#pragma once
// Mesmo sketch em S3, DevKit V1 e ESP32-U; altere identidade por equipamento.
#define ARGOS_PROPERTY_UUID "8da8c584-e51b-4b99-808d-8cf55cee7674"
#define ARGOS_RECEIVER_UUID "9b3cc23c-7c82-4105-96ad-9e6ee7d7c607"
#define ARGOS_WIFI_CHANNEL 6
#define ARGOS_NTP_SERVER "192.168.1.100" // NTP local para operar sem internet.
#define ARGOS_MQTT_PORT 8883
#define ARGOS_LOCAL_PLAINTEXT 0 // Somente laboratório em LAN isolada: 1, porta 1883.
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
