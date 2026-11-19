#pragma once
// Mesmo sketch para qualquer coleira ESP32 compativel.
// Troque APENAS ARGOS_DEVICE_UUID em ArgosDevice.h para cada transmissor.
// O vinculo transmissor -> animal e controlado no banco, nunca neste firmware.
#include "ArgosDevice.h"
#define ARGOS_WIFI_CHANNEL 2
#define ARGOS_INTERVAL_S 30
#define ARGOS_REPETITIONS 3
#if __has_include("ArgosSecrets.h")
#include "ArgosSecrets.h"
#else
#define ARGOS_BEACON_SECRET ""
#endif
static_assert(ARGOS_INTERVAL_S >= 5 && ARGOS_INTERVAL_S <= 86400, "Intervalo inválido");
static_assert(ARGOS_WIFI_CHANNEL >= 1 && ARGOS_WIFI_CHANNEL <= 13, "Canal inválido");
