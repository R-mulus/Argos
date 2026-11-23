#include <ArgosProtocol.h>
#include <assert.h>
#include <iostream>
#include <string>

const char* secret = "0123456789abcdef0123456789abcdef";
const char* uuid = "12345678-1234-4234-9234-123456789abc";
void resign(argos::Beacon& b) { assert(argos::sign(b, secret, b.tag)); }
int main() {
  argos::Beacon b = {};
  assert(argos::parseUuid(uuid, b.transmitter));
  char canonical[37]; argos::formatUuid(b.transmitter, canonical);
  assert(std::string(canonical) == uuid);
  const char* bad[] = {"", "00000000-0000-0000-0000-000000000000",
    "12345678-1234-4234-7234-123456789abc", "12345678-1234-9234-9234-123456789abc",
    "12345678_1234-4234-9234-123456789abc", "12345678-1234-4234-9234-123456789abg"};
  uint8_t parsed[16];
  for (auto value : bad) assert(!argos::parseUuid(value, parsed));
  assert(!argos::parseUuid(nullptr, parsed));
  assert(argos::parseUuid("12345678-1234-4234-9234-123456789ABC", parsed));
  b.magic = argos::MAGIC; b.version = 2; b.battery = 255;
  b.boot = 0x0123456789abcdefULL; b.sequence = 42; resign(b);
  assert(argos::verify(b, secret));
  assert(!argos::verify(b, "fedcba9876543210fedcba9876543210"));
  assert(!argos::verify(b, "short"));
  assert(!argos::verify(b, nullptr));
  // Qualquer bit alterado, inclusive na assinatura, deve invalidar o pacote.
  for (size_t bit = 0; bit < sizeof(b) * 8; ++bit) {
    auto modified = b;
    reinterpret_cast<uint8_t*>(&modified)[bit / 8] ^= 1 << (bit % 8);
    assert(!argos::verify(modified, secret));
  }
  // Campos semanticamente inválidos continuam rejeitados com HMAC correto.
  auto modified = b; modified.version = 3; resign(modified); assert(!argos::verify(modified, secret));
  modified = b; modified.reserved = 1; resign(modified); assert(!argos::verify(modified, secret));
  modified = b; modified.sequence = 0; resign(modified); assert(!argos::verify(modified, secret));
  modified = b; modified.boot = 0; resign(modified); assert(!argos::verify(modified, secret));
  for (int battery = 0; battery <= 255; ++battery) {
    modified = b; modified.battery = battery; resign(modified);
    assert(argos::verify(modified, secret) == (battery <= 100 || battery == 255));
  }
  char event[80]; argos::eventId(b, event, sizeof(event));
  assert(std::string(event) == "12345678-1234-4234-9234-123456789abc:0123456789abcdef:42");
  // Cópias e receptores diferentes mantêm a mesma identidade da transmissão.
  char repeat[80]; argos::eventId(b, repeat, sizeof(repeat)); assert(!strcmp(event, repeat));
  modified = b; ++modified.sequence; argos::eventId(modified, repeat, sizeof(repeat)); assert(strcmp(event, repeat));
  modified = b; ++modified.boot; argos::eventId(modified, repeat, sizeof(repeat)); assert(strcmp(event, repeat));
  modified = b; modified.sequence = UINT32_MAX; argos::eventId(modified, repeat, sizeof(repeat));
  assert(std::string(repeat).find(":4294967295") != std::string::npos);
  // Saída comparada ao vetor independente Python pelo script de testes.
  for (size_t i = 0; i < sizeof(b); ++i) printf("%02x", reinterpret_cast<uint8_t*>(&b)[i]);
  puts("");
  std::cout << "OK: UUID, HMAC, 416 mutacoes, 256 baterias e identidade do evento\n";
}
