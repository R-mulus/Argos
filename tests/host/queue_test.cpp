#define ARGOS_FORMAT_FLASH 0
#define ARGOS_MAX_FILES 2
#define ARGOS_BEACON_SECRET "0123456789abcdef0123456789abcdef"
#include "ArgosQueue.h"
#include <assert.h>

StoredReading reading(uint32_t sequence) {
  StoredReading r = {};
  r.beacon.magic = argos::MAGIC; r.beacon.version = 2; r.beacon.battery = 255;
  r.beacon.boot = 0x0123456789abcdefULL; r.beacon.sequence = sequence;
  assert(argos::parseUuid("12345678-1234-4234-9234-123456789abc", r.beacon.transmitter));
  assert(argos::sign(r.beacon, ARGOS_BEACON_SECRET, r.beacon.tag));
  r.rssi = -65; r.observed = 0; return r;
}
int main() {
  LittleFS.fresh();
  ReadingQueue q; assert(q.begin("owner-A"));
  auto a = reading(1), b = reading(2), c = reading(3);
  assert(q.append(a)); assert(q.pending == 1);
  assert(q.append(a)); assert(q.pending == 1);
  assert(q.append(b)); assert(q.pending == 2);
  assert(!q.append(c)); assert(q.pending == 2); // Fila cheia preserva antigos.
  ReadingQueue restart; assert(restart.begin("owner-A")); assert(restart.pending == 2);
  ReadingQueue wrongOwner; assert(!wrongOwner.begin("owner-B"));
  String path; StoredReading recovered;
  assert(restart.first(recovered, path));
  assert(recovered.observed == 0 && recovered.rssi == -65); // Null não vira horário de reenvio.
  LittleFS.failRemove = true; assert(!restart.acknowledge(path)); assert(restart.pending == 2);
  LittleFS.failRemove = false; assert(restart.acknowledge(path)); assert(restart.pending == 1);
  assert(restart.first(recovered, path)); assert(restart.acknowledge(path));
  assert(restart.pending == 0);
  ReadingQueue reprovision; assert(reprovision.begin("owner-B")); // Pode trocar após drenar.

  LittleFS.fresh(); ReadingQueue interrupted; assert(interrupted.begin("A"));
  LittleFS.failRename = true; assert(!interrupted.append(a));
  assert(LittleFS.exists("/writing.tmp")); assert(!interrupted.append(b));
  LittleFS.failRename = false;
  ReadingQueue recover; assert(recover.begin("A")); assert(recover.pending == 1);
  assert(recover.first(recovered, path)); assert(recovered.beacon.sequence == 1);

  // Uma alteração no horário (fora do HMAC de rádio) é detectada pelo CRC local.
  auto corrupt = recovered; corrupt.observed = 1700000010;
  File f = LittleFS.open(path, "w"); f.write(reinterpret_cast<uint8_t*>(&corrupt), sizeof(corrupt)); f.close();
  assert(!recover.first(recovered, path)); assert(recover.pending == 0);
  assert(recover.discarded == 1);

  LittleFS.fresh(); ReadingQueue partial; assert(partial.begin("A"));
  f = LittleFS.open("/writing.tmp", "w"); f.write(reinterpret_cast<uint8_t*>(&a), 10); f.close();
  ReadingQueue recoverPartial; assert(recoverPartial.begin("A"));
  assert(recoverPartial.pending == 0 && recoverPartial.discarded == 1);
  assert(!LittleFS.exists("/writing.tmp"));
  puts("OK: fila, duplicacao, limite, reinicio, identidade, falha de remocao/rename e corrupcao");
}
