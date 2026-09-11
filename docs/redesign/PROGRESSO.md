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

## F1 — Tokens e classes globais (2026-09-11)

- 11 tokens derivados em 17 blocos de tema, hex literal (babel claro = protótipo), `custom` por
  `color-mix`; gerador com medição prévia em `scripts/redesign/` (fórmulas no cabeçalho).
- `contrastePaletas`: 14 pares novos, piso 200; **424 casos verdes**. A medição impôs três ajustes
  ao protótipo (D-017): hover do primário mais claro no babel (o `#D6431C` do protótipo dava 3,65:1
  com o texto `#3d1105`), superfícies rebaixadas de mochi/notion com menos escurecimento, painel
  escuro mais claro que a superfície no modo escuro.
- Classes: `.btn-solid:hover` por token; `.kpi-pill.active` em ink (D-012); `.field-input` com
  `--field-bg`; `.card-panel.escuro`, `.card-panel.bloqueado`, `.titulo-de-tela`; borda do card do
  babel 1,5 px. Nenhum `.tsx` tocado.

## F2 — Casca (2026-09-11)

- Padrão da posição do menu: `left` (D-012). Preferência gravada vence; as quatro posições
  continuam como itens da loja. Modo claro já era o padrão de quem nunca escolheu (`readDarkMode`).
- `NavRail` a 220 px (protótipo), item de 42 px em accent-soft sem a barra lateral, rótulo que
  quebra em vez de cortar (a pseudo-localização reprova `truncate`), bordas `--divider`, hover
  `--surface-raised`; `--shell-inset-right` = 220 px (o iChat acompanha).
- `ControlCluster` em coluna: busca como pílula larga com "Ctrl K" impresso + fileira A / conforto /
  claro-escuro / conta. Nenhum controle saiu; nomes acessíveis intactos (`tema.e2e` verde).
- `NavBar`: rótulos só a partir de `2xl` — o estouro a 1280 px com os rótulos sênior (achado da
  linha de base) deixa de existir.
- Evidência: `02-casca/jogar__1280__claro.png` (vs `00-base`).

## F3 — Primitivos (2026-09-11)

- `CabecalhoDeTela` (kicker, `h1.titulo-de-tela`, subtítulo, ações) nasce com dois consumidores:
  Início e Vocabulário. O botão "Exportar Relatório / Baixar Palavras / Exportar Meu Caderno" vira a
  ação do cabeçalho — mesmo `onClick`, mesmo rótulo.
- `Ladrilho variante="kpi"`: o cartão de indicador do protótipo (kicker mono acima, número 23 px).
- `PainelEscuro` e `CartaoDeJogo` adiados para a F6: só lá existem dois consumidores de verdade.
- Gate: os cinco arquivos `tests/caracterizacao/{auth-e-conta,ia,importacao-anki,planos-e-quotas,seeds-concorrencia}`
  reprovaram por "Hook timed out in 10000ms" (o servidor de teste não subiu em 10 s com a máquina
  carregada) e passaram isolados (54/54). Não é regressão; fica registrado porque o mesmo sintoma vai
  reaparecer sempre que o gate rodar junto com outra carga. Matriz E2E 99/0/15.
