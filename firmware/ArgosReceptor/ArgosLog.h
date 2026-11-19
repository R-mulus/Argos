#pragma once
// 0: silencioso, 1: ERROR, 2: WARN, 3: INFO, 4: DEBUG.
#ifndef ARGOS_LOG_LEVEL
#define ARGOS_LOG_LEVEL 3
#endif
#define ARGOS_LOG(level, area, format, ...) do { \
  if (ARGOS_LOG_LEVEL >= level) Serial.printf("[%s] " format "\n", area, ##__VA_ARGS__); \
} while (0)
