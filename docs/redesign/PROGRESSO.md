# Progresso — Redesign Design System v3

Branch: `feat/redesign-design-system-v3` (de `main` @ `2ac979b`)
Fonte da verdade: `docs/redesign/PROMPT-REDESIGN-BABELPLAY.md`

## Linha de base medida em 2026-09-11 (antes de qualquer mudança)

| Verificação | Comando | Resultado |
|---|---|---|
| Typecheck | `npm run typecheck` | **verde** (exit 0) |
| Lint | `npm run lint` (`eslint src server server.ts tests --max-warnings 0`) | **verde** (exit 0) |
| Testes unitários | `npm run test:unit` | **verde** — 352 arquivos, **3901 passaram**, 2 pulados |
| Build de produção | `npm run build` | **verde** (exit 0) |
| E2E (3 viewports) | `npm run test:e2e` | **VERMELHO** — 87 ok, **15 falhas**, 12 pulados, exit 1 |

### As 15 falhas do E2E são pré-existentes e vêm do banco local, não do código

A branch ainda não tem **nenhuma** mudança de código — só documentos. Logo, nada aqui é
regressão desta rodada. São **5 testes × 3 viewports**, idênticos nos três, portanto
determinísticos e não intermitentes:

| Teste | Causa medida |
|---|---|
| `fsrs-revisao.e2e.ts:27` | `a fila deveria ter os cartoes da sessao` — esperado >= 6, recebido **3** |
| `seeds.e2e.ts:25` | `a Loja deveria listar itens com preco em Seeds` — esperado > 0, recebido **0** |
| `sessao-de-jogo.e2e.ts:66` (Memória) | depende de baralho montado |
| `sessao-de-jogo.e2e.ts:104` (Termo) | idem |
| `sessao-de-jogo.e2e.ts:141` (Bao) | idem |

**Diagnóstico:** `tests/e2e/_global-setup.ts` só grava `settings.ui.onboarded` — "nenhum baralho,
nenhuma sessao". O próprio docblock diz que os testes que dependem de dados trazem "condicional"
no título e tratam a ausência. **Estes cinco não trazem, e assumem dados que o setup não cria.**
Nesta máquina eles caem no banco real do operador (11 MB), onde a fila tem 3 cartões vencidos em
vez de 6 e a Loja não tem mais item com preço em Seeds porque o operador já os possui.

Não é regressão nem defeito de produção: é **fragilidade da suíte**, que depende de um formato de
banco que ninguém garante. Fica registrada como linha de base e **não será "consertada" afrouxando
asserção** (regra 4). Se a F6 tiver folga, a correção certa é o `_global-setup.ts` semear o
mínimo que esses cinco exigem.

**Piso de paridade desta rodada: 87 aprovados.** A branch não pode terminar abaixo disso.

Nenhuma outra falha pré-existente na `main`. Backup do SQLite antes de mexer:
`data/babel.db.bak-antes-redesign-v3-20260911-005018`.

**A contagem de 3901 testes unitários é o piso.** A branch não pode terminar abaixo disso.

## F0 — Preparação e segurança

- [x] `git fetch`, `main` atualizada, branch `feat/redesign-design-system-v3` criada
- [x] Worktree de baseline da `main` em `../babelplay-baseline` (`git worktree list`)
- [x] Stack descoberta e registrada em `FERRAMENTAS.md` (Express/TS no back, Tailwind 4 no front — **não** é FastAPI)
- [x] Protótipo v3 copiado para `docs/redesign/source/prototipo-v3.html` (caminho ASCII; o nome com acento quebra no Git Bash)
- [x] Backup do SQLite local
- [x] `scripts/redesign/gate.sh` escrito
- [x] `gate.sh` rodado por etapas na branch, resultado registrado acima (typecheck/lint/unit/build verdes; E2E vermelho por estado de banco, pré-existente)
- [ ] commit `chore(redesign): scaffolding e gates`

## Achados que mudam o escopo (ver DECISOES.md)

O prompt lista como "lacunas P0" uma série de coisas que **já estão feitas no app** — ele descreve
as deficiências do *protótipo*, não as do produto. Verificado nesta sessão:

| Suposto P0 do prompt | Situação real | Evidência |
|---|---|---|
| "Não existe design system formal" | Existe, semântico e em Tailwind 4 | `src/index.css:5-107` |
| "Contraste reprovado, recalcule" | Travado por teste, 7 temas × claro/escuro, limiar 4,5:1 | `tests/contrastePaletas.test.ts` |
| "Zero `@media`, frame fixo 1360×860" | E2E roda em 375/768/1280 com dock mobile própria | `playwright.config.ts:41-60` |
| "Ícones de CDN" | `lucide-react` via npm | `package.json` |
| "Dados de mentira" | Já há testes contra dado fabricado | `tests/semConteudoFabricado.test.ts`, `tests/contagemHonesta.test.ts` |
| **"Fontes de CDN"** | **CONFIRMADO** — `@import` de ~10 famílias do Google Fonts | `src/index.css:1` |
| **Acessibilidade automatizada** | **CONFIRMADO ausente** — nenhuma dep axe/a11y no projeto | `package.json` devDependencies |

## Bloqueios

- **[BLOQUEADO] PR draft na F7** — `gh` não está autenticado (`gh auth login` pede login
  interativo) e o MCP do github também não está autorizado nesta sessão. O push da branch é
  possível; abrir o PR draft não. **O operador precisa rodar `gh auth login`** ou abrir o PR à mão.

## F1 — Inventário

- [x] `INVENTARIO.md` escrito — 3 subagentes read-only (telas/rotas/atalhos; jogos/economia/FSRS;
      i18n/honestidade/estilo), tudo com `arquivo:linha`
- [ ] Revalidar `docs/design/auditoria-prototipo-v2/AUDITORIA.md` contra o código atual
- [ ] Suíte de paridade: **estender `tests/e2e/`**, não criar `e2e/paridade/` paralela (D-002)
- [ ] Screenshots do baseline

## F2–F7

Não iniciadas.
