# Alinhamento da integração seletiva

Branch: `integracao/ml-backend-iot`, criada a partir do estado local consolidado de `backend-iot`
(`b65d487`). Não é merge em dev nem está pronta para merge direto. Os pacotes de aplicação já
haviam sido copiados de origin/dev; migrations, CI e iot ausentes foram recuperados sem alterar
os arquivos existentes. A comparação final deve ocorrer contra a dev atualizada.

Responsabilidades: ML entrega validação S3–S5, classificação S6, KPIs SQL S7, recuperação NTP e
avisos do ingestor. Integração prepara API/frontend e verifica contratos. Nenhuma alternativa de
worker foi desativada: não iniciar simultaneamente worker/ e backend/src/mqtt, nem ml/ e iot/.

## Contrato SQL proposto, ainda dependente de confirmação/entrega da Sprint 7

`argos_ml_analise(p_animal_id uuid, p_inicio timestamptz, p_fim timestamptz, p_periodo text)`
retorna JSON `AnaliseML` de shared/ml.ts, incluindo `comportamentos: ComportamentosML`.
O nome e assinatura são uma proposta de integração, não uma função confirmada em produção.
Se comportamentos forem entregues em RPC separada, ajustar o adaptador sem duplicar cálculos.

A API chama a RPC com cliente do usuário autenticado; a propriedade vem da sessão e o animal
é conferido antes da chamada. SQL deve usar SECURITY INVOKER, respeitar RLS, isolar o animal e
validar o período. Ausência/incompatibilidade retorna 503 explícito. Removida a execução de Python
do backend para calcular KPIs; não há fallback com números simulados.

## Gates anteriores ao merge

- Confirmar RPCs, parâmetros, tipos e semântica de cobertura com o responsável do ML.
- Testar funções SQL em banco isolado com duas propriedades e usuário autenticado.
- Comparar migrations versionadas com definições efetivamente aplicadas; não reaplicar DDL.
- Preservar classificação nula nas previsões de posição.
- Testar trigger de zona; updated_at não substitui histórico de vigência. Não atribuir zona antiga
  sem evidência temporal suficiente.
- Verificar avisos de sincronização/rejeição antes de desativar ingestores alternativos.
- Validar recuperação NTP sem retroatribuir horário a beacons não confiáveis.
- Completar painel frontend e executar ensaio integrado; nenhuma validação física declarada.

Nenhum push, merge, alteração de dados ou migration de produção foi executado neste alinhamento.

## Verificação local em 22/11/2026

- `pnpm --filter @argos/backend typecheck`: passou.
- `pnpm --filter @argos/backend test`: 27 testes passaram; inclui autenticação da rota ML,
  normalização de fuso, limites de período, paginação e rejeição de dados de outra propriedade.
- `pnpm --filter @argos/frontend build`: passou, com aviso de bundles maiores que 500 kB.
- `git diff --cached origin/dev --stat -- .github iot supabase`: vazio após a importação;
  esses diretórios correspondem ao snapshot local de origin/dev. Não comprova equivalência
  com DDL de produção ou com mudanças remotas posteriores.

A tela Animais consome `/api/iot/analise` para o animal em destaque e o período selecionado.
Exibe distância, cobertura, RMS, observações validadas e previsões de posição com classificação
opcional. Os cards simulados de comportamento ficaram restritos à demonstração pública.
Sem RPC disponível, a tela apresenta indisponibilidade e permite nova tentativa.
O painel ainda não tem validação visual em navegador nem teste ponta a ponta com a RPC real.
Não há cálculos de KPI no navegador ou subprocesso Python na API.

Pendências de integração: validação profunda do JSON retornado pela RPC, testes SQL de RLS entre
propriedades, confirmação da migration ausente com o DDL aplicado e ensaio dos avisos da central.
Os testes locais não comprovam essas condições. Os workflows recuperados executam testes;
não ativam dois serviços de ingestão. Nenhuma alternativa foi removida nem iniciada aqui.
