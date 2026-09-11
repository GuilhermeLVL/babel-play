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

**FEITO.** `src/core/learning/previsaoDeIntervalo.ts` pergunta ao agendador o que ele faria com
cada nota (`Fsrs5Strategy.review`) e formata a diferença — o mesmo caminho que o servidor percorre
para agendar de verdade, então rótulo e agendamento não têm como divergir. `Study.tsx` passou a
consumir `previsaoDosBotoes(estadoDoCartao(currentCard, agora), agora)`.
Travado por `tests/previsaoDeIntervalo.test.ts` (13 casos), incluindo a armadilha do
`fsrsStability: 0` que precisa virar `undefined` para o cartão novo não cair no ramo errado do FSRS.

**Mas ver P0-12: esses botões não são alcançáveis hoje.**

### P0-2 [app] ~~O botão mente sobre a nota que envia~~ — CORRIGIDO, não procede

**Esta lacuna foi descrita errado na primeira redação e não existe.** Registrada aqui, e não
apagada, porque o erro chegou a ser relatado ao dono.

O que eu afirmei: que `Study.tsx:171-173` promove Bom (3) a Fácil (4) e que, por isso, o botão
rotulado "Good (3.5d)" enviava Easy ao servidor.

O que a verificação mostrou: a promoção existe (`Study.tsx:171-173`), mas só se aplica quando
`exerciseKind === 'active-production'`, e **o único chamador com esse argumento é
`Study.tsx:828`** — o exercício de Produção Ativa, que **não tem a grade de quatro botões**.
Ali a nota é derivada do acerto (`const rating = res.correct ? 3 : 1`, `Study.tsx:826`) e o
usuário nunca escolhe nem vê rótulo de intervalo. Os quatro botões (`:1106`, `:1115`, `:1124`,
`:1133`) chamam `handleFsrsFeedback` **sem** `exerciseKind`, então nunca disparam a promoção.

Portanto não há botão mentindo. A promoção é uma política interna declarada no próprio código
("produção ativa é mais difícil: um acerto vale Easy") aplicada onde não há escolha do usuário —
decisão de produto defensável, não defeito de honestidade. Fica sem ação.

### P0-3 [app] 14 famílias de fonte por CDN do Google, render-blocking

`src/index.css:1` — um `@import url('https://fonts.googleapis.com/...')` com Inter, Archivo,
IBM Plex Mono, Geist, Geist Mono, Baloo 2, Silkscreen, VT323, Merriweather, JetBrains Mono,
Orbitron, Rajdhani, Nunito, Caveat.

Contradiz a promessa do README ("not a single request reaches the server") e o modo local/offline.
Sem `preconnect`, num request único, bloqueando o render.
**`VT323` não é usada em lugar nenhum** — import morto.

**FEITO.** As 13 famílias restantes passaram a vir de `@fontsource`, resolvidas pelo Vite e
servidas do próprio domínio. Duas propriedades preservadas de propósito:
- **subsets completos** (latin, latin-ext, cyrillic, devanagari, vietnamese), como o Google servia.
  Cada `@font-face` traz o seu `unicode-range`, então o navegador continua baixando só o subset da
  página. Cortar para latin-only teria quebrado russo e hindi no vocabulário.
- `font-display: swap`, que era o `&display=swap` do import antigo.

**VT323 saiu** — estava no import e nenhuma regra a usava.

Não foi para `public/fontes/` como eu havia proposto: o Vite já resolve e versiona os `woff2` a
partir do `node_modules`, então copiar à mão seria duplicar o que o bundler faz. O padrão de
`public/` do projeto (`scripts/copiar-assets-runtime.mjs`) existe para binários que bibliotecas
de terceiros carregam de `/` em runtime — não é o caso de fonte referenciada por CSS.

Evidência: `dist` emite 73 `woff2` (2,65 MB em disco) e **zero** ocorrência de `fonts.googleapis`
ou `fonts.gstatic`; o app rodando não faz nenhuma requisição a `gstatic` e as fontes renderizam.
Travado por `tests/fontesSemCdn.test.ts` (5 casos), que lê o CSS fonte — pega a regressão no commit,
não no build. O teste remove comentários antes de varrer, pelo mesmo motivo que
`semConteudoFabricado.test.ts:29`: o cabeçalho de `index.css` cita o import antigo textualmente.

### P0-4 [app] Estado de ERRO ausente em 9 das 13 telas

Só Hub (parcial), LiveCapture, Library, Analysis e Play têm caminho de erro
(`INVENTARIO.md` §6). Reading, Study, Metrics, Loja/Personalizar, Planos, Perfil,
Settings/LangAudit, Recordes e PainelTrilha não têm.

É a única lacuna de estado que o prompt aponta e que **de fato existe**. Vazio e carregando já
estão bem cobertos.

**EM ANDAMENTO — a parte mais grave está feita.** O buraco não era decorativo: várias telas faziam
`.catch(() => set...([]))`, ou seja, **apresentavam falha de rede como conteúdo vazio**. Em
`Study.tsx:62` isso significava anunciar "Nenhuma palavra no deck ainda" com o wi-fi fora — o app
dizendo ao usuário que o vocabulário dele sumiu. É a mesma família que
`semConteudoFabricado.test.ts` e `contagemHonesta.test.ts` perseguem, pela porta dos fundos: em vez
de inventar um número, inventa um ZERO. **Um `Vazio` exibido no lugar de um `Erro` é conteúdo
fabricado.**

`CatalogoDePalavras.tsx:113` já tinha nomeado e corrigido isto na sua própria tela. O markup de lá
virou o primitivo `src/components/ui/Erro.tsx` — a regra de admissão da pasta exige dois
consumidores reais, e ele nasce com dois: `Study.tsx` (o conserto) e `CatalogoDePalavras.tsx`
(refatorado para provar equivalência). O primitivo acrescenta `role="alert"`, que faltava no
original: sem ele o leitor de tela não anunciava a falha.

A ordem importa e está travada por teste: **o erro renderiza ANTES do vazio**. Sem isso, a falha de
rede volta a aparecer como "você não tem palavras" mesmo com o estado de erro existindo no
componente.

Travado por `tests/erroNaoEhVazio.test.tsx` (9 casos).

**`Metrics.tsx` também feito**, e ali doía mais: os `SemDado` desta tela afirmam a CAUSA
("Seu deck ainda está vazio, sem cartões", "Nenhuma fala capturada ainda"). Uma falha de fetch não
virava só um painel em branco — virava uma **frase errada sobre o acervo do usuário**. Tanto o deck
quanto as falas passaram a ter estado de erro com porta de saída.

**`Settings.tsx:153` NÃO precisa de conserto.** Ele faz `.catch(() => setMetrics(null))`, e `null`
ali já é honesto: `wpmMeasured` vira `null` e a tela mostra "—". O próprio comentário da linha
seguinte diz isso ("ppm medido honesto: só existe com fala capturada; senão mostramos '—'").
Mexer seria trocar uma resposta certa por outra.

**Falta `Reading.tsx:181`**, e é um caso diferente dos anteriores — por isso ficou de fora em vez
de ser resolvido às pressas. Lá o deck não alimenta um estado vazio visível: alimenta buscas
(`Reading.tsx:219`, `:276`, `:307`, `:2249`) do tipo "esta palavra já está no meu deck?". Com o
fetch falhando, a resposta vira "não está" para palavras que **estão** — e a tela oferece
"Adicionar ao deck" para algo que o usuário já tem. Não é um rótulo errado num painel; é uma
afirmação errada sobre cada palavra do texto, com uma ação destrutiva pendurada nela. Merece a sua
própria change, com decisão sobre o que fazer com a afordância enquanto o deck é desconhecido.

### P0-5 [-] Nenhuma acessibilidade automatizada

Nenhuma dependência axe/a11y no `package.json`. O projeto trava contraste por teste
(`tests/contrastePaletas.test.ts`, 7 temas × claro/escuro, limiar 4,5:1) e tem primitivos testados
(`tests/primitivosDeUi.test.tsx`), mas nada trava papel, rótulo, foco visível e ordem de tabulação.

**FEITO.** `@axe-core/playwright@4.13.0` + `tests/e2e/acessibilidade.e2e.ts`, varrendo 5 rotas sem
exigência de conta (`/`, `/jogar`, `/planos`, `/sobre`, `/ajustes`) nos **3 viewports** — 15 casos.
Limiar: falha em `serious` e `critical`; `minor`/`moderate` aparecem no relatório e não derrubam.
Exigir zero em tudo, num app de 13 telas que nunca passou por axe, produziria um teste que alguém
desliga na primeira semana.

A mensagem de falha imprime regra, seletor e link — um "expected 3 to be 0" mandaria a próxima
pessoa reabrir o navegador para descobrir o que o teste já sabia.

**Achou uma violação real na primeira execução**, e ela está corrigida: `/planos` usava `--accent`
como **cor de texto** em dois lugares (`Planos.tsx:149` e `:181`). Medido: accent `#F04E23` dá
**3,23:1** sobre `surface` e **2,79:1** sobre `canvas` — reprova o mínimo AA de 4,5:1 nos dois.
O token correto é `--accent-ink`, que no tema `babel` (`index.css:245`) é `#b93613` e dá **5,21:1**
sobre surface e **4,50:1** sobre canvas. Trocado para `text-accent-ink`; 15/15 verdes depois.

Nota lateral: o `--accent-ink` do `:root` (`index.css:129`) é `#C93A15`, que dá 3,96:1 sobre canvas
e reprovaria. Ele só vale como fallback quando nenhum `data-theme` está aplicado — situação que o
`main.tsx:11` evita pintando o tema antes do primeiro render. Fica anotado, não perseguido.

**Segunda violação real, achada quando o teste entrou no gate:**
`scrollable-region-focusable` em `/planos`, **só no viewport de 375px**. A tabela de comparação tem
`min-w-[520px]` e portanto sempre rola de lado no celular; um contêiner rolável sem foco é
inalcançável por teclado, ou seja, quem não usa mouse não chegava às colunas "Essencial" e "Pro" —
à comparação de preços inteira. Corrigido com `tabIndex={0}` + `role="region"` + nome acessível
(`Planos.tsx:169`).

**E um defeito do próprio teste, corrigido junto.** Ele falhava na suíte completa e passava quando
rodado sozinho, pela mesma revisão de código. Causa: a aba ativa de `/planos` **persiste** entre
execuções — com "Consumo do mês" aberta, a tabela nem renderiza e o axe varria uma tela onde o
defeito não existia. Um teste cuja cobertura muda em silêncio conforme o estado deixado por outro
é pior que nenhum, porque dá confiança sem dar garantia. Agora ele percorre todas as abas de cada
rota e deduplica, então o que cobre não depende de onde a sessão anterior parou.

Também passou a anexar o relatório completo do axe (inclusive `minor`/`moderate`) ao resultado do
teste: na primeira falha no gate, o detalhe da violação não existia em lugar nenhum e o diagnóstico
virou adivinhação.

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

### P0-13 [-] Os parâmetros do FSRS são os padrões, e o acoplamento com o servidor não é travado

Verificado no item 5 (ver `VERIFICACOES.md` §5a): pesos (`scheduler.ts:52`) e retenção desejada
(`:62`) são constantes de módulo; **não existe parâmetro por usuário em lugar nenhum**. O servidor
agenda com `makeFsrs5()` sem argumentos (`server/db/repositories/vocab.ts:23`), o mesmo que a
previsão da UI usa — então hoje rótulo e agendamento coincidem por construção.

**Nada a corrigir agora.** A lacuna é o dia seguinte: `scheduler.ts:51` declara que a otimização
por usuário está planejada (`srs-fsrs-optimization`). Se ela chegar e `previsaoDeIntervalo`
continuar lendo os padrões enquanto o servidor lê os do usuário, os rótulos voltam a mentir — o
defeito exato que o P0-1 acabou de fechar. O acoplamento tem de nascer junto com a otimização.

### P0-16 [app] `accent-contrast × accent` não tem margem, e isso agora derruba o gate

O par mede **4,54:1** — 0,04 acima do mínimo AA. `contrastePaletas.test.ts` o cobre e o aprova,
porque compara os tokens puros. Mas qualquer coisa composta atrás do elemento consome a margem, e
em `/sobre` há blobs decorativos animados por baixo do botão `bg-accent text-accent-contrast`:
o axe reprova o botão em `desktop-1280`.

É a única falha que sobrou na suíte de acessibilidade (14 de 15 verdes). **Não é ruído de teste:**
o mesmo botão, no mesmo tema, fica abaixo de 4,5:1 quando um blob passa atrás dele.

Duas saídas, e as duas são decisão de produto (registrado em `DECISOES.md` D-011 como `REVISAR`):
1. **Escurecer `--accent-contrast`** para abrir margem — mexe nos 8 temas e muda a aparência de todo
   botão primário;
2. **Tirar os blobs de baixo do texto** em `/sobre` — resolve este caso e deixa o par frágil de pé
   para o próximo lugar que compuser algo atrás de um botão accent.

A segunda é mais barata; a primeira é a que conserta a classe do problema.

### P0-14 [teste] O modal de recompensa saiu da varredura de axe e precisa da sua própria

**A exclusão foi revertida — ela era o remédio errado.** `.exclude()` impede que o modal seja
CHECADO, mas não desfaz o escurecimento que o backdrop projeta sobre a página: com ele no ar, todo
o texto de trás é medido contra fundo esmaecido e reprova. Foi isso que produziu violações
inexistentes em `/`, `/planos` e `/sobre` (verificado injetando o axe na página com o modal
fechado: zero violações em 375×812 e 1280×800).

O que resolveu foi **impedir a fila de nascer**: `addInitScript` semeia
`babel.recompensas_vistas` com o catálogo real de conquistas e os níveis, e o app só mostra o que
não está lá (`RecompensaDesbloqueada.tsx:47`).

Ainda assim o modal é superfície própria, com botões e foco próprios, e **precisa de um teste de
axe dedicado** que o abra deliberadamente.

### P0-15 [teste] `ditado` é o único dos 18 jogos sem teste dedicado

Ver a tabela em `VERIFICACOES.md` §5b. Está coberto indiretamente por `composicaoDeRodada.test.ts`
e `antessala.test.ts`, mas não tem arquivo próprio como os irmãos `escuta` e `karaoke`, que passam
pelo mesmo tipo de ramo em `montarRodada`.

---

## P1 — o design pede e o app suporta

### P0-12 [app] A grade de quatro botões do FSRS está inalcançável

Descoberto ao tentar fotografar a correção do P0-1 no app rodando: **a tela de "Errei · Difícil ·
Bom · Fácil" não aparece para nenhum cartão.**

A cadeia, com linha:

- `Study.tsx:83` — `const [scheduler] = useState<SchedulerType>('fsrs')`, **sem setter**: nunca muda.
- `Study.tsx:790` — `format = isActiveProductionOnly ? 'active-production' : scheduler === 'fsrs' && currentCard ? formatForCard(currentCard) : 'cloze'`.
- `src/lib/exercicios/progressionRules.ts:17-26` — `formatForCard` devolve **só** `mc`, `typing` ou
  `active-production`.
- `Study.tsx:821`, `:839`, `:908` — os três ramos esgotam esse contradomínio.
- `Study.tsx:984` — o `else`, "DEFAULT FLASHCARD VIEW", é onde os quatro botões moram.

Logo o `else` só roda quando `currentCard` é `undefined` — sem cartão, campos vazios.

Nos três formatos que o usuário encontra de fato, a nota é **derivada do acerto**:
`isCorrect ? 3 : 1` (`Study.tsx:895` e `:971`) e `res.correct ? 3 : 1` (`:826`). Ele nunca escolhe
entre Difícil e Bom — o FSRS-5 recebe só 1 ou 3 (e 4 na produção ativa).

É isto que explica o P0-1: os intervalos cravados no JSX puderam ficar errados indefinidamente
porque **ninguém os via**.

Travado por `tests/gradeDeRevisaoAlcancavel.test.ts`, que prova o contradomínio de `formatForCard`.
O teste não conserta: fixa o fato para que a decisão seja deliberada.

**REVISAR — decisão do dono.** O material de design da rodada anterior trata este fluxo como o
produto em si (`docs/design/auditoria-prototipo-v2/PROMPT.md`, item 6: "Sem isso não é o produto"),
e o protótipo v3 o desenha em `isPalavras` (L675-755). Três saídas possíveis, e escolher é de
produto, não de implementação:
1. tornar a grade alcançável (um quarto formato, ou a grade após o exercício) — muda a UX de revisão;
2. assumir a nota derivada e **remover** a grade como código morto — contraria o design;
3. manter as duas, com a grade sob preferência do usuário.
Enquanto não houver decisão, fica como está: a correção do P0-1 já garante que, no dia em que a
grade aparecer, ela não vai mentir.

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
