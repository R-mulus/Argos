#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_sleep.h>
#include <esp_system.h>
#include <esp_idf_version.h>
#include <atomic>
#include <ArgosProtocol.h>
#include "ArgosConfig.h"

RTC_DATA_ATTR uint64_t bootNonce;
RTC_DATA_ATTR uint32_t sequence;
RTC_DATA_ATTR uint32_t sentinel;
std::atomic<bool> sent{false};
std::atomic<bool> radioOk{false};
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 5, 0)
void onSent(const wifi_tx_info_t*, esp_now_send_status_t status) {
#else
void onSent(const uint8_t*, esp_now_send_status_t status) {
#endif
  radioOk.store(status == ESP_NOW_SEND_SUCCESS);
  sent.store(true);
}
void sleepSeconds(uint32_t seconds) {
  Serial.flush();
  esp_sleep_enable_timer_wakeup(uint64_t(seconds) * 1000000ULL + esp_random() % 500000);
  esp_deep_sleep_start();
}
void fail(const char* message) {
  Serial.println(message);
  sleepSeconds(30);
}
void setup() {
  Serial.begin(115200);
  uint8_t property[16];
  argos::Beacon beacon = {};
  if (!argos::parseUuid(ARGOS_DEVICE_ID, beacon.transmitter) ||
      !argos::parseUuid(ARGOS_PROPERTY_ID, property) || !strlen(ARGOS_DEVICE_CODE) ||
      strlen(ARGOS_BEACON_SECRET) < 32) fail("CONFIG: preencha identidade e segredo; nova tentativa em 30s");
  WiFi.mode(WIFI_STA); WiFi.disconnect(false, false); WiFi.setSleep(false);
  if (esp_wifi_set_channel(ARGOS_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE) != ESP_OK ||
      esp_wifi_set_max_tx_power(ARGOS_TX_POWER) != ESP_OK) fail("RADIO: configuração falhou");
  // RF ativo fornece entropia; deep sleep preserva sequência, outros resets criam nonce.
  if (esp_reset_reason() != ESP_RST_DEEPSLEEP || sentinel != argos::MAGIC || sequence == UINT32_MAX) {
    do { bootNonce = (uint64_t(esp_random()) << 32) | esp_random(); } while (!bootNonce);
    sequence = 0; sentinel = argos::MAGIC;
  }
  beacon.magic = argos::MAGIC; beacon.version = 2; beacon.battery = 255;
  beacon.boot = bootNonce; beacon.sequence = ++sequence;
  if (!argos::sign(beacon, ARGOS_BEACON_SECRET, beacon.tag)) fail("HMAC: falha ao assinar");
  if (esp_now_init() != ESP_OK || esp_now_register_send_cb(onSent) != ESP_OK) fail("ESP-NOW: inicialização falhou");
  esp_now_peer_info_t peer = {};
  memset(peer.peer_addr, 0xff, 6);
  peer.channel = ARGOS_WIFI_CHANNEL; peer.ifidx = WIFI_IF_STA; peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) fail("ESP-NOW: broadcast indisponível");
  char event[80]; argos::eventId(beacon, event, sizeof(event));
  Serial.printf("TX %s MAC=%s canal=%d evento=%s\n", ARGOS_DEVICE_CODE,
    WiFi.macAddress().c_str(), ARGOS_WIFI_CHANNEL, event);
  for (int i = 0; i < ARGOS_REPETITIONS; ++i) {
    sent.store(false); radioOk.store(false);
    esp_err_t error = esp_now_send(peer.peer_addr, reinterpret_cast<const uint8_t*>(&beacon), sizeof(beacon));
    if (error == ESP_OK) {
      uint32_t start = millis();
      while (!sent.load() && millis() - start < 300) delay(1);
    }
    Serial.printf("copia=%d API=%s callback=%d radio=%d (nao confirma recepcao)\n",
      i + 1, esp_err_to_name(error), sent.load(), radioOk.load());
    // Não sobrepor transmissões quando o driver ainda não devolveu o callback.
    if (error == ESP_OK && !sent.load()) break;
    delay(20 + esp_random() % 60);
  }
  esp_now_deinit(); WiFi.mode(WIFI_OFF);
  sleepSeconds(ARGOS_INTERVAL_S);
}
void loop() {}
