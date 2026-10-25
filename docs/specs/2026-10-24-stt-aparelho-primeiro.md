# Aparelho primeiro na transcrição, nuvem para o áudio difícil

Fase B, itens 5 e 6 do plano de qualidade da IA paga (decisão do dono, 24/10/2026). Flag
`stt_aparelho_primeiro`, **desligada de fábrica** (SQLite 0056, PG 0010; `docs/flags.md`).

## Por quê

Sem a flag, no automático, toda fala de quem tem nuvem vai à nuvem primeiro, mesmo no computador
que roda o Parakeet (5,8% de erro em português e 4,3% em espanhol na bancada de 09/10/2026). A copy
do Plus promete "8 h de nuvem para o áudio difícil", e essas horas se gastam em áudio fácil.

## O que muda

| Caso                                                                                                          | Flag desligada (hoje) | Flag ligada                                                                            |
| ------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| Automático, computador com o Parakeet pronto (pt/es, ≥ 8 GB ou Mac Apple, cópia no aparelho), conta com nuvem | Nuvem primeiro        | **Parakeet primeiro**; a nuvem entra quando o áudio fica difícil                       |
| Precisão pedida (`cloud`)                                                                                     | Nuvem primeiro        | Igual                                                                                  |
| Aparelho fraco, celular, Quest, sem memória medida, economia de dados                                         | Nuvem primeiro        | Igual                                                                                  |
| Parakeet sem cópia no aparelho                                                                                | Nuvem primeiro        | Igual (a rota não baixa 672 MB sozinha)                                                |
| Inglês, outros idiomas, "Detectar"                                                                            | Nuvem primeiro        | Igual (não há modelo local bom o bastante ligado: o Parakeet em inglês espera decisão) |
| Sem nuvem na conta, perfil Privado, chave própria                                                             | Como hoje             | Igual                                                                                  |

Item 5 vale com ou sem a flag: quando a nuvem é o motor, a **reserva** local é o Parakeet se ele
estiver pronto (senão o Whisper base). O Whisper base segue quente (parciais e queda invisível); o
Parakeet só entra quando a nuvem PAUSA (402/429/503 ou a 3ª 5xx seguida — num soluço o Whisper quente
atende), uma vez, e o gateway LIBERA o Whisper enquanto ele atende (`reservaParakeet`; os três modelos
não ficam juntos — `memoriaDosModelos.ts`). O modelo do Whisper não é tocado (o regulador pode tê-lo
descido). Depois de 5 respostas boas seguidas da nuvem, o Parakeet sai e o Whisper volta.

A `rota_inteligente` (`politicaLigada`) **continua desligada**: o ramo dela manda o inglês do pagante
ao Moonshine (13,5% de erro contra 4,9% da nuvem) e muda a tradução, o que ninguém decidiu. A regra
nova entra no modo de hoje da política (o único que o app usa), só para a transcrição.

## Peças

- `src/gateway/sttRouter.ts` — `aparelhoPrimeiro` na entrada, `nuvemNoAudioDificil` na rota;
  `parakeetProntoNaRota` (o critério do automático) e a reserva da nuvem.
- `src/core/rota/audioDificil.ts` — o sinal (`avaliarFalaLocal`) e a histerese (puros).
- `src/gateway/adapters/parakeetTdt.ts` + worker + adaptador — a confiança média dos tokens vira o
  `confidence` do final.
- `src/lib/captura/pipelineDeFala.ts` — a cada final, `contarAudioDificil`; ao trocar de modo,
  `gateway.stt.setRoute({ preferCloud })`, o rótulo e o previsto do selo.
- `src/core/rota/politicaDeRota.ts` + `src/lib/captura/seloDaFala.ts` — o previsto conhece o
  Parakeet, a reserva `audio-dificil` e o modo nuvem; a fala que foi à nuvem por áudio difícil diz
  isso sem "mudou".

## O sinal e a histerese (pontos de partida)

Uma fala local é **difícil** se qualquer um destes disparar:

- `confianca`: média do softmax de cada token emitido pelo Parakeet < **0,75** (só com 3+ palavras);
- `compressao`: a porta do Whisper que já existia (laço de repetição);
- `lento`: tempo de DECODE no motor (`decodeMs` do Parakeet, sem a fila) ÷ duração da fala > **1**.

Histerese, por falas (cada fala é um pedido cobrado na nuvem): sobe com **3 difíceis nas últimas 6**
falas locais; fica no mínimo **8 falas** na nuvem; volta com a janela limpa; subir de novo em até 6
falas locais depois de descer dobra o mínimo (teto **64**); a memória (o mínimo dobrado) continua numa
nova preparação da mesma sessão. A nuvem que para de responder devolve ao aparelho na hora: a pausa
dela, ou 2 falas locais seguidas no modo nuvem. Fala da nuvem no modo aparelho (a porta subiu um
trecho) não muda o modo, e o selo diz "mudou" (o motivo "Áudio difícil" é só da histerese).

Se o Parakeet sair da cadeia (não carregou, ou o regulador desceu a um Whisper), o "aparelho primeiro"
acaba na preparação: a nuvem volta à frente, com o Whisper de reserva.

## Medir na bancada ANTES de ligar no staging

A bancada (`scripts/eval-fala/bancada/stt.mjs`) grava agora a `confianca` por caso do Parakeet (sem
`+vad`). Casos já no cache não têm o campo: rode com `--refazer`.

1. Transcrever os mesmos casos com o Parakeet e com a nuvem, limpos e com ruído:

   ```sh
   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/stt.mjs --refazer \
     --sistemas parakeet:v3-int8,groq:whisper-large-v3-turbo+t0+seg \
     --conjuntos fleurs_pt,fleurs_pt_snr10,fleurs_pt_snr5,fleurs_pt_snr0,sem_fala
   ```

   (o espanhol não tem conjunto com ruído derivado; `baixar-bancada.py` só deriva en e pt.) O gasto
   de nuvem passa pelo teto do `livroCaixa.mjs`.

2. Por caso, cruzar `confianca` do Parakeet com `erros/palavras` dos dois sistemas (pareado por
   `id`). Para cada limiar candidato (0,60 a 0,90, passo 0,05), medir:

   - **taxa de subida**: fração dos casos com confiança abaixo do limiar, por conjunto;
   - **acerto**: entre os que sobem, quanto o WER cai com a nuvem (Δ pareado com IC 95% de
     `src/core/eval/bootstrap.ts`); entre os que não sobem, o Δ deve ser ~0.

3. Critério para ligar no staging: no `fleurs_pt` limpo a taxa de subida ≤ **15%**; no `snr5`/`snr0`
   ela sobe de forma clara e o Δ dos casos que sobem exclui 0 a favor da nuvem. Ajustar
   `confiancaMinima` em `LIMIARES_DO_AUDIO_DIFICIL` e registrar o resultado aqui.

4. Histerese: simular as sequências da bancada (os casos em ordem, intercalando limpo e ruído) com
   `registrarFalaLocal`/`registrarFalaNaNuvem` e conferir quantas trocas de modo acontecem por 100
   falas (meta: poucas, e nenhuma no limpo).

5. No staging, com a flag ligada para o dono (`ids`): conferir o selo ("No aparelho" → "Áudio difícil:
   …") e o log da captura (`áudio difícil → a nuvem vai primeiro`), e o consumo de horas em
   `/api/me/uso` antes/depois.

## Limites conhecidos

- O primeiro trecho depois da subida ainda é local; o selo, nesse intervalo, falha fechado ("a nuvem
  não respondeu") até a próxima fala.
- Inglês segue na nuvem primeiro: ligar o Parakeet em inglês (medido melhor que o Moonshine) estende
  a regra sozinho, por `IDIOMAS_DO_PARAKEET`.
