## Why

O inglês na nuvem é hoje a pior precisão do app. A medição de 09/10/2026 (`docs/auditoria/2026-10-09-medicoes-de-nuvem.md`)
deu **WER 27,8% [22,1–33,9]** nas 100 falas do FLEURS em inglês, contra 7,1% do Parakeet e 13,6% do Moonshine base no
aparelho. A causa é o provedor, não o modelo: o OpenRouter mandou 91 das 100 falas à DeepInfra, que devolve texto cortado
(ou vazio) em áudio gravado baixo (mediana de −60 dBFS no inglês do FLEURS, contra −25 no português). Com o pico de cada
fala levado a −3 dBFS antes do envio (diagnóstico `--ganho`), o WER caiu para **6,1% [4,8–7,5]**. O cliente não
normaliza o volume: `captura → audioParaStt (Ogg Opus) → /api/stt` envia o PCM como veio.

Não dá para resolver pelo pedido: com `only: ['groq']` o OpenRouter atendeu e cobrou pela DeepInfra do mesmo jeito, e o
campo `provider` da transcrição só aceita `zdr`, `data_collection` e `options` (mesma auditoria, seção 2.3).

Além disso, a rota do inglês (`src/gateway/sttRouter.ts`, modo `auto`) ainda decide e cita **WER 4,9%** (bancada de
setembro, Groq direto) para mandar o inglês de quem tem nuvem à nuvem. O número não vale mais para o caminho que o app usa
hoje. Requisitos de origem: REQ-014 (normalizar o volume antes do envio) e REQ-015 (a rota usa a medição atual; se a nuvem
normalizada não vencer o aparelho, o inglês fica no aparelho).

## What Changes

- **Mudança de padrão, mesmo com a flag desligada:** a rota `auto` do inglês deixa de ir à nuvem primeiro e passa a ficar no
  aparelho (Moonshine base, 13,6%), porque a medição registrada (nuvem 27,8%) não vence o aparelho. Só volta a "nuvem primeiro"
  se a medição versionada da nuvem normalizada vencer com IC 95% pareado. Efeito para quem usa: inglês mais preciso e sem
  custo de nuvem; o download do Moonshine (32–67 MB) passa a ser pedido a quem ainda não o tem, com o consentimento de hoje.
- **Normalização de volume no cliente, atrás da flag `stt_nuvem_normalizar`** (nasce DESLIGADA): função pura que leva o
  pico do trecho a −3 dBFS com teto de ganho e sem clipping, aplicada ao `Float32Array` ANTES do encode Ogg Opus (e do WAV
  de reserva) no envio à nuvem. O caminho local (Parakeet, Whisper, Moonshine) não passa por ela.
- **Medição versionada da rota** (`src/core/rota/medicoesDeStt.ts`): constante com o WER, o IC, a data e a fonte de cada
  motor de inglês. O comentário e a decisão do `sttRouter` leem dela; o número fixo 4,9% sai do código.
- **Decisão por medição, com critério escrito antes** (ver `design.md`): a flag só liga se o WER do inglês na nuvem
  normalizada ficar ≤ 8% sem piorar o português; a rota do inglês só vira "nuvem primeiro" se a nuvem normalizada vencer o
  motor local de inglês com IC 95% pareado. Caso contrário, o inglês fica no aparelho.
- **Prova**: a bancada mede antes e depois nas mesmas 100 falas em, com WER e latência (mediana e p95); resultado em
  `docs/auditoria/`.

## Non-Goals

- Trocar de provedor, de modelo ou de contrato do OpenRouter; fixar o provedor (não é possível, ver Why e `design.md`).
- Normalizar no servidor: o servidor não recebe áudio de quem não optou pela nuvem (retenção zero, ECA Digital/LGPD) e isso
  não muda; a nuvem só recebe o que já recebia, agora com o volume ajustado.
- Mexer em planos, cotas ou preços (`src/core/planos.ts`), em Gemini (proibido) ou em retenção do áudio (continua zero).
- Normalizar o áudio do caminho local, reduzir ruído, AGC contínuo ou compressão de dinâmica.
- Ligar a flag em produção: é ato do dono, depois da medição.

## Impact

- `src/core/audio/normalizarVolume.ts` (puro, novo) e `src/core/rota/medicoesDeStt.ts` (puro, novo).
- `src/gateway/adapters/groqWhisper.ts` (aplica o ganho antes de `audioParaStt`/`encodeWav`), `src/gateway/sttRouter.ts`
  (rota do inglês lê a medição), `src/lib/captura/pipelineDeFala.ts` (leitura da flag, repassada à configuração do adaptador).
- Flag `stt_nuvem_normalizar`: migração PG 0024 e SQLite 0066, snapshots/journals, `PainelFlags`, `docs/flags.md`,
  contagem do `tests/integration/schema-pg-baseline.test.ts`.
- `scripts/eval-fala/bancada/nuvem/stt.mjs` passa a usar a função pura em vez da cópia local `normalizarPico`.
- `docs/auditoria/` ganha o relatório da medição; `tests/` ganha os testes da função, da medição e da rota.
