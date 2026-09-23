# Auditoria de design e UX — redesign v4 (22/09/2026)

**Alvo:** `feat/redesign-v4 @ 81dc6a6` (o mesmo design que está em `main`), servido em
`http://localhost:4200` com banco descartável (`data/auditoria-descartavel.db`) e login desligado.
**Método:** passada roteirizada com Playwright em 9 telas × 2 viewports (1280×800 e 390×844), axe-core 4
(tags `wcag2a/2aa/21aa/22aa`) em cada tela, contraste no tema escuro, 12 Tabs de teclado, medição de alvos
de toque e rolagem horizontal; detector estático do impeccable sobre `src/`; leitura do código em cada achado.
Scripts em `passada.mjs`, `contraste.mjs` e `recompensa.mjs`; capturas e números brutos em `evidencias/`.

**Não medido:** Lighthouse/performance real. O servidor de dev do Vite serve módulos soltos, então qualquer
número de carga aqui seria falso. Rodar `lighthouse` contra o build (`npm run build && npm start`).

## Nota

| # | Dimensão | Nota | Achado principal |
|---|---|---|---|
| 1 | Acessibilidade | 2/4 | Laranja da marca usado como texto a 3,23:1 em 232 lugares |
| 2 | Performance | 2/4 | 14 famílias de fonte num `@import` que bloqueia a renderização (não medido em build) |
| 3 | Responsivo | 2/4 | Barra inferior do celular esconde "Ajustes" e corta "Planos" |
| 4 | Temas | 3/4 | Sistema de tokens sólido; destaque `rare` a 2,32:1 no escuro |
| 5 | Anti-padrões | 2/4 | Faixa lateral no item ativo, sobrancelhas em caixa-alta em todo bloco, partículas decorativas |
| **Total** | | **11/20** | **Aceitável — trabalho relevante, nada bloqueante** |

## Veredito de anti-padrões

Não parece "feito por IA" no conjunto: a identidade (terracota sobre areia, Archivo + Inter + Plex Mono,
logotipo pixelado) é própria e consistente. Os tiques estão nos detalhes:

- **Sobrancelha mono em caixa-alta espaçada em quase todo bloco** — `NÍVEL 2`, `OFENSIVA`, `SEEDS`,
  `ANTES DE JOGAR`, `IDIOMA`, `DE ONDE VÊM AS PALAVRAS`, `QUAIS GRAVAÇÕES`. Uma vez é voz; em todo bloco vira
  andaime.
- **Faixa lateral colorida** no item ativo do menu e nas legendas do Overlay (`Overlay.tsx:529`, `:657`,
  `BaralhosAnki.tsx:376`).
- **Partículas decorativas** (padrão "Do tema") espalhadas no fundo de todas as telas. Não comunicam estado;
  competem com os números da faixa de progresso.
- **Easing com quique** fora dos jogos (`ChatTranscript.tsx:397`). Dentro dos minijogos é aceitável como
  recompensa pontual.
- **Texto com gradiente** no tema premium escuro (`index.css:345`).

O fundo areia (`#E6E2D6`/`#F5F2EA`) está na faixa "creme" que hoje é o padrão de IA, mas é a identidade já
aprovada (D-011 a D-017). **Mantido de propósito**; não é recomendação trocá-lo.

## Resumo executivo

- **P0:** 0 · **P1:** 6 · **P2:** 7 · **P3:** 6
- Os cinco que mais pesam:
  1. Laranja como cor de texto reprova contraste em quase toda tela (P1, sistêmico).
  2. Balão "iChat sintonizado com: play" reprova contraste **e** mostra o id interno em inglês (P1).
  3. No celular, "Ajustes" some da barra inferior e "Planos" fica cortado (P1).
  4. Modal de conquista não fecha com Esc, não recebe o foco e reaparece em todo navegador novo (P1).
  5. O onboarding dá três tamanhos diferentes para o mesmo download: "alguns MB", "~30 MB" e "~880 MB" (P1).
- A maior parte se resolve em poucos pontos centrais: um token (`--accent-ink`), um componente (balão do
  iChat), a barra inferior e o modal de recompensa.

## Achados

### P1 — corrigir antes de lançar

**[P1] Laranja da marca como cor de texto reprova contraste**
- **Onde:** classe `text-accent` — 232 ocorrências em 72 arquivos; visto no logotipo ("Play"), "Ver tudo que
  existe (130)", links de `Sobre`, `Personalizar`, `Planos`.
- **Medido:** `#F04E23` sobre `#F5F2EA` = **3,23:1** (texto de 15 px bold exige 4,5:1).
  O `--accent-ink` atual (`#C93A15`) passa na superfície (4,58:1) mas **reprova no canvas** (3,96:1).
- **Norma:** WCAG 1.4.3.
- **Correção:** `text-accent` só para ícones e preenchimentos (3:1 basta); todo texto usa `text-accent-ink`.
  Escurecer `--accent-ink` do tema babel para `#AE300E` (5,81:1 na superfície, 5,02:1 no canvas, 5,07:1 no
  `accent-soft`). O escuro já passa (`#FF7B5C`: 6,90:1).
- **Comando:** `/impeccable colorize` (troca de token) + codemod `text-accent` → `text-accent-ink` onde o nó é
  texto.

**[P1] Balão "iChat sintonizado com: …" — contraste e vazamento de id interno**
- **Onde:** `src/components/IChat.tsx:807` — `<strong className="text-rare">{showContextSyncNotification}</strong>`.
  Aparece em 8 de 9 telas.
- **Medido:** `#5B5EA6` sobre ink = 2,88:1 no claro; `#58A6FF` sobre `#F0F6FC` = **2,32:1** no escuro.
- **Além do contraste:** mostra o id da rota, não o nome da tela: "sintonizado com: **play**" em Jogar,
  "**loja**" em Personalizar. Em inglês e com um nome que o usuário nunca vê.
- **Norma:** WCAG 1.4.3; Nielsen #2 (linguagem do usuário).
- **Correção:** mapear a rota para o rótulo do menu ("Jogar", "Personalizar"); o destaque usa
  `text-ink-contrast` em negrito, sem cor. Mostrar só na primeira vez em cada tela, não a cada navegação.
- **Comando:** `/impeccable clarify`.

**[P1] Barra inferior do celular esconde "Ajustes"**
- **Onde:** navegação principal no breakpoint móvel (390 px).
- **Medido:** 9 itens ocupam 440 px numa tela de 390 px, `overflow-x: visible`, sem rolagem. "Planos" fica
  cortado (353–394 px); "Ajustes" (394–440 px) fica fora da tela. Só se chega a Ajustes pelo menu da conta.
- **Norma:** WCAG 1.4.10 (reflow); Nielsen #6 (reconhecer em vez de lembrar).
- **Correção:** 4 destinos principais + "Mais" (Início, Capturar, Jogar, Vocabulário, Mais → Biblioteca,
  Personalizar, Planos, Sobre, Ajustes). Ver o protótipo.
- **Comando:** `/impeccable adapt`.

**[P1] Modal de conquista: sem Esc, sem foco, reaparece por aparelho**
- **Onde:** `src/components/RecompensaDesbloqueada.tsx:101`.
- **Medido:** Esc não fecha (testado duas vezes); o componente não tem `keydown` nem move o foco para
  dentro do diálogo. O "já visto" fica em `localStorage` (`babel.recompensas_vistas`), então o modal
  volta em todo navegador ou aparelho novo. **Não há crédito duplicado:** o saldo ficou em 34 Seeds nas duas
  rodadas.
- **Norma:** WCAG 2.1.2 e 2.4.3; padrão APG de diálogo modal.
- **Correção:** `<dialog>` nativo com `showModal()` (Esc e foco de graça) ou trap de foco + Esc; marcar como
  visto no servidor, junto da conquista.
- **Comando:** `/impeccable harden`.

**[P1] Três tamanhos diferentes para o mesmo download**
- **Onde:** `Onboarding.tsx:447` diz "O download (~alguns MB)"; a tela seguinte diz "cerca de 880 MB";
  `GuidePanel.tsx:45` diz "~30MB".
- **Impacto:** para quem está no 4G, o tamanho é a decisão. Prometer "alguns MB" e entregar 880 MB é o tipo
  de coisa que faz a pessoa desinstalar.
- **Norma:** Nielsen #1 (status do sistema) e #2.
- **Correção:** uma constante só (derivada do modelo escolhido), usada nos três lugares.
- **Comando:** `/impeccable clarify`.

**[P1] Checkbox "Prévia antes de começar" sem nome no celular**
- **Onde:** `src/components/views/Play.tsx:3577` — o texto do rótulo está em `hidden sm:inline`, então abaixo
  de 640 px o input fica sem nome acessível (axe: `label`).
- **Norma:** WCAG 4.1.2.
- **Correção:** manter o texto visível, ou `aria-label` no input quando o texto some.
- **Comando:** `/impeccable harden`.

### P2 — próxima passada

**[P2] Botão flutuante do iChat cobre ação no celular** — no Início (390 px) o balão fica por cima de
"Abrir vocabulário" (`evidencias/mobile-inicio.png`). Reservar `padding-bottom` no conteúdo igual à altura
da barra + balão, ou levar o iChat para a barra superior no celular. `/impeccable adapt`.

**[P2] Alvos de toque pequenos** — links de texto com 17–19 px de altura: "personalizar" (8× em
Personalizar), "escolher outro jogo", "Ver estatísticas detalhadas", "Termos de uso", "Política de
privacidade"; na lista de jogos, 13 alvos abaixo de 24 px. No celular, entre 9 e 83 alvos por tela ficam
abaixo de 44 px. WCAG 2.5.8 pede 24 px no mínimo. `/impeccable adapt`.

**[P2] Jogar abre com modal toda vez** — "Antes de jogar / O que você vai praticar" cobre a tela a cada
entrada (há opção para desligar). O modal ainda sobra ~100 px vazios embaixo. Virar um painel inline no topo
de Jogar, já com a última escolha aplicada. `/impeccable distill`.

**[P2] 14 famílias de fonte num `@import` bloqueante** — `index.css:1` carrega Inter, Archivo, Plex Mono,
Geist, Geist Mono, Baloo 2, Silkscreen, VT323, Merriweather, JetBrains Mono, Orbitron, Rajdhani, Nunito e
Caveat antes do primeiro pixel, mesmo que só três sejam usadas no tema padrão. Carregar só as do tema ativo
(`<link rel=preload>` para as três padrão; as demais sob demanda ao equipar). `/impeccable optimize`.

**[P2] Conquista e ofensiva "grátis" no self-host** — o seed de demonstração (`server/db/seed.ts`, só com
`AUTH_REQUIRED=0`) faz um usuário novo ver "Conquista feita: Primeira captura +25 Seeds +30 XP" e "Você já
revisou hoje, ofensiva de 1 dia" sem ter feito nada. Não contar dados de demonstração para conquistas e
ofensiva. `/impeccable onboard`.

**[P2] Telas sem `h1`** — Capturar (começa em `h2: Captura ao vivo`) e Personalizar (`h2: Personalizar`).
As outras 7 têm exatamente um `h1`. WCAG 1.3.1 (boa prática). `/impeccable typeset`.

**[P2] "Pular apresentação" não pula** — leva à etapa 6 de 6 ("Como você quer rodar a IA?"), que é
obrigatória. Renomear para "Ir para a escolha" ou deixar a etapa 6 com um padrão pré-selecionado.
`/impeccable clarify`.

### P3 — polimento

- **[P3] Faixa lateral de destaque** — item ativo do menu e `Overlay.tsx:529/657`, `BaralhosAnki.tsx:376`.
  Trocar por fundo `accent-soft` sem a faixa (o fundo já existe). `/impeccable polish`.
- **[P3] Sobrancelhas em caixa-alta em todo bloco** — manter só como rótulo de dado (OFENSIVA/SEEDS debaixo
  do número); nos títulos de seção do modal/painel, usar peso e tamanho. `/impeccable typeset`.
- **[P3] Partículas decorativas no fundo** — desligadas por padrão no tema babel; ficam como item equipável.
  `/impeccable quieter`.
- **[P3] `ink-faint` sobre canvas** — `#7A7568` sobre `#E6E2D6` = 3,55:1 (visto em Capturar,
  `.text-ink-faint.leading-tight`). Usar `ink-muted` (5,31:1) em texto informativo. `/impeccable colorize`.
- **[P3] Espaço entre palavras some nos títulos** — "O que você querfazer?" no Início a 390 px
  (`evidencias/mobile-inicio.png`). O espaço do Archivo em 800–900 é estreito e o `letter-spacing` de
  −0,025em o apaga. Reproduzido no Chromium headless, no app e no protótipo; conferir num aparelho real.
  `word-spacing: 0.08em` nos títulos resolve (aplicado no protótipo). `/impeccable typeset`.
- **[P3] Quique fora dos jogos e texto com gradiente no tema premium** — `ChatTranscript.tsx:397`,
  `index.css:345`, `index.css:1514–1549`. `/impeccable animate`.

## Padrões sistêmicos

- **Cor crua usada como texto.** O CSS já documenta (linha 65) que as cores cruas são para preenchimento e
  que texto usa as variantes `-ink` — o `text-accent` e o `text-rare` escaparam dessa regra. Um lint
  (`no-restricted-syntax` sobre `className` com `text-accent` sem sufixo) segura a regressão.
- **Conteúdo que não se adapta ao celular.** Barra inferior, balão do iChat e checkbox sem rótulo são o
  mesmo problema: componentes desenhados no desktop e encolhidos. A matriz e2e roda em 390 px, mas não
  mede se os itens cabem.
- **Três fontes de verdade para o mesmo número** (tamanho do modelo). Vale uma varredura por cópias de
  números que deveriam vir de uma constante.

## O que está bom

- **Foco visível** em 12 de 12 Tabs; nenhum elemento sem indicação.
- **Landmarks e nomes:** `nav` rotulada "Navegação principal", `main`, `header`; botões de ícone com
  `aria-label` ("Recolher o menu lateral", "Mudar para o modo escuro", "Sua conta").
- **Nenhuma rolagem horizontal da página** em 390 px, em nenhuma das 9 telas.
- **Zero erros de console** nas 18 visitas (fora o WebSocket do HMR, que é do ambiente).
- **Sistema de tokens maduro**: variantes `-ink`/`-soft`/`-contrast` por cor semântica, redeclaradas em cada
  tema, com o motivo documentado no próprio CSS. No tema escuro, o Início passa sem nenhuma falha.
- **Movimento reduzido respeitado** em partículas, som e `juice` (`prefers-reduced-motion` em 5 arquivos).
- **Hierarquia do Início** clara: uma ação primária escura, duas secundárias, depois o progresso.

## Ações recomendadas, em ordem

1. **[P1] `/impeccable colorize`** — `--accent-ink` → `#AE300E` e codemod de `text-accent` em texto; `ink-faint`
   → `ink-muted` onde for informação.
2. **[P1] `/impeccable adapt`** — barra inferior com 4 itens + "Mais"; folga para o balão do iChat.
3. **[P1] `/impeccable harden`** — modal de conquista acessível e "visto" no servidor; rótulo do checkbox.
4. **[P1] `/impeccable clarify`** — uma constante para o tamanho do modelo; balão do iChat com o nome da tela.
5. **[P2] `/impeccable distill`** — "Antes de jogar" vira painel inline.
6. **[P2] `/impeccable optimize`** — fontes sob demanda; depois Lighthouse no build.
7. **[P2] `/impeccable onboard`** — seed de demonstração fora de conquistas e ofensiva; "Pular apresentação".
8. **[P3] `/impeccable quieter`** + **`/impeccable typeset`** — partículas, sobrancelhas, faixa lateral.
9. **`/impeccable polish`** — passada final.

## Protótipo

`docs/prototipos/auditoria-v4-correcoes.html` — navegável, arquivo único, com as correções P1/P2 aplicadas
sobre os tokens do tema babel (única mudança de token: `--accent-ink` → `#AE300E`). Tem chaves para
anotações, celular (390 px) e tema escuro.

Verificado com `verifica-prototipo.mjs` (Playwright + axe-core): 7 telas × {desktop, celular} × {claro,
escuro} = **28 passadas sem nenhuma violação WCAG 2.2 AA**, um `h1` por tela, barra inferior sem estouro,
diálogo de conquista recebe o foco e fecha com Esc, "Mais → Ajustes" funciona, zero erros de JS.
