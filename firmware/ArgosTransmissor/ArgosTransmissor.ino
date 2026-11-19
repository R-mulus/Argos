#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_sleep.h>
#include <esp_system.h>
#include <esp_idf_version.h>
#include "ArgosProtocol.h"

RTC_DATA_ATTR uint64_t bootNonce;
RTC_DATA_ATTR uint32_t sequence;
RTC_DATA_ATTR uint32_t sentinel;
static volatile bool sent = false;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 5, 0)
static void onSent(const wifi_tx_info_t*, esp_now_send_status_t) { sent = true; }
#else
static void onSent(const uint8_t*, esp_now_send_status_t) { sent = true; }
#endif
void setup() {
  Serial.begin(115200);
  if (strlen(ARGOS_BEACON_SECRET) < 32) {
    Serial.println("Configure ArgosSecrets.h com segredo de pelo menos 32 caracteres");
    esp_sleep_enable_timer_wakeup(60000000ULL); esp_deep_sleep_start();
  }
  WiFi.mode(WIFI_STA); WiFi.disconnect(false, false); WiFi.setSleep(false);
  esp_wifi_set_channel(ARGOS_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
  // Novo nonce após reset físico/software; deep sleep mantém sequência.
  if (esp_reset_reason() != ESP_RST_DEEPSLEEP || sentinel != 0xA260BEE1UL || sequence == UINT32_MAX) {
    bootNonce = ((uint64_t)esp_random() << 32) | esp_random(); sequence = 0; sentinel = 0xA260BEE1UL;
  }
  ArgosBeacon beacon = {};
  beacon.magic=0xA260BEE1UL; beacon.version=2; beacon.battery=255;
  beacon.boot=bootNonce; beacon.sequence=++sequence;
  bool valid = parseUuid(ARGOS_DEVICE_UUID, beacon.transmitter) && tagBeacon(beacon, beacon.tag);
  if (!valid) {
    Serial.println("UUID invalido ou falha ao assinar beacon; nada sera transmitido");
  } else {
    char id[80]; eventId(beacon, id, sizeof(id));
    Serial.printf("ARGOS transmissor UUID: %s\nEvento: %s\n", ARGOS_DEVICE_UUID, id);
  }
  if (valid && esp_now_init() == ESP_OK) {
    esp_now_register_send_cb(onSent);
    esp_now_peer_info_t peer = {}; memset(peer.peer_addr, 0xff, 6);
    peer.channel=ARGOS_WIFI_CHANNEL; peer.ifidx=WIFI_IF_STA; peer.encrypt=false;
    if (esp_now_add_peer(&peer) == ESP_OK) {
      for (int i=0;i<ARGOS_REPETITIONS;i++) {
        sent=false;
        if (esp_now_send(peer.peer_addr, (const uint8_t*)&beacon, sizeof(beacon)) == ESP_OK) {
          uint32_t start=millis(); while (!sent && millis()-start<300) delay(1);
        }
        delay(20 + esp_random()%60); // Mesmo evento em todas as cópias; reduz colisões.
      }
    }
    esp_now_deinit();
  }
  Serial.flush();
  WiFi.mode(WIFI_OFF);
  // Jitter entre coleiras evita sincronização permanente de colisões.
  esp_sleep_enable_timer_wakeup((uint64_t)ARGOS_INTERVAL_S*1000000ULL + esp_random()%500000);
  esp_deep_sleep_start();
}
void loop() {}
