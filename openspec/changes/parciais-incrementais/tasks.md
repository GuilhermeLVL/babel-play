Legenda: **[D]** = decisão ou ato do dono; **[R]** = exige aparelho real. Nada de ligar flag antes do A/B correspondente aprovado.

## 1. Lote A: medir primeiro

- [x] 1.1 Escrever e commitar `criterio.md` do Lote A e dos A/B de V1, V2, V3 antes da 1ª rodada. Verificar: `ab.mjs` aceita (commit anterior).
- [ ] 1.2 **[D]** Confirmar o efeito mínimo provisório (−20%) e o k do mask-k. Verificar: registrado no `criterio.md`.
- [x] 1.3 Funções puras em `src/core/` para `atrasoDePalavraMs` e `erasure` (original e tradução). Verificar: testes com casos à mão (apaga, troca, reaparece).
- [x] 1.4 Marca `frasy:parcial` (só números) em `marcasDeDesempenho.ts` e contadores em `captureMetrics.ts`. Verificar: teste de que nenhuma marca leva texto; microbenchmark ≤ 0,2 ms p95.
- [x] 1.5 Script que gera o roteiro com palavras (transformers.js em Node, Whisper `small`, `return_timestamps: 'word'`, sem dependência nova) e grava `palavras` no JSON de `montar-audio.mjs`. Verificar: fixture regenerado; fala com < 90% casadas listada e excluída.
  - Feito: `whisper-small` não exporta atenção cruzada; ficou `onnx-community/whisper-medium.en_timestamped` (fp32), 6/8 falas casadas ≥ 90% (`fleurs_en_1747` e `fleurs_en_1776` excluídas).
- [ ] 1.6 **[D]** Amostra manual de ~20 falas (ouvir/forma de onda) para validar a precisão do alinhamento; se reprovar, decidir o plano B (MFA/wav2vec2, dependência nova). Verificar: nota em `docs/auditoria/`.
  - Parcial: validação automática em `validar-alinhamento.mjs` (desvio mediano 190 ms, p95 543 ms). A amostra manual de ouvido continua com o dono.
- [x] 1.7 Bancada calcula as métricas novas a partir de `lat.dom` e do roteiro, com as funções de 1.3. Verificar: rodada de fumaça gera os campos; o relatório traz p50/p90 e erasure.
- [x] 1.8 Gravar a linha de base (≥ 10 rodadas, desktop e fraco emulado) antes de qualquer variante. Verificar: relatório com origem e IC.
  - Feito: 12/12 rodadas por perfil (`docs/auditoria/2026-11-21-linha-de-base-dos-parciais.md`). Erasure da base 0,62 → guarda emendada para "não piorar contra A" (commit `fd31bc01`), antes de qualquer rodada de variante.

## 2. V1 `parciais_vivos`

- [x] 2.1 Flag: migrações PG 0029 e SQLite 0069 (semente idempotente, DESLIGADA, `regras = '{}'`, reversão `DELETE FROM flags`), constante em `src/core/planos.ts`, snapshots, journals, `PainelFlags`, `docs/flags.md`. Verificar: nasce desligada; numeração reconferida contra a `main`.
  - Feito: flag `parciais_vivos` (PG 0029, SQLite 0069), desligada; ver `docs/flags.md`. Numeração conferida contra a `main` em 23/11/2026 (PG renumerada de 0027).
- [x] 2.2 LocalAgreement-2 puro em `src/core/`. Verificar: testes (prefixo confirmado nunca regride; empate; pontuação; idioma sem espaço).
  - Feito: `src/core/legendas/localAgreement.ts` (+ testes).
- [x] 2.3 Parcial do Whisper/Moonshine usa `onUpdate`, atrás da flag. Verificar: teste do adaptador; flag desligada = comportamento de hoje.
  - Feito: `onUpdate` do Whisper/Moonshine atrás da flag; sem a flag, comportamento de hoje.
- [x] 2.4 Cadência adaptativa pura (RTF, ocupação, piso/teto, teto de CPU) ligada a `systemAudio.ts` e `querParcial`; final continua cancelando o parcial. Verificar: testes de grade; teste de que o final nunca espera o parcial.
  - Feito: `src/core/legendas/cadenciaDoParcial.ts` ligada a `querParcial`; o final continua cancelando o parcial.
- [x] 2.5 UI: cauda provisória com estilo próprio (não só cor), leitor de tela anuncia só o confirmado. Verificar: teste de componente e revisão de acessibilidade.
  - Feito: cauda provisória com estilo próprio (`src/styles/legendas.css`); o leitor de tela anuncia só o confirmado.
- [x] 2.6 A/B de V1 (≥ 10 rodadas/lado, desktop e fraco emulado). Verificar: relatório pelo `criterio.md`; reprova se `fimDaFalaAteLegendaMs` p75 piorar.
  - **Feito, REPROVADO** na V1 (`docs/auditoria/2026-11-21-ab-dos-parciais.md`: primária −80%, mas erasure 0,59 → 3,60, renders 91 → 223, p75 do final). Iterações, todas só para rodadas novas, nenhuma reaprovou a anterior: V1b `sem-cauda`/`cauda-decode` reprovadas (`2026-11-21-ab-dos-parciais-v1b.md`); V1c `acrescenta-*` sem modo aprovado (`2026-11-21-ab-dos-parciais-v1c.md`); V4 com orçamento de pisca absoluto e limitador de 125 ms (`docs/auditoria/2026-11-22-ab-dos-parciais-v4.md`): inglês sem diferença provada no desktop e reprovado no fraco emulado; pt com o Parakeet ganha na primária (−39%), mas a guarda 1 medida depois sobre `fimDaFalaAteOriginalMs` reprova (+198 ms, IC [+54, +445]; teto +30). Nada a ligar.

## 3. V2 `parciais_parakeet`

- [x] 3.1 Flag: PG 0030 e SQLite 0070 (mesmo molde). Verificar: nasce desligada.
  - Feito: flag `parciais_parakeet` (PG 0030, SQLite 0070), desligada.
- [x] 3.2 Parcial do Parakeet por re-decode da janela, só onde já é usado, com a cadência de 2.4. Verificar: teste do adaptador; sem download novo.
  - Feito: parcial do Parakeet por re-decode da janela, atrás da flag, sem download novo.
- [x] 3.3 A/B de V2. Verificar: relatório pelo critério.
  - **Feito, REPROVADO** (`docs/auditoria/2026-11-21-ab-do-parakeet-parcial.md`): primária −71%, mas erasure, renders e texto final reprovam. Retomado com V1c e V4 em pt (ver 2.6): reprovado pela guarda 1.

## 4. V3 `traducao_incremental`

- [x] 4.1 Flag: PG 0031 e SQLite 0071. Verificar: nasce desligada; sem efeito sem `parciais_vivos`.
  - Feito: flag `traducao_incremental` (PG 0031, SQLite 0071), desligada; sem efeito sem `parciais_vivos`.
- [x] 4.2 Generalizar `parcialEstavel` à legenda comum: só prefixo confirmado, mask-k, só motor local carregado; final intocado. Verificar: testes (nunca chama nuvem; final substitui via `traducaoProvisoria`).
  - Feito: tradução do prefixo confirmado (mask-k), só motor local; final intocado.
- [x] 4.3 A/B de V3 com `erasureTraducao`. Verificar: relatório pelo critério.
  - **Feito, REPROVADO** (`docs/auditoria/2026-11-21-ab-dos-parciais.md`): atraso da tradução p50 1.290 → 2.692 ms (+1.402, IC [+367, +1.916]), p75 do final +169 ms, tradução final difere; fraco emulado também reprova.

## 5. Fechamento

- [ ] 5.1 **[R]** Rodada em celular real de V1 (e V2/V3 se aprovados) antes de qualquer ganho de celular. Verificar: relatório por aparelho.
- [ ] 5.2 **[D]** Ligar cada flag, uma a uma, só com o A/B aprovado. Verificar: decisão registrada com data.
- [ ] 5.3 Spike separado (fora deste escopo): viabilidade do Nemotron 3.5 streaming no onnxruntime-web, sem integrar.
