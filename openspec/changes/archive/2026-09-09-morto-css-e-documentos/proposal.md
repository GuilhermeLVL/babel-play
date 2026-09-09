## Why

`src/index.css` tem 1.776 linhas escritas a mao (o Tailwind poda os utilitarios sozinho, estas nao). E tres documentos descreviam um estado que deixou de existir — o pior tipo de documentacao, porque parece atual.

## What Changes

- CSS: oito classes declaradas e nunca usadas saem (`blitz-pop` e `blitz-refill` com os seus `@keyframes`, e seis variantes de animacao). `slide-in-from-top-5`, que estava EM USO e nunca foi declarada, passa a existir — a classe nao produzia CSS nenhum.
- `src/components/minigames/culturais/README.md`: dizia que os nove jogos nao eram alcancaveis por rota nenhuma; eles voltaram em 08/09 e o e2e cobra que estejam na grade.
- `AUDITORIA-ESTADO.md` sai da raiz para `docs/auditoria/2026-09-02-ux-e-economia-estado.md`, com cabecalho dizendo que e historico.
- `server/ai/llmRequest.ts:8` dizia "a rota usa a chave do dono, sem auth"; `/api/gemini/chat` esta atras do `authMiddleware` desde `server.ts:171`.
- `tsconfig.json`: a nota sobre `_graveyard/` descrevia um diretorio que nao existe.

## Nao-escopo

Consolidar duplicata (isso e Fase 3, com ADR), mover arquivo (Fase 3) e corrigir comportamento (Fase 4). Aqui so sai o que nao tem consumidor, com prova.
