## Why

O dono desenhou o Protótipo v3 (Claude Design): sidebar clara à esquerda, tema "Babel Atelier",
cards, chips e hierarquia tipográfica nova. Antes de qualquer linha de design, a branch precisa de
uma fundação medida: herdar as correções reais da rodada anterior (tag
`arquivo/redesign-v3-2026-09-11`), um gate reproduzível, evidências visuais do "antes" e um
inventário funcional que impeça a perda silenciosa de qualquer superfície.

## What Changes

- Oito commits herdados por cherry-pick, em ordem cronológica: intervalos do FSRS vêm do agendador;
  fontes self-hosted (`@fontsource*`, zero CDN); `@axe-core/playwright` no E2E com as duas violações
  reais de `/planos` corrigidas; primitivo `ui/Erro` (erro antes do vazio em `Study` e `Metrics`);
  `.gitattributes` com LF; E2E contra banco descartável com a lista de exceções abolida.
- O stash da rodada anterior: proteção do banco movida para `playwright.config.ts`
  (`scripts/e2e/preparar-banco.mjs` recusa subir contra `data/babel.db`, porta 3301) e `.sobre-decor`.
- `docs/redesign/`: INVENTARIO, PARIDADE, DESIGN-SPEC, DECISOES (D-012 a D-016 desta sessão),
  VERIFICACOES, LACUNAS, ERRATA-DO-PROMPT, PLANO (14 fases), COPY (renomeações com decisão por
  linha), INVENTARIO-FUNCIONAL (checklist antes/depois por tela) e `source/` com os protótipos v2 e v3.
- `scripts/redesign/evidencias.mjs`: captura rota × viewport × modo em `docs/redesign/evidencias/<fase>/`
  contra o banco descartável; linha de base em `00-base/`.
- `docs/design/auditoria-prototipo-v2/` (auditoria v2 × app e 12 prints) passa a ser versionada.

## Nao-escopo

Nenhuma mudança visual. Nenhum token novo. Nenhuma tela reestruturada. O padrão de posição do
menu e o modo claro (D-012) mudam na F2, não aqui.
