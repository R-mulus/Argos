#pragma once
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <errno.h>
#include "ArgosConfig.h"

#if ARGOS_LOCAL_PLAINTEXT
using ArgosTransport = WiFiClient;
#else
using ArgosTransport = WiFiClientSecure;
#endif

// ArduinoMqttClient chama Client::connect antes de enviar MQTT CONNECT.
// Instrumentar essa chamada mede a conexão real, sem socket extra, publish de teste,
// troca de canal, escrita em flash ou trabalho no callback ESP-NOW.
class ArgosNetworkClient : public ArgosTransport {
 public:
  using ArgosTransport::connect;
  int connect(const char* host, uint16_t port) override {
#if ARGOS_NETWORK_DIAGNOSTICS
    const uint32_t start = millis();
    errno = 0;
#endif
    const int result = ArgosTransport::connect(host, port);
#if ARGOS_NETWORK_DIAGNOSTICS
    const int socketError = errno;
    Serial.printf("%s: %s broker=%s:%u tempo_ms=%lu WiFi=%d canal=%d errno_aux=%d\n",
      ARGOS_LOCAL_PLAINTEXT ? "TCP" : "TCP/TLS", result ? "OK" : "FALHOU",
      host, unsigned(port), (unsigned long)(millis() - start), WiFi.status(), WiFi.channel(),
      result ? 0 : socketError);
    // errno é auxiliar: o cliente/core pode não preservar o erro original do socket.
#if !ARGOS_LOCAL_PLAINTEXT
    if (!result) {
      char detail[160] = {};
      const int code = lastError(detail, sizeof(detail));
      Serial.printf("TLS: erro=%d detalhe=%s (inclui TCP e handshake; CA continua obrigatoria)\n", code, detail);
    }
#endif
#endif
    return result;
  }
};
