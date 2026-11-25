#pragma once
#include "ArgosDevice.h"
#if __has_include("ArgosSecrets.h")
#include "ArgosSecrets.h"
#else
#include "ArgosSecrets.example.h"
#endif
#define ARGOS_WIFI_CHANNEL 10
#define ARGOS_NTP_SERVER "pool.ntp.org"
// 1 somente para laboratório em LAN controlada; produção: 0 e porta 8883.
#ifndef ARGOS_LOCAL_PLAINTEXT
#define ARGOS_LOCAL_PLAINTEXT 1
#endif
#ifndef ARGOS_MQTT_PORT
#define ARGOS_MQTT_PORT 1883
#endif
// 1 somente no primeiro provisionamento, depois voltar a 0. Não formata se montar.
#define ARGOS_FORMAT_FLASH 0
#define ARGOS_MAX_FILES 512
#define ARGOS_RAM_READINGS 128
// Diagnostica a conexão usada pelo MQTT, sem abrir um segundo socket de teste.
#ifndef ARGOS_NETWORK_DIAGNOSTICS
#define ARGOS_NETWORK_DIAGNOSTICS 1
#endif
#define ARGOS_CONNECT_TIMEOUT_MS 2000
static_assert(ARGOS_LOCAL_PLAINTEXT == 0 || ARGOS_LOCAL_PLAINTEXT == 1, "Modo MQTT deve ser 0 ou 1");
static_assert(ARGOS_MQTT_PORT > 0 && ARGOS_MQTT_PORT <= 65535, "Porta MQTT inválida");
static_assert(ARGOS_WIFI_CHANNEL >= 1 && ARGOS_WIFI_CHANNEL <= 11, "Canal deve ser 1..11");
static_assert(ARGOS_MAX_FILES > 0 && ARGOS_RAM_READINGS > 0, "Fila inválida");
