#pragma once
#include <LittleFS.h>
#include <ArgosProtocol.h>

// Formato local; independente do pacote de rádio. Detecta escrita parcial/corrupção.
struct __attribute__((packed)) StoredReading {
  argos::Beacon beacon;
  int64_t observed;
  int8_t rssi;
  uint32_t crc;
};
inline uint32_t recordCrc(const StoredReading& r) {
  uint32_t crc = 0xffffffffUL;
  const uint8_t* data = reinterpret_cast<const uint8_t*>(&r);
  for (size_t i = 0; i < offsetof(StoredReading, crc); ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (0xedb88320UL & (0U - (crc & 1)));
  }
  return ~crc;
}
class ReadingQueue {
 public:
  uint32_t pending = 0;
  uint32_t discarded = 0;
  bool begin(const String& owner) {
    if (!LittleFS.begin(false)) {
#if ARGOS_FORMAT_FLASH
      if (!LittleFS.format() || !LittleFS.begin(false)) return false;
#else
      Serial.println("FLASH: não montou; primeiro uso exige ARGOS_FORMAT_FLASH=1");
      return false;
#endif
    }
    if (!LittleFS.exists("/q") && !LittleFS.mkdir("/q")) return false;
    if (!LittleFS.exists("/bad") && !LittleFS.mkdir("/bad")) return false;
    File dir = LittleFS.open("/q");
    if (!dir) return false;
    for (File f = dir.openNextFile(); f; f = dir.openNextFile()) { ++pending; f.close(); }
    dir.close();
    String previous;
    File f = LittleFS.open("/owner", "r");
    if (f) { previous = f.readString(); f.close(); }
    if (previous != owner) {
      // Impede republicar fila antiga sob outro receptor/propriedade.
      if (pending || LittleFS.exists("/writing.tmp")) {
        Serial.println("FLASH: identidade mudou com fila pendente; restaure identidade anterior para drenar");
        return false;
      }
      f = LittleFS.open("/owner.tmp", "w");
      if (!f) return false;
      size_t n = f.print(owner); f.flush(); f.close();
      if (n != owner.length() || !LittleFS.rename("/owner.tmp", "/owner")) return false;
    }
    if (LittleFS.exists("/writing.tmp")) {
      StoredReading r = {};
      if (!read("/writing.tmp", r)) {
        // Preserva o arquivo incompleto para diagnóstico; não formata a partição.
        if (!LittleFS.rename("/writing.tmp", String("/bad/tmp-") + esp_random())) return false;
        ++discarded;
      } else {
        String name = path(r);
        if (LittleFS.exists(name)) {
          if (!LittleFS.remove("/writing.tmp")) return false;
        } else {
          if (!LittleFS.rename("/writing.tmp", name)) return false;
          ++pending;
        }
      }
    }
    return true;
  }
  bool read(const String& path, StoredReading& r) {
    File f = LittleFS.open(path, "r");
    if (!f) return false;
    bool ok = f.size() == sizeof(r) && f.read(reinterpret_cast<uint8_t*>(&r), sizeof(r)) == sizeof(r);
    f.close();
    return ok && r.crc == recordCrc(r) && r.rssi >= -127 && r.rssi <= 0 &&
      (r.observed == 0 || (r.observed >= 1700000000LL && r.observed <= 4102444800LL)) &&
      argos::verify(r.beacon, ARGOS_BEACON_SECRET);
  }
  String path(const StoredReading& r) {
    char event[80]; argos::eventId(r.beacon, event, sizeof(event));
    return String("/q/") + event + ".bin";
  }
  bool append(StoredReading& r) {
    String name = path(r);
    if (LittleFS.exists(name)) return true;
    if (pending >= ARGOS_MAX_FILES || LittleFS.totalBytes() - LittleFS.usedBytes() < 16384) {
      ++discarded; return false;
    }
    // Nunca sobrescreve um temporário que não conseguiu concluir.
    if (LittleFS.exists("/writing.tmp")) return false;
    r.crc = recordCrc(r);
    File f = LittleFS.open("/writing.tmp", "w");
    if (!f) { ++discarded; return false; }
    size_t n = f.write(reinterpret_cast<const uint8_t*>(&r), sizeof(r));
    f.flush(); f.close();
    if (n != sizeof(r)) {
      ++discarded;
      if (!LittleFS.remove("/writing.tmp")) Serial.println("FLASH: temporário incompleto preservado");
      return false;
    }
    if (!LittleFS.rename("/writing.tmp", name)) return false;
    ++pending; return true;
  }
  bool first(StoredReading& r, String& name) {
    File dir = LittleFS.open("/q");
    File f = dir.openNextFile();
    if (!f) { dir.close(); return false; }
    name = f.path(); f.close(); dir.close();
    if (read(name, r)) return true;
    String quarantine = String("/bad/") + name.substring(name.lastIndexOf('/') + 1);
    if (LittleFS.rename(name, quarantine)) { --pending; ++discarded; }
    Serial.println("FLASH: registro inválido; separado para diagnóstico quando possível");
    return false;
  }
  bool acknowledge(const String& name) {
    if (!LittleFS.remove(name)) return false;
    --pending; return true;
  }
};
