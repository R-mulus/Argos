# Validação da integração backend-iot

Executada em 16/11/2026, base `dev` / `8b241f5e5f8fae849336755988c048fcb1528e02`.

| Verificação | Resultado |
|---|---|
| Backend TypeScript: `pnpm --dir backend typecheck` | Passou |
| Backend: `pnpm --dir backend test` | 25 testes passaram |
| Frontend: `pnpm --dir frontend build` | Passou; aviso preexistente de chunks >500 kB |
| Frontend: `pnpm --dir frontend lint` | Passou |
| Python: `python -m pytest -q` com PostgreSQL de teste | 10 testes passaram |
| Migrações completas do repositório | Aplicadas em PostgreSQL 17 descartável, com simulação mínima de papéis/auth Supabase |
| RLS | Outro usuário não lê coordenadas/localizações; proprietário lê; calibração inválida rejeitada |
| Job transacional | Dois receptores não localizam; terceiro localiza; quarto recalcula a mesma linha; replay não duplica |
| TensorFlow CPU 2.21 | Treino de 1 época, serialização, recarga e inferência das 3 saídas passaram com CSV sintético temporário |
| ESP32-C3 (`esp32:esp32:esp32c3`) | Compilou transmissor: 905.968 bytes de programa; 33.708 bytes de dados globais |
| ESP32-S3 (`esp32:esp32:esp32s3`) | Compilou receptor: 1.001.765 bytes de programa; 43.560 bytes de dados globais |
| ESP32 clássico (`esp32:esp32:esp32`) | Compilou receptor com OLED habilitado: 1.074.841 bytes de programa; 48.732 bytes de dados globais |

Firmware compilado com core Espressif 3.0.7, ArduinoMqttClient 0.1.8, ArduinoJson 7.4.2, Adafruit SSD1306 2.5.15 e dependências GFX/BusIO. A compilação usa placeholders sem segredos e **não comprova funcionamento físico**. Memória de heap dinâmica (fila, TLS, OLED) deve ser medida na placa; números acima são os globais reportados pelo compilador.

O smoke test TensorFlow usou rótulos sintéticos somente para verificar execução, não demonstrar acurácia. Modelo temporário não integra a entrega e não está aprovado para operação. O CI adicionado repete testes Python/PostgreSQL e compila firmware; seu resultado no GitHub só poderá ser verificado depois de publicar um commit. Não executa treinamento TensorFlow no CI.

Não executados: gravação nas placas, broker real do usuário, ACL/TLS do ambiente da fazenda, consumo de bateria, cortes físicos de energia, OLED físico, alcance/calibração RSSI, GRU com dados de animais, migração no Supabase real. Nenhum cadastro/histórico do banco real foi alterado.

## Reproduzir PostgreSQL

Use instância descartável PostgreSQL 17. Rode `iot/tests/bootstrap_postgres.sql` apenas nessa instância (simula papéis/auth para testes), depois todos os arquivos `supabase/migrations/*.sql` em ordem com `ON_ERROR_STOP=1`. Exporte `ARGOS_TEST_DATABASE_URL` e execute pytest dentro de `iot/`. O workflow `.github/workflows/iot.yml` documenta os comandos completos.

## Reproduzir firmware

```sh
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32@3.0.7 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli lib install 'ArduinoMqttClient@0.1.8' 'ArduinoJson@7.4.2' 'Adafruit SSD1306@2.5.15'
arduino-cli compile --fqbn esp32:esp32:esp32c3 firmware/ArgosTransmissor
arduino-cli compile --fqbn esp32:esp32:esp32s3 firmware/ArgosReceptor
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/ArgosReceptor
```

Para validar OLED, habilite `ARGOS_OLED=1` em uma cópia do sketch antes da última compilação. Não é necessário substituir segredos para compilar, apenas para operar.

## 19/11/2026 — correções para o ensaio físico

Executado em cópia da `dev` com as alterações locais (Node 22, pnpm 12.18, Python 3, core ESP32 3.0.7 compilado na nuvem).

| Verificação | Resultado |
|---|---|
| `pnpm --dir backend typecheck` / `test` | Passou / 30 testes |
| `python -m pytest -q` em `iot/` | 12 passaram, 1 pulado (PostgreSQL de teste não disponível) |
| `pnpm --dir frontend test` / `build` / `lint` | 31 testes / passou (aviso de chunk >500 kB) / passou |
| Receptor ESP32-S3 (TLS) | 1.011.833 bytes de programa, 43.648 bytes globais |
| Receptor ESP32 clássico (TLS) | 1.054.329 bytes de programa, 48.308 bytes globais |
| Receptor ESP32 clássico, `ARGOS_LOCAL_PLAINTEXT=1` + OLED | 1.002.349 bytes de programa, 48.244 bytes globais |

Não executados: gravação nas placas, broker do notebook, NTP, ensaio de recuperação, navegador com conta real. Coleira não alterada nem recompilada.
