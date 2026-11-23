#pragma once
// Adaptador de teste: disco Windows + injeção de falha. Não simula o hardware flash.
#include <filesystem>
#include <fstream>
#include <memory>
#include <vector>
#include <iostream>
#include <chrono>
#include <string>
class String : public std::string {
 public:
  using std::string::string;
  String(const std::string& s) : std::string(s) {}
  String substring(size_t p) const { return substr(p); }
  size_t lastIndexOf(char c) const { return rfind(c); }
};
inline String operator+(const String& s, uint32_t n) { return String(std::string(s) + std::to_string(n)); }
struct { void println(const char* s) { std::cout << s << '\n'; } } Serial;
inline uint32_t esp_random() { static uint32_t value = 100; return ++value; }
namespace fs = std::filesystem;
class File {
  fs::path native;
  String name;
  std::shared_ptr<std::fstream> stream;
  std::vector<fs::path> entries;
  size_t cursor = 0;
  bool directory = false;
 public:
  File() = default;
  File(fs::path p, String logical, const char* mode) : native(p), name(logical) {
    directory = fs::is_directory(p);
    if (directory) { for (auto& e : fs::directory_iterator(p)) entries.push_back(e.path()); }
    else stream = std::make_shared<std::fstream>(p, std::ios::binary |
      (std::string(mode) == "w" ? std::ios::out | std::ios::trunc : std::ios::in));
  }
  explicit operator bool() const { return directory || (stream && stream->is_open()); }
  File openNextFile() {
    if (cursor == entries.size()) return {};
    auto p = entries[cursor++];
    return File(p, String(std::string(name) + "/" + p.filename().string()), "r");
  }
  void close() { if (stream) stream->close(); }
  String path() const { return name; }
  size_t size() const { return size_t(fs::file_size(native)); }
  String readString() { return String(std::string(std::istreambuf_iterator<char>(*stream), {})); }
  size_t read(uint8_t* out, size_t n) { stream->read(reinterpret_cast<char*>(out), n); return size_t(stream->gcount()); }
  size_t write(const uint8_t* in, size_t n) { stream->write(reinterpret_cast<const char*>(in), n); return *stream ? n : 0; }
  size_t print(const String& s) { return write(reinterpret_cast<const uint8_t*>(s.data()), s.length()); }
  void flush() { stream->flush(); }
};
class FakeLittleFS {
 public:
  fs::path root;
  bool failRename = false;
  bool failRemove = false;
  void fresh() {
    static uint32_t counter = 0;
    root = fs::path(".build") / ("queue-test-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()) + "-" + std::to_string(++counter));
    fs::create_directories(root);
  }
  fs::path resolve(const String& p) {
    // LittleFS aceita ':'; NTFS trata como alternate data stream. Escape no adaptador.
    std::string relative = std::string(p).substr(1);
    for (char& c : relative) if (c == ':') c = '_';
    return root / relative;
  }
  bool begin(bool) { return true; }
  bool exists(const String& p) { return fs::exists(resolve(p)); }
  bool mkdir(const String& p) { return fs::create_directories(resolve(p)); }
  File open(const String& p, const char* mode = "r") { return File(resolve(p), p, mode); }
  bool rename(const String& from, const String& to) {
    if (failRename) return false;
    std::error_code error;
    if (exists(to)) fs::remove(resolve(to), error);
    fs::rename(resolve(from), resolve(to), error); return !error;
  }
  bool remove(const String& p) { return !failRemove && fs::remove(resolve(p)); }
  size_t totalBytes() { return 1024 * 1024; }
  size_t usedBytes() { return 0; }
};
inline FakeLittleFS LittleFS;
