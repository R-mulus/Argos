#pragma once
// Cabeçalho de identificação: corresponde a dispositivos.id / vínculos do banco.
// Coleira de referência: TX-0001; animal esperado: A001.
// Animal UUID de referência: f1483d64-f6e2-4f4d-a9e9-aad1ec3ddd74.
// O vínculo temporal no banco é a autoridade; trocar animal não exige novo firmware.
#define ARGOS_TRANSMITTER_UUID "3fa85f64-5717-4562-b3fc-2c963f66afa6"
#define ARGOS_WIFI_CHANNEL 6
#define ARGOS_INTERVAL_S 30
#define ARGOS_REPETITIONS 3
#if __has_include("ArgosSecrets.h")
#include "ArgosSecrets.h"
#else
#define ARGOS_BEACON_SECRET ""
#endif
static_assert(ARGOS_INTERVAL_S >= 5 && ARGOS_INTERVAL_S <= 86400, "Intervalo inválido");
static_assert(ARGOS_WIFI_CHANNEL >= 1 && ARGOS_WIFI_CHANNEL <= 13, "Canal inválido");
