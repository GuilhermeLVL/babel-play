# A gamificação sob a autoridade nova

## Por quê

Onda 3 de seis. É onde a branch `gamificacao-v2-wip` contradiz `main` de verdade: ela traz um
catálogo mestre de 128 itens com o seu próprio vocabulário de canais, e um sistema de drop que
chama a economia por um contrato que já não existe.

## O que foi medido antes de mexer

| Fato | Número |
|---|---|
| Itens no catálogo mestre da branch | 128 |
| Deles, que já são o MESMO objeto em `main` | 29 |
| Em canais que **nenhum** código concede (`desafio` 23 + `tempo` 20) | 43 |
| `conquistaId` que não existem em `CONQUISTAS` | 4 |
| Itens que "equipam" para lugar nenhum (shader, carimbo, som, visualizador, moldura) | 11 |
| Itens que dependem do motor de suítes (Onda 4) | 36 |
| Duplicatas por mistura de `-` e `_` | 9 |

E três achados que decidiram o desenho:

1. **`drop_partida` não é concedido por nada em `main`** — nem por `main` nem, de forma utilizável,
   pela branch: `src/lib/drops.ts:207` chama `creditarSeeds({ creditoId: 'drop-partida-bau-' +
   Date.now(), amount, reason })`. Três defeitos numa linha: `amount` e `reason` saíram do contrato
   (`src/data/api.ts:914`), o `Date.now()` destrói a idempotência — que é POR `creditoId` — e a
   família não resolve em `valorDoCredito`, então leva 400 de qualquer jeito.
2. **`ItemDaLoja` não tem campo `canal`.** As quatro portas de `main` são derivadas dos campos
   (`nivel`, `precoSeeds`, `exclusivoDe`, `precoCreditos`). O mestre inventa uma quinta taxonomia
   paralela para a mesma pergunta.
3. **A moeda da temporada era um efeito colateral do tamanho do catálogo.** `slotsDoPasse` fazia
   `cofres = 10 − itens da década`. Acrescentar 24 itens derrubou o total da temporada de **1.554
   para 235 Seeds** — 85% da moeda da trilha evaporando porque a Loja ganhou produto, sem ninguém
   decidir isso.

## O que muda

**Drop deixa de ser um canal e passa a ser um sorteio.** Um item já tem porta; o drop escolhe entre
os que têm. Isso resolve os 30 itens de `drop_partida` sem criar uma quinta régua, e mantém a
promessa que `posse-uma-regua` já fazia.

- `creditoId = drop:<roundId>` — um drop por rodada, idempotente pela rodada, ancorado numa rodada
  que existe e é do usuário. Sem rodada, sem drop.
- **Quem sorteia é o servidor.** `sortearItemDoDrop` é pura e recebe o float de fora, então é
  testável; a aleatoriedade fica na rota. Se o cliente escolhesse, escolheria o lendário.
- Sorteio em duas etapas (faixa 75/25, item uniforme dentro dela) e não roleta item a item — senão
  a taxa de raro mudaria sozinha a cada item novo e a cada compra.
- A posse sai de `seed_credits.reason = drop:<itemId>`, que é a coluna de onde a posse já é
  derivada — sem isso `hidratarPosse(autoritativo)` apagaria o baú no próximo carregamento.
- `SEEDS_DO_DROP = 5`, que é exatamente `PESOS_SEEDS.rodadaPerfeita`: o baú nunca paga mais do que
  jogar bem. O prêmio é o item.
- O modo sem conta usa as mesmas funções do core, e `tests/contratos/economia.test.ts` compara as
  duas pontas.

**24 itens novos entram no catálogo** (106 → 130), cada um com leitor existente: 10 packs de emoji,
8 cursores e 6 rastros. Os 6 rastros não custaram uma linha de código — `estiloDeRastro` já resolve
`gen:<forma>:<paleta>` e `croma:<forma>:<matiz>`.

**Três conquistas passam a entregar cosmético** (`poliglota`, `duelista`, `nivel-10`). Dez das
catorze não entregavam nada, e o mestre estava certo em querer preencher isso.

**A moeda da temporada vira decisão escrita.** `COFRES_POR_DECADA` substitui a divisão
`10 − itens`. Os números são exatamente os que a divisão antiga produzia — nada mudou de valor para
quem joga —, mas agora mexer na moeda da trilha exige editar aquela linha.

## O que NÃO entra, e por quê

- **Os 4 motores de partícula do mestre** (`part-raio`, `part-folhas`, `part-cristal`, `part-fogo`).
  A skin só vira forma no ternário de `ParticleCanvas.tsx:242-249`, que conhece cinco ids; uma skin
  desconhecida cai em `circulo` — idêntica à skin "Do tema", que é grátis. Seriam quatro itens de
  110 a 400 Seeds entregando o padrão de fábrica.
- **Os 11 itens sem leitor** (shader, carimbo, som, visualizador, moldura). Entram no cofre, tocam
  som de celebração e não mudam nada.
- **As 36 suítes `tema_total`** — dependem de `suitesTematicas.ts`, que é da Onda 4.
- **As 9 duplicatas `-`/`_` e os 5 `pal-*`** — o id de `main` vence; as paletas já têm porta pelos
  itens `gal-estilo-*`.
- **`three` e `@types/three`** — não há o que remover: nunca estiveram em `main`. É a branch que os
  adiciona, com zero imports.
- **`GaleriaDoCofre` e `MontadorDeEstiloDeck`** (922 e 2.318 linhas, nenhuma delas chamando
  `equiparItem`, nenhuma conferindo cadeado) vão para a Onda 4, junto do resto de `gamificacao/`.

## Impacto

- Spec `posse-uma-regua`: requisitos novos sobre o drop e sobre a moeda da temporada.
- Código: `src/core/economiaAutoridade.ts`, `src/core/passe.ts`, `src/core/loja.ts`,
  `src/core/learning/conquistas.ts`, `src/lib/cursores.ts`, `src/lib/particulas.ts`,
  `server/routes/metrics.ts`, `server/db/repositories/economia.ts`,
  `src/data/efemero/servidor.ts`.
- Testes: `tests/dropComAutoridade.test.ts` e `tests/integration/drop-idempotente.test.ts` novos;
  `tests/contratos/economia.test.ts` e `tests/contratos/rota-de-obtencao.test.ts` ampliados.
- **Sem migração**: `seed_credits.reason` já existe e o índice único `(user_id, credito_id)` já é a
  idempotência.
