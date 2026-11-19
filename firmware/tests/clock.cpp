#include <cassert>
#include "../ArgosReceptor/ArgosClock.h"
int main() {
  ArgosClock clock;
  assert(clock.recover(0, 1, 1)==0);
  clock.synchronize(10000000, 1800000000000000LL);
  assert(clock.recover(5000000,1,1)==1799999995LL);
  assert(clock.recover(5000000,1,2)==0); // outro boot
  assert(clock.recover(11000000,1,1)==0); // não retroprojetar após âncora
  clock.synchronize(20000000,1900000000000000LL);
  assert(clock.recover(5000000,1,1)==1799999995LL); // ajuste não muda âncora
  ArgosClock longBoot;
  longBoot.synchronize(5000000000000LL,1800000000000000LL);
  assert(longBoot.recover(4999995000000LL,1,1)==1799999995LL); // >49 dias
  assert(longBoot.recover(4998000000000LL,1,1)==0); // limite de recuperação
}
