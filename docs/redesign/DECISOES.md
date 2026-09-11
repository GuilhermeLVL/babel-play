# Decisões do redesign v3

Formato: `D-### | data | contexto | opções | escolha | motivo | reversível? | REVISAR?`

---

**D-001 | 2026-09-11 | O protótipo v3 depende de `./support.js`, que não veio no export (`docs/redesign/source/prototipo-v3.html:6`); sem ele o HTML não renderiza.**
Opções: (a) reconstruir um `support.js` por engenharia reversa; (b) extrair a especificação lendo o template `sc-if`/`sc-for` e a classe `Component`.
Escolha: (b).
Motivo: a seção 1 do prompt proíbe renderizar às cegas; um runtime reconstruído produziria screenshots que não são o design, e o template já é declarativo o bastante para virar `DESIGN-SPEC.md`.
Reversível: sim (se o `support.js` aparecer, basta renderizar e gerar `evidencias/referencia/`).
REVISAR: não.

**D-002 | 2026-09-11 | O prompt pede uma suíte de paridade nova em `e2e/paridade/`, mas o projeto já tem 21 specs Playwright em `tests/e2e/**/\*.e2e.ts`rodando em 3 viewports (375/768/1280,`playwright.config.ts:44-66`).**
Opções: (a) criar `e2e/paridade/` em paralelo; (b) tratar a suíte existente como a suíte de paridade e estendê-la.
Escolha: (b).
Motivo: a seção 9 do prompt proíbe criar estrutura paralela quando já existe equivalente ("evolua o existente"); duas suítes E2E disputariam a mesma porta 3100 e o mesmo SQLite de um usuário só (`playwright.config.ts:24-38`).
Reversível: sim.
REVISAR: não.

**D-003 | 2026-09-11 | O prompt descreve o app com premissas que o código contradiz.**
Verificado item a item nesta sessão:

- Back é **Express 4 + TypeScript** (`server.ts`), não FastAPI/Python.
- Estilo é **Tailwind CSS 4** com uma camada de tokens semânticos já pronta em `src/index.css:5-107`
  (`--canvas`, `--surface`, `--ink`, `--ink-muted`, `--accent`, `--accent-soft`, `--accent-ink`,
  `--good`, `--warn`, `--rare`, `--error`, `--border-subtle`, `--font-display/body/mono`, raios e sombras).
  **O design system formal existe** — o que não existe é no protótipo.
- Ícones já são `lucide-react` via npm, self-hosted. Não há CDN de ícones no app.
- Contraste AA já é **travado por teste**: `tests/contrastePaletas.test.ts` mede os pares de token
  em 7 temas × claro/escuro com limiar 4,5:1, e roda no `test:unit`.
- Responsivo já existe: a suíte E2E roda em **3 viewports** (375 / 768 / 1280), com dock mobile
  própria (`playwright.config.ts:41-60`).
- Já existem testes contra dado inventado (`tests/semConteudoFabricado.test.ts`,
  `tests/contagemHonesta.test.ts`) e contra primitivos quebrados (`tests/primitivosDeUi.test.tsx`).
  Escolha: seguir o código; tratar a lista de "lacunas P0" do prompt como **hipóteses a verificar**,
  não como fatos, e reescrever `LACUNAS.md` a partir do que de fato falta.
  Motivo: hierarquia de decisão do prompt, item 1 — comportamento e dados reais vencem a descrição.
  Reversível: n/a.
  REVISAR: **sim** — o alvo real desta rodada é bem menor e mais cirúrgico do que o prompt supõe.
  O prompt descreve as deficiências do **protótipo**, e boa parte delas não é deficiência do app.

**D-004 | 2026-09-11 | Fontes por CDN do Google (`src/index.css:1`): um `@import` de ~10 famílias em `fonts.googleapis.com`.**
Esta é uma lacuna **real** e contradiz a promessa local-first do README ("not a single request
reaches the server"). Diferente das outras hipóteses do prompt, esta se confirmou.
Opções: (a) manter; (b) self-hospedar as famílias em `public/fontes/` com `@font-face` e subset.
Escolha: (b), a executar na F6/P0.
Motivo: promessa de funcionamento offline e de não vazar requisição para terceiros.
Reversível: sim.
REVISAR: não.

**D-005 | 2026-09-11 | Não há nenhuma dependência de acessibilidade automatizada no projeto (nem `@axe-core/playwright`, nem `jest-axe`).**
Opções: (a) checagem manual registrada; (b) adicionar `@axe-core/playwright` como devDependency.
Escolha: (b) — a seção 8 do prompt autoriza devDependencies de teste explicitamente.
Motivo: o projeto já trava contraste por teste, mas nada trava papel, rótulo, foco e ordem de
tabulação; sem axe, "acessível" é afirmação sem evidência.
Reversível: sim.
REVISAR: não.

---

# Decisões do dono — 2026-09-11

Tomadas por ele, não por mim. Registradas aqui como **decididas**; o que ainda exige trabalho
está em `PROGRESSO.md`.

**D-006 | P0-12 — a grade de quatro botões do FSRS: modelo híbrido.**
Contexto: a grade `Errei/Difícil/Bom/Fácil` está inalcançável (`Study.tsx:984` só renderiza quando
não há cartão — ver `tests/gradeDeRevisaoAlcancavel.test.ts`), e nos três formatos reais a nota é
derivada do acerto.
Escolha do dono: **híbrido**. A resposta objetiva continua determinando acerto/erro. No **erro**, a
nota fica travada em `Again`. No **acerto**, aparecem chips `Hard`/`Good`/`Easy` **opcionais**, com
a nota derivada atual **pré-selecionada**, e "Continuar" confirma sem exigir clique extra. Os
intervalos exibidos vêm de `previsaoDeIntervalo`.
Execução: **change OpenSpec própria**, com testes garantindo que a nota enviada é a escolhida — no
servidor, em `POST /api/vocab/:id/review`, que é onde o agendamento de fato acontece (`montarRodada`
não roda no servidor; ver `VERIFICACOES.md` §5a).
Também: **remover o ramo morto** do `scheduler` sem setter (`Study.tsx:83`) se não tiver consumidor.
Reversível: sim. REVISAR: não — está decidido.

**D-007 | Reading.tsx:181 — não adivinhar pertença ao deck.**
Contexto: `fetchDeck().catch(() => {})` deixa o deck vazio; as buscas "esta palavra já está no meu
deck?" (`Reading.tsx:219`, `:276`, `:307`, `:2249`) passam a responder "não está" para palavras que
estão, e a tela oferece "Adicionar ao deck" para algo que o usuário já tem.
Escolha do dono: **consultar, nunca adivinhar**. Enquanto carrega, estado de carregando; no erro,
`ui/Erro`; e a ação "adicionar" precisa ser **idempotente no servidor**.
Reversível: sim. REVISAR: não.

**D-008 | P1-3 — Bingo entra no registro só se cumprir o mesmo contrato.**
Contexto: `src/core/minigames/bingo.ts` + `BingoPanel.tsx` funcionam, mas o Bingo não é
`MinigameId`, não entra em `MINIGAMES`, nem em `montarRodada`, nem no gate de elegibilidade
(`estadoDosJogos.ts:390`), nem no ranking.
Escolha do dono: entra **somente se** cumprir o contrato dos outros 18 — def + componente +
passagem por `montarRodada` + testes. Caso contrário **fica fora e documentado** como painel
acoplado à captura, não como jogo.
Reversível: sim. REVISAR: não.

**D-009 | PR draft fica para depois.**
`gh` não está autenticado nesta máquina e o MCP do github também não. O dono fará `gh auth login`
quando quiser o PR. **Seguir sem ele** — a branch continua sendo enviada ao `origin` a cada fase.
Reversível: n/a. REVISAR: não.

**D-010 | 2026-09-11 | A lista de exceções do E2E foi eliminada, não corrigida.**
Ver `AUDITORIA-EXCECOES-E2E.md`. As 5 entradas não eram falhas da `main`: eram falhas causadas pelo
banco daquela máquina, e a `main` com banco limpo passa nas cinco.
Opções: (a) corrigir a lista para refletir a `main`; (b) tornar o resultado reproduzível e abolir a
lista.
Escolha: (b) — `DATABASE_URL` descartável no gate, porta própria, exigência de **zero falhas**.
Motivo: uma lista de exceções é dívida paga com confiança; enquanto existia, o gate dizia "verde"
com 15 falhas em tela, e qualquer uma delas podia passar a falhar por motivo novo sem ninguém notar.
Reversível: sim. REVISAR: não.

**D-011 | 2026-09-11 | `accent-contrast` × `accent` passa por 4,54:1 — margem de 0,04.**
O par é coberto e aprovado por `contrastePaletas.test.ts`, mas o axe reprovou o botão renderizado do
modal de recompensa. O próprio teste de token avisa em `:59` que ele e a medição renderizada são
complementares.
Escolha: **não mexer no token de passagem**. Escurecer `--accent-contrast` afeta os 8 temas e é
decisão de design, não conserto incidental.
Reversível: sim.
**DECIDIDO pelo dono em 2026-09-11: não alterar `--accent-contrast`.** Tirar a camada decorativa de
trás de texto e controles (feito por máscara em `.sobre-decor`) e pausar a deriva com
`prefers-reduced-motion`. O par de 4,54:1 fica registrado como **risco permanente** em
`LACUNAS.md`, com a regra "nenhuma camada decorativa atrás de componente accent" valendo para toda
a F5. REVISAR: não.

---

# Decisões do dono — 2026-09-11 (segunda sessão, branch `feat/redesign-v3`)

A branch anterior (`feat/redesign-design-system-v3`) virou a tag `arquivo/redesign-v3-2026-09-11`:
tinha zero linhas de design e sete commits de correção, herdados aqui por cherry-pick. O plano
completo está em `docs/redesign/PLANO.md`.

**D-012 | Padrão visual novo para todo mundo: sidebar clara à esquerda + tema claro.**
Contexto: o protótipo v3 tem rail de 220 px à esquerda e o tema "Babel Atelier" claro; o app abre
com barra no topo e segue `prefers-color-scheme`. Os hex do protótipo já são os tokens do tema `babel`.
Opções: (a) sidebar esquerda + claro como padrão; (b) só a posição; (c) não mudar o padrão.
Escolha do dono: **(a)**. Modo escuro e as quatro posições continuam como escolha (os itens
`pos-*` da loja não mudam); preferência salva de quem já escolheu prevalece.
Reversível: sim (`useAparencia.ts` e `theme.ts`, padrões). REVISAR: não.

**D-013 | Perfil de exibição padrão continua `senior`.**
Contexto: o protótipo foi desenhado na densidade `pro`; o app abre em `senior` (`lib/profile.ts:46`).
Escolha do dono: manter `senior`. O v3 é a referência do `pro`; `senior` (mais respiro, alvos de
48 px) e `kids` são derivados do mesmo sistema. Toda tela redesenhada é conferida nos três.
Reversível: sim. REVISAR: não.

**D-014 | Ritmo autônomo com relatório por fase; uma PR por fase para `main`.**
Parar só em decisão de produto ou ação destrutiva sem reversão. O gate
(`scripts/redesign/gate.sh`) precisa estar verde antes de cada commit de fase.
Reversível: n/a. REVISAR: não.

**D-015 | Herdar os sete commits e o stash da branch arquivada como primeiro passo.**
Motivo: são correções independentes do visual e já testadas (intervalos FSRS do agendador, fontes
sem CDN, axe, estados de erro, gate com banco descartável). Aplicados em ordem cronológica; os
conflitos foram só em `docs/redesign/*` e `scripts/redesign/gate.sh`, resolvidos com a versão
final da tag e do stash. O stash trazia a D-011 e a proteção do banco no `playwright.config.ts`.
Reversível: sim. REVISAR: não.

**D-016 | O app vence o protótipo; o protótipo dita forma, hierarquia e densidade.**
Onde o v3 contradiz dado ou comportamento real (Personalizar com abas e catálogo inventados e uma
moeda só; números de progresso soltos; CEFR clicável; "Meta da semana"; KPIs na Biblioteca; "em
breve" em busca, iChat e ajustes de captura; overlay como card fixo), vale o app. Lista fechada em
`docs/design/auditoria-prototipo-v2/AUDITORIA.md` §13 e no inventário do v3.
Reversível: n/a. REVISAR: não.
