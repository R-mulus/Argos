#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <time.h>
#include <atomic>
#include <esp_timer.h>
#include <esp_sntp.h>
#include "ArgosProtocol.h"
#include "ArgosClock.h"
#include "ArgosLog.h"
#if ARGOS_OLED
#include <Wire.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 oled(128,64,&Wire,-1);
bool oledReady=false;
#endif
#if ARGOS_LOCAL_PLAINTEXT
WiFiClient network;
#else
WiFiClientSecure network;
#endif
MqttClient mqtt(network);
struct Reading { ArgosBeacon beacon; int8_t rssi; time_t observed; int64_t capturedUs; };
ArgosClock captureClock;
uint64_t receiverBoot;
std::atomic<bool> ntpSynchronized{false};
std::atomic<uint32_t> received{0}, invalid{0};
std::atomic<int> disconnectReason{0};
uint32_t wifiAttempts=0;
bool wifiWasConnected=false;
QueueHandle_t readings;
std::atomic<uint32_t> lost{0};
uint32_t pending=0, nextWiFi=0, nextMqtt=0, lastPanel=0;
uint32_t mqttBackoff=1000;
String topic;
String lastEvents[64]; size_t eventCursor=0;

void onReceive(const esp_now_recv_info_t* info,const uint8_t* data,int length) {
  if (!info || !info->rx_ctrl || !data || length != sizeof(ArgosBeacon)) {invalid.fetch_add(1);return;}
  received.fetch_add(1);
  Reading r={}; memcpy(&r.beacon,data,sizeof(r.beacon));
  r.rssi=info->rx_ctrl->rssi;
  r.capturedUs=esp_timer_get_time();
  r.observed=ntpSynchronized.load() ? time(nullptr) : 0;
  if (xQueueSend(readings,&r,0) != pdTRUE) lost.fetch_add(1);
}
void halt(const char* reason) { ARGOS_LOG(1,"ERROR","%s",reason); while(true) delay(1000); }
void persist() {
  Reading r;
  // Limite por passagem preserva tempo para rede e watchdog.
  for(int i=0;i<32 && xQueueReceive(readings,&r,0)==pdTRUE;i++) {
    if (!verifyBeacon(r.beacon)) {invalid.fetch_add(1);continue;}
    char id[80], tx[37]; eventId(r.beacon,id,sizeof(id)); formatUuid(r.beacon.transmitter,tx);
    bool duplicate=false;
    for (const auto& e:lastEvents) if(e==id) duplicate=true;
    if(duplicate) continue;
    // Sem relógio, não podemos atribuir vínculo histórico com segurança.
    // Mantém null no contrato v1; processamento central preserva ausência de horário.
    String name=String("/q/")+id+".json";
    if(LittleFS.exists(name)) continue;
    if(pending>=ARGOS_MAX_FILES || LittleFS.totalBytes()-LittleFS.usedBytes()<8192) {
      lost.fetch_add(1); continue; // Preserva os eventos antigos; contador visível.
    }
    JsonDocument doc;
    // Metadados somente em flash; nunca acrescentados ao contrato MQTT v1.
    doc["_boot"]=receiverBoot; doc["_captured_us"]=r.capturedUs;
    doc["versao"]=1; doc["evento_id"]=id; doc["transmissor_id"]=tx; doc["rssi_dbm"]=(int)r.rssi;
    if(r.beacon.battery<=100) doc["bateria_percentual"]=r.beacon.battery;
    if(r.observed>=1700000000) {
      char iso[24]; struct tm utc; gmtime_r(&r.observed,&utc);
      strftime(iso,sizeof(iso),"%Y-%m-%dT%H:%M:%SZ",&utc); doc["detectado_em"]=iso;
    } else doc["detectado_em"]=nullptr;
    File f=LittleFS.open("/writing.tmp","w");
    size_t expected=measureJson(doc);
    if(!f) {lost.fetch_add(1);continue;}
    size_t written=serializeJson(doc,f); f.flush(); f.close();
    // Rename atômico LittleFS: queda de energia deixa arquivo completo ou .tmp.
    if(written!=expected || !LittleFS.rename("/writing.tmp",name)) {lost.fetch_add(1);continue;}
    pending++; lastEvents[eventCursor++%64]=id;
    ARGOS_LOG(4,"RX","ESP-NOW aceito: evento=%s RSSI=%d dBm fila=%lu",
                  id,(int)r.rssi,(unsigned long)pending);
  }
}
void publishOne() {
  if(!mqtt.connected() || !pending) return;
  File directory=LittleFS.open("/q"); File f=directory.openNextFile();
  if(!f) return;
  String path=f.path(); String payload=f.readString(); f.close(); directory.close();
  JsonDocument check;
  if(deserializeJson(check,payload)) {
    String quarantine=String("/quarantine/")+path.substring(path.lastIndexOf('/')+1);
    if(LittleFS.rename(path,quarantine)) {pending--;lost.fetch_add(1);}
    Serial.println("Arquivo corrompido separado para diagnóstico"); return;
  }
  if(check["detectado_em"].isNull() && check["_boot"].is<uint64_t>() &&
     check["_captured_us"].is<int64_t>()) {
    const auto captured=check["_captured_us"].as<int64_t>();
    const auto boot=check["_boot"].as<uint64_t>();
    // Espera limitada para NTP; não bloqueia captura/persistência no loop.
    if(boot==receiverBoot && !captureClock.epochUs && esp_timer_get_time()-captured<60000000LL) return;
    time_t recovered=captureClock.recover(captured,boot,receiverBoot);
    if(recovered) {
      char iso[24]; struct tm utc; gmtime_r(&recovered,&utc);
      strftime(iso,sizeof(iso),"%Y-%m-%dT%H:%M:%SZ",&utc); check["detectado_em"]=iso;
      // Antes da primeira publicação, congela o horário recuperado em flash.
      File recoveredFile=LittleFS.open("/writing.tmp","w");
      if(!recoveredFile) return;
      size_t expected=measureJson(check), written=serializeJson(check,recoveredFile);
      recoveredFile.flush(); recoveredFile.close();
      if(written!=expected || !LittleFS.rename("/writing.tmp",path)) return;
    }
  }
  check.remove("_boot"); check.remove("_captured_us");
  payload=""; serializeJson(check,payload);
  // ArduinoMqttClient 0.1.8 endMessage aguarda PUBACK no QoS1.
  if(!mqtt.beginMessage(topic.c_str(),(unsigned long)payload.length(),false,1) ||
     mqtt.print(payload)!=payload.length()) {
    mqtt.stop(); return; // Nunca remover arquivo após escrita incompleta.
  }
  if(mqtt.endMessage()) {
    if(LittleFS.remove(path)) {
      pending--;
      ARGOS_LOG(4,"MQTT","PUBACK do broker; fila=%lu", (unsigned long)pending);
    }
  } else mqtt.stop(); // Reenvia mesmo evento; backend garante idempotência.
}
void setup() {
  Serial.begin(115200);
  receiverBoot=((uint64_t)esp_random()<<32)|esp_random();
  ARGOS_LOG(3,"BOOT","Firmware Argos iniciado");

uint8_t uuid[16];

ARGOS_LOG(3,"DEVICE","Propriedade=%s receptor=%s",ARGOS_PROPERTY_UUID,ARGOS_DEVICE_UUID);
ARGOS_LOG(3,"WIFI","SSID configurado=%s",ARGOS_WIFI_SSID);

if (!parseUuid(ARGOS_PROPERTY_UUID, uuid)) {
    halt("ERRO: UUID DA PROPRIEDADE INVALIDO");
}

if (!parseUuid(ARGOS_DEVICE_UUID, uuid)) {
    halt("ERRO: UUID DO RECEPTOR INVALIDO");
}

if (strlen(ARGOS_BEACON_SECRET) < 32) {
    halt("ERRO: CHAVE HMAC NAO CARREGADA");
}
if (!strlen(ARGOS_WIFI_SSID) || !strlen(ARGOS_MQTT_HOST)) {
    halt("Configure Wi-Fi e endpoint EMQX em ArgosSecrets.h");
}
if (!strlen(ARGOS_MQTT_USER) || !strlen(ARGOS_MQTT_PASS)) {
    halt("Configure credenciais MQTT individuais do EMQX");
}
if (!strcmp(ARGOS_MQTT_HOST,"127.0.0.1") || !strcmp(ARGOS_MQTT_HOST,"localhost"))
    halt("Use IP LAN do broker ou hostname acessível ao ESP32");

ARGOS_LOG(3,"DEVICE","Identidade e configuração HMAC válidas");

  readings=xQueueCreate(256,sizeof(Reading)); if(!readings) halt("Fila RAM indisponível");
  if(!LittleFS.begin(false)) {
#if ARGOS_FORMAT_FLASH
    if(!LittleFS.format() || !LittleFS.begin(false)) halt("Falha LittleFS");
#else
    halt("LittleFS não montou; formatação automática desativada");
#endif
  }
  LittleFS.mkdir("/q"); LittleFS.mkdir("/quarantine");
  // Recupera escrita completa interrompida antes do rename; parcial é contabilizada.
  if(LittleFS.exists("/writing.tmp")) {
    File f=LittleFS.open("/writing.tmp"); JsonDocument d; auto error=deserializeJson(d,f); f.close();
    if(!error && d["evento_id"].is<const char*>()) {
      String path=String("/q/")+d["evento_id"].as<const char*>()+".json";
      if(!LittleFS.exists(path) && !LittleFS.rename("/writing.tmp",path))
        halt("Falha ao recuperar escrita: temporário preservado");
    } else lost.fetch_add(1);
    LittleFS.remove("/writing.tmp");
  }
  File dir=LittleFS.open("/q"); for(File f=dir.openNextFile();f;f=dir.openNextFile()) {pending++;f.close();} dir.close();
  topic=String("argos/v1/propriedades/")+ARGOS_PROPERTY_UUID+"/receptores/"+ARGOS_DEVICE_UUID+"/deteccoes";
  ARGOS_LOG(3,"MQTT","Tópico=%s", topic.c_str());
  WiFi.mode(WIFI_STA); WiFi.setSleep(false); WiFi.setAutoReconnect(false);
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if(event==ARDUINO_EVENT_WIFI_STA_DISCONNECTED)
      disconnectReason.store(info.wifi_sta_disconnected.reason);
  });
  esp_wifi_set_channel(ARGOS_WIFI_CHANNEL,WIFI_SECOND_CHAN_NONE);
  if(esp_now_init()!=ESP_OK) halt("ESP-NOW indisponível");
  if(esp_now_register_recv_cb(onReceive)!=ESP_OK) halt("Falha no callback ESP-NOW");
  sntp_set_time_sync_notification_cb([](struct timeval*) {ntpSynchronized.store(true);});
  configTime(0,0,ARGOS_NTP_SERVER,ARGOS_NTP_FALLBACK_1,ARGOS_NTP_FALLBACK_2);
#if !ARGOS_LOCAL_PLAINTEXT
  if(!strlen(ARGOS_MQTT_CA)) halt("Configure CA do broker; TLS é obrigatório");
  network.setCACert(ARGOS_MQTT_CA); network.setHandshakeTimeout(5);
#endif
  mqtt.setId(String("argos-rx-")+ARGOS_DEVICE_UUID);
  // A fila local reenvia publicações; não precisamos de assinatura persistente aqui.
  mqtt.setCleanSession(true);
  if (strlen(ARGOS_MQTT_USER)) mqtt.setUsernamePassword(ARGOS_MQTT_USER,ARGOS_MQTT_PASS);
  mqtt.setConnectionTimeout(2000); mqtt.setKeepAliveInterval(15000);
#if ARGOS_OLED
  Wire.begin(ARGOS_OLED_SDA,ARGOS_OLED_SCL); oledReady=oled.begin(SSD1306_SWITCHCAPVCC,0x3c);
#endif
}
void loop() {
  if(ntpSynchronized.load() && !captureClock.epochUs) {
    struct timeval utc; gettimeofday(&utc,nullptr);
    captureClock.synchronize(esp_timer_get_time(),(int64_t)utc.tv_sec*1000000+utc.tv_usec);
    ARGOS_LOG(3,"NTP","Sincronizado UTC=%lld",(long long)utc.tv_sec);
  }
  persist();
  uint32_t now=millis();
  int reason=disconnectReason.exchange(0);
  if(reason) ARGOS_LOG(2,"WIFI","Desconexão motivo=%d",reason);
  if(WiFi.status()!=WL_CONNECTED && wifiWasConnected) {
    wifiWasConnected=false; mqtt.stop();
    esp_wifi_set_channel(ARGOS_WIFI_CHANNEL,WIFI_SECOND_CHAN_NONE);
  }
  if(WiFi.status()!=WL_CONNECTED && (int32_t)(now-nextWiFi)>=0) {
    WiFi.disconnect(); esp_wifi_set_channel(ARGOS_WIFI_CHANNEL,WIFI_SECOND_CHAN_NONE);
    WiFi.begin(ARGOS_WIFI_SSID,ARGOS_WIFI_PASS,ARGOS_WIFI_CHANNEL);
    ARGOS_LOG(3,"WIFI","Conectando SSID=%s tentativa=%lu canal=%d",ARGOS_WIFI_SSID,(unsigned long)++wifiAttempts,ARGOS_WIFI_CHANNEL);
    nextWiFi=now+30000+esp_random()%2000;
  }
  if(WiFi.status()==WL_CONNECTED) {

    //TESTE COMPARATIVO DE CANAIS
    //Serial.print("Canal configurado no firmware: ");
    //Serial.println(ARGOS_WIFI_CHANNEL);

    //Serial.print("Canal atual do roteador: ");
    //Serial.println(WiFi.channel());
    if(WiFi.channel()!=ARGOS_WIFI_CHANNEL) {
      ARGOS_LOG(1,"WIFI","Canal AP=%d difere ESP-NOW=%d; retomando captura e tentando novamente em 30s",WiFi.channel(),ARGOS_WIFI_CHANNEL);
      mqtt.stop(); WiFi.disconnect(); wifiWasConnected=false;
      esp_wifi_set_channel(ARGOS_WIFI_CHANNEL,WIFI_SECOND_CHAN_NONE);
      nextWiFi=now+30000; return;
    }
    if(!wifiWasConnected) {
      wifiWasConnected=true;
      ARGOS_LOG(3,"WIFI","Conectado IP=%s gateway=%s DNS=%s canal=%d RSSI=%d",WiFi.localIP().toString().c_str(),WiFi.gatewayIP().toString().c_str(),WiFi.dnsIP().toString().c_str(),WiFi.channel(),WiFi.RSSI());
    }

    if (!mqtt.connected() && (int32_t)(now-nextMqtt) >= 0) {
        if (ARGOS_LOCAL_PLAINTEXT || ntpSynchronized.load()) {
            ARGOS_LOG(3,"MQTT","Conectando host=%s porta=%d",ARGOS_MQTT_HOST,ARGOS_MQTT_PORT);
            if (mqtt.connect(ARGOS_MQTT_HOST, ARGOS_MQTT_PORT)) {
                ARGOS_LOG(3,"MQTT","Autenticado no EMQX");
                mqttBackoff = 1000;
            } else {
                ARGOS_LOG(2,"MQTT","Conexão falhou código=%d",mqtt.connectError());
                mqttBackoff = min(mqttBackoff * 2, 60000UL);
            }
        } else {
            ARGOS_LOG(2,"NTP","Aguardando sincronização para validar TLS");
            mqttBackoff = 30000;
        }

        nextMqtt = millis() + mqttBackoff + esp_random() % 1000;
    }

    mqtt.poll(); publishOne();
  }
  if(now-lastPanel>5000) {
    lastPanel=now;
    ARGOS_LOG(3,"ESPNOW","Recebidos=%lu inválidos=%lu",(unsigned long)received.load(),(unsigned long)invalid.load());
    ARGOS_LOG(3,"QUEUE","WiFi:%d MQTT:%d Fila:%lu Perdidas:%lu Hora:%s",
      WiFi.status(),mqtt.connected(),(unsigned long)pending,(unsigned long)lost.load(),
      time(nullptr)>=1700000000 ? "OK" : "SEM_NTP");
#if ARGOS_OLED
    if(oledReady) {oled.clearDisplay();oled.setTextColor(SSD1306_WHITE);oled.setTextSize(1);oled.setCursor(0,0);
      oled.printf("ARGOS\nWiFi %s\nMQTT %s\nFila %lu\nPerdidas %lu",WiFi.status()==WL_CONNECTED?"OK":"--",
        mqtt.connected()?"OK":"--",(unsigned long)pending,(unsigned long)lost.load());oled.display();}
#endif
  }
  delay(2);
}
