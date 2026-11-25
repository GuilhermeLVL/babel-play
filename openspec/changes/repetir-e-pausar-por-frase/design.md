## Contexto

O player da Análise já distingue três coisas: o relógio (o `<audio>` real, ou a legenda quando não há áudio), a frase ativa
(`activeSentenceIndex`) e o fim da frase (o `startTime` da próxima fala, `playerDaSessao.ts:105-127`). A escuta guiada
(`src/core/learning/escutaGuiada.ts` + `src/lib/analise/escutaGuiada.ts`) mostra o padrão: máquina pura em `core`, estado e
teclado em `lib`, desenho em `components`. O audiolivro tem `frasePorTempo(tempos, t)` e `aoMudarFrase`.

## Decisão

1. **Máquina pura de "frase por frase"** em `src/core/learning/frasePorFrase.ts`, ao lado de `escutaGuiada.ts`. Estado:
   `{ ativo, repeticoes: 1|2|3, pausa: fator 0,5 a 2, feita: n }`. Função `aoFimDaFrase(estado, i, total)` devolve
   `repetir | esperar(ms) | seguir | parar`. Sem DOM e sem relógio próprio: quem chama passa a duração da frase.
2. **O hook** `src/lib/analise/usarFrasePorFrase.ts` liga a máquina ao player por `seekTo`/`setIsPlaying` e reaproveita
   `pararNoFimRef` (com o modo ativo ele é `true`). O `loopMode` morto de `Analysis.tsx` passa a ser derivado do estado do
   hook em vez de `useState(false)`: uma fonte só.
3. **A pausa de repetir** conta pelo relógio da mídia quando há `<audio>` e por `setTimeout` só na narração TTS; ao voltar
   do segundo plano, recalcula.
4. **Flag** `frase_por_frase` em `src/core/planos.ts` (padrão `FLAG_*`), migração nas duas cadeias (PG e SQLite),
   desligada, sem regra de plano, fora de `FLAGS_LIGADAS_NO_DEV` (o e2e liga por `page.route('**/api/flags')`). Não é
   flag de risco: não liga microfone nem custa IA.
5. **Prática no meio**: o botão "Repetir em voz alta" abre o `SombraDaFala` já existente como folha sobre a frase em foco;
   nada de tela nova.

## Alternativa descartada

**Cortar o áudio em arquivos por frase (pré-fatiar com `AudioBuffer`)**: daria cortes exatos e repetição sem emenda, mas
duplica o áudio na memória (o teto de upload é 120 MB, `audioDaSessao.ts`) e quebra a sincronia com a forma de onda. Ficar
no `<audio>` único com `seekTo` custa um clique de uns 50 ms na emenda, aceitável para estudo.

## Plano de medição (método rápido, skill `ciclo-rapido`)

A única medida com risco é o CORTE: a frase pausa no lugar certo?

1. **Simular antes**: um teste puro percorre as sessões e legendas de exemplo e, para cada frase, calcula
   `fim - início` e a sobra até a próxima fala; reprova frase fora de 0,5 a 15 s ou `startTime` não monotônico. Sem
   navegador, em segundos. Critério escrito antes de rodar.
2. **Triagem curta**: 10 frases de 3 sessões em Chromium com áudio fake, medindo o desvio entre o fim real da frase e o
   instante em que o modo pausa (meta: p95 <= 150 ms). Para na primeira falha de critério.
3. **Só a finalista na medição longa**: rodada em aparelho real **[R]** (Safari/iOS, Chrome Android, Quest) com 20 frases;
   o Safari é o que mais atrasa o `seek`. Uma rodada só, com pré-voo (áudio de teste, flag ligada, bateria).
