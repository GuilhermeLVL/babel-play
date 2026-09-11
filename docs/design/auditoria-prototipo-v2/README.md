# Pacote para o Claude Design — Protótipo v2 → v3

Auditoria comparativa entre `Babel Play - Protótipo v2 (interativo).dc.html` (feito no Claude Design em 2026-09-10) e o app real em `main` @ `2ac979b`.

| Arquivo | Para quê |
|---|---|
| `PROMPT.md` | O texto a colar no Claude Design (bloco "Versão operacional com checklist"). Tem também uma versão curta para iterar. |
| `AUDITORIA.md` | A fonte completa: tela a tela, tabela lado a lado com veredito (`OK` · `PARCIAL` · `AUSENTE` · `DIVERGE` · `INVENTADO`) e `arquivo:linha` do código. Anexar junto com o prompt. |
| `prints/` | 12 capturas do app real, numeradas e citadas na auditoria. Anexar junto. |

## Como usar

1. Abra o Claude Design na conversa do protótipo v2.
2. Anexe `AUDITORIA.md` e as 12 imagens de `prints/`.
3. Cole o bloco "Versão operacional com checklist" de `PROMPT.md`.
4. Nas rodadas seguintes, use a "Versão curta" apontando a seção da auditoria que falta.

## Como foi feito

Leitura integral do protótipo + inventário do código (`src/`, `server/`, `openspec/specs/`, `docs/`) em três frentes (telas e rotas; jogos e gamificação; docs, specs e pipeline). Nenhum print novo foi tirado (decisão do dono); os prints são cópias de `docs/img/`, da raiz e de `openspec/changes/auditoria-i18n-v1/evidencias/`.
