# Plano: aplicar o design do Protótipo v3 na aplicação (branch nova), sem perder funcionalidade

## Contexto

O dono desenhou no Claude Design um layout novo (Protótipo v3, `Babel Play - Protótipo v3 (interativo).dc.html`, 1.710 linhas): sidebar clara de 220 px à esquerda, tema claro "Babel Atelier", moldura arredondada, cards, chips, hierarquia tipográfica Archivo/Inter/IBM Plex Mono, 9 itens de navegação. Ele pede uma branch nova que aplique esse visual ao app real **com cuidado e metodologia**, sem perder nenhuma funcionalidade, e que estenda o padrão às telas que o protótipo não cobre.

Fatos que definem a estratégia (levantados em 11/09):

1. **O design system já existe e é o mesmo do protótipo.** `#F5F2EA/#F04E23/#26241F/#E6E2D6` são os tokens do tema `babel`, padrão do app (`src/index.css:5-107`, `src/lib/theme.ts:107`). 66 % das cores do protótipo caem exatamente num token existente; o resto são ~6 derivadas faltantes (`--surface-sunken`, `--field-bg`, `--accent-hover`, `--accent-border`…). O que muda é **hierarquia, densidade, casca e componentes**, não a paleta.
2. **A posição da navegação já é configurável** (`StudioHeader.tsx` escolhe `NavRail` esquerda/direita ou `NavBar` topo/rodapé por `menuPosition`; item `pos-esquerda` é grátis). O padrão atual é barra no topo e modo escuro; o protótipo é rail à esquerda e claro.
3. **O protótipo cobre menos da metade do app**: matriz de paridade da rodada anterior = 27 cobertos · 33 sem desenho · 2 novos (Antessala, Raspadinha). Os 33 sem desenho (Sala de Escolha, Tour, Passe, Conquistas, Inventário, LangAudit, KPIs expandidos, Foco Cheio, Recordes reais, Loja com duas moedas…) precisam receber a linguagem do v3 por extensão.
4. **O v3 ainda contradiz o app em pontos que não podem ser copiados**: Personalizar com abas/catálogo inventados e uma moeda só; números de progresso soltos (Nível 12 vs Etapa 15; CEFR clicável; "Meta da semana"); KPIs de Biblioteca; "em breve" na busca, iChat e ajustes de captura; overlay como card fixo; marcador/pausa em Capturar; 15 de 18 jogos como placeholder. Regra: **o comportamento e os dados do app vencem o protótipo**; o protótipo dita só a forma.
5. **A branch de redesign anterior (tag `arquivo/redesign-v3-2026-09-11`) não tem nenhuma linha de design**, mas tem 7 commits de correções reais e infraestrutura de verificação que a branch nova deve herdar por cherry-pick (lista abaixo), mais um stash e um script untracked (`scripts/e2e/preparar-banco.mjs`, 2,9 KB, só no disco).
6. **Rede de segurança existente**: 3.901 testes unitários (piso), 21 specs e2e × 3 viewports (375/768/1280) por papel/nome acessível, testes de honestidade (`semConteudoFabricado`, `contagemHonesta`, `contrastePaletas` 4,5:1 em 7 temas × claro/escuro, `primitivosDeUi`, `temasOferecidos`), gate `scripts/redesign/gate.sh` (typecheck, lint, unit, build, e2e em banco descartável, integridade de testes: falha se um teste some ou ganha `.skip`).
7. Decisões do dono já registradas na rodada anterior e que valem aqui: D-006 (FSRS híbrido: erro trava em Again; acerto mostra Hard/Good/Easy opcionais com a nota derivada pré-selecionada), D-007 (Reading: consultar o deck, nunca adivinhar), D-008 (Bingo só entra no registro se cumprir o contrato), D-011 (não mexer em `--accent-contrast`; nenhuma camada decorativa atrás de componente accent).

## Fontes (já em contexto)

- Inventário do v3 com linhas: tokens (§1), casca (§2), telas bloco a bloco (§3), v3×v2 (§4), 15 padrões reutilizáveis (§5), contradições (§6).
- Auditoria v2×app: `docs/design/auditoria-prototipo-v2/AUDITORIA.md` (untracked; commitar na branch).
- Docs da rodada anterior na tag: `docs/redesign/{INVENTARIO,PARIDADE,DESIGN-SPEC,DECISOES,VERIFICACOES,AUDITORIA-EXCECOES-E2E}.md`, `scripts/redesign/gate.sh`, e a ERRATA (52 primeiras linhas de `PROMPT-REDESIGN-BABELPLAY.md` no commit `45a888b`).

## Decisões do dono (11/09, esta sessão)

- **Padrão visual novo para todos**: sidebar clara à esquerda + tema claro. Modo escuro e as 4 posições continuam como escolha (itens de loja intactos); preferências salvas de quem já escolheu continuam valendo.
- **Perfil de exibição padrão continua `senior`**. O v3 é a referência do `pro`; `senior` (mais respiro, alvos 48 px) e `kids` são derivados.
- **Ritmo autônomo com relatório por fase**; parar só em decisão de produto ou ação destrutiva. Uma PR por fase para `main`.
- **Herdar os 7 commits + stash** da branch arquivada como primeiro passo da branch nova, com gate verde antes de qualquer design.

## Princípios de execução (valem em toda fase)

1. **O app vence o protótipo** em dados, comportamento e cobertura; o v3 dita forma, hierarquia e densidade. Personalizar do v3 é inventado: usar abas/catálogo reais.
2. **Fatias verticais, nunca big bang.** Cada fase deixa o app inteiro funcional e o gate verde. CSS (F1) e casca (F2) vestem todas as telas de uma vez; as fases de tela só reestruturam o interior.
3. **Evoluir, não substituir**: `.card-panel` (181 usos), `.btn-solid/.btn-outline/.btn-ink`, `.badge-tag`, `.kpi-pill`, `.label-mono`, `.field-input` mudam no CSS e vestem tudo de graça. Primitivos novos em `ui/` só com 2+ consumidores e só tokens.
4. **Não tocar**: seletores da camada `!important` de contraste (`index.css:1084-1216`), `--accent-contrast` (D-011), `.age-*` (descem do `<main>`), classes de `body` (`shell-*`, `performance-mode`, `animations-*`, `dark`), `data-shell`, `data-theme` no `<html>`, `#root`, nenhum `ThemeType/MenuPositionType/FonteType` (itens já comprados via `equipar.ts`), nomes acessíveis que a e2e usa (itens do nav, "Mudar para o modo claro/escuro", "Errei/Difícil/Bom/Fácil", rótulos de grupo do `Segmentado`), `<main>` como marco.
5. **Copy**: chave i18n = texto pt. Rótulo só muda com `public/i18n/{en,es,ar,xx}.json` + e2e no mesmo commit, e só se for melhor nos 3 perfis. Candidatas registradas em `docs/redesign/COPY.md` (F0).
6. **Navegação** sempre por `onChangeView` (passa por `askNavGuard`); nunca `setActiveView` direto nem `<a href>` real.
7. **Sem "em breve", sem botão morto, sem número inventado**; métrica sem base = "—"; vazio com causa + ação (`ui/Vazio`), erro antes do vazio (`ui/Erro`).

## Fases e PRs

Branch: `feat/redesign-v3` a partir de `main @ 2ac979b`. Uma change OpenSpec por PR (`openspec/changes/redesign-v3-<fase>/`).

### F0 — Fundação (M, PR 1)

1. `git switch -c feat/redesign-v3 main`; cherry-pick em ordem `9ed6b48` (LF primeiro), `8c2d181`, `77a22b7`, `1553c1e`, `80cb26f`, `ed6aee7`, `e9dc55d`, `dcdfece`; rodar vitest entre picks se houver conflito (`Study.tsx`, `Metrics.tsx`).
2. `git stash apply stash@{0}` + `git add scripts/e2e/preparar-banco.mjs` (só existe no disco).
3. Copiar da tag para `docs/redesign/`: INVENTARIO, PARIDADE, DESIGN-SPEC, DECISOES, VERIFICACOES, AUDITORIA-EXCECOES-E2E, ERRATA (52 linhas do PROMPT em `45a888b`); `scripts/redesign/gate.sh`. Commitar `docs/design/auditoria-prototipo-v2/` e o `.dc.html` v3 em `docs/redesign/source/`.
4. Novo `scripts/redesign/evidencias.mjs`: Playwright standalone, rotas de `src/lib/rotas.ts` × 3 viewports × claro/escuro → `docs/redesign/evidencias/<fase>/<rota>__<vp>__<modo>.png` na porta 3301 com banco descartável. Rodar em `00-base/`.
5. Novo `docs/redesign/INVENTARIO-FUNCIONAL.md`: checklist por tela (elemento, `arquivo:linha`, colunas antes/depois) derivado de `AUDITORIA.md` §1-§12 e `INVENTARIO.md`; marcar "antes".
6. `docs/redesign/COPY.md` com as renomeações candidatas e decisão por linha.
7. Registrar D-012..D-015 (decisões desta sessão) em `DECISOES.md`.
   Gate: `gate.sh` verde, contagem de testes ≥ main, integridade sem acusar.

### F1 — Tokens e classes globais (M, PR 2) — só `src/index.css` + teste

- Tokens novos declarados como hex em `:root` e em cada um dos 16 blocos tema/dark: `--surface-sunken` (#EBE7DB), `--field-bg` (#FFF), `--accent-hover` (#D6431C), `--accent-border` (#F0C9BE), `--surface-raised` (#EFEAD9), `--divider` (#E5E1D4), `--panel-bg/-surface/-border/-ink/-ink-muted` (#1C1A16/#26241F/#45423A/#E6E2D6/#B9B3A4; no escuro o painel é mais claro que o canvas). Expor no `@theme` como `--color-*`. Nos 7 temas restantes derivar com razão anotada.
- `tests/contrastePaletas.test.ts`: adicionar 14 pares (ink/ink-muted/accent-ink × surface-sunken, surface-raised; ink/ink-muted/ink-faint × field-bg; accent-contrast × accent-hover; panel-ink/panel-ink-muted × panel-bg/panel-surface) e subir o piso de pares avaliados.
- Classes: `--border-width-card: 1.5px` (babel); `.btn-solid` hover `--accent-hover` + sombra inset do v3; `.btn-outline` = btnGhost; `.label-mono` tracking 0.1em; `.badge-tag` chip v3; `.card-panel` sombra seca; `.field-input` com `--field-bg`; novas `.card-panel.escuro`, `.card-panel.bloqueado`, `.titulo-de-tela` (Archivo 900, -0.02em, 24→28px).
- D-012: `.kpi-pill.active` passa de accent para ink (alinha `Abas pilula`/`Segmentado pilula` ao v3); ajustar a regra correspondente da camada de contraste sem mudar seletores.
  Gate: `gate.sh` + axe + evidências `01-tokens/` vs `00-base/`.

### F2 — Casca (M, PR 3)

- `NavRail.tsx`: 220 px expandido (68 recolhido), fundo `bg-surface/85`, borda `--divider`, item `min-h-[42px] rounded-xl`, ativo `bg-accent-soft text-accent-ink`, sem barra lateral; cabeçalho com `Brand` + `font-marca`. `index.css:1349` → `--shell-inset-right: 220px`.
- `ControlCluster.tsx` em `column`: busca como pílula larga "Buscar · Ctrl K", depois A±/conforto/claro-escuro, depois `MenuDaConta` com avatar. Nenhum controle sai.
- **Padrão novo (decisão do dono)**: `menuPosition` padrão `left` (`useAparencia.ts:16-17`) e modo claro padrão para quem nunca escolheu (verificar `theme.ts` boot: hoje segue `prefers-color-scheme`); preferências salvas prevalecem; `restaurar.ts` `VISUAL_PADRAO` acompanha.
- `NavBar`/`MobileNav`: só tokens. Manter `data-shell`, `aria-current`, classes de `body`.
  Gate: `gate.sh`, `tema`, `quatro-superficies-alcancaveis`, `pseudo-localizacao` (risco: `truncate` em 220 px com rótulos senior +40 %: trocar por quebra em 2 linhas ou manter 232).

### F3 — Primitivos novos (M, PR 4)

`CabecalhoDeTela` (kicker + h1 `.titulo-de-tela` + subtítulo + ações; consumidores Hub, Metrics), `PainelEscuro` (LiveCapture hero, Play "Jogando com", Analysis transcrição), `Ladrilho` variante `kpi`, `CartaoDeJogo` (cor por modalidade, estado bloqueado com motivo + porta de saída; Play e Analysis aba Jogos). `Erro` já veio. Sem `Botao/Chip/Selo/Cartao` genéricos. Testes em `primitivosDeUi.test.tsx`.

### F4 + F5 — Início, Vocabulário, Revisar (G, PR 5)

Hub: `CabecalhoDeTela`, 3 pilares `.card-panel` com `copyDoPerfil`, faixa `Barra` + `Ladrilho kpi`, recentes com `MiniaturaDoItem`, rodapé lendo `core/planos.ts`. Metrics/Study: card-herói, 4 KPIs New/Learning/Review/Relearning, lista com `Segmentado`; **change própria `fsrs-hibrido` (D-006)** testada em `POST /api/vocab/:id/review` + `fsrs-revisao.e2e.ts` estendido; reescrever `gradeDeRevisaoAlcancavel.test.ts` junto. Estender: KPIs expandidos, LangAudit, BaralhosAnki, Curadoria, Mapa, Trilha.

### F6 — Jogar lobby + rodada (GG, PR 6)

`Play.tsx`: cabeçalho Etapa/ofensiva/Seeds, `PainelEscuro` + gaveta de facetas com `Segmentado`, abas + legenda de modalidade, grade `CartaoDeJogo`, "Precisam de outro material" = estado bloqueado do `MinigameDef`, Recordes. Estender sem mudar fluxo: SalaDeEscolha, Antessala, ComoSeJoga, Tour, ResumoDaRodada, ScratchReward, SeletorDeConteudo. Não renomear containers usados por `juice.ts`.

### F7 — Biblioteca + Sessão + Leitura (GG, PR 7)

Library (chips, grade com capa em `--surface-sunken`, Filtros, Importar 4 fontes com cadeado só se `core/planos.ts` disser), Analysis (4 abas `Abas` sublinhado, Analista à direita, Visão Geral com "—"), Reading (modos com `Segmentado` tom ink; D-007 consulta o deck), PlayerInterativo, Overlay/PiP só tokens (janela própria herda vars: testar).

### F8 — Capturar (GG, PR 8)

`LiveCapture.tsx`: hero `PainelEscuro`, gaveta de config com `Abas pilula`, painéis `.card-panel`, Falantes, ModelPrepPanel, AiEnginePanel, Foco Cheio, Bingo (D-008). Presets `--transcript-*` não migram. Não trocar `overflow-y-auto` (seletor de `--ichat-reserva`).

### F9 + F10 — Personalizar, Planos, Ajustes, Perfil, Sobre, Login, Onboarding (M, PR 9)

Loja com 4 abas reais, catálogo `core/loja.ts`, duas moedas, `.badge-tag` por raridade; Passe, Conquistas, Inventário, RecompensaDesbloqueada. Planos (3 cards de `core/planos.ts`, 10 linhas, nota self-host). Ajustes 4 abas, Perfil 3 abas, AuthShell, GateDeConta/ModalDeMigracao, Onboarding 8 passos (+ provedor "Personalizado"), ErroDaTela.

### F11 — Jogos (G, PR 10)

18 minigames + ArteDosJogos: só tokens/classes; regras intactas. `text-white` só trocar onde o par não está na camada `!important`.

### F12 + F13 — Estados globais, mobile, escuro, 7 temas, fechamento (M, PR 11)

Toast/askConfirm, CommandPalette, IChat 3 estados, GuidePanel, LayoutStudio, PopoverFlutuante, InfoHint. Passadas em 375 px, escuro e nos 7 temas com evidências. PARIDADE final (27+33+2), INVENTARIO-FUNCIONAL "depois" 100 %, arquivar changes, relatório final `openspec/audits/`.

## Verificação (por fase)

1. `bash scripts/redesign/gate.sh` (typecheck, lint, unit, build, e2e 3 viewports em banco descartável na 3301, integridade de testes). Antes da PR: `npm run morto:arquivos`, `npm run morto:ciclos`, `npm run i18n:orfas`, `node scripts/i18n/pseudo.mjs --check`, `ast-grep scan -c sgconfig.yml src server server.ts`.
2. Paridade = suíte e2e existente, estendida com `it` novos nos specs da tela; nunca `paridade/*` paralelo.
3. `node scripts/redesign/evidencias.mjs --fase NN` e comparação com `00-base/` na PR.
4. Axe (`acessibilidade.e2e.ts`), `contrastePaletas`, pseudo-locale a cada mudança de casca/cabeçalho.
5. `INVENTARIO-FUNCIONAL.md`: item sem "depois" marcado bloqueia o merge da fase.
6. Relatório por fase em `docs/redesign/PROGRESSO.md` (baseline: 3.901 unitários, 87+15 e2e); pisos só sobem.
7. Inspeção visual final de cada fase no Chrome (rota principal da fase, pro e senior, claro e escuro).
