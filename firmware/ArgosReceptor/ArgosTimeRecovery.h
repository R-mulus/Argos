#pragma once
#include <stdint.h>

// Apenas instantes monotônicos capturados em RAM no boot atual. Não aceita flash antiga.
inline int64_t recoverObservedTime(int64_t capturedUs, int64_t nowUs, int64_t epoch,
                                   bool synced, bool sameBoot) {
  if (!synced || !sameBoot || capturedUs <= 0 || nowUs < capturedUs ||
      nowUs - capturedUs > 300000000LL || epoch < 1700000000LL || epoch > 4102444800LL) return 0;
  const int64_t result = epoch - (nowUs - capturedUs) / 1000000LL;
  return result >= 1700000000LL ? result : 0;
}
