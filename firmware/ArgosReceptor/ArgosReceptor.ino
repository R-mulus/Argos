#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <time.h>
#include <sys/time.h>
#include <esp_timer.h>
#include <atomic>
#include "ArgosProtocol.h"
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
// observedMs: UTC em ms (0 = relógio ainda sem NTP); monoMs: relógio monotônico desde o boot.
struct Reading { ArgosBeacon beacon; int8_t rssi; int64_t observedMs; int64_t monoMs; };
QueueHandle_t readings;
std::atomic<uint32_t> lost{0};
uint32_t pending=0, nextWiFi=0, nextMqtt=0, lastPanel=0;
uint32_t mqttBackoff=1000;
uint32_t bootId=0, nextScan=0;
std::atomic<uint8_t> wifiReason{0};
uint8_t lastReason=0;
int lastMqttError=0;
bool wasConnected=false, mqttWasConnected=false, clockWasValid=false;
uint32_t recoveredTimes=0, nullTimes=0;
String topic, mqttHost;
String lastEvents[64]; size_t eventCursor=0;

void onReceive(const esp_now_recv_info_t* info,const uint8_t* data,int length) {
  if (!info || !info->rx_ctrl || length != sizeof(ArgosBeacon)) return;
  Reading r={}; memcpy(&r.beacon,data,sizeof(r.beacon));
  r.rssi=info->rx_ctrl->rssi;
  // Captura na recepção, nunca no envio do buffer.
  struct timeval tv; gettimeofday(&tv,nullptr);
  r.observedMs=tv.tv_sec>=1700000000 ? (int64_t)tv.tv_sec*1000+tv.tv_usec/1000 : 0;
  r.monoMs=esp_timer_get_time()/1000;
  if (xQueueSend(readings,&r,0) != pdTRUE) lost.fetch_add(1);
}
void halt(const char* reason) { Serial.println(reason); while(true) delay(1000); }
bool clockValid() { return time(nullptr)>=1700000000; }
int64_t nowEpochMs() { struct timeval tv; gettimeofday(&tv,nullptr); return (int64_t)tv.tv_sec*1000+tv.tv_usec/1000; }
int64_t monoMs() { return esp_timer_get_time()/1000; }
void isoUtc(int64_t ms,char* out,size_t size) {
  time_t seconds=ms/1000; struct tm utc; gmtime_r(&seconds,&utc);
  size_t n=strftime(out,size,"%Y-%m-%dT%H:%M:%S",&utc);
  snprintf(out+n,size-n,".%03dZ",(int)(ms%1000));
}
const char* wifiReasonText(uint8_t reason) {
  switch(reason) {
    case 201: return "rede nao encontrada: confira o SSID, se a rede e 2,4 GHz e se o canal do roteador e ARGOS_WIFI_CHANNEL";
    case 15: case 202: case 204: return "falha de autenticacao: confira a senha do Wi-Fi";
    case 203: return "associacao recusada pelo ponto de acesso";
    case 200: return "sinal perdido (beacon timeout)";
    case 8: return "desconectado pelo proprio receptor";
    default: return "consulte wifi_err_reason_t do ESP-IDF";
  }
}
const char* mqttErrorText(int error) {
  switch(error) {
    case -2: return "conexao TCP recusada ou sem rota: IP do notebook, porta, EMQX rodando, firewall do Windows, TLS/CA";
    case -1: return "tempo esgotado sem CONNACK: porta/TLS trocados ou broker sobrecarregado";
    case 1: return "versao do protocolo recusada";
    case 2: return "client id recusado";
    case 3: return "broker indisponivel";
    case 4: return "usuario ou senha MQTT incorretos";
    case 5: return "nao autorizado: usuario sem permissao no EMQX";
    default: return "erro desconhecido";
  }
}
// NTP: servidor local opcional, gateway do Wi-Fi (notebook/roteador) e servidor público de reserva.
// O SNTP guarda o ponteiro do nome: o buffer do gateway precisa ser estático.
void configureClock() {
  static char gateway[16];
  strlcpy(gateway,WiFi.gatewayIP().toString().c_str(),sizeof(gateway));
  if(strlen(ARGOS_NTP_SERVER)) configTime(0,0,ARGOS_NTP_SERVER,gateway,ARGOS_NTP_FALLBACK);
  else configTime(0,0,gateway,ARGOS_NTP_FALLBACK);
  Serial.printf("[Hora] NTP: %s %s %s\n",ARGOS_NTP_SERVER,gateway,ARGOS_NTP_FALLBACK);
}
// "gateway" usa o IP do ponto de acesso, útil quando o notebook com EMQX é o próprio hotspot.
String resolveMqttHost() {
  String host=ARGOS_MQTT_HOST;
  return host=="gateway" ? WiFi.gatewayIP().toString() : host;
}
void persist() {
  Reading r;
  // Limite por passagem preserva tempo para rede e watchdog.
  for(int i=0;i<32 && xQueueReceive(readings,&r,0)==pdTRUE;i++) {
    if (!verifyBeacon(r.beacon)) continue;
    char id[80], tx[37]; eventId(r.beacon,id,sizeof(id)); formatUuid(r.beacon.transmitter,tx);
    bool duplicate=false;
    for (const auto& e:lastEvents) if(e==id) duplicate=true;
    if(duplicate) continue;
    // Sem relógio: grava o instante monotônico deste boot (_b/_ms, campos locais que nunca vão
    // ao MQTT). publishOne converte para UTC quando o NTP sincronizar; após reinício não há
    // referência confiável e o contrato v1 segue com null.
    String name=String("/q/")+id+".json";
    if(LittleFS.exists(name)) continue;
    if(pending>=ARGOS_MAX_FILES || LittleFS.totalBytes()-LittleFS.usedBytes()<8192) {
      lost.fetch_add(1); continue; // Preserva os eventos antigos; contador visível.
    }
    JsonDocument doc;
    doc["versao"]=1; doc["evento_id"]=id; doc["transmissor_id"]=tx; doc["rssi_dbm"]=(int)r.rssi;
    if(r.beacon.battery<=100) doc["bateria_percentual"]=r.beacon.battery;
    if(r.observedMs>0) {
      char iso[32]; isoUtc(r.observedMs,iso,sizeof(iso)); doc["detectado_em"]=iso;
    } else {
      doc["detectado_em"]=nullptr; doc["_b"]=bootId; doc["_ms"]=(long long)r.monoMs;
    }
    File f=LittleFS.open("/writing.tmp","w");
    size_t expected=measureJson(doc);
    if(!f) {lost.fetch_add(1);continue;}
    size_t written=serializeJson(doc,f); f.flush(); f.close();
    // Rename atômico LittleFS: queda de energia deixa arquivo completo ou .tmp.
    if(written!=expected || !LittleFS.rename("/writing.tmp",name)) {lost.fetch_add(1);continue;}
    pending++; lastEvents[eventCursor++%64]=id;
  }
}
// Prepara o JSON do contrato v1. false = leitura deste boot ainda aguardando o NTP.
bool prepareForPublish(JsonDocument& doc) {
  if(!doc["_ms"].is<long long>()) return true;
  uint32_t boot=doc["_b"].as<uint32_t>(); long long captured=doc["_ms"].as<long long>();
  if(boot==bootId && captured<=monoMs()) {
    if(clockValid()) {
      char iso[32]; isoUtc(nowEpochMs()-(monoMs()-captured),iso,sizeof(iso));
      doc["detectado_em"]=iso; recoveredTimes++;
    } else if(monoMs()<(int64_t)ARGOS_TIME_WAIT_S*1000) return false;
    else nullTimes++;
  } else nullTimes++;
  doc.remove("_b"); doc.remove("_ms");
  return true;
}
void publishOne() {
  if(!mqtt.connected() || !pending || (int32_t)(millis()-nextScan)<0) return;
  File directory=LittleFS.open("/q");
  String path, payload, corrupted;
  for(int i=0;i<64;i++) {
    File f=directory.openNextFile(); if(!f) break;
    String candidate=f.path(); String body=f.readString(); f.close();
    JsonDocument doc;
    if(deserializeJson(doc,body)) {corrupted=candidate; break;}
    if(!prepareForPublish(doc)) continue;
    path=candidate; serializeJson(doc,payload); break;
  }
  directory.close();
  if(corrupted.length()) {
    String quarantine=String("/quarantine/")+corrupted.substring(corrupted.lastIndexOf('/')+1);
    if(LittleFS.rename(corrupted,quarantine)) {pending--;lost.fetch_add(1);}
    Serial.println("[Fila] arquivo corrompido separado em /quarantine"); return;
  }
  if(!path.length()) {nextScan=millis()+1000; return;} // tudo aguardando hora
  // ArduinoMqttClient 0.1.8 endMessage aguarda PUBACK no QoS1.
  mqtt.beginMessage(topic.c_str(),(unsigned long)payload.length(),false,1);
  mqtt.print(payload);
  if(mqtt.endMessage()) {
    if(LittleFS.remove(path)) pending--;
  } else {
    Serial.println("[MQTT] publicacao sem PUBACK; reconectando e reenviando o mesmo evento");
    mqtt.stop(); // Backend garante idempotência.
  }
}
void setup() {
  Serial.begin(115200);
  uint8_t uuid[16];
  if(!parseUuid(ARGOS_PROPERTY_UUID,uuid) || !parseUuid(ARGOS_RECEIVER_UUID,uuid) || strlen(ARGOS_BEACON_SECRET)<32)
    halt("Configure identidade e ArgosSecrets.h");
  if(!strlen(ARGOS_WIFI_SSID) || !strlen(ARGOS_MQTT_HOST)) halt("Configure ARGOS_WIFI_SSID e ARGOS_MQTT_HOST em ArgosSecrets.h");
  bootId=esp_random();
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
  topic=String("argos/v1/propriedades/")+ARGOS_PROPERTY_UUID+"/receptores/"+ARGOS_RECEIVER_UUID+"/deteccoes";
  WiFi.mode(WIFI_STA); WiFi.setSleep(false); WiFi.setAutoReconnect(false);
  esp_wifi_set_channel(ARGOS_WIFI_CHANNEL,WIFI_SECOND_CHAN_NONE);
  if(esp_now_init()!=ESP_OK) halt("ESP-NOW indisponível");
  esp_now_register_recv_cb(onReceive);
  WiFi.onEvent([](WiFiEvent_t,WiFiEventInfo_t info){ wifiReason.store(info.wifi_sta_disconnected.reason); },
    ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  Serial.printf("[Argos] receptor %s | propriedade %s | canal %d | MQTT %s:%d %s\n",
    ARGOS_RECEIVER_UUID,ARGOS_PROPERTY_UUID,ARGOS_WIFI_CHANNEL,ARGOS_MQTT_HOST,ARGOS_MQTT_PORT,
    ARGOS_LOCAL_PLAINTEXT?"sem TLS (laboratorio)":"TLS");
  Serial.printf("[Fila] %lu leituras pendentes na flash\n",(unsigned long)pending);
#if !ARGOS_LOCAL_PLAINTEXT
  if(!strlen(ARGOS_MQTT_CA)) halt("Configure CA do broker; TLS é obrigatório");
  network.setCACert(ARGOS_MQTT_CA); network.setHandshakeTimeout(5);
#endif
  mqtt.setId(String("argos-rx-")+ARGOS_RECEIVER_UUID);
  mqtt.setUsernamePassword(ARGOS_MQTT_USER,ARGOS_MQTT_PASS);
  mqtt.setConnectionTimeout(2000); mqtt.setKeepAliveInterval(15000);
#if ARGOS_OLED
  Wire.begin(ARGOS_OLED_SDA,ARGOS_OLED_SCL); oledReady=oled.begin(SSD1306_SWITCHCAPVCC,0x3c);
#endif
}
void loop() {
  persist();
  uint32_t now=millis();
  if(WiFi.status()!=WL_CONNECTED && (int32_t)(now-nextWiFi)>=0) {
    WiFi.disconnect(); esp_wifi_set_channel(ARGOS_WIFI_CHANNEL,WIFI_SECOND_CHAN_NONE);
    WiFi.begin(ARGOS_WIFI_SSID,ARGOS_WIFI_PASS,ARGOS_WIFI_CHANNEL);
    nextWiFi=now+30000+esp_random()%2000;
  }
  uint8_t reason=wifiReason.exchange(0);
  if(reason && reason!=lastReason) {
    Serial.printf("[WiFi] desconectado (%u): %s\n",reason,wifiReasonText(reason)); lastReason=reason;
  }
  if(WiFi.status()==WL_CONNECTED) {
    if(WiFi.channel()!=ARGOS_WIFI_CHANNEL) {
      // Sem halt: continua captando no canal das coleiras e guardando na flash.
      Serial.printf("[WiFi] ponto de acesso no canal %d; coleiras no canal %d. Fixe o roteador/hotspot no canal %d (2,4 GHz) ou recompile coleiras e receptores.\n",
        WiFi.channel(),ARGOS_WIFI_CHANNEL,ARGOS_WIFI_CHANNEL);
      WiFi.disconnect(); esp_wifi_set_channel(ARGOS_WIFI_CHANNEL,WIFI_SECOND_CHAN_NONE);
      wasConnected=false; nextWiFi=now+30000; delay(2); return;
    }
    if(!wasConnected) {
      wasConnected=true; lastReason=0;
      Serial.printf("[WiFi] conectado a %s | IP %s | gateway %s | canal %d | RSSI %d dBm\n",
        WiFi.SSID().c_str(),WiFi.localIP().toString().c_str(),WiFi.gatewayIP().toString().c_str(),
        WiFi.channel(),WiFi.RSSI());
      configureClock();
      mqttHost=resolveMqttHost();
    }
    if(mqttWasConnected && !mqtt.connected()) {Serial.println("[MQTT] conexao perdida"); mqttWasConnected=false;}
    if(!mqtt.connected() && (int32_t)(now-nextMqtt)>=0) {
      // TLS exige hora correta para validar certificado. ESP-NOW continua recebendo.
      if(ARGOS_LOCAL_PLAINTEXT || clockValid()) {
        if(mqtt.connect(mqttHost.c_str(),ARGOS_MQTT_PORT)) {
          mqttBackoff=1000; lastMqttError=0; mqttWasConnected=true;
          Serial.printf("[MQTT] conectado a %s:%d; topico %s\n",mqttHost.c_str(),ARGOS_MQTT_PORT,topic.c_str());
        } else {
          lastMqttError=mqtt.connectError();
          Serial.printf("[MQTT] falha em %s:%d (%d): %s\n",mqttHost.c_str(),ARGOS_MQTT_PORT,lastMqttError,mqttErrorText(lastMqttError));
          mqttBackoff=min(mqttBackoff*2,60000UL);
        }
      } else Serial.println("[MQTT] TLS aguardando a hora do NTP");
      nextMqtt=millis()+mqttBackoff+esp_random()%1000;
    }
    mqtt.poll(); publishOne();
  } else wasConnected=false;
  if(!clockWasValid && clockValid()) {
    clockWasValid=true; char iso[32]; isoUtc(nowEpochMs(),iso,sizeof(iso));
    Serial.printf("[Hora] sincronizada: %s\n",iso);
  }
  if(now-lastPanel>5000) {
    lastPanel=now;
    Serial.printf("[Status] WiFi:%s MQTT:%s Hora:%s Fila:%lu Perdidas:%lu HoraRecuperada:%lu SemHora:%lu\n",
      WiFi.status()==WL_CONNECTED?"OK":"--",mqtt.connected()?"OK":"--",clockValid()?"OK":"aguardando NTP",
      (unsigned long)pending,(unsigned long)lost.load(),(unsigned long)recoveredTimes,(unsigned long)nullTimes);
#if ARGOS_OLED
    if(oledReady) {oled.clearDisplay();oled.setTextColor(SSD1306_WHITE);oled.setTextSize(1);oled.setCursor(0,0);
      oled.printf("ARGOS\nWiFi %s\nMQTT %s\nHora %s\nFila %lu\nPerdidas %lu",WiFi.status()==WL_CONNECTED?"OK":"--",
        mqtt.connected()?"OK":"--",clockValid()?"OK":"--",(unsigned long)pending,(unsigned long)lost.load());oled.display();}
#endif
  }
  delay(2);
}
