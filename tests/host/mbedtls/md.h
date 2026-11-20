#pragma once
// Adaptador APENAS para teste Windows: executa o cabeçalho de produção usando
// HMAC-SHA256 do BCrypt. Firmware continua usando mbedTLS do core Espressif.
#include <windows.h>
#include <bcrypt.h>
#include <stdint.h>
#include <stddef.h>
struct mbedtls_md_info_t {};
enum { MBEDTLS_MD_SHA256 = 1 };
inline const mbedtls_md_info_t* mbedtls_md_info_from_type(int) {
  static mbedtls_md_info_t info; return &info;
}
inline int mbedtls_md_hmac(const mbedtls_md_info_t*, const uint8_t* key, size_t keySize,
                         const uint8_t* data, size_t size, uint8_t* digest) {
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  NTSTATUS status = BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, BCRYPT_ALG_HANDLE_HMAC_FLAG);
  if (status >= 0) status = BCryptCreateHash(algorithm, &hash, nullptr, 0, const_cast<PUCHAR>(key), ULONG(keySize), 0);
  if (status >= 0) status = BCryptHashData(hash, const_cast<PUCHAR>(data), ULONG(size), 0);
  if (status >= 0) status = BCryptFinishHash(hash, digest, 32, 0);
  if (hash) BCryptDestroyHash(hash);
  if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
  return status >= 0 ? 0 : -1;
}
