#pragma once
#include <stdint.h>

// Relógio monotônico em microssegundos: não sofre o wrap de millis() em 49 dias.
// A primeira âncora NTP é imutável; correções posteriores não reescrevem capturas.
struct ArgosClock {
  int64_t anchorUs = 0;
  int64_t epochUs = 0;
  void synchronize(int64_t monotonicUs, int64_t utcUs) {
    if (!epochUs && utcUs >= 1700000000000000LL) {
      anchorUs = monotonicUs;
      epochUs = utcUs;
    }
  }
  int64_t recover(int64_t capturedUs, uint64_t capturedBoot, uint64_t boot) const {
    if (!epochUs || capturedBoot != boot || capturedUs < 0 || capturedUs > anchorUs ||
        anchorUs - capturedUs > 1800000000LL) return 0;
    return (epochUs - (anchorUs - capturedUs)) / 1000000LL;
  }
};
