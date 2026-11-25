## Abordagem escolhida

**O clipe é um anexo do cartão, produzido na captura e guardado onde a pessoa escolheu.**

1. **Corte na origem.** O pipeline já tem o PCM de cada fala (`pipelineDeFala.ts:1154`). `audioDasFalas.ts` hoje liga só no
   Quest; passa a manter, com a flag, um anel curto (últimas 40 falas, <= 8 s cada, dentro do teto atual de 20 MB) em memória,
   que alimenta o cartão quando a palavra é salva. Fala fora do anel (palavra salva minutos depois) recorta do áudio da
   sessão, se existir.
2. **Codificação** no aparelho com `codificadorOpus.ts` (Ogg Opus; WAV como reserva no Safari).
3. **Guarda** atrás de uma interface `ArmazemDeAudioDoCartao { gravar, abrir, apagar, apagarTudo }` com dois adaptadores:
   `local` (IndexedDB, molde de `vozGuardada.ts`) e `conta` (rota nova `PUT/GET/DELETE /api/vocab/:id/audio`, autenticada,
   escopo por `UserId`, `reservarArmazenamento` do R2, teto de 200 KB por clipe).
4. **Toque** (`falaOriginal.ts`): clipe do cartão, trecho da sessão, voz do aparelho. O clipe local vira `blob:` no toque e é
   revogado ao fechar a revisão (a mesma contabilidade de `audioDaSessao.ts`).
5. **Dado**: nenhuma coluna nova para o destino local; a conta ganha `audio_chave` e `audio_dur_ms` em `vocab_cards` por
   migração aditiva, sem backfill. Cartão sem clipe é o estado normal.

## Alternativa descartada

**Cortar o trecho no servidor, sob demanda, da gravação da sessão** (ffmpeg ou `Range` no R2). Resolve o download inteiro sem
mexer na captura, mas (a) o Worker não tem ffmpeg e cortar Opus em Ogg sem reencodar é frágil, (b) o cartão continua morrendo
com a sessão e não existe para quem usa sem conta, (c) cada toque vira uma execução no servidor (custo e latência) e (d) o
áudio de menores continua no servidor. Fica registrada como saída se a captura local se mostrar cara.

## Método rápido (skill ciclo-rapido)

O que se mede é latência de codificação e tamanho, não qualidade de modelo. Sem bancada longa:

1. **Simular antes**: script em Node (`scripts/lab/clipe-do-cartao.mjs`) lê PCM das fixtures existentes, codifica em Opus
   16/24/32 kbps e WAV e imprime bytes por segundo. Sem aparelho.
2. **Triagem curta** (1 h): 3 bitrates x 20 falas e escuta cega do dono em 10 clipes. Parada antecipada: se 24 kbps é
   inteligível em 9 de 10, não testa 32.
3. **Só a finalista no aparelho**: um Safari e um Android médio medem o p95 da codificação e o tamanho do IndexedDB após 200
   clipes. Pré-voo: `navigator.storage.estimate()` impresso no Diagnóstico.
