## Why

Hoje o texto aparece em saltos. O parcial local sai a cada `PARTIAL_INTERVAL_MS = 2000` com no máximo `MAX_PARCIAIS_POR_FALA = 3`
(`src/gateway/capture/systemAudio.ts`), `concatFrames` recopia a fala inteira a cada tique e o Whisper decodifica uma janela fixa
de 30 s por chamada (`whisperWorker.ts`), só quando o worker está livre (`transcribeIfIdle`). O parcial nem usa o `onUpdate`
(`whisperLocal.ts`), embora o worker gere token a token. O Parakeet não tem parcial. A tradução do parcial só roda com motor
local carregado, em greedy, e `parcialEstavel.ts` (duas leituras iguais + fronteira de oração) só existe no intérprete. Resultado:
`primeiroTextoNaTelaMs` bimodal no desktop (~1,0 s / ~3,2 s) e texto que pula em blocos. O alvo é o atraso POR PALAVRA, que a
bancada de hoje não mede (o roteiro só tem início e fim da voz por fala).

Restrição herdada do ciclo 1: a "fila da legenda" (esperar prefixo estável antes de mostrar) PIOROU `fimDaFalaAteLegendaMs`
(+184 ms no fraco emulado) e foi reprovada. Esta mudança NÃO pode atrasar o final; o final segue com prioridade e cancela o parcial.

Referências: LocalAgreement-2 (ufal/whisper_streaming e ufal/SimulStreaming, MIT); re-tradução e mask-k, erasure normalizada < 0,2
(Arivazhagan et al., arXiv:1912.03393 e 2004.03643); UX de legenda (Google, CHI EA 2023).

## What Changes

- **Lote A, medir primeiro.** Roteiro da bancada com tempo por PALAVRA; métricas `atrasoDePalavraMs` (p50/p90, original e tradução),
  `erasureOriginal`, `erasureTraducao` (NE) na bancada e no cliente; marca `frasy:parcial` sem texto; linha de base gravada
  ANTES de qualquer variante.
- **V1 `parciais_vivos`** (flag, DESLIGADA): (a) parcial do Whisper/Moonshine usa `onUpdate`; (b) cadência adaptativa em vez de
  2 s fixo/máx. 3, com orçamento por RTF medido e ocupação do worker, nunca atrasando o final; (c) LocalAgreement-2 sobre as
  hipóteses sucessivas: parte confirmada firme, cauda não confirmada com estilo "provisório" (não só cor).
- **V2 `parciais_parakeet`** (flag própria, DESLIGADA): re-decode da janela que cresce, mesma cadência adaptativa, só onde o
  Parakeet já é usado (RTF ~0,089 no desktop).
- **V3 `traducao_incremental`** (flag, DESLIGADA): generaliza `parcialEstavel` para a legenda comum; traduz só o prefixo
  CONFIRMADO, com mask-k, só motor local; a tradução final não muda.
- **Migrações** de flag: PG 0029, 0030, 0031 e SQLite 0069, 0070, 0071 (a main tem até PG 0028 / SQLite 0068, conferido
  em 23/11/2026).
- **Cada variante é um A/B separado** no laboratório, com `criterio.md` commitado antes.

## Non-Goals

- Streaming de nuvem (`TRANSPORTE_AO_VIVO_EXISTE = false`; terceiros com termos 18+). Parcial nunca vai à nuvem.
- Nemotron 3.5 streaming: vira SPIKE separado (viabilidade no onnxruntime-web), sem integrar aqui.
- Mudar a tradução final ou o caminho do final (VAD, fila de prioridade, `traducaoProvisoria`).
- Gemini (proibido), planos e cotas (`src/core/planos.ts`), qualquer dado novo na rede ou retenção (menores, retenção zero).
- Aprovar celular: o perfil fraco é `emulado` e não aprova.

## Impact

- Núcleo puro novo em `src/core/` (LocalAgreement, mask-k, cadência, erasure); `src/gateway/capture/systemAudio.ts`,
  `src/lib/captura/pipelineDeFala.ts` (`querParcial`), `parcialEstavel.ts`, `whisperLocal.ts`, `whisperWorker.ts`,
  `parakeetLocal.ts`/`parakeetWorker.ts`, `filaDoWorker.ts`, `traducaoDaFala.ts`, `captureMetrics.ts`, `marcasDeDesempenho.ts`;
  componente do balão (estilo provisório).
- Laboratório: `scripts/perf/latencia-legenda/` (`montar-audio.mjs`, `bancada-captura.mjs`, `ab.mjs`, `slo-captura.json`).
- Migrações de flag, `docs/flags.md`, `PainelFlags`, relatórios em `docs/auditoria/`.
- Dependência: a marca `frasy:*` e a bancada vêm do change `lab-medicao-legenda-traduzida`; este assume que ele está mesclado.
