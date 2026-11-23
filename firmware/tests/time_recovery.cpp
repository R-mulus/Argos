#include "../ArgosReceptor/ArgosTimeRecovery.h"
#include <assert.h>
int main() {
  const int64_t t = 1800000000LL;
  assert(recoverObservedTime(1000000,61000000,t,true,true)==t-60);
  assert(recoverObservedTime(1000000,61000000,t,false,true)==0); // sem NTP / perda prolongada
  assert(recoverObservedTime(1000000,61000000,t,true,false)==0); // reboot
  assert(recoverObservedTime(1000000,301000001,t,true,true)==0); // antigo
  assert(recoverObservedTime(61000000,1000000,t,true,true)==0); // relógio monotônico inválido
  assert(recoverObservedTime(0,1000000,t,true,true)==0); // legado sem captura
  assert(recoverObservedTime(1000000,61000000,1,true,true)==0);
}
