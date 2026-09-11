# INVENTÁRIO do app atual (F1)

Levantado em 2026-09-11 por três subagentes read-only na branch `feat/redesign-design-system-v3`
(código idêntico à `main` @ `2ac979b` — a branch ainda não tem mudança de código).
Toda linha cita `arquivo:linha`.

## 1. Navegação: não há roteador, há espelho de URL

`src/lib/rotas.ts:1` diz explicitamente "Não há router". O estado é `useState<ViewType>`
(`src/App.tsx:64`) e a URL é espelhada à mão. Navegação por função única `navigateTo`
(`src/lib/estado/useNavegacao.ts:67`), com guard de saída para captura em andamento (`:75`).
Deep-link restaurado no boot (`:136-144`), publicado estado→URL (`:147-155`), `popstate`
tratado (`:159-172`).

**Consequência para o redesign: trocar a camada visual não pode quebrar `rotas.ts`.**

### 13 views de topo (`src/types.ts:156`)

| View | Componente | Rota | No menu? |
|---|---|---|---|
| `hub` | `Hub.tsx` | `/` | Início |
| `capture` | `LiveCapture.tsx` | `/capturar` | Capturar |
| `play` | `Play.tsx` | `/jogar` (+query de filtro) | Jogar |
| `library` | `Library.tsx` | `/biblioteca` | Biblioteca |
| `analysis` | `Analysis.tsx` | `/sessao/<id>/<aba>` | **não** — só por Hub/Biblioteca |
| `study` | `Study.tsx` dentro de Analysis | `/revisar[/<id>]` | não |
| `reading` | `Reading.tsx` dentro de Analysis | `/sessao/<id>/leitura` | não |
| `metrics` | `Metrics.tsx` | `/vocabulario` | Vocabulário |
| `loja` | `Loja.tsx` | `/loja/<aba>`, alias `/creditos` | Personalizar |
| `sobre` | `Sobre.tsx` | `/sobre` | Sobre |
| `planos` | `Planos.tsx` | `/plano`, alias `/planos` | Planos |
| `profile` | `Perfil.tsx` | `/perfil` | **não** — só pelo avatar |
| `settings` | `Settings.tsx` | `/ajustes` | Ajustes |

Fora do `ViewType` (gates antes do shell): Login (`App.tsx:174`), ResetPassword (`:167`),
Onboarding (`:186`), callback OAuth (`:157`).

Barra de navegação: `StudioHeader.tsx:51` escolhe `NavBar` (topo/rodapé) ou `NavRail`
(esquerda/direita) conforme `menuPosition`. Dock mobile própria: `shell/MobileNav.tsx:19`
(`md:hidden`, `aria-label="Navegação principal"`). Itens numa fonte única: `shell/navItems.ts:43`.

### Atalhos de teclado

- **Ctrl/Cmd+K** — busca global, listener com prioridades em `CommandPalette.tsx:192`.
- **Esc** — pilha de camadas em `src/lib/camadasDeEscape.ts:18` (fase de captura), mais ~20
  listeners locais (LiveCapture, Library, Analysis, LangPicker, jogos).
- **Ctrl/Cmd+Enter** — confirma edição inline na Análise (`Analysis.tsx:1822`, `:1849`).
- **Setas + Esc** — tour do onboarding (`Onboarding.tsx:164-167`).
- Teclado de jogo: `TermoGame.tsx:431-440`, `ChoseongGame.tsx:176`.

## 2. O protótipo está ATRÁS do app, não à frente

O prompt lista como lacunas P1/P2 uma série de telas que **já existem e funcionam**:

| "Lacuna" segundo o prompt | Situação real | Evidência |
|---|---|---|
| Sessão com 4 abas + modal Exportar real | **existe** — Transcrição / Leitura / Jogos / Visão Geral e Métricas | `Analysis.tsx:717-752`; modal `:703` |
| Loja real (Meu visual / Loja / Passe / Desafios) | **existe**, com as 4 abas | `Loja.tsx:482-485` |
| Perfil com 3 abas | **existe** — Você / Progresso / Seus dados | `Perfil.tsx:56` |
| Busca real (paleta de comandos) | **existe**, Ctrl+K | `BuscaGlobal.tsx:1` sobre `CommandPalette.tsx:1` |
| iChat | **existe** em 3 estados | `App.tsx:400`, `useNavegacao.ts:52-56` |
| Menu de conta | **existe** — 4 itens | `shell/MenuDaConta.tsx:95-158` |
| Gaveta de Capturar / Falantes / Foco / Bingo | **existe** | `LiveCapture.tsx:1586`, `:1721`, `:2491`, `:2299`, `:2374` |
| Ajustes com 4 abas | **existe** | `Settings.tsx:57-62` |
| Importar com 4 fontes | **existe** — YouTube / documento / web / áudio local | `Library.tsx:619` |
| Mobile 375px | **existe** — dock própria + E2E em 3 viewports | `MobileNav.tsx:19`, `playwright.config.ts:41-60` |
| Lobby de Jogar com facetas, Sala de Escolha, Recordes | **existe** | `Play.tsx:2733`, `:2988`, `:3355`, `:2703`, `:2680`, `:3396` |
| Ranking global real | **existe**, servido pelo Express | `server/routes/rank.ts:29-92` |

Sobram como possível lacuna de desenho apenas **Antessala** e **Raspadinha**. Na direção oposta,
dezenas de telas do app nunca foram desenhadas no protótipo.

## 3. "Em breve", links mortos e dado falso: já limpos

- **"Em breve": zero em string de interface.** As 19 ocorrências em `src/` estão todas dentro de
  comentários que documentam a remoção do texto antigo. Nenhum "coming soon".
- **`href="#"` ou vazio: zero.** `Sobre.tsx:27` tem guarda — link sem destino **não renderiza**.
- **Dado falso já travado por teste:** `semConteudoFabricado.test.ts:37,39,45` mantém canários de
  texto cravado fora do JSX de Analysis/Metrics/Reading e obriga a primitiva `<SemDado>` (`:56`);
  `contagemHonesta.test.ts:35` proíbe exibir artefato de paginação como fato do acervo, `:52`
  obriga marcar `recortado`, `:79` proíbe número impossível na tela.

## 4. i18n

Biblioteca própria: `src/lib/i18n.ts:118` (`t`, `tp`, `ehRTL`, `numero`, `temTraducao`).
**A chave é o próprio texto em português**; falta de tradução cai no português, nunca em vazio ou
id (`tests/i18n.test.ts:22`, `:31`). Catálogos em `public/i18n/` (`en.json` 701 chaves,
`xx.json` pseudo-locale 701, `ar.json` 21, `es.json` 20). Cobertura medida e versionada em
`src/data/i18n/cobertura.json:1` — pt 1.0, en 1.0, ar 0.03, es 0.03. **Só pt e en são oferecidos**,
e a lista sai da cobertura medida, não de constante (`tests/i18n.test.ts:145`, `:156`).
Órfãs travadas no CI: `scripts/i18n/orfas.mjs:40`, `.github/workflows/ci.yml:75`, piso de 420
chaves (`ci.yml:91`).

## 5. Camada de estilo

- Bridge Tailwind 4 em `src/index.css:4` (`@theme`): os utilitários nunca carregam hex.
- Tokens base em `src/index.css:71`, paleta clara `:83-121`.
- **Claro/escuro por classe** no `<html>` e no `<body>` (`src/lib/theme.ts:125-126`), seletor
  `src/index.css:149`.
- **8 temas de cor** por atributo `data-theme` (`src/lib/theme.ts:107`), pintados antes do primeiro
  render (`src/main.tsx:11`): `babel` (padrão), `premium`, `linear`, `vercel`, `aurora` (sempre
  escuro), `mochi`, `notion`, `custom`. Travado por `tests/temasOferecidos.test.ts`.
- **8 temas de fonte** num atributo separado `data-fonte`: `padrao`, `pixel`, `serif`, `mono`,
  `cyber`, `rounded`, `handwriting`, `display` (`src/lib/appearance.ts:48`). Qualquer tema de cor
  combina com qualquer tipografia.
- `src/lib/appearance.ts:39-43` exige que a descrição cite a família **realmente carregada**.
- **`prefers-reduced-motion` em três camadas**: guarda global `src/index.css:1451`, guardas locais
  `:372` e `:936`, e JS em `src/lib/juice.ts:62`, `useAparencia.ts:83`, `ParticleCanvas.tsx:63`.
- Armadilha documentada em `src/index.css:48-69`: token derivado com `color-mix()` precisa ser
  redeclarado em todo bloco de tema.

### Fontes: 14 famílias por `@import` do Google (`src/index.css:1`)

Inter, Archivo, IBM Plex Mono, Geist, Geist Mono, Baloo 2, Silkscreen, **VT323**, Merriweather,
JetBrains Mono, Orbitron, Rajdhani, Nunito, Caveat.

- **`VT323` não é usada em lugar nenhum** — import morto, citado só num comentário (`:1598`).
- O `@import` é render-blocking, sem `preconnect`, 14 famílias num request único.
- **Lacuna P0 real confirmada** (D-004).

## 6. Estados vazio / carregando / erro — mapa por tela

| Tela | Carregando | Vazio | Erro |
|---|---|---|---|
| Hub | — | `Hub.tsx:647-650`, `:816-817`, `:827` | — |
| LiveCapture | `:2341`, `:2245` | `:1706`, `:528` | `:1749`, `:1247` |
| Library | `:197`, `:267` | `:826-830`, `:869` | `:399` |
| Analysis | `:537-543`, `:2003-2010` | `:541`, `:1273-1274` | `AnalysisExpandedKpi.tsx:128,140,271,311,380` |
| Play | `:1547` | `:285`, `:3415`, `:3826` | `:351`, `:1015`, `:2166` |
| Reading | `:1701` | `:1701`, `:1945` | — |
| Study | — | `:690-691` | — |
| Metrics | `MetricsExpandedKpi.tsx:77` | `:640`, `:912-913` | — |
| Loja / Personalizar | — | `Inventario.tsx:291,335` | — |
| Planos | `:226` | — | — |
| Perfil | `AbaVoce.tsx:72` | `AbaProgresso.tsx:262` | — |
| Settings / LangAudit | `LangAudit.tsx:352` | `LangAudit.tsx:69,79,96,106` | — |
| Recordes | — | `play/Recordes.tsx:83` | — |

**Buraco real: estado de ERRO ausente em 9 das 13 telas.** Entra no `LACUNAS.md` como P0.

**Risco anotado:** `Analysis`, `Library`, `Metrics` e `Perfil` só montam quando `!anonimo`
(`App.tsx:289,304,320,322`); sem conta, `/sessao/...`, `/biblioteca`, `/vocabulario` e `/perfil`
renderizam só o `CartaoDeConvite` (`App.tsx:273`).

## 7. Jogos

Registro único e exaustivo, tipado: `MinigameId` em `src/core/minigames/types.ts:18-21` e
`MINIGAMES: Record<MinigameId, MinigameDef>` em `:147-181`. Mapa id → componente em
`src/components/views/play/telaDoJogo.ts:17-35`. Lista derivada usada pelo servidor:
`src/core/minigames/revelavel.ts:301`.

**Os 18 ids do protótipo existem todos de fato.** Nenhum falta. Seis deles (`termo`, `scramble`,
`karaoke`, `escuta`, `ditado`, `conectores`) têm `TelaDoJogo = null` e são renderizados por
caminho próprio, não pela cascata genérica.

**Existe um jogo fora do registro: o Bingo da escuta** (`src/core/minigames/bingo.ts:1-20`,
`BingoPanel.tsx`). Não é `MinigameId`, não entra em `MINIGAMES`, nem em `montarRodada`, nem no
gate de elegibilidade (`estadoDosJogos.ts:390`), nem no ranking. É um painel acoplado à captura.

### `montarRodada`

`src/core/minigames/rodada.ts:172`. Puro: sem DOM, sem `Date.now()`, sem `localStorage`; o `agora`
é injetado. Entrada em `:112-170`, saída `RodadaMontada` em `:89-93`, ou `null` quando falta
material. Material etiquetado em 7 variantes (`:79-86`). **Todos os 18 jogos passam por ele.**
Chamado só de `Play.tsx` (wrapper em `:728`). ADR: `docs/adr/0003-montagem-de-rodada-no-nucleo.md`.
Camada anti-vazamento da resposta na prévia: `revelavel.ts:105`, `:226`.

## 8. Economia: duas moedas, autoridade no servidor

**Seeds** (ganha estudando) e **Créditos** (comprada). O saldo **não é campo mutável** — é
derivado por eventos (ganhas − gastas).

- Preços autoritativos no core: `src/core/economiaAutoridade.ts:1-40`
  (`CUSTOS_DE_NIVEL = [50,110,220]`, `CUSTO_PULAR_RODADA = 40`), catálogo em `src/core/loja.ts:1-25`,
  pacotes de crédito em `src/core/creditos.ts:17-31` (`PRECO_DO_PASSE_CENTAVOS = 1490`).
- Regras de ganho: `src/core/learning/economia.ts:19-45`.
- Saldo derivado no servidor: `server/db/repositories/metrics.ts:494` (`economiaDoUsuario`);
  ledgers em `economia.ts:18-52` e `seedSpends.ts:51-167` ("saldo por eventos, nunca mutável").
- Débito de Seeds: `POST /api/metrics/seeds/gastar` — `server/routes/metrics.ts:113-175`, com três
  portas (autorização por `reason` `:117`; preço divergente → 400 `:126`; saldo insuficiente → 402
  `:146-152`), idempotente por `spendId`.
- Débito de Créditos: `POST /api/billing/gastar` — `server/routes/billing.ts:141-175`.
- O cliente apenas **espelha**: `deriveProgress` em `src/lib/progress.ts:83` (o próprio `:87` avisa
  que a fórmula está escrita duas vezes).
- Modo anônimo: servidor efêmero em memória no navegador (`src/data/efemero/rotas/economia.ts:35`)
  — ali a autoridade é local.

**Corrida aberta, já documentada no código:** `server/routes/metrics.ts:107-111` — duas compras
simultâneas podem ambas passar a conferência de saldo. Não é regressão desta rodada.

## 9. Loja / Passe / Desafios / Conquistas

As quatro são **abas de uma tela real só** (`view: 'loja'`), não specs.
Rotas em `src/lib/rotas.ts:31`, slugs `:88-96`, aliases `:108-119`.
Passe: 100 slots em 10 décadas, `TEMPORADA_ATUAL = 't1'` (`src/core/passe.ts:1-30`), creditação
server-side em `server/routes/billing.ts:207-214`.
**"Desafios" é apenas o rótulo de URL da aba de Conquistas** (`rotas.ts:92`, `:113`) — consolidação
deliberada documentada em `Perfil.tsx:65-66`. Não existe sistema de desafios diários separado.

## 10. FSRS — e o achado mais grave desta rodada

Agendador próprio, sem lib externa: `src/core/learning/scheduler.ts`. Pesos FSRS-5 (19 params)
em `:53-56`, `REQUEST_RETENTION = 0.9` `:62`, núcleo em `:69-97`, `makeFsrs5` `:103-139`.

**Não existem os estados New/Learning/Review/Relearning.** O estado é contínuo — `stability`,
`difficulty`, `reps`, `lapses`, `lastReview` (`:20-35`) — mais o `box` 1..5 legado do Leitner
mantido por reversibilidade. "Novo" é apenas `stability === undefined` (`:109`). Grep por
`relearning` em `src/` e `server/` não retorna nada.

Isto inverte o item do prompt: não é o protótipo que simplifica de quatro estados para três — é o
app que nunca teve os quatro. O rótulo certo tem de sair do modelo contínuo real.

### P0-A — os intervalos dos botões de revisão são literais no JSX

`src/components/views/Study.tsx:1111` `Again (10m)`, `:1120` `Hard (1.2d)`, `:1129` `Good (3.5d)`,
`:1138` `Easy (8d)`. **São constantes fixas.** Não chamam `intervalDays`, não usam a `stability` do
cartão nem a retenção prevista. O próprio arquivo (`:160-169`) declara ter removido a simulação
local e que o servidor passou a ser a única fonte — isso vale para o cartão persistido
(`handleFsrsFeedback` `:170-180`), mas **os quatro rótulos continuam cravados**.

É exatamente o "dado de mentira" que o prompt manda erradicar, e está no app, não só no protótipo.

### P0-B — o botão mente sobre a nota que envia

`src/components/views/Study.tsx:171-173`: em `exercise-kind === 'active-production'`, um `3` (Bom)
é promovido a `4` (Fácil) antes de ir ao servidor. O botão diz "Good (3.5d)" e o servidor recebe
Easy. Mais grave que o rótulo fixo, porque altera o agendamento real do cartão.

## 11. Recordes / ranking

Ranking global real, servido pelo Express: `GET/POST /api/rank/:jogo` —
`server/routes/rank.ts:29-92`. Fica **antes** do `authMiddleware` de propósito (placar público e
anônimo, `:9-15`). Valida o id contra o registro do core (`:23`, `:34`), não contra lista copiada.
Guardas: apelido 3-20 chars (`:66`), `TETO_DE_PONTOS` (`:72`), `TETO_DE_COMBO` (`:76`),
1 envio/min por hash de IP (`:83`). Tabela `rank` em `server/db/schema.ts:750-764`.

A tela `play/Recordes.tsx` tem duas abas com **origens diferentes**: "Meus recordes" vem de
`GET /api/exercises/recordes` (autenticado, `server/routes/exercises.ts:33-34`); o ranking global
vem de `/api/rank/:jogo` (anônimo, por apelido). `src/lib/ranking.ts:4` documenta por que usa
`fetch` cru fora do funil `apiFetch`.
