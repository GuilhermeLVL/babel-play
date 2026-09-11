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

## F4+F5 — Início, Vocabulário e Revisar (2026-09-11)

- Início e Vocabulário já receberam o cabeçalho na F3; os pilares, a faixa de progresso, o card-herói,
  as sessões recentes e o rodapé de planos já eram os do protótipo e passaram a vestir os tokens da
  F1. Nada foi reescrito por reescrever.
- **FSRS híbrido (D-006)**, change `openspec/changes/fsrs-hibrido`: `notasOferecidas`/`notaFinal` no
  core, `NotaDeRevisao` (radiogroup com intervalos do agendador), os três formatos do Estudo enviam a
  nota marcada; produção ativa recebe o grupo entre o veredito e "Próximo". Testes: 7 puros, 3 de
  componente, 1 E2E novo (acertar → "Bom" marcado → "Fácil" → avança).
- P0-12 de `LACUNAS.md` resolvido; ramo morto do flashcard fica para limpeza própria.

## F6 — Jogar (2026-09-11)

- Cabeçalho pelo primitivo; painel escuro "jogando com" (`card-panel escuro`) com as ações da barra
  em pílulas escuras; categorias em ink (D-012); primários pelo token; carta bloqueada pela classe
  `.card-panel.bloqueado`. Nenhum nome acessível mudou.
- Antessala, Raspadinha, Resumo e os 18 jogos já eram `card-panel`/tokens: vestem a F1 sem edição.
- Evidência: `06-jogar/jogar__1280__claro.png` (vs `02-casca`).

## F7 — Biblioteca e Sessão (2026-09-11, parcial)

- Biblioteca e Sessão com o cabeçalho pelo primitivo; abas da Sessão pelo `Abas` (tablist de
  verdade, pílula ativa em ink), "Mais" fora do tablist; classes de aba por tipo de mídia removidas.
- Fica para a rodada seguinte: painel escuro da transcrição (modo escuro do `ChatTranscript`),
  Leitura, filtros e cards da Biblioteca.
- Gate: typecheck, lint, build e integridade OK; unitários 4063 (5 arquivos de caracterização HTTP
  estouraram timeout sob carga e passaram isolados, 63/63); matriz E2E 102/0/15; 12 evidências em
  `evidencias/07-biblioteca-sessao/` (biblioteca e revisar × 3 viewports × claro/escuro).

## F8 — Capturar (2026-09-11)

- O hero da captura é o painel escuro do protótipo (`card-panel escuro`, tokens `panel-*`; 2º
  consumidor depois do "jogando com"). Título, cronômetro, Foco Cheio, Bingo, chip de idiomas,
  orientação e waveform nos tokens do painel; gravando, anel accent em vez de borda.
- Microfone mudo com tokens do painel só na variante de tela; avisos (idiomas iguais, Whisper,
  cobertura) em chip `warn-soft`/`warn-ink`, par já coberto pelo teste de contraste.
- Nada de função, rótulo ou nome acessível mudou. Gaveta de configurações, Falantes, ModelPrep,
  Foco Cheio, Bingo, Overlay e PiP já vestiam a F1 e ficam como estão.
- Evidências em `evidencias/08-capturar/` (capturar × 3 viewports × claro/escuro).
- Verificação à mão no banco descartável (3302): chip abre a gaveta "Idiomas da sessão"; Bingo
  alterna `aria-pressed` e abre a cartela; Foco Cheio abre o modo focado com microfone e Legendas
  (variante `foco` intacta). Gate: typecheck, lint, build, integridade OK; 5 arquivos de
  caracterização HTTP estouraram timeout sob carga e passaram isolados (54/54); matriz E2E 102/0/15.
  Inventário: 4 linhas de Capturar marcadas "depois".

## F9 — Personalizar, Planos, Ajustes, Perfil (2026-09-11)

- Ajustes, Planos e Perfil pelo `CabecalhoDeTela` (kicker com ícone por perfil em Ajustes; os
  textos e chaves i18n são os mesmos). Filtros da Loja em `kpi-pill` com ativa em ink (D-012),
  `aria-pressed` intacto.
- Personalizar (4 abas, carteira Seeds/Créditos, Passe, Desafios) já vestia a F1 e fica; o
  catálogo do v3 é inventado (D-016). Sobre mantém o herói do criador em `font-marca`.
- Evidências em `evidencias/09-personalizar-planos-ajustes-perfil/` (ajustes, plano, perfil,
  loja/itens × 3 viewports × claro/escuro).
- Gate verde completo: 4126 unitários (2 skipped, sem timeouts), typecheck, lint, build, integridade;
  matriz E2E 102/0/15. Inventário: Planos (2 abas, 3 cards), Perfil (3 abas) e Ajustes (4 abas)
  conferidos nas capturas de 1280 e marcados "depois".

## F11 — Jogos (2026-09-11)

- Os 18 jogos já eram tokens; sobravam o selo de combo copiado em 8 jogos com `from-orange-500
to-amber-500 text-white` (paleta do Tailwind, sem par de contraste) e um `emerald-500/5` no
  Memory. Agora `.selo-combo` (warn + `--warn-contrast` verificado por tema) e `good/5`.
- Os `text-white` restantes estão todos sobre accent/warn/good/error, pares que a camada de
  contraste resolve. Nenhuma regra, handler, `data-tour` ou nome acessível muda.
- Sem evidência própria: o selo só aparece no meio de uma rodada; a mudança é uma classe de CSS
  coberta pelo build e pela matriz de contraste.
- Gate verde completo: 4126 unitários, typecheck, lint, build, integridade; matriz E2E 102/0/15.
