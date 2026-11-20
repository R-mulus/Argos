#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <mbedtls/md.h>

namespace argos {
// Compatível byte a byte com origin/dev: little-endian em todas as placas ESP32.
struct __attribute__((packed)) Beacon {
  uint32_t magic;
  uint8_t version;
  uint8_t battery;
  uint16_t reserved;
  uint8_t transmitter[16];
  uint64_t boot;
  uint32_t sequence;
  uint8_t tag[16];
};
static_assert(sizeof(Beacon) == 52 && offsetof(Beacon, tag) == 36, "Wire v2 incompatível");
constexpr uint32_t MAGIC = 0xA260BEE1UL;

inline int hex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
inline bool validUuidBytes(const uint8_t* u) {
  return (u[6] >> 4) >= 1 && (u[6] >> 4) <= 8 && (u[8] & 0xc0) == 0x80;
}
inline bool parseUuid(const char* s, uint8_t* out) {
  if (!s || strlen(s) != 36) return false;
  size_t n = 0;
  for (size_t i = 0; i < 36;) {
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (s[i++] != '-') return false;
      continue;
    }
    int high = hex(s[i++]), low = hex(s[i++]);
    if (high < 0 || low < 0) return false;
    out[n++] = (high << 4) | low;
  }
  return validUuidBytes(out);
}
inline void formatUuid(const uint8_t* u, char* out) {
  snprintf(out, 37, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    u[0],u[1],u[2],u[3],u[4],u[5],u[6],u[7],u[8],u[9],u[10],u[11],u[12],u[13],u[14],u[15]);
}
inline bool sign(const Beacon& b, const char* secret, uint8_t* tag) {
  if (!secret || strlen(secret) < 32) return false;
  uint8_t digest[32];
  const auto* md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!md || mbedtls_md_hmac(md, reinterpret_cast<const uint8_t*>(secret), strlen(secret),
      reinterpret_cast<const uint8_t*>(&b), offsetof(Beacon, tag), digest) != 0) return false;
  memcpy(tag, digest, 16);
  return true;
}
inline bool verify(const Beacon& b, const char* secret) {
  if (b.magic != MAGIC || b.version != 2 || b.reserved || !b.sequence || !b.boot ||
      !validUuidBytes(b.transmitter) || (b.battery > 100 && b.battery != 255)) return false;
  uint8_t tag[16];
  if (!sign(b, secret, tag)) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < sizeof(tag); ++i) diff |= tag[i] ^ b.tag[i];
  return diff == 0;
}
inline void eventId(const Beacon& b, char* out, size_t size) {
  char uuid[37]; formatUuid(b.transmitter, uuid);
  snprintf(out, size, "%s:%08lx%08lx:%lu", uuid,
    static_cast<unsigned long>(b.boot >> 32),
    static_cast<unsigned long>(b.boot & 0xffffffffULL), static_cast<unsigned long>(b.sequence));
}
} // namespace argos
