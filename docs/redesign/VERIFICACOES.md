# Verificações pedidas pelo dono (item 5)

---

## 5a — `previsaoDeIntervalo` usa os parâmetros do usuário ou os padrões?

**Usa os padrões. E hoje isso está correto, porque o servidor usa exatamente os mesmos.**

| O quê                            | Onde                                       | Valor                                           |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Pesos FSRS-5 (19 parâmetros)     | `src/core/learning/scheduler.ts:52`        | `FSRS5_DEFAULT_WEIGHTS`, constante de módulo    |
| Retenção desejada                | `src/core/learning/scheduler.ts:62`        | `REQUEST_RETENTION = 0.9`, constante de módulo  |
| Quem o servidor usa para agendar | `server/db/repositories/vocab.ts:23`       | `const fsrs = makeFsrs5()` — **sem argumentos** |
| Quem a previsão da UI usa        | `src/core/learning/previsaoDeIntervalo.ts` | `Fsrs5Strategy` (= `makeFsrs5()`), injetável    |

**Não existe parâmetro de FSRS por usuário em lugar nenhum do sistema.** Não há coluna, nem rota,
nem campo em settings. Varredura por `weights`/`pesos`/`retention` em `server/` só encontra
métricas _derivadas_ (`metrics.ts:251` calcula retenção média para exibição), nunca configuração.

O próprio `scheduler.ts:51` declara a intenção: _"Fixos nesta fase; otimização =
srs-fsrs-optimization"_.

**Então não há o que corrigir hoje** — rótulo e agendamento coincidem por construção, que é
justamente a propriedade que a correção do P0-1 buscava. Corrigir seria trocar uma resposta certa
por outra.

**Mas a lacuna futura é real e está aberta** (P0-13 em `LACUNAS.md`): no dia em que pesos por
usuário existirem, se `previsaoDeIntervalo` continuar lendo os padrões enquanto o servidor lê os
do usuário, os rótulos voltam a mentir — exatamente o defeito que acabou de ser consertado. O
acoplamento precisa nascer junto com a otimização, e não depois.

**Correção de rota registrada:** o prompt afirma "montagem de rodada no servidor (`montarRodada`)".
`grep -rn montarRodada server/` devolve **zero**. A montagem vive no núcleo isomórfico
(`src/core/minigames/rodada.ts:172`) e é chamada só do cliente (`Play.tsx:728`), por decisão
registrada em `docs/adr/0003-montagem-de-rodada-no-nucleo.md`. O que roda no servidor é o
**agendamento** (`vocab.ts:23`) e a rota de revisão `POST /api/vocab/:id/review`.

---

## 5b — Os 18 jogos: def, componente, montagem e teste

`MinigameId` em `src/core/minigames/types.ts:18-21` · `MINIGAMES` em `:147-181` ·
`TELA_DO_JOGO` em `src/components/views/play/telaDoJogo.ts:17-35`.

**"Adapter no servidor" não existe para nenhum jogo** — ver a correção acima. A coluna equivalente
é o **ramo de `montarRodada`**, que é por onde todo jogo obrigatoriamente passa
(`src/core/minigames/rodada.ts:172`), e o tipo de material que ele devolve (`:79-86`).

| #   | id            | def            | `TELA_DO_JOGO`              | ramo de `montarRodada`             | modalidade   | grava SRS | teste dedicado                                                                                                    |
| --- | ------------- | -------------- | --------------------------- | ---------------------------------- | ------------ | --------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `memory`      | `types.ts:148` | `MemoryGame` (`:18`)        | `itens`                            | palavra      | sim       | `memoryGameLongo.test.tsx`                                                                                        |
| 2   | `wordsearch`  | `:149`         | `WordSearchGame` (`:19`)    | `itens`                            | palavra      | sim       | `wordsearch.test.ts`                                                                                              |
| 3   | `blitz`       | `:150`         | `BlitzGame` (`:20`)         | `itens`                            | palavra      | sim       | `blitzGame.test.tsx`, `blitz-regras.test.ts`                                                                      |
| 4   | `termo`       | `:155`         | **`null`** (`:21`)          | `termo` (`rodada.ts:343`)          | palavra      | sim       | `termoLayout`, `termoModos`, `termoEscada`, `termoJusto`, `termoDificuldade`, `termoScramble`, `termoTravado` (7) |
| 5   | `scramble`    | `:157`         | **`null`** (`:22`)          | `frase` (`rodada.ts:379`)          | frase        | não       | `termoScramble.test.ts`                                                                                           |
| 6   | `karaoke`     | `:158`         | **`null`** (`:23`)          | `karaoke` (`rodada.ts:439`)        | frase falada | não       | `karaokeGame.test.tsx`                                                                                            |
| 7   | `escuta`      | `:162`         | **`null`** (`:24`)          | `escuta` (`rodada.ts:424`, `:451`) | frase falada | não       | `escuta.test.ts`                                                                                                  |
| 8   | `ditado`      | `:163`         | **`null`** (`:25`)          | `ditado` (`rodada.ts:421`, `:463`) | frase falada | não       | — (coberto por `composicaoDeRodada`)                                                                              |
| 9   | `conectores`  | `:164`         | **`null`** (`:26`)          | `frase`/`conectores`               | frase        | não       | `conectores-acento.test.ts`                                                                                       |
| 10  | `karuta`      | `:168`         | `KarutaGame` (`:27`)        | `itens`                            | palavra      | sim       | `karutaGame.test.tsx`                                                                                             |
| 11  | `choseong`    | `:169`         | `ChoseongGame` (`:28`)      | `itens`                            | palavra      | sim       | `choseongGame.test.tsx`                                                                                           |
| 12  | `tenis`       | `:173`         | `TenseTennisGame` (`:29`)   | `itens`                            | palavra      | sim       | `tenseTennisGame.test.tsx`                                                                                        |
| 13  | `koffer`      | `:174`         | `KofferGame` (`:30`)        | `itens`                            | palavra      | sim       | `kofferGame.test.tsx`                                                                                             |
| 14  | `bao`         | `:175`         | `BaoGame` (`:31`)           | `itens`                            | palavra      | sim       | `baoGame.test.tsx` + `e2e/sessao-de-jogo`                                                                         |
| 15  | `vitendawili` | `:176`         | `VitendawiliGame` (`:32`)   | `itens`                            | palavra      | sim       | `vitendawiliGame.test.tsx`                                                                                        |
| 16  | `shiritori`   | `:177`         | `ShiritoriGame` (`:33`)     | `itens`                            | palavra      | sim       | `shiritoriGame.test.tsx`, `shiritoriCorrente.test.ts`                                                             |
| 17  | `cadavre`     | `:179`         | `CadavreExquisGame` (`:34`) | `itens`                            | palavra      | **não**   | `cadavreGame.test.tsx`                                                                                            |
| 18  | `taboo`       | `:180`         | `TabooGame` (`:35`)         | `itens`                            | palavra      | sim       | `tabooGame.test.tsx`                                                                                              |

### Leitura

- **Os 18 existem, com def e destino de render.** Nenhum é fachada. A P3 do prompt é vazia.
- **Seis têm `TELA_DO_JOGO = null`** (`termo`, `scramble`, `karaoke`, `escuta`, `ditado`,
  `conectores`). Não é ausência: são rodadas de frase/áudio montadas antes e renderizadas por
  caminho próprio (`src/components/minigames/`). O `null` é o registro dizendo "não passa pela
  cascata genérica".
- **Todos passam por `montarRodada`.** Doze caem no ramo genérico `itens`; seis têm ramo dedicado.
- **Um só sem teste dedicado: `ditado`.** Está coberto indiretamente por `composicaoDeRodada.test.ts`
  e `antessala.test.ts`, mas não tem arquivo próprio como os irmãos `escuta` e `karaoke`. É a única
  lacuna de cobertura da tabela e vira tarefa.
- **Além dos 18, o Bingo** (`src/core/minigames/bingo.ts`) é funcional e está **fora** do registro
  — ver a decisão D-008.
