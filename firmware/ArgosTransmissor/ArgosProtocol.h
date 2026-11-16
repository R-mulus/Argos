#pragma once
#include <Arduino.h>
#include <mbedtls/md.h>
#include <stddef.h>
#include "ArgosConfig.h"

// Wire v2 little-endian ESP32. UUID completo evita tabela manual nos receptores.
struct __attribute__((packed)) ArgosBeacon {
  uint32_t magic;
  uint8_t version;
  uint8_t battery; // 255 = não medida; nunca estimar sem ADC calibrado.
  uint16_t reserved;
  uint8_t transmitter[16];
  uint64_t boot;
  uint32_t sequence;
  uint8_t tag[16];
};
static_assert(sizeof(ArgosBeacon) == 52, "Wire incompatível");
inline bool parseUuid(const char* s, uint8_t* out) {
  if (strlen(s) != 36) return false;
  size_t index = 0;
  for (size_t i = 0; i < 36;) {
    if (i == 8 || i == 13 || i == 18 || i == 23) { if (s[i++] != '-') return false; continue; }
    char pair[3] = {s[i], s[i+1], 0};
    if (!isxdigit(pair[0]) || !isxdigit(pair[1])) return false;
    out[index++] = strtoul(pair, nullptr, 16); i += 2;
  }
  return index == 16;
}
inline void formatUuid(const uint8_t* u, char* out) {
  snprintf(out, 37, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    u[0],u[1],u[2],u[3],u[4],u[5],u[6],u[7],u[8],u[9],u[10],u[11],u[12],u[13],u[14],u[15]);
}
inline bool tagBeacon(const ArgosBeacon& b, uint8_t* tag) {
  uint8_t digest[32];
  const auto* md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!md || mbedtls_md_hmac(md, (const uint8_t*)ARGOS_BEACON_SECRET,
      strlen(ARGOS_BEACON_SECRET), (const uint8_t*)&b, offsetof(ArgosBeacon, tag), digest)) return false;
  memcpy(tag, digest, 16); return true;
}
inline bool verifyBeacon(const ArgosBeacon& b) {
  if (b.magic != 0xA260BEE1UL || b.version != 2 || b.reserved || !b.sequence ||
      (b.battery > 100 && b.battery != 255)) return false;
  uint8_t tag[16]; if (!tagBeacon(b, tag)) return false;
  uint8_t diff=0; for (int i=0;i<16;i++) diff |= tag[i]^b.tag[i];
  return diff == 0;
}
inline void eventId(const ArgosBeacon& b, char* out, size_t size) {
  char uuid[37]; formatUuid(b.transmitter, uuid);
  snprintf(out, size, "%s:%08lx%08lx:%lu", uuid, (unsigned long)(b.boot >> 32),
    (unsigned long)b.boot, (unsigned long)b.sequence);
}
