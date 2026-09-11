# LACUNAS — priorizado a partir de medição, não da lista do prompt

A seção 6/F3 do prompt traz uma lista de lacunas P0–P3. **A maior parte dela descreve deficiências
do protótipo, não do app** — ver `INVENTARIO.md` §2 e `DECISOES.md` D-003. Esta é a lista
depurada: cada item abaixo foi verificado no código nesta sessão, com `arquivo:linha`.

Legenda de origem: **[app]** existe no app e está errado · **[proto]** existe só no protótipo ·
**[ambos]** · **[suíte]** defeito da suíte de testes.

---

## P0 — impede o redesign de ser correto

### P0-1 [app] Os intervalos dos botões de revisão FSRS são literais no JSX

`src/components/views/Study.tsx:1111` `Again (10m)` · `:1120` `Hard (1.2d)` ·
`:1129` `Good (3.5d)` · `:1138` `Easy (8d)`.

São constantes fixas. Não chamam `intervalDays` (`src/core/learning/scheduler.ts:74`), não usam a
`stability` do cartão nem a retenção prevista. O próprio arquivo (`Study.tsx:160-169`) declara ter
removido a simulação local e que o servidor é a única fonte — verdade para o cartão persistido
(`handleFsrsFeedback` `:170-180`), **falso para os quatro rótulos**.

É exatamente o "dado de mentira" que a regra 3 proíbe, e está no app.
Correção: derivar cada rótulo de `intervalDays` com a `stability`/`difficulty` do cartão da vez.

### P0-2 [app] O botão mente sobre a nota que envia

`src/components/views/Study.tsx:171-173`: quando `exercise-kind === 'active-production'`, um `3`
(Bom) é promovido a `4` (Fácil) antes de ir ao servidor. O botão diz "Good (3.5d)" e o cartão é
agendado como Fácil.

Mais grave que P0-1, porque altera o agendamento real. Ou o rótulo passa a dizer a verdade, ou a
promoção sai. Decisão a registrar em `DECISOES.md` antes de mexer.

### P0-3 [app] 14 famílias de fonte por CDN do Google, render-blocking

`src/index.css:1` — um `@import url('https://fonts.googleapis.com/...')` com Inter, Archivo,
IBM Plex Mono, Geist, Geist Mono, Baloo 2, Silkscreen, VT323, Merriweather, JetBrains Mono,
Orbitron, Rajdhani, Nunito, Caveat.

Contradiz a promessa do README ("not a single request reaches the server") e o modo local/offline.
Sem `preconnect`, num request único, bloqueando o render.
**`VT323` não é usada em lugar nenhum** — import morto (`src/index.css:1598` só a cita num
comentário). Correção: self-hospedar em `public/fontes/` com `@font-face` e subset; remover VT323.

### P0-4 [app] Estado de ERRO ausente em 9 das 13 telas

Só Hub (parcial), LiveCapture, Library, Analysis e Play têm caminho de erro
(`INVENTARIO.md` §6). Reading, Study, Metrics, Loja/Personalizar, Planos, Perfil,
Settings/LangAudit, Recordes e PainelTrilha não têm.

É a única lacuna de estado que o prompt aponta e que **de fato existe**. Vazio e carregando já
estão bem cobertos.

### P0-5 [-] Nenhuma acessibilidade automatizada

Nenhuma dependência axe/a11y no `package.json`. O projeto trava contraste por teste
(`tests/contrastePaletas.test.ts`, 7 temas × claro/escuro, limiar 4,5:1) e tem primitivos testados
(`tests/primitivosDeUi.test.tsx`), mas nada trava papel, rótulo, foco visível e ordem de tabulação.
Correção: `@axe-core/playwright` nas rotas migradas (D-005).

### P0-6 [proto] Contraste reprovado no protótipo

`#8C867C` sobre `#F5F2EA` = **3,23:1** em 22 ocorrências de texto pequeno. O app já tem a saída:
`--ink-faint` (`#7A7568`). Idem `#B8B2A2` (x5). Não copiar esses hex para o código.
Hierarquia de decisão item 2: acessibilidade vence fidelidade.

### P0-7 [proto] Dado fabricado no protótipo

Lista fechada em `DESIGN-SPEC.md` §7.2 — "Nível 12 · 340/500 XP", "2.057", "6h 40min",
"Etapa 15 · 755/1500 XP", "Retenção 87%", "132 ppm", "500 MB". Nenhum pode virar constante.
O app já tem as primitivas certas: `<SemDado>` (`Analysis.tsx`), `Honestidade.tsx`,
`Provenance.tsx`, e o padrão `"—" quando não há timing confiável` que o próprio protótipo usa.

### P0-8 [proto] Tela Progresso órfã

`goProgresso` existe na classe `Component` mas tem 0 ocorrências no template e não está em
`navDefs` (`prototipo-v3.html:1434-1444`). A tela `isProgresso` (L756-797) é inalcançável.
No app, Progresso **é uma aba de Perfil** (`views/perfil/AbaProgresso.tsx`), alcançável pelo avatar.
Decisão: a tela do protótipo não vira rota nova; o conteúdo de CEFR/semana que valer vai para
Vocabulário ou para a aba que já existe. Registrar em `DECISOES.md`.

### P0-9 [proto] Links sem destino no protótipo

"Ver estatísticas detalhadas" (Início), "Privacidade" e "Termos" (Sobre).
O app já resolveu: `/termos.html` e `/privacidade.html` (`Login.tsx:148-149`) e `Sobre.tsx:27`
tem guarda que **não renderiza** link vazio. Basta não regredir.

### P0-10 [ambos] Estados de palavra do FSRS

O protótipo mostra New/Learning/Review. O prompt pede os 4 estados reais incluindo Relearning.
**Nenhum dos dois bate com o app:** o agendador é de estado contínuo — `stability`, `difficulty`,
`reps`, `lapses` (`scheduler.ts:20-35`); "novo" é `stability === undefined` (`:109`);
`relearning` não existe em `src/` nem em `server/`.
O rótulo tem de sair do modelo contínuo real, não de qualquer das duas listas.

### P0-11 [-] Tokens derivados que faltam no `index.css`

Os 34% de cor do protótipo que não caem em token existente (`DESIGN-SPEC.md` §3) são derivadas,
não cores novas: `--surface-sunken`, `--field-bg`, `--accent-hover`, `--accent-deep`,
`--accent-border`, `--good-border`. Adicionar **e redeclarar em todos os 8 temas** — a armadilha do
`color-mix()` está documentada em `src/index.css:48-69`.
Depois, regra de lint proibindo hex solto em arquivo novo ou alterado.

---

## P1 — o design pede e o app suporta

### P1-1 [proto] Antessala da rodada
Prévia, fases com estrelas, dificuldade, leeches, Jogar/Trocar/Repetir/Sair.
`montarRodada` já devolve `previa: ItemDaAntessala[]` (`src/core/minigames/rodada.ts:89-93`) — **o
dado já existe**, falta a tela. Verificar antes se `Play.tsx` já a renderiza sob outro nome.

### P1-2 [proto] Raspadinha de fim de rodada
3 estrelas, canvas raspável, corrente, combo, caça ao recorde. Depende da economia, que é real
(`server/routes/metrics.ts:113-175`). O "Trocar mantendo o combo — 40 Seeds" bate com
`CUSTO_PULAR_RODADA = 40` (`src/core/economiaAutoridade.ts`). Coerente com a arquitetura.

### P1-3 [app] O Bingo é um jogo fora do registro
`src/core/minigames/bingo.ts:1-20` + `BingoPanel.tsx` funcionam, mas o Bingo não é `MinigameId`,
não entra em `MINIGAMES`, nem em `montarRodada`, nem no gate de elegibilidade
(`estadoDosJogos.ts:390`), nem no ranking. Ou entra no registro, ou fica documentado como painel
de captura e não como jogo. Decisão de produto — marcar `REVISAR`.

---

## P2 — precisa de decisão ou backend

### P2-1 [app] Corrida no débito de Seeds
`server/routes/metrics.ts:107-111` documenta que duas compras simultâneas podem ambas passar a
conferência de saldo. Pré-existente, fora do escopo visual, mas registrado porque o redesign toca
a Loja. Não corrigir de passagem sem teste.

### P2-2 [suíte] Cinco E2E que dependem de banco que o setup não cria
`fsrs-revisao:27`, `seeds:25`, `sessao-de-jogo:66/104/141` — ver `PROGRESSO.md`. Falham nesta
máquina contra o banco real do operador. A correção certa é o `_global-setup.ts` semear o mínimo
que eles exigem, **nunca** afrouxar asserção (regra 4).

---

## P3 — mecânica de jogo

**Vazia.** O prompt supõe que os 18 jogos do protótipo podem não ter adapter. Verificado: os 18
ids existem todos, com def em `src/core/minigames/types.ts:147-181` e componente em
`src/components/views/play/telaDoJogo.ts:17-35`. Nenhum jogo novo a implementar.

---

## O que o prompt listava e não é lacuna

Registrado para que ninguém "conserte" o que já está certo — cada um com evidência em
`INVENTARIO.md` §2 e §3: design system formal, contraste AA travado, responsivo 375 px, ícones
self-hosted, "em breve" em string de interface, `href="#"`, Sessão com 4 abas, modal Exportar,
Loja com 4 abas, Perfil com 3 abas, busca Ctrl+K, iChat, menu de conta, gaveta de Capturar,
Ajustes com 4 abas, Importar com 4 fontes, lobby facetado, Recordes, ranking global,
`prefers-reduced-motion`, i18n com pseudo-locale e catraca de cobertura no CI.
