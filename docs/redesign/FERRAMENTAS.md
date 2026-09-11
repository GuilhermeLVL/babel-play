# Ferramentas disponíveis nesta rodada (F0)

Levantado em 2026-09-11 na branch `feat/redesign-design-system-v3`.

## Stack real (confirmada, não presumida)

| Camada       | O que é                                                                                      | Evidência                                               |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Front        | React 19 + TypeScript, Vite 7                                                                | `package.json:60-75`, `vite.config.ts`                  |
| Estilo       | **Tailwind CSS 4** (`@tailwindcss/vite`) + `src/index.css` (79,9 KB, camada de tokens/temas) | `package.json` dep `@tailwindcss/vite`, `src/index.css` |
| Ícones       | **lucide-react** (pacote npm, já self-hosted)                                                | `package.json` dep `lucide-react`                       |
| Gráficos     | recharts                                                                                     | `package.json` dep `recharts`                           |
| Back         | Express 4 + TypeScript (`server.ts`, 21,5 KB) + Drizzle ORM + libsql/SQLite                  | `server.ts`, `drizzle.config.ts`                        |
| Testes unit  | **Vitest 4** (`tests/**/*.test.ts[x]`)                                                       | `vitest.config.ts`                                      |
| Testes E2E   | **Playwright** (`tests/e2e/**/*.e2e.ts`), 3 viewports: 375 / 768 / 1280                      | `playwright.config.ts:44-66`                            |
| Lint         | ESLint 9 flat config, `--max-warnings 0`                                                     | `eslint.config.js`                                      |
| Specs        | **OpenSpec** já em uso (`openspec/specs`, `openspec/changes`, `openspec/audits`)             | pasta `openspec/`                                       |
| Código morto | knip + madge (ciclos)                                                                        | scripts `morto:arquivos`, `morto:ciclos`                |
| i18n         | pipeline próprio (`scripts/i18n/pseudo.mjs`, `orfas.mjs`) + e2e de pseudo-locale             | `tests/e2e/pseudo-localizacao.e2e.ts`                   |

## Comandos

| Necessidade        | Comando                                            |
| ------------------ | -------------------------------------------------- |
| Subir app (dev)    | `npm run dev` (tsx server.ts)                      |
| Subir app para E2E | `npm run dev:local` → porta 3100 (`subir-dev.mjs`) |
| Typecheck          | `npm run typecheck`                                |
| Lint               | `npm run lint`                                     |
| Testes unitários   | `npm run test:unit`                                |
| E2E                | `npm run test:e2e`                                 |
| Build de produção  | `npm run build`                                    |
| Backup do SQLite   | `npm run backup`                                   |

## MCP e plugins

| Ferramenta                           | Estado                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| Playwright MCP (`plugin:playwright`) | **disponível**                                                              |
| Context7 MCP                         | **disponível** (`plugin_context7_context7`)                                 |
| Chrome DevTools MCP                  | disponível                                                                  |
| Claude Design MCP                    | **ausente** — o protótipo é lido estaticamente                              |
| `frontend-design` (skill)            | disponível                                                                  |
| `code-review` (skill)                | disponível                                                                  |
| OpenSpec (skills `opsx:*`)           | disponível                                                                  |
| github MCP                           | **não autenticado** — PR draft terá de sair por `gh` CLI ou ficar bloqueado |

## Fonte do design

`docs/redesign/source/prototipo-v3.html` (158 KB, 1710 linhas), cópia ASCII de
`Babel Play - Protótipo v3 (interativo).dc.html` na raiz.
`docs/redesign/source/prototipo-v2.html` fica como referência da rodada anterior.

**O protótipo NÃO é renderizável aqui**: depende de `./support.js` (`prototipo-v3.html:6`),
que não veio no export. A especificação é extraída por leitura do template `sc-if`/`sc-for`
e da classe `Component`. Registrado como decisão D-001.

## Material da rodada anterior (reaproveitável)

`docs/design/auditoria-prototipo-v2/` já contém uma auditoria comparativa app × protótipo v2
(`AUDITORIA.md`, 64 KB, tela a tela com veredito e `arquivo:linha`) e 12 prints do app real.
É a base do INVENTARIO/PARIDADE desta rodada — revalidada contra o código atual, não copiada.
