# Entrega ML — Sprint 7 e fronteira de integração

Responsável: Larápio. Revisão técnica: 22/11/2026 (America/Sao_Paulo).
Branch `backend-iot`, worktree separado `argos-ml-sprint7`. O checkout da integração foi preservado.
Nenhuma API Express, componente React ou definição em `shared/ml.ts` foi alterada nesta entrega.

## RPC e compatibilidade

```sql
select public.argos_ml_analise(
  p_animal_id => '00000000-0000-4000-8000-000000000021'::uuid,
  p_inicio => '2026-11-01T00:00:00Z'::timestamptz,
  p_fim => '2026-11-01T00:10:00Z'::timestamptz,
  p_periodo => 'dia'
);
```

UUID acima é exclusivamente fixture isolada. Na API usar o animal autorizado da sessão:

```ts
const { data, error } = await clientDoUsuario.rpc('argos_ml_analise', {
  p_animal_id: animalId, p_inicio: inicioISO, p_fim: fimISO, p_periodo: periodo,
});
```

Assinatura proposta pelo integrador mantida. Retorna `jsonb` com os três objetos de
`AnaliseML`: `resumo`, `movimentacao`, `comportamentos`. `ComportamentosML` permanece intacto.
Extensões **aditivas para revisão conjunta**, sem alteração silenciosa dos tipos TypeScript:

- `qualidade`: versão do contrato 1; segundos sem cobertura, segundos observados indeterminados,
  velocidade máxima estimada, localizações excluídas, mínimo de receptores, origens,
  referenciais e quantidade de observações confiáveis.
- `comportamentos_temporais`: início/fim de cada bucket, classe, segundos observados.
- `previsoes`: quantidade, disponibilidade, observado_em, previsto_para, horizonte_segundos,
  modelo_versao, origem, referencial_versao, desempenho_validado.

O consumidor atual pode ignorar essas extensões. `PainelML.previsoes` é um **array** da API;
o novo `previsoes` da RPC é um **resumo**. Ao montar PainelML, manter o array já consultado,
ou mapear este resumo para outro nome; não substituir o array pelo objeto da RPC.
Histórico de coordenadas permanece em `argos_localizacoes`/API existente, sem duplicar listas
potencialmente grandes no JSON dos KPIs. Distância e deslocamento acumulado usam o mesmo
estimador: soma dos segmentos aceitos; não são dois indicadores independentes.

## Semântica dos cálculos

- Animal deve pertencer à propriedade do `auth.uid()` e ser visível sob RLS.
  Função `SECURITY INVOKER`, `search_path=''`, timezone UTC. EXECUTE só para authenticated;
  anon e PUBLIC revogados. Não fornece caminho de consulta com service role.
- Intervalo `[inicio,fim)`, timestamps finitos com fuso, positivo, máximo 31 dias.
  `dia`: buckets de uma hora UTC; `semana` e `mes`: buckets diários UTC, cortados nas bordas.
  Erros: `22023` para período inválido; `42501` para animal inexistente ou não autorizado,
  sem distinguir esses dois casos. Nenhuma consulta inicia IoT, Python ou TensorFlow.
- Localização válida: >=3 receptores, RMS entre 0 e 15 m, coordenadas finitas dentro de ±1e6 m,
  vínculo histórico único e proveniência explícita. Valores são limites de engenharia,
  não evidência de precisão. Amostras inválidas não são removidas antes de formar pares:
  não se cria uma ponte artificial através delas.
- Pares consecutivos do mesmo transmissor: mesmo referencial, hash e origem, intervalo >0
  e <=120 s, velocidade <=8 m/s e um único vínculo cobrindo ambos os instantes.
  Timestamps duplicados e sobreposição entre transmissores não produzem deslocamento.
  Mudanças de referencial interrompem segmentos; coordenadas nunca são subtraídas entre eles.
- Distância é soma proporcional dos segmentos dentro do período. Velocidade média é
  distância/segundos cobertos; máxima é o maior segmento aceito. RMS é resíduo do ajuste,
  **não erro físico**. Dados experimentais/sintéticos ficam identificados em `qualidade.origens`.
- Repouso aparente: velocidade <=0,1 m/s e deslocamento <=3 m. Movimento aparente:
  velocidade >=0,5 m/s e distância >3 m + RMS de ambas as amostras. Demais segmentos
  aceitos são indeterminados. Lacunas são `segundos_sem_cobertura`, nunca repouso.
- Sem cobertura: distância, velocidades e tempos aparentes do resumo são null;
  cobertura é 0. Buckets possuem contadores 0 e percentuais null. Uma amostra isolada
  permite contar localização e RMS, mas não distância ou velocidade.
- Comportamentos observados exigem `revisado_em`, `revisado_por` não vazio, confiança >=0,8
  e classe conhecida. Intervalos de até 120 s entre rótulos concordantes da mesma câmera;
  transições, sobreposição de câmeras e observações conflitantes não entram na cobertura.
  Percentuais têm como denominador somente o tempo observado confiável, não todo o período.
  Probabilidades de previsões não são convertidas em percentuais de tempo.
- Previsões são filtradas pelo instante de observação, com horizonte positivo; aceitam
  classificação/confiança/probabilidades nulas. Não são tratadas como rótulos.
  `desempenho_validado=null`: ainda não há registro persistido de métricas revisadas de modelos.
  O backend não deve depender de manifestos no disco do worker para servir o histórico.

## Migrations propostas e implantação

Pré-requisitos: migrations de `origin/dev` até `20261116181500`, recuperadas byte a byte
do snapshot local. Isso não comprova equivalência com DDL adicional em produção.

1. `20261122235957_argos_ml_proveniencia.sql`: campos opcionais de referencial/hash/origem
   nas localizações e previsões; classificação nullable; revisão de rótulos e SELECT restrito
   por RLS aos rótulos revisados da propriedade. Não concede escrita a authenticated.
2. `20261122235958_argos_ml_kpis.sql`: RPC e permissões.

Arquivos gerados com `supabase migration new` (CLI 3.2.0); SQL testado somente no PostgreSQL
descartável. **Não aplicados em produção.** Comparar primeiro o schema e histórico remoto;
não reaplicar migrations antigas ou preencher proveniência retroativamente para fazer KPI aparecer.
As duas localizações antigas/genéricas devem continuar indisponíveis para deslocamento se não
houver prova do referencial. Nenhum backfill é incluído.

Ordem de rollout: revisar schema em staging → aplicar as propostas autorizadas → validar RPC com
JWTs de duas propriedades → atualizar ML → integrar API. O novo worker grava os campos de
proveniência; antes da migration, PostgREST pode recusá-los. Jobs/outbox permanecem para retry;
não habilitar escrita antes do rollout. `ARGOS_WRITE_ENABLED=0` permanece padrão.

## Testes reproduzíveis

```powershell
pnpm --dir supabase/testes --ignore-workspace install --frozen-lockfile
$env:ARGOS_TEST_PYTHON = (Resolve-Path ml/.venv/Scripts/python.exe).Path
node --test supabase/testes/ml.test.mjs
```

PGlite 0.5.17 executa PostgreSQL WASM em memória, aplica todas as migrations, usa papéis
authenticated/anon e RLS reais. `auth.uid()` é um stub de sessão no bootstrap; não simula
validação criptográfica JWT, PostgREST, Supabase Auth, concorrência distribuída ou navegador.
Sem ARGOS_TEST_PYTHON, apenas o ensaio RSSI→Python→SQL fica marcado como skipped.

O teste mantém os dados após finalizar o processo Python e consulta a RPC sem broker/ESP32.
Testes HTTP/React de banco indisponível e estado visual desatualizado pertencem ao integrador;
não foram declarados concluídos por estes testes SQL.

Exemplo vazio completo: `supabase/testes/exemplo-vazio.json`. Exemplos são fixtures, não telemetria real.
