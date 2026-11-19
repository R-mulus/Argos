#pragma once
// Mesmo sketch para ESP32-S3, DevKit V1 e ESP32 classico com antena externa.
// Para outro receptor, altere APENAS ARGOS_DEVICE_UUID em ArgosDevice.h.
#include "ArgosDevice.h"
#define ARGOS_PROPERTY_UUID "8da8c584-e51b-4b99-808d-8cf55cee7674"
#define ARGOS_WIFI_CHANNEL 2
#define ARGOS_NTP_SERVER "pool.ntp.org" // Para rede sem internet, troque por NTP LOCAL funcional.
#define ARGOS_MQTT_PORT 8883
#define ARGOS_LOCAL_PLAINTEXT 0 // EMQX Cloud: TLS. Ensaio LAN isolado: 1 + porta 1883.
#define ARGOS_FORMAT_FLASH 0 // 1 apenas no provisionamento inicial; voltar a 0.
#define ARGOS_MAX_FILES 512
#define ARGOS_OLED 0
#define ARGOS_OLED_SDA 21
#define ARGOS_OLED_SCL 22
#if __has_include("ArgosSecrets.h")
#include "ArgosSecrets.h"
#else
#define ARGOS_BEACON_SECRET ""
#define ARGOS_WIFI_SSID ""
#define ARGOS_WIFI_PASS ""
#define ARGOS_MQTT_HOST ""
#define ARGOS_MQTT_USER ""
#define ARGOS_MQTT_PASS ""
#define ARGOS_MQTT_CA ""
#endif
static_assert(ARGOS_WIFI_CHANNEL >= 1 && ARGOS_WIFI_CHANNEL <= 13, "Canal inválido");
static_assert(ARGOS_MAX_FILES > 0, "Fila precisa de capacidade positiva");

#ifndef ARGOS_NTP_FALLBACK_1
#define ARGOS_NTP_FALLBACK_1 "time.google.com"
#endif
#ifndef ARGOS_NTP_FALLBACK_2
#define ARGOS_NTP_FALLBACK_2 "time.cloudflare.com"
#endif
