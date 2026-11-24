## 1. Linha de base

- [ ] 1.1 Rodar a bancada (antes) nas 100 falas en e nas 100 pt, sem ganho; guardar WER, IC 95%, latência mediana e p95
- [x] 1.2 Registrar o critério de decisão (design.md, decisão 6) no relatório ANTES de ver o "depois"

## 2. Puro

- [x] 2.1 `src/core/audio/normalizarVolume.ts`: pico, ganho com teto de 40 dB, piso de silêncio, cópia sem clipping; testes
      (fala baixa sobe a −3 dBFS, já alta não muda, silêncio e vazio não mudam, `|x| ≤ 1`, não altera a entrada)
- [x] 2.2 `src/core/rota/medicoesDeStt.ts`: medições com `{ wer, ic95, n, data, fonte }` e função pura da decisão com IC; testes
      dos dois lados (vence / empata / sem medição)

## 3. Flag e ligação

- [x] 3.1 Flag `stt_nuvem_normalizar` nascida DESLIGADA: PG 0024, SQLite 0066, snapshots, journals, `PainelFlags`,
      `docs/flags.md` (com data para morrer), contagem do `schema-pg-baseline.test.ts`
- [x] 3.2 `groqWhisper.ts`: aplica `normalizarVolume` antes de `audioParaStt` e do `encodeWav` do Quest, só com a flag; o PCM
      original segue para o caminho local; teste: flag desligada envia o mesmo buffer de antes, ligada envia o normalizado
- [x] 3.3 `pipelineDeFala.ts`: lê `flagLigada` e repassa ao adaptador (gateway sem importar de `src/lib`)
- [x] 3.4 `scripts/eval-fala/bancada/nuvem/stt.mjs`: `--ganho` usa a função pura em vez da cópia `normalizarPico`

## 4. Rota

- [x] 4.1 `sttRouter.ts`: remover o 4,9% do comentário e da decisão; a rota do inglês lê `medicoesDeStt`; teste de rota para
      flag desligada, medição que vence e medição que empata; teste que falha se "4,9" voltar ao roteador
- [x] 4.2 Conferir que a rota de pt/es, o modo `cloud` e o Quest não mudam (testes existentes de `sttRouter` e `politicaDeRota`)

## 5. Medir de novo e decidir

- [ ] 5.1 Rodar a bancada (depois) com a função entregue: en e pt, mesmas 100 falas, WER, IC pareado, latência mediana e p95
- [ ] 5.2 Rodada de Opus no navegador (ou nota de limite) para a interação ganho × Opus
- [ ] 5.3 Aplicar o critério: registrar em `medicoesDeStt.ts` a nova medição e decidir a rota do inglês (nuvem primeiro só se
      vencer o motor local com IC; senão, aparelho)
- [ ] 5.4 `docs/auditoria/2026-11-XX-stt-ingles-volume.md` com tabela antes/depois, decisão e como repetir

## 6. Fechamento

- [x] 6.1 `npm run typecheck`, `npm run lint`, `npm test` (os arquivos novos e os de rota) e `npx knip` verdes; um PR só
- [ ] 6.2 Dono: ligar `stt_nuvem_normalizar` no staging, observar, depois produção (ato do dono)

## Notas da implementação (2026-11-21)

- BLOQUEADO 1.1 e 5.1: o OpenRouter respondeu `401 "User not found"` à chave disponível (gasto US$ 0,00). Falta uma chave
  válida [D]; depois, ~400 chamadas (~US$ 0,05) com `BANCADA_NUVEM_ENV` apontando para o .env e `BANCADA_TETO_USD`.
- 5.2/5.3/5.4 parciais: Opus + ganho não medido (rodada manual no navegador); `nuvemNormalizada = null` → o inglês fica no
  aparelho (Moonshine base) — é o novo padrão, também com a flag desligada; relatório `docs/auditoria/2026-11-21-stt-ingles-volume.md`
  com o critério escrito antes e a tabela a preencher.
- Offline: 56/100 falas en batem o teto de 40 dB de ganho (mediana de pico −44 dBFS); pt, ganho mediano 7 dB.
- `politicaDeRota`/`conferenciaDaRota` espelham a rota nova (senão a conferência acusaria divergência). Testes que congelavam
  "inglês na nuvem" usam a fixture `medicoesDeSttQueFavorecemANuvem` para manter a cobertura daquele ramo; o padrão novo é
  coberto em `tests/medicoesDeStt.test.ts`.
- Rótulo honesto na importação de áudio (X8): a fila deixou de dizer sempre "Whisper local"; o texto vem do motor/modelo reais de cada trecho (`OfflineProgress.motor`/`modelo`, `src/lib/import/rotuloDaImportacao.ts`, mesma decisão de "onde" do `seloDaFala`): "Transcrevendo no aparelho (whisper-tiny)…", "…na nuvem do Frasy (whisper-large-v3-turbo)…", e volta a "no aparelho" quando a nuvem falha no trecho. Testes: `tests/rotuloDaImportacao.test.ts`, `tests/importacao-stt-nuvem.test.ts`.
