#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <time.h>
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
struct Reading { ArgosBeacon beacon; int8_t rssi; time_t observed; };
QueueHandle_t readings;
std::atomic<uint32_t> lost{0};
uint32_t pending=0, nextWiFi=0, nextMqtt=0, lastPanel=0;
uint32_t mqttBackoff=1000;
String topic;
String lastEvents[64]; size_t eventCursor=0;

void onReceive(const esp_now_recv_info_t* info,const uint8_t* data,int length) {
  if (!info || !info->rx_ctrl || length != sizeof(ArgosBeacon)) return;
  Reading r={}; memcpy(&r.beacon,data,sizeof(r.beacon));
  r.rssi=info->rx_ctrl->rssi;
  r.observed=time(nullptr); // Captura na recepção, nunca no envio do buffer.
  if (xQueueSend(readings,&r,0) != pdTRUE) lost.fetch_add(1);
}
void halt(const char* reason) { Serial.println(reason); while(true) delay(1000); }
void persist() {
  Reading r;
  // Limite por passagem preserva tempo para rede e watchdog.
  for(int i=0;i<32 && xQueueReceive(readings,&r,0)==pdTRUE;i++) {
    if (!verifyBeacon(r.beacon)) continue;
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
  // ArduinoMqttClient 0.1.8 endMessage aguarda PUBACK no QoS1.
  mqtt.beginMessage(topic.c_str(),(unsigned long)payload.length(),false,1);
  mqtt.print(payload);
  if(mqtt.endMessage()) {
    if(LittleFS.remove(path)) pending--;
  } else mqtt.stop(); // Reenvia mesmo evento; backend garante idempotência.
}
void setup() {
  Serial.begin(115200);
  uint8_t uuid[16];
  if(!parseUuid(ARGOS_PROPERTY_UUID,uuid) || !parseUuid(ARGOS_RECEIVER_UUID,uuid) || strlen(ARGOS_BEACON_SECRET)<32)
    halt("Configure identidade e ArgosSecrets.h");
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
  configTime(0,0,ARGOS_NTP_SERVER);
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
  if(WiFi.status()==WL_CONNECTED) {
    if(WiFi.channel()!=ARGOS_WIFI_CHANNEL) halt("Canal do AP difere da coleira: fixe canal no roteador");
    if(!mqtt.connected() && (int32_t)(now-nextMqtt)>=0) {
      // TLS exige hora correta para validar certificado. ESP-NOW continua recebendo.
      if(ARGOS_LOCAL_PLAINTEXT || time(nullptr)>=1700000000) {
        if(mqtt.connect(ARGOS_MQTT_HOST,ARGOS_MQTT_PORT)) mqttBackoff=1000;
        else mqttBackoff=min(mqttBackoff*2,60000UL);
      }
      nextMqtt=millis()+mqttBackoff+esp_random()%1000;
    }
    mqtt.poll(); publishOne();
  }
  if(now-lastPanel>5000) {
    lastPanel=now;
    Serial.printf("WiFi:%d MQTT:%d Fila:%lu Perdidas:%lu\n",WiFi.status(),mqtt.connected(),(unsigned long)pending,(unsigned long)lost.load());
#if ARGOS_OLED
    if(oledReady) {oled.clearDisplay();oled.setTextColor(SSD1306_WHITE);oled.setTextSize(1);oled.setCursor(0,0);
      oled.printf("ARGOS\nWiFi %s\nMQTT %s\nFila %lu\nPerdidas %lu",WiFi.status()==WL_CONNECTED?"OK":"--",
        mqtt.connected()?"OK":"--",(unsigned long)pending,(unsigned long)lost.load());oled.display();}
#endif
  }
  delay(2);
}
