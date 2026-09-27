# Recompensas v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o catálogo de emoji/recolor por cosméticos que aparecem na ação principal (legenda, cartões, jogos, tema), ligados a maestria, temporada e conquistas conferidas no servidor, com um motor único de comemoração e economia por resultado.

**Architecture:** evolui o que existe. Catálogo em `src/core/loja.ts`; posse derivada dos motivos de crédito/gasto (novos prefixos `maestria:`, `temporada:`, `reembolso:`, `meta:`, `palavra:`); regras de autoridade em `src/core/economiaAutoridade.ts`, usadas pelo servidor Express (`server/routes/metrics.ts`) e pelo espelho da edição estática (`src/data/efemero/rotas/economia.ts`). Tudo novo atrás da flag remota `recompensas_v2`.

**Tech Stack:** React 19 + Vite, TypeScript, Express, SQLite (@libsql/client) + Drizzle, vitest, Playwright (e2e da edição estática).

**Spec:** `docs/superpowers/specs/2026-09-27-recompensas-v2-design.md` (ler inteiro antes de qualquer tarefa).

## Global Constraints

- Interface e código em pt-BR; nomes no estilo do arquivo vizinho.
- Design: cartões, tokens de `src/index.css` / `src/styles/prototipo.css` e ícones `lucide-react`. **Nenhum emoji na interface.**
- Nenhuma Seed ou XP por tempo de uso ou por abrir o app (Decreto 12.880, art. 9º).
- Nada aleatório vendido; Seeds nunca compráveis; baú nunca pago; maestria e conquista nunca à venda.
- `perfilProtegido()` (`src/lib/protecaoDoMenor.ts:87`): sem loja com Créditos, sem ofertas, sem ranking, sem aviso de ofensiva.
- `reduzirEfeitos()` (`src/lib/dispositivo/perfil.ts`) e `prefers-reduced-motion`: sem fundo animado, sem partículas pesadas, sem rastro.
- Toda rota nova de economia existe no servidor **e** no espelho (`src/data/efemero/rotas/`), coberta por `tests/contratos/rotas-espelhadas.test.ts`.
- Preço, sorteio e crédito decididos só no servidor/autoridade; o cliente nunca manda valor.
- Migração nova: expand/contract, snapshot com `npx tsx scripts/migracoes/snapshot-do-schema.ts`, `tests/integration/schema-igual-ao-banco.test.ts` verde.
- i18n: toda string nova de interface passa pelo sistema de i18n existente e pelo script de cobertura.
- Commits em pt-BR (`feat(recompensas): …`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add -A`; nunca `git stash` puro; nunca push.
- Gates de cada onda: `npx tsc --noEmit`, `npm run lint`, `npx vitest run` completo, i18n, `npm run build`, orçamento do bundle, e2e da edição estática (`playwright.estatica.config.ts`, desktop e mobile-375).

## Review Focus

1. **Usuário antigo com itens removidos equipados** (cursor/pack/rastro): ao abrir o app v2, volta ao padrão sem erro de console e recebe o reembolso uma vez só, mesmo abrindo em duas abas. → Task 2.3 (teste de idempotência concorrente + equipado inexistente cai no padrão).
2. **Edição estática sem servidor** (IndexedDB vazio, primeira visita): Maestria, Temporada e Conquistas renderizam com zero e sem "Disponível na versão completa". → Task 5.4 (e2e em banco limpo).
3. **Relógio e fuso:** meta diária, teto de baú (3/dia) e silêncio 22h–8h usam o dia **local** do usuário; virada de meia-noite no meio da rodada não duplica nem perde crédito. → Tasks 2.2 e 5.2 (teste com `vi.setSystemTime` em 23:59→00:01).
4. **Rodada abandonada ou salva duas vezes** (rede cai, retry): maestria, baú e Seeds são idempotentes por `roundId`. → Tasks 2.2 e 3.1.
5. **Quest/celular com modo leve:** tema com fundo animado e finalização pesada não derrubam FPS; efeitos viram retorno discreto. → Tasks 1.1 e 4.1 (teste de `reduzirEfeitos` + e2e mobile com `data-modo-leve`).

---

## Execução em paralelo

| Bloco | Tarefas                                        | Pode rodar junto com                         |
| ----- | ---------------------------------------------- | -------------------------------------------- |
| A     | Onda 0 (já em andamento)                       | —                                            |
| B     | Onda 1 (comemoração)                           | Onda 2 (economia) — arquivos disjuntos       |
| C     | Onda 3 (maestria)                              | Onda 4 (temas/legenda/cartões) — depois de B |
| D     | Onda 5 (temporada, missões, conquistas, telas) | —                                            |
| E     | Onda 6 (loja com Créditos)                     | —                                            |

Cada agente de um bloco paralelo trabalha num worktree próprio criado a partir da ponta de `feat/recompensas-v2`:
`git worktree add ../rv2-<onda> -b rv2/<onda> feat/recompensas-v2`, com junction `node_modules` → `audit-v4\node_modules`.
**Antes de remover o worktree, apagar a junction com `[System.IO.Directory]::Delete(<caminho>\node_modules, $false)`.**
Integração: merge na `feat/recompensas-v2` dentro de `audit-v4`, onde rodam os gates completos.

Conflito previsto: `src/core/loja.ts` (ondas 2 e 4). Regra: a onda 2 só **remove** itens e tipos; a onda 4 só **acrescenta** num arquivo novo `src/core/catalogoV2.ts`, concatenado em `CATALOGO_DA_LOJA`.

---

## Onda 1 — Motor único de comemoração

### Task 1.1: módulo `src/lib/comemoracao/`

**Files:**

- Create: `src/lib/comemoracao/index.ts`, `src/lib/comemoracao/intensidade.ts`, `src/lib/comemoracao/pacotes.ts`
- Test: `tests/comemoracao-motor.test.ts`

**Interfaces:**

- Produces:

```ts
export type EventoDeComemoracao =
  | { tipo: 'acerto'; combo: number; el?: Element | null; pontos?: number }
  | { tipo: 'erro'; el?: Element | null }
  | { tipo: 'combo'; multiplicador: number; el?: Element | null }
  | { tipo: 'recorde' }
  | { tipo: 'rodada'; estrelas: 0 | 1 | 2 | 3; jogo: MinigameId }
  | { tipo: 'maestria'; jogo: MinigameId; nivel: 1 | 2 | 3 | 4 | 5 }
  | { tipo: 'conquista' }
  | { tipo: 'bau'; raridade: 'comum' | 'raro' }
  | { tipo: 'nivel' };
export type Intensidade = 'discreta' | 'media' | 'forte' | 'maxima';
export function intensidadeDe(ev: EventoDeComemoracao): Intensidade;
export function celebrar(ev: EventoDeComemoracao): void;
/** O que o motor fará (puro, testável): sons, partículas, vibração, texto flutuante. */
export function planoDeComemoracao(
  ev: EventoDeComemoracao,
  ctx: { leve: boolean; semSom: boolean; efeitos: EfeitosEquipados },
): PlanoDeComemoracao;
export interface EfeitosEquipados {
  acerto: string;
  combo: string;
  finalizacao: string;
}
export interface PlanoDeComemoracao {
  sons: { evento: SoundEvent; transpose?: number }[];
  rajadas: { kind: BurstKind; forma?: FormaParticula; quantidade: number }[];
  vibracao: number[] | null;
  flutuante: string | null;
  tremor: 0 | 1 | 2 | 3;
}
```

- [ ] **Step 1: testes do plano puro** — em `tests/comemoracao-motor.test.ts`:
  - `rodada` com 1 estrela → `intensidadeDe` = `discreta`, `rajadas` vazio; 3 estrelas → `maxima` e rajada com a forma da finalização equipada.
  - `acerto` com combo 0..6 → `sons[0].transpose` = `min(combo, 12)` (tom sobe um semitom por passo).
  - `ctx.leve = true` → `rajadas` vazio, `tremor` 0, `vibracao` null, som mantido.
  - `ctx.semSom = true` → `sons` vazio.
  - `erro` → `vibracao` = `[40, 30, 40]`, `flutuante` null.
- [ ] **Step 2:** `npx vitest run tests/comemoracao-motor.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar `planoDeComemoracao` e `intensidadeDe` puros; `celebrar` lê `reduzirEfeitos()`, `movimentoReduzido()` (de `src/lib/juice.ts`), o mudo de `soundFx.ts` e os efeitos equipados (por enquanto o padrão `{ acerto: 'padrao', combo: 'padrao', finalizacao: 'padrao' }`) e executa o plano com `play`, `emitBurst`/`burstFromElement`, `vibrar`, `pontosDoElemento`, `tremor`.
- [ ] **Step 4:** teste → PASS.
- [ ] **Step 5:** commit `feat(comemoracao): motor único com plano puro e modo leve`.

### Task 1.2: os 18 jogos passam pelo motor

**Files:**

- Modify: os 9 jogos de `src/components/minigames/*.tsx` e os 9 de `src/components/minigames/culturais/*.tsx`, `src/components/minigames/casca/ResultadoDaRodada.tsx`, `src/components/RecompensaDesbloqueada.tsx`, `src/lib/estado/useRecompensas.ts`
- Delete: `triggerConfetti`, `triggerVictoryConfetti`, `playJuicedHit`, `playJuicedError`, `playJuicedVictory` de `src/lib/gameFeel.ts`; `comemorar` de `src/lib/juice.ts` passa a delegar para `celebrar` (manter a assinatura só enquanto houver chamadores fora de jogos, depois apagar).
- Modify: `package.json` (remover `canvas-confetti` e `@types/canvas-confetti`).
- Test: `tests/comemoracao-jogos.test.ts`

- [ ] **Step 1: teste de varredura** — `tests/comemoracao-jogos.test.ts` lê o fonte dos 18 arquivos de jogo (lista de `src/core/minigames/types.ts`) e exige: nenhum import de `gameFeel` nem de `canvas-confetti`; ao menos uma chamada `celebrar({ tipo: 'acerto'` e uma `celebrar({ tipo: 'erro'`; nenhuma chamada direta a `vibrar(` / `triggerHaptic(` / `emitBurst(`.
- [ ] **Step 2:** rodar → FAIL listando os jogos fora do padrão.
- [ ] **Step 3:** migrar jogo a jogo: acerto → `celebrar({ tipo: 'acerto', combo, el, pontos })`; erro → `celebrar({ tipo: 'erro', el })`; subida de multiplicador → `celebrar({ tipo: 'combo', multiplicador })`. Taboo ganha comemoração de acerto. O fim de rodada comemora só em `ResultadoDaRodada` com `celebrar({ tipo: 'rodada', estrelas, jogo })` (tirar comemoração de fim de dentro dos jogos). Modal e fila usam `celebrar({ tipo: 'conquista' | 'bau' | 'nivel' })`.
- [ ] **Step 4:** teste → PASS; testes existentes dos jogos atualizados.
- [ ] **Step 5:** `npm run build` e conferir no relatório do bundle que `canvas-confetti` sumiu.
- [ ] **Step 6:** commit `refactor(jogos): 18 jogos no motor único de comemoração; sai canvas-confetti`.

### Task 1.3: e2e de retorno nos jogos

**Files:** Test: `tests/e2e-estatica/comemoracao.e2e.ts`

- [ ] **Step 1:** para Memória, Termo, Karuta e Taboo (dois principais, dois culturais): acertar um item e conferir que aparece o `+N` flutuante (`[data-flutuante]`) e que o HUD mostra o multiplicador após 3 acertos; com `html[data-modo-leve='true']` conferir que nenhum `canvas` de partículas recebe desenho (contador exposto em `window.__comemoracoes` só em `import.meta.env.DEV`/e2e).
- [ ] **Step 2:** rodar `npx playwright test -c playwright.estatica.config.ts comemoracao` → PASS desktop e mobile-375.
- [ ] **Step 3:** commit `test(e2e): retorno de acerto igual nos jogos e modo leve`.

---

## Onda 2 — Economia, corte do catálogo, reembolso

### Task 2.1: regras de ganho por resultado

**Files:**

- Modify: `src/core/learning/xp.ts` (`PESOS_XP`, `PESOS_SEEDS`), `src/core/learning/economia.ts` (`REGRAS`), `server/db/repositories/metrics.ts` (cálculo de Seeds/XP derivados), `src/core/economiaAutoridade.ts` (`valorDoCredito` para `meta:<AAAA-MM-DD>` e `palavra:<cardId>`)
- Test: `tests/economia-sem-tempo.test.ts`, atualizar `tests/economia.test.ts`, `tests/xp.test.ts`, `tests/seeds.test.ts`

**Interfaces:**

- Produces: `PESOS_SEEDS` sem `presenca` e sem `capturaPor5Min`; novos `palavraSalva: 1` (teto 30/dia), `metaDiaria: 15`, `nivelDeMaestria: 20` (multiplicado pelo nível). Motivos de crédito `meta:<AAAA-MM-DD>` e `palavra:<cardId>`.

- [ ] **Step 1: teste de varredura** — `tests/economia-sem-tempo.test.ts`:

```ts
import { REGRAS } from '../src/core/learning/economia';
import { PESOS_SEEDS, PESOS_XP } from '../src/core/learning/xp';
it('nenhuma regra paga por tempo ou presença', () => {
  const proibidos = /presen|minuto|min\b|tempo|abrir/i;
  for (const r of REGRAS) expect(`${r.id} ${r.como} ${r.unidade}`).not.toMatch(proibidos);
  expect(Object.keys(PESOS_SEEDS)).not.toContain('presenca');
  expect(Object.keys(PESOS_SEEDS)).not.toContain('capturaPor5Min');
  expect(Object.keys(PESOS_XP)).not.toContain('capturaPor5Min');
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** remover as fontes por tempo e presença dos pesos, das `REGRAS` e da derivação do servidor; adicionar `palavraSalva`, `metaDiaria`, `nivelDeMaestria`; a ofensiva passa a contar só dias com revisão, rodada ou palavra salva (`server/db/repositories/metrics.ts:456-501` — tirar `presencas` da conta; a rota `/presenca` continua gravando para estatística, sem crédito).
- [ ] **Step 4:** testes → PASS; ajustar os testes antigos que esperavam presença/captura (documentar no commit).
- [ ] **Step 5:** commit `feat(economia): Seeds só por resultado; sai presença e tempo de captura`.

### Task 2.2: baú v2

**Files:**

- Modify: `src/core/economiaAutoridade.ts` (drop), `server/routes/metrics.ts:263-302`, `src/data/efemero/rotas/economia.ts`, `src/lib/estado/useRecompensas.ts`, `src/components/RecompensaDesbloqueada.tsx`
- Test: `tests/bau-v2.test.ts`, `tests/contratos/rotas-espelhadas.test.ts`

**Interfaces:**

- Produces:

```ts
export const BAUS_POR_DIA = 3;
export const PITY_DO_BAU = 5; // o 5º baú seguido sem raro é raro
export const SEEDS_DO_REPETIDO = { comum: 15, raro: 40 } as const;
export function decidirBau(entrada: {
  estrelas: 0 | 1 | 2 | 3;
  bausHoje: number;
  semRaroSeguidos: number;
  sorteio: number;
  elegiveis: ItemDaLoja[];
}):
  | { tipo: 'sem-bau'; motivo: 'estrelas' | 'teto' }
  | { tipo: 'item'; item: ItemDaLoja; raridade: 'comum' | 'raro' }
  | { tipo: 'seeds'; seeds: number; raridade: 'comum' | 'raro' };
```

A resposta da rota inclui `chances: { comum: 75, raro: 25 }` e `proximoRaroGarantidoEm: number`.

- [ ] **Step 1: testes** — `estrelas < 2` → `sem-bau/estrelas`; `bausHoje = 3` → `sem-bau/teto`; `semRaroSeguidos = 4` e sorteio 0.01 → raro; elegíveis vazios → `seeds` com o valor da raridade sorteada; dia local: baús às 23:59 e 00:01 contam em dias diferentes (`vi.setSystemTime`); mesmo `roundId` duas vezes → um crédito só.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar `decidirBau` puro; servidor lê estrelas de `exercise_results` do `roundId`, conta baús do dia local (fuso do usuário enviado no perfil; se ausente, `America/Sao_Paulo`) e a sequência sem raro dos créditos `drop:`; espelho igual. UI: o modal mostra "Chances: 75% comum · 25% raro" e "raro garantido em N baús"; `seeds` mostra "Você já tem este item: +N Seeds".
- [ ] **Step 4:** PASS, incluindo a paridade.
- [ ] **Step 5:** commit `feat(bau): baú por desempenho, teto diário, garantia e repetido vira Seeds`.

### Task 2.3: corte do catálogo e reembolso

**Files:**

- Modify: `src/core/loja.ts` (remove tipos `cursor`, `pack`, `aprimoramento`, itens de `galeria` de emoji, partícula `emoji`, rastros além de 1 por forma), `src/core/economiaAutoridade.ts` (`autorizarGasto` recusa `aprimoramento:`), `src/lib/galeria/equipar.ts`, `src/lib/theme.ts`/`appearance.ts` (ignorar valores removidos)
- Delete: `src/lib/cursores.ts`, `src/lib/aprimoramentos.ts`, `src/components/views/personalizar/SeletorDeEmojis.tsx`, editor de pack, e o que ficar sem uso (conferir com `npm run knip` se rodar; senão grep)
- Create: `src/core/reembolso.ts`; rota `POST /api/seeds/reembolso` no servidor e no espelho
- Modify: `src/lib/rastroDoMouse.ts` (só `matchMedia('(pointer: fine)')` e sem modo leve)
- Test: `tests/reembolso.test.ts`, `tests/integration/economia-reembolso.test.ts`

**Interfaces:**

- Produces:

```ts
export const ITENS_REMOVIDOS: ReadonlySet<string>; // ids antigos
export function reembolsosDevidos(
  gastos: { reason: string; amount: number }[],
  jaCreditados: ReadonlySet<string>,
): { creditoId: `reembolso:${string}`; seeds: number }[];
```

Créditos pagos com Créditos (`premium:`) de item removido → `equivalenteDe(id): string` (mapa fixo em `src/core/reembolso.ts`, para itens da onda 4; até lá o equivalente é o tema "Aurora").

- [ ] **Step 1: testes** — gasto `loja:cursor-pato` 45 → devolve `reembolso:loja:cursor-pato` 45; já creditado → nada; duas chamadas concorrentes na rota (Promise.all) → 1 crédito (índice único de `seed_credits` por usuário+motivo já existe — conferir; se não, migração); item removido equipado em `settings` → `equiparItem`/hidratação cai no padrão sem lançar.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3a:** letras (`tipo: 'fonte'`) e posição do menu (`tipo: 'posicao'`) saem do catálogo e viram opções livres no Personalizar (bloco "Acessibilidade e layout"); quem gastou Seeds em posição entra no reembolso. Teste: `estadoDoItem` não é chamado para fonte/posição e todas ficam selecionáveis no nível 1.
- [ ] **Step 3:** implementar; o cliente chama a rota uma vez por sessão quando a flag `recompensas_v2` está ligada e mostra o aviso único (chave `babel.aviso_reembolso_v2`) "Trocamos os cursores e emojis por recompensas novas. Suas Seeds voltaram: +N".
- [ ] **Step 4:** PASS + paridade + `tests/eca-art20-sem-recompensa-aleatoria-paga.test.ts`.
- [ ] **Step 5:** commit `feat(loja): sai o catálogo de emoji; reembolso idempotente das Seeds`.

### Task 2.4: flag `recompensas_v2` e calibragem

**Files:**

- Create: `server/db/migrations/0036_flag_recompensas_v2.sql` (+ journal + snapshot), `scripts/economia/simular-ritmo.ts`
- Modify: `server/lib/flags.ts`, `src/core/flags.ts`, `docs/flags.md`
- Test: `tests/flags-recompensas-v2.test.ts`

- [ ] **Step 1:** teste: a flag existe, é booleana, nasce `false` no servidor e `true` na edição estática só quando `VITE_RECOMPENSAS_V2=1` (a onda 5 liga).
- [ ] **Step 2:** FAIL → implementar como `oferta_planos` (migração 0031 é o modelo) → PASS.
- [ ] **Step 3:** `scripts/economia/simular-ritmo.ts` simula 3 perfis por 30 dias (leve: 10 revisões + 1 rodada/dia; típico: 25 revisões + 3 rodadas + 10 palavras + meta; intenso: 60 revisões + 8 rodadas + 30 palavras + meta), com os pesos novos, baú e maestria, e imprime Seeds/dia e dias até cada faixa de preço. **Meta:** perfil típico compra um comum a cada 2–3 dias com Seeds; um raro por semana; um épico a cada 2–3 semanas. Ajustar os preços por raridade em `src/core/loja.ts` até o típico cair na meta e gravar a tabela em `docs/economia-v2.md`.
- [ ] **Step 4:** commit `feat(economia): flag recompensas_v2 e preços calibrados por simulação`.

---

## Onda 3 — Maestria por jogo

### Task 3.1: pontos e níveis (core + servidor)

**Files:**

- Create: `src/core/maestria.ts`
- Modify: `src/core/economiaAutoridade.ts` (`valorDoCredito` aceita `maestria:<jogo>:<nivel>` conferido), `server/routes/metrics.ts` (GET `/api/maestria` e crédito), `src/data/efemero/rotas/economia.ts`
- Test: `tests/maestria.test.ts`, `tests/integration/economia-maestria.test.ts`

**Interfaces:**

- Produces:

```ts
export const LIMIARES_DE_MAESTRIA = [30, 100, 220, 400, 600] as const;
export const NOMES_DE_MAESTRIA = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Mestre'] as const;
export function pontosDeMaestria(r: {
  acertos: number;
  total: number;
  comboMaximo: number;
}): number {
  if (r.total === 0) return 0;
  const precisao = r.acertos / r.total;
  const mult = precisao >= 1 ? 2 : precisao >= 0.9 ? 1.5 : precisao >= 0.75 ? 1 : 0.5;
  return Math.round(r.acertos * mult) + Math.min(5, Math.floor(r.comboMaximo / 3));
}
export function nivelDeMaestria(pontos: number): {
  nivel: 0 | 1 | 2 | 3 | 4 | 5;
  pontos: number;
  proximo: number | null;
  pctNoNivel: number;
};
export interface MaestriaDoJogo {
  jogo: MinigameId;
  pontos: number;
  nivel: 0 | 1 | 2 | 3 | 4 | 5;
}
```

- [ ] **Step 1: testes** — 10/10 com combo 10 → 23; 9/10 combo 0 → 14; 0 itens → 0; limiares exatos (29 → nível 0, 30 → 1, 600 → 5, `proximo` null); nenhum parâmetro de tempo na assinatura; servidor soma de `exercise_results` por jogo (idempotente por `roundId`); `maestria:memory:3` só credita se os pontos do servidor alcançam 220, com Seeds `20 × 3`.
- [ ] **Step 2:** FAIL → implementar → PASS (inclui paridade do espelho).
- [ ] **Step 3:** commit `feat(maestria): pontos por precisão e combo, 5 níveis, crédito conferido`.

### Task 3.2: maestria no fim da rodada e na antessala

**Files:**

- Modify: `src/components/minigames/casca/ResultadoDaRodada.tsx`, `src/components/minigames/casca/AntessalaDaRodada.tsx`, `src/lib/estado/useRecompensas.ts` (evento `maestria`)
- Create: `src/components/maestria/BarraDeMaestria.tsx`
- Test: `tests/barra-de-maestria.test.tsx`

- [ ] **Step 1:** teste de componente: barra mostra "Prata · 140/220", anima o ganho da rodada (+N) e, ao cruzar o limiar, dispara `celebrar({ tipo: 'maestria', jogo, nivel })` e enfileira a recompensa do nível.
- [ ] **Step 2:** FAIL → implementar (ícone lucide por nível: `Medal`, `Award`, `Trophy`, `Gem`, `Crown`) → PASS.
- [ ] **Step 3:** commit `feat(maestria): barra no fim da rodada e na antessala`.

### Task 3.3: efeitos de jogo e finalizações

**Files:**

- Create: `src/core/efeitosDeJogo.ts` (catálogo dos efeitos: 6 acertos, 4 combos genéricos, 18 finalizações), `src/lib/comemoracao/efeitos.ts` (receitas: forma, cor por token, quantidade, som)
- Modify: `src/lib/comemoracao/index.ts` (lê efeitos equipados), `src/core/loja.ts` (concatena itens `efeito-acerto` / `efeito-combo` / `finalizacao`), `src/lib/galeria/equipar.ts`
- Test: `tests/efeitos-de-jogo.test.ts`

**Interfaces:**

- Produces: tipos `'efeito-acerto' | 'efeito-combo' | 'finalizacao' | 'moldura' | 'titulo'` em `TipoDaLoja` (moldura no nível 3 e título no nível 5 de cada jogo, sem preço); `ItemDaLoja.jogo?: MinigameId`; `ItemDaLoja.origemMaestria?: { jogo: MinigameId; nivel: 2 | 4 }`.
- [ ] **Step 1: testes** — cada um dos 18 jogos tem exatamente uma finalização com `origemMaestria.nivel = 4` e um acerto próprio com nível 2 (ou reaproveita um genérico, documentado); `estadoDoItem` de item de maestria nunca devolve preço; finalização de jogo X equipada só vale em X até o nível 5 de X; `planoDeComemoracao` usa a receita equipada.
- [ ] **Step 2:** FAIL → implementar as receitas só com o motor de partículas existente (`FormaParticula`, `OrigemRajada`) e tokens de cor → PASS.
- [ ] **Step 3:** verificação no navegador: jogar Memória até 3 estrelas com finalização equipada, screenshot.
- [ ] **Step 4:** commit `feat(maestria): efeitos de acerto, combo e 18 finalizações`.

---

## Onda 4 — Temas completos, legenda, cartões

### Task 4.1: tema completo

**Files:**

- Create: `src/core/catalogoV2.ts` (temas novos, legendas, cartões — concatenado em `CATALOGO_DA_LOJA`), `src/styles/temas-v2.css`
- Modify: `src/index.css` (tokens `--hud-*`, `--textura`, `--fundo-animado` para os 8 temas atuais com valores neutros), `src/lib/theme.ts`, `src/lib/soundFx.ts` (pacote de sons por tema), `src/lib/effects.ts` (`PARTICLE_PRESETS` dos temas novos), `src/components/minigames/casca/HudDaRodada.tsx` (usa `--hud-*`)
- Test: `tests/temas-v2.test.ts`, `tests/contrastePaletas.test.ts` (estender)

- [ ] **Step 1: testes** — os 6 temas novos (`radio`, `papel`, `neon`, `fliperama`, `jardim`, `observatorio`) existem no catálogo, em `ThemeType`, em `PARTICLE_PRESETS` e no mapa de sons; contraste AA de texto em claro e escuro (o teste existente de contraste passa a iterar sobre eles); `html[data-modo-leve='true']` e `prefers-reduced-motion` zeram `--fundo-animado` (teste do CSS gerado por regex); o fundo animado é CSS puro (sem `<canvas>` nem imagem > 8 KB).
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** navegador: aplicar cada tema em Início, Jogar e Personalizar, claro e escuro, screenshot; conferir que o layout, os ícones e os componentes são os mesmos do tema Babel.
- [ ] **Step 4:** orçamento do bundle (`npm run build` + script de orçamento) sem estourar.
- [ ] **Step 5:** commit `feat(temas): tema completo (sons, HUD, textura, fundo leve) e 6 temas novos`.

### Task 4.2: estilos de legenda

**Files:**

- Modify: `src/lib/transcriptUtils.ts` (`TranscriptSettings.estilo: string`, padrão `'classica'`), `src/components/views/captura/LegendasFlutuantes.tsx`, `src/components/ChatTranscript.tsx`, `src/components/DocumentPiP.tsx`, `src/components/views/captura/TranscriptVisualSettings.tsx`
- Create: `src/lib/estilosDeLegenda.ts`, `src/styles/legendas.css`
- Test: `tests/estilos-de-legenda.test.ts`

**Interfaces:**

- Produces: `export interface EstiloDeLegenda { id: string; caixa: 'nenhuma' | 'solida' | 'vidro' | 'fita'; contorno: 0 | 1 | 2; entrada: 'nenhuma' | 'surgir' | 'digitar'; destaqueAprendida: 'sublinhado' | 'marca-texto' | 'cor' }` e `ESTILOS_DE_LEGENDA` com 8 estilos (`classica` grátis).
- [ ] **Step 1: testes** — estilo não possuído cai em `classica`; `entrada` vira `nenhuma` com movimento reduzido; tamanho, cor de alto contraste e fonte continuam livres e ganham do estilo quando em conflito (acessibilidade primeiro); a palavra que o usuário já aprendeu recebe `data-aprendida` na legenda.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** navegador: captura com vídeo de teste, trocar os 8 estilos, screenshot; conferir que a latência da legenda não muda (animação só em CSS).
- [ ] **Step 4:** commit `feat(legenda): 8 estilos de legenda ao vivo com destaque da palavra aprendida`.

### Task 4.3: peles de cartão

**Files:**

- Create: `src/lib/pelesDeCartao.ts`, `src/styles/cartoes.css`
- Modify: cartão do Estudar (`src/components/views/Study.tsx`), da Biblioteca (componente de cartão em `src/components/views/biblioteca/`), jogos que mostram cartões
- Test: `tests/peles-de-cartao.test.ts`

- [ ] **Step 1: testes** — 5 peles, cada uma com classe para `nova`, `aprendida`, `dominada`; o estado vem do FSRS existente (função que já classifica a palavra — localizar e reutilizar, não recalcular); pele não possuída cai na padrão.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** commit `feat(cartoes): peles de cartão que mudam com o estado da palavra`.

---

## Onda 5 — Missões, temporada, conquistas, telas

### Task 5.1: conquistas v2

**Files:**

- Modify: `src/core/learning/conquistas.ts` (~40 conquistas em 4 pilares, `icone: keyof typeof icones lucide` no lugar de `emoji`, `nivel?: 'bronze' | 'prata' | 'ouro'`, `secreta?: boolean`), `src/lib/conquistas.ts` (contexto), `src/core/economiaAutoridade.ts` (`CONQUISTAS_CONFERIVEIS` = todas), `src/components/views/Conquistas.tsx`
- Test: `tests/conquistas-v2.test.ts`

- [ ] **Step 1: testes** — nenhuma conquista tem `emoji`; toda conquista está em `CONQUISTAS_CONFERIVEIS`; nenhuma condição usa tempo de tela; secretas ≤ 3; ouro dá `moldura` ou `titulo`; ids das 14 antigas preservados (quem já tinha continua tendo).
- [ ] **Step 2:** FAIL → implementar (definições concretas das ~40 no próprio arquivo, com a tabela no commit) → PASS.
- [ ] **Step 3:** commit `feat(conquistas): 40 conquistas em 4 pilares, todas conferidas`.

### Task 5.2: missões diárias e ofensiva

**Files:**

- Create: `src/core/missoes.ts`
- Modify: `src/lib/progress.ts:96-130`, `src/lib/estado/useNotificacoes.ts`, servidor e espelho (crédito `meta:<dia>`)
- Test: `tests/missoes.test.ts`

**Interfaces:**

- Produces: `export function missoesDoDia(dia: string, historico: { jogosJogados: MinigameId[] }): Missao[]` (determinística por dia: mesma entrada → mesmas 3 missões); `export function metaConcluida(m: Missao[]): boolean`; congelamento: `congelamentosDisponiveis(historico): 0 | 1 | 2`.
- [ ] **Step 1: testes** — 3 missões por dia, determinísticas; nenhuma missão de tempo; "praticar um jogo novo" só aparece se há jogo nunca jogado; meta concluída credita `meta:<dia>` uma vez; virada 23:59→00:01 no meio da rodada credita no dia em que a rodada **começou**; congelamento ganho 1/semana, máximo 2; aviso "missão quase completa" 1/dia, nunca 22h–8h, nunca para perfil protegido.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** commit `feat(missoes): 3 missões diárias, meta do dia e congelamento de ofensiva`.

### Task 5.3: temporada com datas

**Files:**

- Modify: `src/core/passe.ts` → `src/core/temporada.ts` (renomear; manter reexport temporário só se houver import externo), `src/components/views/passe/PasseDeTemporada.tsx`, servidor/espelho (`temporada:<id>:<nivel>:gratis|assinante`)
- Test: `tests/temporada.test.ts`

**Interfaces:**

- Produces: `export interface Temporada { id: string; inicio: string; fim: string; niveis: 30 }`; `TEMPORADAS: Temporada[]` (T1 de 01/10/2026 a 25/11/2026); `temporadaAtual(agora: Date): Temporada | null`; `xpDeTemporada` = XP da conta ganho entre `inicio` e `fim`; `nivelDaTemporada(xp): number` (30 níveis, 150 XP cada); `recompensaDaTrilha(nivel, trilha: 'gratis' | 'assinante'): ItemDaLoja | { seeds: number } | null` (grátis em todo nível par; assinante em todo nível).
- [ ] **Step 1: testes** — fora das datas → `null` e a tela mostra "próxima temporada em …" (sem contagem para perfil protegido); nenhuma rota compra nível; crédito de assinante exige assinatura ativa no servidor; item de temporada passada ganha `precoSeeds` depois de 365 dias do `fim`.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** commit `feat(temporada): temporada de 8 semanas com trilha grátis e de assinante`.

### Task 5.4: Personalizar em 5 abas + fila de recompensas + resumos

**Files:**

- Modify: `src/components/views/Loja.tsx` (abas Coleção, Maestria, Temporada, Conquistas, Loja), `src/components/views/Personalizar.tsx`, `src/components/views/personalizar/Inventario.tsx`, `src/components/RecompensaDesbloqueada.tsx` (prévia real e agrupamento "N novidades"), `src/components/views/Study.tsx:729-760` (resumo igual ao da rodada), `src/lib/rotas.ts` (aliases das abas)
- Create: `src/components/views/maestria/PainelDeMaestria.tsx`, `src/components/perfil/MolduraETitulo.tsx` (moldura e título equipados no perfil, no cabeçalho do Personalizar e no ranking de adulto; itens `tipo: 'moldura' | 'titulo'` vindos de maestria nível 3/5, conquistas de ouro e temporada)
- Test: `tests/personalizar-v2.test.tsx`, `tests/moldura-e-titulo.test.tsx`, `tests/e2e-estatica/personalizar-v2.e2e.ts`

- [ ] **Step 1: testes de componente** — as 5 abas; contagem de conquistas "x/40"; Loja sem Créditos na edição estática e para perfil protegido; prévia ao vivo: selecionar um estilo de legenda muda a legenda de exemplo sem equipar; fila mostra "3 novidades" quando chegam 3 juntas e nunca abre durante uma rodada.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** ligar `recompensas_v2` na edição estática (`VITE_RECOMPENSAS_V2=1` em `scripts/build-estatica.mjs`).
- [ ] **Step 4: e2e em banco limpo** (desktop e mobile-375): primeira visita → Personalizar abre as 5 abas sem "Disponível na versão completa"; jogar uma rodada de Memória com 3 estrelas → maestria sobe, baú aparece com as chances, Seeds do resumo = Seeds do saldo.
- [ ] **Step 5:** commit `feat(personalizar): coleção, maestria, temporada, conquistas e loja`.

---

## Onda 6 — Loja com Créditos

### Task 6.1: compra direta com prévia

**Files:**

- Modify: `src/components/views/Loja.tsx` (aba Loja: vitrine "de Créditos"), `src/core/loja.ts` (itens com `precoCreditos` do catálogo v2), `server/routes/billing.ts` (`/gastar` só para item conhecido, com preço do servidor), `src/components/loja/ComprarCreditos.tsx`
- Test: `tests/loja-creditos-v2.test.ts`, `tests/eca-art20-sem-recompensa-aleatoria-paga.test.ts` (estender)

- [ ] **Step 1: testes** — nenhum item com `precoCreditos` é aleatório, de maestria, de conquista ou de temporada-assinante; compra exige confirmação explícita em duas etapas (prévia → confirmar), sem "comprar com um clique"; perfil protegido recebe 403 no servidor e não vê a vitrine; a varredura do ECA art. 20 cobre `decidirBau`, temporada e loja (nenhum caminho de Créditos chega a `decidirBau`).
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** e2e no app completo (porta local, Asaas em modo de teste) comprar um item: saldo de Créditos cai, item aparece na Coleção. Pular se o ambiente de teste do provedor não estiver configurado e registrar no relatório.
- [ ] **Step 4:** commit `feat(loja): compra direta com Créditos, prévia e bloqueio para perfil protegido`.

### Task 6.2: fechamento

- [ ] **Step 1:** revisão de toda a branch (agente revisor) contra a spec e este plano.
- [ ] **Step 2:** gates completos em `audit-v4`.
- [ ] **Step 3:** `docs/economia-v2.md` com a tabela final e o que o dono precisa validar com advogado antes de ligar a flag em produção completa.
- [ ] **Step 4:** relatório ao dono; merge na `main` e deploy da edição estática **só com autorização**.
