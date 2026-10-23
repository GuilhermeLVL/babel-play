# Diagnóstico: trilho, animação de entrada e acesso aos Ajustes (23/10/2026)

Só diagnóstico, nenhum código do app foi alterado. App em `dev:local` na porta 3188, banco PGlite isolado
no scratchpad (onboarding marcado como feito, seed de demonstração). Chromium e WebKit (Playwright 1.64.1).

Pasta base: `/private/tmp/claude-501/-Users-guilhermepinheirodeoliveira-dev-personal-babel-babel-play/898ab642-2ab5-4fc7-a965-c182337821d4/scratchpad/ui/`
(abaixo, `UI/` = essa pasta).

- Prints: `UI/shots/chromium/` e `UI/shots/webkit/` (`<L>x<A>-<tema>-<tela>[-mais].png`). Tamanhos: 1440×900, 1280×800,
  1024×768, 768×1024, 375×812, mais 1280×720 e 1024×600 (Início, Intérprete e Ajustes). Nove telas, claro e escuro,
  com o "Mais" aberto (Início, Intérprete, Ajustes).
- Medidas objetivas por print: `UI/medidas-chromium.json`, `UI/medidas-webkit.json` (script `UI/prints.mjs`).
- Animação: `UI/anim/<motor>-<tamanho>/` (quadros PNG a cada ~70 ms, vídeo `.webm` e `log.json` por quadro de rAF;
  script `UI/anim.mjs`, resumo `UI/resumir.mjs`).
- Cliques: `UI/cliques/` (script `UI/cliques.mjs`).

Chromium e WebKit deram **exatamente os mesmos achados** no trilho. Nada é específico do Safari.

---

## 1. Bugs (do mais grave ao menos grave)

### B1. O Intérprete abre deslocado 108 px para a direita e "pula" para o lugar no fim da animação (GRAVE)

- **Onde:** computador e tablet (largura > 720 px), claro e escuro, Chromium e WebKit. Ao abrir o Intérprete pelo trilho
  (de qualquer tela), ao sair dele, e ao abrir o "Mais" por cima dele.
- **Prints:** `UI/anim/chromium-1440x900/inicio-a-interprete-08-594ms.png` (no meio: as duas metades fora do lugar, uma
  faixa vazia de 108 px entre o trilho e o conteúdo, tudo desfocado) e `...-13-1020ms.png` (o fim). Vídeo:
  `UI/anim/chromium-1440x900/inicio-a-interprete.webm`.
- **Medida (log por quadro):** durante 600 ms a `.int` fica em `x = 216..236`, largura 1224; no último quadro salta para
  `x = 108`, largura 1332. Igual no WebKit. Na saída (Intérprete → Início) ela salta de 108 para 216 já no primeiro quadro.
  Com o "Mais" aberto ela vai para `x = 255`, 1138×837 e fica lá.
- **Causa:** a `.int` da página é `position: fixed; left: 108px` (`src/styles/modoInterprete.css:17` e `:31-35`). Quando a
  camada de transição anima a `.px-tela` com `transform` + `filter`, a `.px-tela` vira o bloco de contenção dos filhos
  `fixed`, e o `left: 108px` passa a contar a partir dela (que já começa em x = 108). Isso acontece em três lugares:
  - entrada: `src/lib/polimento/telas.ts:235`. A raiz da captura (`div.flex-1.flex.flex-col...`) não é `.q-palco` nem `.tela`,
    então `pecas()` (`telas.ts:216-225`) não acha bloco nenhum e cai em `anima(tela, ENTRA(...))`: escala + translateY +
    `blur(8px)` **na `.px-tela` inteira**, por 620 ms;
  - saída: `telas.ts:282-289` (`translateY/scale/blur` com `fill: 'forwards'`);
  - "Mais"/folha aberta: `.px-recuado .px-tela { transform: scale(0.93); filter: blur(3px) }`
    (`src/styles/polimento/efeitos.css:44`, também `polimento.css:171`).
- No celular (≤ 720) a `.int` tem `left: 0` e a `.px-tela` começa em 0, então o salto é de 0 a 7 px (quase não se vê).

### B2. Duas animações brigando na entrada do Intérprete (e da Captura): tela inteira desfocada (GRAVE, junto com B1)

- **Onde:** todos os tamanhos e temas.
- **Print:** `UI/anim/chromium-1440x900/inicio-a-interprete-08-594ms.png`; Captura: `UI/anim/chromium-1440x900/inicio-a-capturar-09-*.png`.
- **Causa:** além da `.px-tela` inteira entrando com escala e desfoque (B1), a própria conversa roda a entrada dela ao montar:
  `entradaDaConversa()` (`src/lib/polimento/interprete.ts:20-45`, chamada em
  `src/components/views/captura/interprete/ConversaDoPrototipo.tsx:208`). As metades vêm de −60/+60 px, a faixa cresce de
  `scaleX(0.6)` e o botão Ouvir de `scale(0.4)`, tudo ao mesmo tempo que a tela inteira desce, encolhe e desfoca. Por isso a
  faixa de cima e as metades aparecem desalinhadas entre si. Na Captura acontece o mesmo fallback: a tela inteira entra
  desfocada por 620 ms, e as peças do cabeçalho (o chip "Vai rodar no aparelho", o microfone, o botão de ajustes) chegam depois
  (deslocamento de layout).
- Em dev o log mostra cada animação da conversa **duas vezes**, por causa do `StrictMode` (`src/main.tsx:60`). Só acontece em dev,
  mas confunde quem testa localmente.

### B3. ~350 ms de tela vazia na primeira visita a cada tela (GRAVE para a sensação de "não fluido")

- **Onde:** todas as telas, todos os tamanhos, os dois motores. Na primeira ida a Intérprete, Captura, Jogar, Ajustes,
  Biblioteca etc.
- **Print:** `UI/anim/chromium-1440x900/inicio-a-interprete-05-387ms.png`: só o fundo e o botão do iChat, sem conteúdo.
- **Medida:** a tela de antes some em ~200 ms e a nova só aparece entre 535 e 600 ms, ou seja, 320 a 410 ms de nada. Na
  **segunda** visita à mesma tela o vazio cai para 50 a 110 ms (`UI/gap.mjs`: Jogar 381 → 109 ms, Biblioteca 355 → 52 ms).
  Na primeira visita o `Suspense` mostra o fallback (`.carregando-da-tela`), que fica invisível porque a `.px-tela` continua
  com opacidade 0.
- **Causa provável:** as telas são `lazyComRecarga(...)` (`src/App.tsx:24-31`, `src/lib/lazyComRecarga.ts:25-28`), um
  `lazy(async () => ...)`. A pré-carga (`src/lib/polimento/precarga.ts`, `pedirTela`) baixa o `import()` cru, mas o `lazy` do
  React ainda não foi resolvido: no primeiro render ele suspende mesmo com o módulo em cache, e o React 19 segura o fallback por
  ~300 ms (o throttle do Suspense). Isso bate com os ~350 ms, e a pré-carga de Jogar (que é pré-carregado no ocioso) não evitou.
  Some com a saída de 150 ms (`telas.ts:272-289`), e a pessoa vê a tela sair, um vazio e depois a entrada.
  _Medido em dev (Vite). Vale confirmar no build de produção, mas o mecanismo é o mesmo._

### B4. Trilho estoura em altura entre 641 e ~860 px: "Buscar" cobre "Planos" (GRAVE no computador comum)

- **Onde:** 1280×800 e 1024×768 (24 de 24 prints em cada tamanho, claro e escuro), 1280×720, Chromium e WebKit. Uma tela de
  1440×900 real no Chrome/Safari tem ~780–820 px úteis de altura, então cai aqui também.
- **Print:** `UI/shots/chromium/1280x800-claro-inicio.png`: "Planos" cortado pela metade, "Self-host (tudo liberado)" escondido
  atrás de "Buscar ⌘K".
- **Medida:** o conteúdo do trilho tem 842 px (logo 44 + 8 destinos de 64 px + Planos com o estado, 89 px + gaps de 8 + Buscar
  77 + Mais 64). Com 800 px, `scrollHeight 842 > clientHeight 800`. Buscar ocupa y = 635–712 sobre Planos (580–669). Em 1280×720
  "Buscar" também cobre "Progresso" e "Mais" cobre "Planos".
- **Causa:** `src/styles/quest.css`:
  - `.q-trilho { overflow-y: auto }` (`:47`) e Buscar/Mais `position: sticky; bottom: 0 / 72px` com `box-shadow` da cor do fundo
    (`:117-130`). Quando o trilho rola, os dois botões presos ao pé ficam **por cima** dos itens, que passam por baixo;
  - o modo compacto só entra com `max-height: 640px` (`:138`), então nada aperta entre 641 e 860 px;
  - "Planos" ganhou a linha de estado (`.q-estado`, `:103-109`, `TrilhoDoQuest.tsx:360-364`) e ficou 25 px mais alto;
  - não há sinal visual de que o trilho rola (sem degradê nem barra).

### B5. Em 1024×600 (janela baixa) "Planos" some atrás de "Buscar" e "Mais", mesmo no modo compacto (MÉDIO)

- **Print:** `UI/shots/chromium/1024x600-claro-interprete.png`: Planos não aparece, e Buscar fica colado em Progresso.
- **Medida:** com o compacto ligado o conteúdo ainda tem 676 px para 600; Planos (458–537) fica embaixo de Buscar (465–532) e de
  Mais (536–590).
- **Causa:** a mesma de B4 (`quest.css:117-130`, `:138-155`). Com 8 destinos o compacto não basta.

### B6. Botão flutuante do iChat cobre conteúdo e botões (MÉDIO)

- **Onde:** 375×812 (Biblioteca: o botão "Retomar captura" fica cortado embaixo do iChat), 1280×800 (cobre o "0/1" do último
  cartão de missão), 768×1024. Também aparece sozinho na tela vazia de B3.
- **Prints:** `UI/shots/chromium/375x812-claro-biblioteca.png`, `UI/shots/chromium/1280x800-claro-inicio.png`.
- **Causa:** `.fab { position: absolute; right: 22px; bottom: 22px }` e, no celular, `bottom: 80px` (`src/styles/prototipo.css:352`,
  `:420`). O conteúdo não reserva o espaço dele no computador. No celular a reserva de 156 px (`polimento/celular.css`, regra
  `:is(.q-palco,.rolagem)`) vale só no fim da rolagem, e o meio da tela continua coberto.

### B7. "Personaliza-r" quebrado no meio da palavra no painel "Mais" do celular (BAIXO, mas visível)

- **Onde:** 375×812, claro e escuro, os dois motores.
- **Print:** `UI/cliques/375x812-1-mais.png` (e `UI/shots/chromium/375x812-claro-inicio-mais.png`).
- **Causa:** `html[data-px='on'] .q-mais .q-tile.em-linha b { font-size: 15px; overflow-wrap: anywhere; }`
  (`src/styles/polimento/telas.css:127`). O ladrilho tem 165 px, o texto tem 91 px, e "Personalizar" em 15 px não cabe.
  `anywhere` quebra no meio da palavra. "Ajuda e / suporte" também quebra em duas linhas.

### B8. Folha "Como isto funciona" (chip do modelo) cortada à direita no celular (BAIXO, a confirmar)

- **Print:** `UI/cliques/375x812-6-chip-do-modelo.png`: a folha encosta na borda esquerda e termina em ~355 px, com o canto
  direito arredondado e a borda esquerda reta. Parece deslocada ou capturada no meio da animação de abrir. Vale reproduzir à mão.
- No celular essa folha também não traz a linha "Modelo local · ... MB" (`src/components/views/captura/enxuta/pecas.tsx:141-147`:
  só aparece com `modelo` e `aoVerModelo`). Então pela Captura no celular não existe caminho até "Modelos no aparelho".

### Observações (comportamento intencional, mas vale saber)

- Celular: a barra flutuante fica por cima do conteúdo em todas as telas (é translúcida, de propósito). O "Capturar" elevado sai
  22 px acima da barra (`celular.css:64-75`), também de propósito.
- 768×1024 e 1024×768: o painel "Mais" (880 px de largura máxima) cobre o trilho. Tem fundo modal, então não é bug.
- Não houve rolagem horizontal da página, item fora da tela nem badge cobrindo rótulo (o seed não tem cartões vencendo; o selo
  de Cartões não foi exercitado).

---

## 2. Animação: o que se vê e por quê

Sequência medida ao tocar em "Intérprete" a partir do Início (1440×900; WebKit dá o mesmo resultado com ±20 ms):

| t (ms)   | o que acontece                                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–200    | o Início sai: `.px-tela` com opacidade 1→0, `scale(0.985)`, `translateY(-18px)`, `blur(5px)` (`telas.ts:286-290`)                                                                                                                         |
| 200–550  | **nada na tela** (só o fundo e o iChat): `Suspense` em fallback na primeira visita (B3)                                                                                                                                                   |
| ~550     | a conversa monta. A `.px-tela` começa a entrar (`ENTRA(28)`: opacidade, `translateY(28px) scale(0.96)`, `blur(8px)`, 620 ms, `telas.ts:235`) **e** a conversa roda a entrada própria (metades ±60 px, faixa `scaleX`, botão `scale(0.4)`) |
| 550–1140 | a `.int` (fixed) fica deslocada 108 px para a direita e cortada, porque a `.px-tela` transformada virou o bloco de contenção dela (B1)                                                                                                    |
| ~1140    | fim da animação da `.px-tela`: o Intérprete **pula 108 px para a esquerda** e ganha 108 px de largura                                                                                                                                     |

Em resumo, o que está quebrado: (a) um vazio de ~350 ms; (b) duas animações simultâneas e desencontradas; (c) a tela inteira
desfocada e encolhida; (d) um salto de 108 px no fim. Ajustes e Jogar só têm (a) e a cascata normal, que nelas funciona
porque têm `.q-palco`. Captura tem (a) e (c), sem salto (não tem `fixed` com `left`).

`prefers-reduced-motion`: como as animações nascem ligadas (`babel.animations_enabled` = true,
`src/lib/estado/useAparencia.ts:82-89`), `body.animations-on` faz `reduz()` ignorar o sistema (`src/lib/polimento/base.ts:67-72`).
Quem pede movimento reduzido só é atendido porque o Modo desempenho liga sozinho nesse caso (`reduzirEfeitos()`). Com o Modo
desempenho desligado à mão, a pessoa recebe o desfoque e os saltos mesmo pedindo menos movimento no sistema.
View Transitions (`src/lib/movimento/revelar.ts`) só são usadas na troca de tema e não participam da troca de tela.

**Direções de correção (para decidir, não aplicadas):**

1. Não animar `transform`/`filter` na `.px-tela` quando a tela tem filho `fixed`: dar à raiz da captura e do Intérprete a classe
   `.q-palco`/`.tela` (aí a cascata anima as peças), ou pular `entrar()` e `.px-recuado` para essas telas, ou tirar o
   `position: fixed` da `.int[data-pagina]` (ela já convive com o trilho e pode ser `absolute`/fluxo normal dentro da `.px-tela`).
2. Uma entrada só para o Intérprete: ou a `.px-tela` ou a `entradaDaConversa`.
3. Vazio de 350 ms: pré-carregar o `lazy` de verdade (guardar o módulo resolvido e renderizar o componente direto) ou só soltar a
   saída quando o pedaço estiver pronto. Medir no build de produção antes.

---

## 3. Acesso aos Ajustes e a "Modelos no aparelho"

Pontos de entrada hoje:

- **Trilho:** não tem Ajustes. No computador são 8 destinos + Buscar + Mais (`NO_TRILHO`, `TrilhoDoQuest.tsx:84`).
- **Mais:** ladrilho "Ajustes" (2º no computador, depois de Personalizar; 5º no celular, depois de Intérprete, Biblioteca,
  Progresso e Personalizar). Na aba "Avisos" do Mais há "Preferências de notificação", que leva a Ajustes → Notificações.
- **Cabeçalho da Captura:** o botão de controles deslizantes "Ajustes da captura" (`CapturaDoPrototipo.tsx:230`) abre o painel
  "Dispositivos e modelos de IA". Ele **não** leva a Ajustes nem a "Modelos no aparelho" (verificado: nenhum botão com
  "Ajustes" e nenhum texto "Modelos no aparelho" no painel).
- **Chip do modelo na Captura** ("Vai rodar no aparelho"): abre "Como isto funciona" → linha "Modelo local · 209 MB" → painel do
  modelo → "Ver todos os modelos" (`ModeloNoDispositivo.tsx:256`, `LiveCapture.tsx:3881-3884`) → Ajustes → Processamento.
  Só no computador (no celular a linha não aparece, B8).
- **Intérprete:** nenhuma entrada (só o trilho/Mais).
- **Outros:** `Metrics.tsx:596` e `FaixaDaConta.tsx:110` (Planos) têm um botão para Ajustes.
- A aba **não vai para a URL**: Ajustes → Processamento continua em `/ajustes`. Não dá para deixar link nem favorito direto.

Contagem de cliques (medida):

| De                               | Até Ajustes                                                     | Até "Modelos no aparelho"                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qualquer tela, computador/tablet | 2 (Mais → Ajustes)                                              | 3 (Mais → Ajustes → aba "Processamento", a 4ª de 6). O título fica em y = 634 em 1440×900; em janelas mais baixas é preciso rolar (fica abaixo do painel de motores de IA) |
| Qualquer tela, celular 375       | 2 (Mais → 5º ladrilho)                                          | 3 cliques **+ rolar a barra de abas para o lado** ("Processamento" fica em x = 448, fora da tela) **+ rolar a página** (título em y = 916 de 812)                          |
| Captura, computador              | 2 (Mais → Ajustes; o botão de ajustes do cabeçalho não leva lá) | 3 pelo chip do modelo (chip → "Modelo local" → "Ver todos os modelos") ou 3 pelo Mais                                                                                      |
| Captura, celular                 | 2                                                               | só pelo Mais (3 + 2 rolagens)                                                                                                                                              |
| Intérprete                       | 2                                                               | 3 (+ rolagens no celular)                                                                                                                                                  |

Por que parece escondido: o rótulo "Mais" não diz "Ajustes"; o ícone de engrenagem só aparece depois do primeiro clique; o
botão da Captura que _parece_ ajustes (controles deslizantes, "Ajustes da captura") abre outra coisa; "Modelos no aparelho" fica
numa aba chamada "Processamento", que no celular nem aparece na tela; e não há link direto por URL.

---

## Processos

Servidor de dev (porta 3188, banco no scratchpad) e navegadores Playwright foram encerrados ao final; o pid 5978 (porta 3177)
não foi tocado. O boot do servidor isolado **copiou** `data/secret.key` para o scratchpad (o log diz "movida", mas o original
continua em `data/secret.key`, sem alteração).
