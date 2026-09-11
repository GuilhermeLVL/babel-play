# Decisões do redesign v3

Formato: `D-### | data | contexto | opções | escolha | motivo | reversível? | REVISAR?`

---

**D-001 | 2026-09-11 | O protótipo v3 depende de `./support.js`, que não veio no export (`docs/redesign/source/prototipo-v3.html:6`); sem ele o HTML não renderiza.**
Opções: (a) reconstruir um `support.js` por engenharia reversa; (b) extrair a especificação lendo o template `sc-if`/`sc-for` e a classe `Component`.
Escolha: (b).
Motivo: a seção 1 do prompt proíbe renderizar às cegas; um runtime reconstruído produziria screenshots que não são o design, e o template já é declarativo o bastante para virar `DESIGN-SPEC.md`.
Reversível: sim (se o `support.js` aparecer, basta renderizar e gerar `evidencias/referencia/`).
REVISAR: não.

**D-002 | 2026-09-11 | O prompt pede uma suíte de paridade nova em `e2e/paridade/`, mas o projeto já tem 21 specs Playwright em `tests/e2e/**/*.e2e.ts` rodando em 3 viewports (375/768/1280, `playwright.config.ts:44-66`).**
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
