## 1. Linha de base

- [ ] 1.1 Rodar a bancada (antes) nas 100 falas en e nas 100 pt, sem ganho; guardar WER, IC 95%, latência mediana e p95
- [ ] 1.2 Registrar o critério de decisão (design.md, decisão 6) no relatório ANTES de ver o "depois"

## 2. Puro

- [ ] 2.1 `src/core/audio/normalizarVolume.ts`: pico, ganho com teto de 40 dB, piso de silêncio, cópia sem clipping; testes
      (fala baixa sobe a −3 dBFS, já alta não muda, silêncio e vazio não mudam, `|x| ≤ 1`, não altera a entrada)
- [ ] 2.2 `src/core/rota/medicoesDeStt.ts`: medições com `{ wer, ic95, n, data, fonte }` e função pura da decisão com IC; testes
      dos dois lados (vence / empata / sem medição)

## 3. Flag e ligação

- [ ] 3.1 Flag `stt_nuvem_normalizar` nascida DESLIGADA: PG 0024, SQLite 0066, snapshots, journals, `PainelFlags`,
      `docs/flags.md` (com data para morrer), contagem do `schema-pg-baseline.test.ts`
- [ ] 3.2 `groqWhisper.ts`: aplica `normalizarVolume` antes de `audioParaStt` e do `encodeWav` do Quest, só com a flag; o PCM
      original segue para o caminho local; teste: flag desligada envia o mesmo buffer de antes, ligada envia o normalizado
- [ ] 3.3 `pipelineDeFala.ts`: lê `flagLigada` e repassa ao adaptador (gateway sem importar de `src/lib`)
- [ ] 3.4 `scripts/eval-fala/bancada/nuvem/stt.mjs`: `--ganho` usa a função pura em vez da cópia `normalizarPico`

## 4. Rota

- [ ] 4.1 `sttRouter.ts`: remover o 4,9% do comentário e da decisão; a rota do inglês lê `medicoesDeStt`; teste de rota para
      flag desligada, medição que vence e medição que empata; teste que falha se "4,9" voltar ao roteador
- [ ] 4.2 Conferir que a rota de pt/es, o modo `cloud` e o Quest não mudam (testes existentes de `sttRouter` e `politicaDeRota`)

## 5. Medir de novo e decidir

- [ ] 5.1 Rodar a bancada (depois) com a função entregue: en e pt, mesmas 100 falas, WER, IC pareado, latência mediana e p95
- [ ] 5.2 Rodada de Opus no navegador (ou nota de limite) para a interação ganho × Opus
- [ ] 5.3 Aplicar o critério: registrar em `medicoesDeStt.ts` a nova medição e decidir a rota do inglês (nuvem primeiro só se
      vencer o motor local com IC; senão, aparelho)
- [ ] 5.4 `docs/auditoria/2026-11-XX-stt-ingles-volume.md` com tabela antes/depois, decisão e como repetir

## 6. Fechamento

- [ ] 6.1 `npm run typecheck`, `npm run lint`, `npm test` (os arquivos novos e os de rota) e `npx knip` verdes; um PR só
- [ ] 6.2 Dono: ligar `stt_nuvem_normalizar` no staging, observar, depois produção (ato do dono)
