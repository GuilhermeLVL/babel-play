# Progresso — Redesign v3

Branch: `feat/redesign-v3` (de `main @ 2ac979b`) · Plano: `docs/redesign/PLANO.md` · Decisões: `DECISOES.md`
Regra: cada fase termina com o gate verde e um relatório aqui. Pisos só sobem.

## Linha de base (F0, 2026-09-11)

Medida na árvore da F0 (os oito commits herdados + stash + docs), **antes de qualquer linha de design**.

| Verificação           | Comando                                                       | Resultado                                                                                                                         |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck             | `npm run typecheck`                                           | verde                                                                                                                             |
| Lint                  | `npm run lint` (`--max-warnings 0`)                           | verde                                                                                                                             |
| Unitários             | `npm run test:unit`                                           | **3.931 passaram**, 2 pulados, 356 arquivos (main: 3.901 / 352)                                                                   |
| Build                 | `npm run build`                                               | verde                                                                                                                             |
| E2E, 3 viewports      | `bash scripts/testes/matriz-e2e.sh` + `resumir-matriz.mjs`    | **99 aprovados, 0 falhas, 15 pulados** (banco descartável)                                                                        |
| Integridade de testes | `gate.sh` etapa 6                                             | nenhum teste removido, nenhum `.skip`/`.only` novo                                                                                |
| Código morto          | `npm run morto:arquivos` (knip)                               | verde (13 pacotes `@fontsource*` na lista de exceções: knip não segue `@import` de CSS; `tests/fontesSemCdn.test.ts` prova o uso) |
| Ciclos                | `npm run morto:ciclos` (madge)                                | verde, 0 ciclos                                                                                                                   |
| i18n                  | `i18n:orfas`, `pseudo --check`, `cobertura --check`, piso 420 | verde (701 chaves, 0 órfãs, 420 chamadas)                                                                                         |
| Regras arquiteturais  | `ast-grep test` + `scan`                                      | verde (6 regras; avisos pré-existentes)                                                                                           |
| Evidências visuais    | `node scripts/redesign/evidencias.mjs --fase 00-base`         | `docs/redesign/evidencias/00-base/` (14 rotas × 3 viewports × claro/escuro)                                                       |

**Pisos desta rodada**: 3.931 unitários · 99 E2E aprovados · 0 falhas.

### O que a F0 corrigiu de verdade (não estava no plano)

- **As fixtures E2E escreviam no banco real.** `tests/e2e/_fixtures.ts` tinha `localhost:3100` como
  padrão; a página ia para a 3301 (descartável) e as sementes/asserções iam para a 3100 (banco de
  trabalho). Com o servidor de desenvolvimento aberto, 8 testes × 3 viewports reprovavam por comparar
  dois servidores, e uma sessão + 12 cartões + `darkMode=false` foram gravados em `data/babel.db`.
  Corrigido: `BASE` segue `PORT`/`BASE_URL` como o config e recusa a 3100. Detalhe em
  `AUDITORIA-EXCECOES-E2E.md` (adendo). A limpeza do banco real ficou para decisão do dono
  (backup em `data/babel.db.bak-antes-limpeza-e2e-*`).
- **Servidor órfão na 3301** derrubava todos os lotes seguintes quando o Playwright morria;
  `matriz-e2e.sh` libera a porta antes de cada lote. `resumir-matriz.mjs` lê os JSON por lote.
- `knip.json`: exceção documentada para as fontes self-hosted.

### Achado da linha de base visual

Em `00-base/jogar__1280__claro.png` (perfil `senior`, barra no topo), os rótulos longos do perfil
("Gravar Áudio", "Planos e preços", "Configurações") **estouram sobre o cluster de controles** a
1280 px: "Gravar Áudio" fica cortado à esquerda e "Planos" some atrás da busca. É defeito pré-existente
da `main`, não desta branch; a F2 (casca) precisa resolvê-lo junto com a sidebar, e a pseudo-localização
(+40 %) só o acusa em elementos com overflow contido.

### Fases

| Fase                                                | Estado        | Gate          | Relatório  |
| --------------------------------------------------- | ------------- | ------------- | ---------- |
| F0 Fundação                                         | **concluída** | verde (acima) | esta seção |
| F1 Tokens e classes                                 | —             |               |            |
| F2 Casca                                            | —             |               |            |
| F3 Primitivos                                       | —             |               |            |
| F4+F5 Início, Vocabulário, Revisar                  | —             |               |            |
| F6 Jogar                                            | —             |               |            |
| F7 Biblioteca, Sessão, Leitura                      | —             |               |            |
| F8 Capturar                                         | —             |               |            |
| F9+F10 Personalizar, Planos, Ajustes, Perfil, Sobre | —             |               |            |
| F11 Jogos                                           | —             |               |            |
| F12+F13 Estados, mobile, temas, fechamento          | —             |               |            |

### Como rodar o gate nesta máquina

`bash scripts/redesign/gate.sh` roda o E2E num comando só, e o processo do Playwright morre acima de
~30 testes no Windows. Use `GATE_PULAR_E2E=1 bash scripts/redesign/gate.sh` para as etapas 1-4 e 6, e
`bash scripts/testes/matriz-e2e.sh && node scripts/testes/resumir-matriz.mjs` para o E2E em lotes.
Nunca com um servidor de desenvolvimento aberto na 3100 durante a corrida (as fixtures agora recusam,
mas o custo de um engano é o banco real).
