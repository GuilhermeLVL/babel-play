## Why

O objetivo do ciclo (`research/frasy-core-stt-mt-desempenho/01-outcome.md`) é cortar pela metade o tempo entre o fim de cada
fala e a legenda TRADUZIDA completa na tela. Hoje esse tempo não é medido: a bancada mede "início da 1ª fala → 1º texto" e
"→ legenda completa", não "fim da fala → legenda traduzida" por fala. Além disso:

- a bancada de captura saiu inválida em 18/11/2026 neste Mac ("bipe não encontrado na sonda de áudio"), também no commit
  anterior à change `carga-rapida-no-celular`; a base `local-darwin` de `slo-captura.json` ficou PROVISÓRIA por isso;
- os números de celular e iPhone vêm de emulação (CEL-08, `docs/auditoria/2026-10-09-medicoes-no-aparelho.md`); nunca houve
  rodada em Android de entrada, iPhone ou Quest reais;
- o tempo de carga de cada modelo (download, compilação, aquecimento) não é medido; só há marcas `frasy:*` soltas de carga
  e pedido do tradutor (`src/gateway/marcasDeDesempenho.ts`), sem marca de fim da fala nem de legenda na tela;
- não há dado de campo (RUM): `/api/metricas/captura` (v:1) leva STT, 1º parcial, MT e RTF por motor, mas não a métrica
  principal nem a classe do aparelho; no Worker o lote é validado e descartado (sem backend de métricas).

As próximas mudanças do core (fila de tradução, tradução local leve, roteador com sinais de sessão) só se justificam se
provarem ganho. Sem um laboratório que meça, compare A/B e decida com critério escrito antes, cada uma seria opinião. Esta
change é o Lote 0: cria o laboratório e a linha de base oficial que as demais vão usar. Ela não muda a experiência de ninguém.

## What Changes

- **Diagnosticar e consertar a bancada** (`scripts/perf/latencia-legenda/`). A causa de "bipe não encontrado" NÃO está
  confirmada (ver design.md, "Diagnóstico do bipe"): a primeira tarefa é um diagnóstico que distingue as hipóteses e uma rodada
  que, ao falhar, diz POR QUÊ (sem sonda, sem áudio, sem 2 kHz, bipe perdido). Rodada inválida deixa de gerar número.
- **Métrica principal definida e instrumentada**: `fimDaFalaAteLegendaMs` = do último quadro de voz da fala (VAD) até o
  primeiro quadro pintado com a tradução FINAL daquela fala. Duas marcas novas (`frasy:fala:fim`, `frasy:legenda:traduzida`)
  e a regra de falas sem tradução, parciais e falhas. A bancada passa a medi-la fala a fala e valida o marcador de campo contra
  o instante real do áudio (erro ≤ 50 ms).
- **Tempo de carga por modelo** em três fases (download, compilação, aquecimento) por `frasy:modelo:<fase>:*`, para STT e MT.
- **Linha de base oficial versionada**: a métrica entra em `slo-captura.json` por ambiente e por perfil, com a origem de cada
  número ("medido" ou "emulado"). As próximas changes comparam com ela.
- **Telemetria de campo agregada** atrás da flag `rum_latencia`, NASCIDA DESLIGADA (PG 0023, SQLite 0065): contrato `v: 2` de
  `/api/metricas/captura` com baldes fixos por classe de aparelho (5 perfis de `src/lib/dispositivo/perfil.ts`) e idioma,
  sem texto, sem áudio, sem id. Histogramas Prometheus com rótulos de lista fechada. Ligar em produção exige o parecer de
  privacidade do dono (menores, ECA Digital/LGPD): tarefa bloqueante.
- **Protocolo do laboratório** (`docs/auditoria/protocolo-do-laboratorio-de-latencia.md`): como rodar A/B (mesmas falas, mesmo
  aparelho, N repetições intercaladas, IC 95% pareado, critério escrito antes), onde os resultados ficam, e a matriz de
  aparelhos reais com o que fazer enquanto eles não existem (resultado marcado "emulado" e nunca usado para aprovar ganho).

## Non-Goals

- Mudar fila, motor de STT, tradução local, roteador ou qualquer caminho da captura: esta change só mede.
- Ligar `rum_latencia` em produção (é ato do dono, depois do parecer de privacidade).
- Comprar ou conseguir os aparelhos reais; a matriz diz o que fazer sem eles.
- Mexer em planos, cotas (`src/core/planos.ts`), provedores de IA ou preços. Nenhum provedor novo (Gemini continua proibido).
- Guardar qualquer coisa no servidor: o servidor só agrega em histograma e esquece (retenção zero).
- Métricas de qualidade (WER, COMET) e de custo: seguem em suas bancadas; aqui só a latência e a carga de modelo.

## Impact

- `scripts/perf/latencia-legenda/` (`sonda.js`, `medir.mjs`, `analisar.mjs`, `metricas-captura.mjs`, `comparar.mjs`,
  `slo-captura.json`; novo `ab.mjs` para o IC pareado), `.github/workflows/desempenho.yml` (só se o teste de YAML pedir).
- `src/gateway/marcasDeDesempenho.ts`, `src/gateway/capture/{systemAudio,pipelineDeFala,captureMetrics,telemetriaDeCaptura}.ts`,
  adaptadores `whisperLocal`, `parakeet*`, `moonshine`, `opusMtLocal`, `bergamotLocal` (só marcas), e o ponto da tela da
  legenda que pinta a tradução.
- `server/routes/metricasCaptura.ts` (contrato v:2, v:1 segue válido), `server/http/metricas.ts` (histogramas novos).
- Flag `rum_latencia`: migrações PG 0023 e SQLite 0065, snapshots e journals, `PainelFlags`, `docs/flags.md`, teste de baseline.
- `docs/auditoria/` (protocolo e a linha de base de 2026-11), `docs/slo.md` (seção da métrica), `docs/runbook.md` (consulta do p75).
- Specs: ADDED `laboratorio-de-latencia-da-legenda`; MODIFIED `metrics-prometheus` (rótulos de lista fechada).
