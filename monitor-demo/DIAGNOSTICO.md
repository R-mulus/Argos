# Diagnóstico inicial — 25/11/2026

Branch `dev`, base `7be96bd`. Fluxo oficial: firmware ESP-NOW → MQTT/EMQX →
`worker/` (SQLite e sincronização) → `deteccoes` → trigger `argos_iot_jobs` →
`ml/argos_ml/worker.py` (trilateração e GRU v1) → Supabase → servidor Python → HTML.
`iot/` é alternativa legada: não iniciar junto com `ml/`.

Antes das alterações, consulta remota encontrou 2.556 detecções, 746 localizações
(744 experimentais), 91 jobs pendentes e 132 sem receptores calibrados suficientes.
Última observação localizada: 23/11 19:59:36 UTC; cálculo: 19:59:43 UTC.
Última recepção: 24/11 18:05:31 UTC, mas última medição: 23/11 20:03:23 UTC.
Recebimento tardio não é evidência de transmissor ativo.

RX-001 = (-9,27; 0,03), RX-002 = (6,73; -6,50), RX-003 = (5; 10) metros.
As coordenadas dos dois primeiros mudaram em 23/11 23:48 UTC, depois das últimas
localizações. O usuário confirmou usar a geometria atual. Não reutilizar posições
da geometria anterior como se fossem atuais. Calibração continua experimental.

Problemas no monitor: consultas sequenciais repetem cadastros; snapshot inteiro
aguarda todas; filtro só experimental; RSSI limitado ao último evento; ausência
de diagnóstico da fila e de proteção contra regressão/saltos. Cache HTTP e exclusão
de consultas simultâneas já existiam, portanto não são a causa demonstrada.

Nenhuma tabela está publicada no Realtime. Usar polling local controlado com
consulta agregada no servidor, sem chave no navegador. RLS está habilitada nas
tabelas inspecionadas; leitura autenticada de posições restringe por proprietário.
Jobs são privados. Dados sintéticos ficarão em tabelas próprias sem triggers IoT.

A causa histórica exata do teste físico não pode ser reconstruída só pelo estado
atual. Fila pendente, mudança de calibração e ausência de posições novas são
evidências observadas; ensaio físico contínuo ainda precisa de placas transmitindo.
