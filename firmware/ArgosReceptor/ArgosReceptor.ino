#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_sntp.h>
#include <time.h>
#include <atomic>
#include <ArgosProtocol.h>
#include "ArgosConfig.h"
#include "ArgosQueue.h"

#if ARGOS_LOCAL_PLAINTEXT
WiFiClient network;
#else
WiFiClientSecure network;
#endif
MqttClient mqtt(network);
ReadingQueue storage;
QueueHandle_t readings;
std::atomic<uint32_t> lost{0}, malformed{0};
std::atomic<bool> clockSynced{false};
std::atomic<uint32_t> syncMillis{0};
uint32_t rejected = 0, duplicates = 0, published = 0;
uint32_t nextWiFi = 0, nextMqtt = 0, lastReport = 0, backoff = 1000;
String topic;
String recent[64];
size_t recentCursor = 0;
bool wifiWasConnected = false;

void halt(const char* reason) {
  Serial.println(reason);
  while (true) delay(1000);
}
void onTimeSync(struct timeval*) {
  syncMillis.store(millis()); clockSynced.store(true);
}
bool reliableClock() {
  // Exige sincronização nesta inicialização e no máximo 24h de deriva sem NTP.
  return clockSynced.load() && uint32_t(millis() - syncMillis.load()) < 86400000UL;
}
void onReceive(const esp_now_recv_info_t* info, const uint8_t* data, int length) {
  if (!info || !info->rx_ctrl || !data || length != sizeof(argos::Beacon)) { ++malformed; return; }
  StoredReading r = {};
  memcpy(&r.beacon, data, sizeof(r.beacon));
  r.rssi = info->rx_ctrl->rssi;
  // Copia o horário observado agora; não usa o horário de publicação após reconectar.
  time_t now = time(nullptr);
  r.observed = reliableClock() && now >= 1700000000LL ? now : 0;
  if (xQueueSend(readings, &r, 0) != pdTRUE) ++lost;
}
void persistReadings() {
  StoredReading r;
  for (int i = 0; i < 16 && xQueueReceive(readings, &r, 0) == pdTRUE; ++i) {
    if (!argos::verify(r.beacon, ARGOS_BEACON_SECRET) || r.rssi < -127 || r.rssi > 0) { ++rejected; continue; }
    char event[80]; argos::eventId(r.beacon, event, sizeof(event));
    bool seen = false;
    for (const auto& value : recent) if (value == event) { seen = true; break; }
    if (seen) { ++duplicates; continue; }
    if (storage.append(r)) recent[recentCursor++ % 64] = event;
    else {
      ++lost;
      // Erro de rename não pode fazer a próxima escrita destruir o temporário durável.
      if (LittleFS.exists("/writing.tmp")) halt("FLASH: escrita pendente preservada; reinicie para recuperar");
    }
  }
}
void publishOne() {
  if (!mqtt.connected() || !storage.pending) return;
  StoredReading r = {}; String path;
  if (!storage.first(r, path)) return;
  char event[80], tx[37];
  argos::eventId(r.beacon, event, sizeof(event)); argos::formatUuid(r.beacon.transmitter, tx);
  JsonDocument doc;
  doc["versao"] = 1; doc["evento_id"] = event; doc["transmissor_id"] = tx;
  doc["rssi_dbm"] = int(r.rssi);
  if (r.beacon.battery <= 100) doc["bateria_percentual"] = r.beacon.battery;
  else doc["bateria_percentual"] = nullptr;
  if (r.observed) {
    char iso[24]; struct tm utc; time_t observed = r.observed;
    gmtime_r(&observed, &utc); strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &utc);
    doc["detectado_em"] = iso;
  } else doc["detectado_em"] = nullptr;
  char payload[384]; size_t expected = measureJson(doc);
  if (expected >= sizeof(payload)) halt("JSON: tamanho inesperado");
  serializeJson(doc, payload, sizeof(payload));
  // 0.1.8 endMessage aguarda PUBACK para QoS 1. Só então remove da flash.
  if (!mqtt.beginMessage(topic.c_str(), (unsigned long)expected, false, 1) ||
      mqtt.write(reinterpret_cast<const uint8_t*>(payload), expected) != expected || !mqtt.endMessage()) {
    Serial.println("MQTT: publicação/PUBACK falhou; evento continua na flash"); mqtt.stop(); return;
  }
  if (storage.acknowledge(path)) ++published;
  else Serial.println("FLASH: PUBACK recebido mas remoção falhou; reenvio será deduplicado pelo banco");
}
void setup() {
  Serial.begin(115200);
  uint8_t receiver[16], property[16];
  if (!argos::parseUuid(ARGOS_DEVICE_ID, receiver) || !argos::parseUuid(ARGOS_PROPERTY_ID, property) ||
      !strlen(ARGOS_DEVICE_CODE) || strlen(ARGOS_BEACON_SECRET) < 32 || !strlen(ARGOS_WIFI_SSID) ||
      !strlen(ARGOS_MQTT_HOST) || !strlen(ARGOS_MQTT_USER) || !strlen(ARGOS_MQTT_PASS))
    halt("CONFIG: preencha ArgosDevice.local.h e ArgosSecrets.h");
  if (!strcmp(ARGOS_MQTT_HOST, "localhost") || !strcmp(ARGOS_MQTT_HOST, "127.0.0.1"))
    halt("CONFIG: MQTT exige IP LAN/hostname do broker");
  char rx[37], farm[37]; argos::formatUuid(receiver, rx); argos::formatUuid(property, farm);
  topic = String("argos/v1/propriedades/") + farm + "/receptores/" + rx + "/deteccoes";
  if (!storage.begin(topic)) halt("FLASH: fila indisponível; corrija antes de receber dados");
  readings = xQueueCreate(ARGOS_RAM_READINGS, sizeof(StoredReading));
  if (!readings) halt("RAM: não foi possível criar fila");
  WiFi.mode(WIFI_STA); WiFi.setSleep(false); WiFi.setAutoReconnect(false);
  if (esp_wifi_set_channel(ARGOS_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK)
    halt("RADIO: canal inválido");
  // Retenta inicialização sem reiniciar nem apagar a fila persistente.
  while (esp_now_init() != ESP_OK) { Serial.println("ESP-NOW: falha; tentando em 5s"); delay(5000); }
  if (esp_now_register_recv_cb(onReceive) != ESP_OK) halt("ESP-NOW: callback indisponível");
  sntp_set_time_sync_notification_cb(onTimeSync);
  configTime(0, 0, ARGOS_NTP_SERVER);
#if !ARGOS_LOCAL_PLAINTEXT
  if (!strlen(ARGOS_MQTT_CA)) halt("TLS: configure a CA PEM do broker");
  network.setCACert(ARGOS_MQTT_CA); network.setHandshakeTimeout(5);
#endif
  network.setConnectionTimeout(2000);
  mqtt.setId(String("argos-rx-") + rx);
  mqtt.setUsernamePassword(ARGOS_MQTT_USER, ARGOS_MQTT_PASS);
  mqtt.setConnectionTimeout(2000); mqtt.setKeepAliveInterval(15000);
  Serial.printf("RX %s MAC=%s canal=%d fila=%lu\n%s\n", ARGOS_DEVICE_CODE,
    WiFi.macAddress().c_str(), ARGOS_WIFI_CHANNEL, (unsigned long)storage.pending, topic.c_str());
}
void loop() {
  persistReadings();
  uint32_t now = millis();
  // Invalida definitivamente até o próximo NTP, inclusive antes do wrap de millis.
  if (clockSynced.load() && uint32_t(now - syncMillis.load()) >= 86400000UL) clockSynced.store(false);
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && WiFi.channel() != ARGOS_WIFI_CHANNEL) {
    Serial.printf("RADIO: AP no canal %d, esperado %d; fixe o canal do roteador\n", WiFi.channel(), ARGOS_WIFI_CHANNEL);
    mqtt.stop(); WiFi.disconnect();
    esp_wifi_set_channel(ARGOS_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    nextWiFi = now + 30000; connected = false;
  }
  if (!connected && wifiWasConnected) {
    mqtt.stop(); esp_wifi_set_channel(ARGOS_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    Serial.println("WiFi: desconectado; fila em flash permanece");
  }
  if (connected && !wifiWasConnected) Serial.printf("WiFi: IP=%s canal=%d\n", WiFi.localIP().toString().c_str(), WiFi.channel());
  wifiWasConnected = connected;
  if (!connected && int32_t(now - nextWiFi) >= 0) {
    WiFi.disconnect(); esp_wifi_set_channel(ARGOS_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    WiFi.begin(ARGOS_WIFI_SSID, ARGOS_WIFI_PASS, ARGOS_WIFI_CHANNEL);
    nextWiFi = now + 30000 + esp_random() % 1000;
    Serial.println("WiFi: tentativa de conexão em 2,4 GHz");
  }
  if (connected) {
    if (!mqtt.connected() && int32_t(now - nextMqtt) >= 0) {
      if (ARGOS_LOCAL_PLAINTEXT || reliableClock()) {
        if (mqtt.connect(ARGOS_MQTT_HOST, ARGOS_MQTT_PORT)) {
          backoff = 1000; Serial.println("MQTT: autenticado");
        } else {
          Serial.printf("MQTT: connectError=%d (-2 TCP/TLS; -1 timeout; 4/5 credenciais/ACL)\n", mqtt.connectError());
          backoff = backoff < 30000 ? backoff * 2 : 60000;
        }
      } else Serial.println("TLS: aguardando sincronização NTP");
      nextMqtt = millis() + backoff + esp_random() % 1000;
    }
    mqtt.poll(); publishOne();
  }
  if (now - lastReport >= 5000) {
    lastReport = now;
    Serial.printf("WiFi=%d MQTT=%d NTP=%d flash=%lu RAM=%u publicadas=%lu perdidas=%lu invalidas=%lu duplicadas=%lu flash_descartadas=%lu\n",
      WiFi.status(), mqtt.connected(), reliableClock(), (unsigned long)storage.pending,
      unsigned(uxQueueMessagesWaiting(readings)), (unsigned long)published,
      (unsigned long)lost.load(), (unsigned long)(rejected + malformed.load()),
      (unsigned long)duplicates, (unsigned long)storage.discarded);
  }
  delay(2);
}
