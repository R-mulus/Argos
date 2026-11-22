#pragma once
#include "ArgosDevice.h"
#if __has_include("ArgosSecrets.h")
#include "ArgosSecrets.h"
#else
#include "ArgosSecrets.example.h"
#endif
#define ARGOS_WIFI_CHANNEL 2
#define ARGOS_INTERVAL_S 5
#define ARGOS_REPETITIONS 3
// Potência em unidades de 0,25 dBm: 52 = 13 dBm. Calibrar RSSI usando este valor.
#define ARGOS_TX_POWER 52
static_assert(ARGOS_WIFI_CHANNEL >= 1 && ARGOS_WIFI_CHANNEL <= 11, "Canal deve ser 1..11");
static_assert(ARGOS_INTERVAL_S > 0 && ARGOS_REPETITIONS > 0, "Intervalo/repetições inválidos");
