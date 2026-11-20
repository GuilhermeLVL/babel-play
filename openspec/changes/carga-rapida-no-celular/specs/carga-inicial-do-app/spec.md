## ADDED Requirements

### Requirement: O /app pinta rápido no celular em 4G lento

O `/app` SHALL ter LCP de no máximo 2,5 s e no máximo 300 KB de JS transferidos até o LCP, medidos pelo Lighthouse mobile
com `--throttling-method=devtools` (4G lento: 1,6 Mbps, RTT 150 ms, CPU 4×), na mediana de 3 corridas contra o staging.

#### Scenario: Visitante abre o app (LB-01)

- **WHEN** `node node_modules/lighthouse/cli/index.js https://<staging>/app --throttling-method=devtools
--only-categories=performance` roda 3 vezes no preset mobile
- **THEN** a mediana do LCP fica em no máximo 2500 ms (a auditoria mediu 7442 ms)
- **AND** o JS transferido até o LCP fica em no máximo 300 KB (a auditoria mediu 555 KB)

#### Scenario: Orçamento do bundle continua cobrado

- **WHEN** `npm run build && node scripts/perf/orcamento-bundle.mjs` roda na CI
- **THEN** o JS inicial fica abaixo do teto do `slo.json`, sem subir o teto atual de 180 KB gzip

### Requirement: Telas fechadas não entram no caminho crítico

O caminho crítico até o LCP do Início MUST NOT incluir o SDK de autenticação para o visitante sem sessão, os módulos do
Quest fora do Quest, o iChat, nem as telas de captura e de jogos. Esses módulos SHALL carregar por intenção (toque, foco ou
hover no item que os abre) ou depois do LCP.

#### Scenario: Visitante sem sessão

- **WHEN** um visitante sem sessão salva abre `/app` e a rede é registrada até o LCP
- **THEN** nenhum chunk `vendor-supabase`, `TrilhoDoQuest`, `InicioDoQuest`, `IChat`, `LiveCapture` ou `Play` foi pedido antes
  do LCP

#### Scenario: Intenção de legendar

- **WHEN** a pessoa toca o cartão "Legendar agora"
- **THEN** o chunk de LiveCapture começa a baixar no `touchstart`, e a tela de Legendar fica pronta em no máximo 300 ms a
  mais que a medição atual em 4G

#### Scenario: Quem tem sessão salva

- **WHEN** quem tem sessão salva abre `/app`
- **THEN** o SDK de autenticação é pedido no boot, e o tempo até a tela interativa sobe no máximo 100 ms em relação à
  medição de antes da mudança
