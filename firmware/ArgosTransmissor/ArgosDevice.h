#pragma once
// Copie ArgosDevice.example.h para ArgosDevice.local.h (ignorado pelo Git).
#if __has_include("ArgosDevice.local.h")
#include "ArgosDevice.local.h"
#else
#define ARGOS_DEVICE_ID ""
#define ARGOS_DEVICE_CODE ""
#define ARGOS_PROPERTY_ID ""
#endif
