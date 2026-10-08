<!-- Inventário do protótipo (fonte: babel-play-lab/docs/prototipos/polimento-movimento-src). É a ESPECIFICAÇÃO da passada de fidelidade: cada item fecha com prova lado a lado. Estado dos itens: ver estado.md ao lado. -->

# Inventário da camada de minijogos do protótipo

Base: `C:\Users\Guilh\OneDrive\Área de Trabalho\babel-play-lab\docs\prototipos\polimento-movimento-src\` (todos os `arquivo:linha` abaixo são relativos a ela).

Li por inteiro os 10 arquivos pedidos e as rodadas 11–14 de `auditoria.html` (198–265). Fora deles, resolvi apenas helpers em `prototipo.js`, `sentidos.js`, `telas.js` e o CSS de produção embutido em `captura.json` (`/css/1/text`), onde vivem `.hud`, `.combo`, `.fim`, `.letra` etc. Nada foi executado: tudo vem de leitura do código.

## 0. Divergências e pontos ambíguos (ler antes de portar)

| # | Achado | Onde |
|---|---|---|
| A | **O "pulso após 2 erros" está quebrado como escrito.** Usa `$('…', tela).filter(...)`, mas `$` é `querySelector` (devolve Element, sem `.filter`). No 2º erro seguido isso lança `TypeError` dentro de `pjErro`, depois de `erroBase` já ter rodado; o código do chamador após `pjErro(...)` (ex.: `i++; pjDepois(...)`) não executaria. A intenção é `$$`. Portar a intenção, não o bug. | `jogos4.js:130`; `prototipo.js:11-12` |
| B | **Textos de nível divergem do código nos tempos.** `pjSeg(15)` no Fácil dá `Math.round(22.5)` = **23 s**, mas `DIF` diz "22 segundos" (Choseong, Shiritori). `pjSeg(30)` no Difícil dá **23 s**, mas `DIF.taboo` diz "22 segundos por carta". | `jogos4.js:26-28, 36, 41, 42` |
| C | **Efeitos de nível não descritos em `DIF`:** Tabu no Fácil também cai para 3 alternativas (via `distr`); Conectores no Fácil também baixa o limiar para 60; no Duelo o corte da ajuda vira 1 no Fácil. | `jogos.js:82, 775`; `jogos2.js:545, 807` |
| D | **"Chave de primeira jogada" não existe.** O onboarding usa um `Set` em memória (`jaViu`), sem storage; reaparece a cada carregamento da página. | `jogos4.js:185, 247-249`; `auditoria.html:254` |
| E | **Não há botão de pausa.** A pausa (`pjPausar`) só acontece quando a explicação abre. O comentário "voltar e pausar em cima" em `celular.css:232` não tem marcação correspondente. | `jogos4.js:100-116, 189` |
| F | **Botão Recomeçar do cabeçalho:** a auditoria diz que fica escondido em produção e que foi mantido assim. Não achei regra que o esconda nos arquivos lidos; só a de celular que o reduz a ícone. | `auditoria.html:218`; `jogos.js:128`; `celular.css:237-238` |
| G | **Com a sugestão de nível, "Próximo jogo" deixa de ocupar a linha inteira.** `.pj-fim-acoes .btn:first-child { grid-column: 1/-1 }` passa a pegar a sugestão, inserida com `afterbegin`. | `jogos.css:219`; `jogos4.js:151`; `jogos4.css:7` |
| H | **Código morto, não portar:** `comoSeJoga()` (substituída por `abrirOnb`), as cenas antigas de Rali e Mala em `jogos2.js` e seus CSS `.pj-quadra/.pj-bola/.pj-rede/.pj-rali/.pj-mala/.pj-itens/.pj-pergunta/.pj-selo`, as minis antigas de `tenis`/`koffer`, e `.rl-tempo` (sem marcação). | `jogos.js:345-357`; `jogos2.js:145-283`; `jogos.css:165-188`; `minis.js:19-20`; `jogos3.css:51` |
| I | **`.estrelas-fim span` base:** a captura perdeu nome e duração da animação (shorthand vazio); só sobra `animation-delay: calc(var(--i)*.15s)`. A regra `.fim .estrelas-fim span.on` está completa (seção 8). | `captura.json` |
| J | **Karaokê não usa microfone:** a nota é sorteada (72–98). | `jogos2.js:630-634` |
| K | **Mala no Difícil:** a tradução some só das etiquetas da paleta; dentro da mala aberta os compartimentos continuam mostrando `<small>` com a tradução. | `jogos3.js:194, 215` |
| L | **Nível em `sessionStorage`**, não `localStorage`: vale só enquanto a aba está aberta. | `jogos4.js:18, 82`; `jogos5.js:13, 20-21` |

## 1. Motor comum

### 1.1 Constantes de movimento, som e vibração

| Nome | Valor | Ref |
|---|---|---|
| `EO` (padrão de `anima`) | `cubic-bezier(0.23, 1, 0.32, 1)` | `prototipo.js:35` |
| `EIO` | `cubic-bezier(0.77, 0, 0.175, 1)` | `prototipo.js:36` |
| `EG` | `cubic-bezier(0.32, 0.72, 0, 1)` | `prototipo.js:37` |
| `MOLA` / `--px-mola` | `linear()` de mola ζ=0.5 (44 pontos, `zw=6.9`); fallback `cubic-bezier(0.34, 1.56, 0.64, 1)` | `prototipo.js:39-52` |
| `MOLA_SUAVE` / `--px-mola-suave` | mola ζ=0.72; fallback `EG` | `prototipo.js:51-53` |
| `--ease` (produção) | `cubic-bezier(.16, 1, .3, 1)` | `captura.json` |
| `anima(el, quadros, {d=240, atraso=0, e=EO, fill='backwards'})` | duração e atraso × `K()` | `prototipo.js:55-61` |
| `K()` | 5 em câmera lenta, senão 1 | `prototipo.js:21` |
| `pjDepois(ms, fn)` | `setTimeout(ms*K())`, cancelado ao sair ou recomeçar | `jogos.js:169-172` |
| `reduz()` | só quando `data-px-acess='on'` e `prefers-reduced-motion` | `prototipo.js:25` |

`sentir(nome)` toca `SONS[nome]` e vibra `TATO[nome]`, só no modo polido (`sentidos.js:94-111`). `nota(f, {t, d, tipo, g, f2})` é um oscilador com ataque de 6 ms e ganho mestre 0.55 (`sentidos.js:20-42`).

| Nome | Som | Vibração (ms) | Ref |
|---|---|---|---|
| `acerto` | 659, 988, 1319 Hz; passo 70 ms; d 0.22; g 0.1; triangle | `[10,30,16]` | `sentidos.js:76, 89` |
| `erro` | 196→150 Hz square d 0.16 g 0.12; depois 150→120 Hz em t 0.12, d 0.18, g 0.1 | `[30,40,30]` | `sentidos.js:74, 88` |
| `sucesso` | 523, 659, 784, 1047; passo 75 ms; d 0.24; g 0.1; triangle | `[10,50,10,50,18]` | `sentidos.js:73, 88` |
| `aviso` | 880 (d 0.12, g 0.08) + 1320 em t 0.07 (d 0.18, g 0.06) | `[8,40,8]` | `sentidos.js:72, 88` |
| `festa` (disparado por `confete`) | 523, 659, 784, 1047, 1319, 1568; passo 60 ms; d 0.3; g 0.09 + sopro 0.6 s | `[15,40,15,40,30]` | `sentidos.js:83, 89, 148` |
| `vira` (também em todo `girar`) | sopro 0.09 s 1200→3400 + 420→640 Hz d 0.05 | 8 | `sentidos.js:75, 89, 153` |
| `abre` / `fecha` (também na folha) | sopro 0.22 s + 330→660 / sopro 0.16 s + 620→310 | 10 / 6 | `sentidos.js:70-71, 142-143` |
| `aba` | 700→940 Hz, d 0.06, g 0.08 | 6 | `sentidos.js:69` |
| `moeda` | 1318, 1760, 2093; passo 55 ms; d 0.16; g 0.06 | `[8,30,8]` | `sentidos.js:77` |
| `liga` | 660→990, d 0.07, g 0.08 | 10 | `sentidos.js:78` |
| `grava` | 440 (0.09) + 660 em t 0.09 (0.12) | 14 | `sentidos.js:80` |
| `fala` | 1250 Hz, d 0.03, g 0.025 | nenhuma | `sentidos.js:82` |
| `tique` | 1040 Hz square, d 0.04, g 0.05 | 5 | `jogos.js:46, 55` |
| `conta` | 520 Hz triangle, d 0.14, g 0.1 | 10 | `jogos.js:47, 55` |
| `vai` | 784 + 1175 Hz triangle, d 0.3, g 0.1 / 0.08 | 22 | `jogos.js:48, 55` |
| `tecla` | 820 + rand·260 Hz triangle, d 0.03, g 0.04 | 5 | `jogos.js:49, 55` |
| `encaixa` | 560→840 triangle, d 0.07, g 0.08 | 8 | `jogos.js:50, 55` |
| `solta` | 700→460 triangle, d 0.06, g 0.06 | 6 | `jogos.js:51, 55` |
| `quique` | 240→520 sine, d 0.1, g 0.11 | 12 | `jogos.js:52, 55` |
| `sobe` | 392, 523, 659, 784; passo 60 ms; d 0.18; g 0.09; triangle | `[10,30,10,30,20]` | `jogos.js:53, 55` |

A voz é `speechSynthesis`: `en-US` por padrão, taxa 0.95 (0.6 em "devagar"), timeout de 7000 ms (`jogos.js:95-112`).

### 1.2 Casca da partida (`cascaDaPartida`, `jogos.js:123-141`; selo de nível em `jogos4.js:95-99`)

```
div.rolagem.w-full > div.tela.larga.entra
  header.cab
    button.voltar                      [chevron-left] "Jogar"
    div.cab-linha
      div.cab-texto
        span.sobrancelha               [ícone do jogo] <span>{rodada}</span>
        h1                             {titulo}
      div.cab-acoes
        button.btn.btn-outline.peq.pj-nivel   data-pj="nivel" data-nivel="{facil|medio|dificil}"   [gauge] {Fácil|Médio|Difícil}
        button.btn.btn-outline.peq            data-pj="como"       [circle-question-mark] "Como se joga"
        button.btn.btn-outline.peq            data-acao="recomecar" [rotate-ccw] "Recomeçar"
  section.palco-jogo.px-partida#palco  data-qj="{id}"
    div.hud  role=group aria-label="Placar da rodada"
      div.hud-bloco > small "Pontos" + b.tn[data-pj=pontos] "0"
      div
        div.entre (font-size 12px; margin-bottom 5px) > span.mut[data-pj=rotulo] + span[data-pj=relogio][hidden]
        div.hud-progresso.pj-progresso  role=progressbar aria-label="Progresso da rodada" > span (width 0%)
        div.hud-progresso.hud-tempo[hidden] > span (width 100%)
      div.hud-ajudas > button.btn.btn-outline.peq.ajuda-jogo[data-ajuda=k] title="…" : [ícone] {rótulo} <span class="n">{n}</span>
      span.combo > small "×" + "1" + em
    p.pj-instr   {instr}
    div.pj-miolo
```

- **Selo de nível:** só existe se `DIF[id]` existe (16 jogos; fora Cadavre e Karaokê). Fica em `.cab-acoes`, imediatamente antes de "Como se joga". `aria-label="Nível de dificuldade: {nome}. Toque para trocar"`.
- **Cor do selo:** `facil` usa borda `color-mix(in srgb, var(--good) 55%, var(--border-subtle))` e texto `--good-ink`; `dificil` usa o mesmo com `--error` / `--error-ink`; `medio` é o outline normal (`jogos4.css:5-6`).
- **Clique no selo:** abre a explicação direto na tela 3 (`abrirOnb(2)`, `jogos4.js:257`).
- **Botão de ajuda:** `title` = "Conta como dica: zera o combo" ou "De graça". O `<span class="n">` só aparece se a quantidade é finita. Desabilitado: `opacity .4; cursor: not-allowed` (`jogos.js:126`; `jogos.css:14-15`).
- **Rótulo de progresso:** `"{feitos} de {total} {unidade}"` (`jogos.js:179`). Antes do onboarding de primeira vez: `"Antes de começar"` (`jogos4.js:251`).
- **Navegação** (`jogos.js:368-371`): `.voltar` e `data-pj="jogos"` vão para `jogar`; `data-acao="recomecar"` chama `abrirJogo(pjId)`; `data-pj="proximo"` chama `abrirJogo(data-id)`.
- **Teclado:** `keydown` é ignorado com Ctrl/Meta/Alt ou com `dialog[open]` (`jogos.js:377-380`).

CSS da casca:

| Elemento | Valores | Ref |
|---|---|---|
| `.palco-jogo` | `border-radius: 22px; padding: 22px; border: var(--bw-card)` (2px) `solid var(--border-subtle); box-shadow: var(--shadow-card); overflow: hidden; isolation: isolate`; fundo `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--accent-soft) 60%, var(--surface)), var(--surface) 70%)`; `::before` com pontilhado `radial-gradient(color-mix(in srgb, var(--ink) 9%, transparent) 1px, transparent 1.5px)`, 22×22 px, opacidade .6 | `captura.json` |
| `.px-partida` | `--pj-raio: 16px` | `jogos.css:9` |
| `.hud` | grid `auto minmax(0,1fr) auto auto; align-items: center; gap: 14px; margin-bottom: 16px` | `captura.json`; `jogos.css:10` |
| `.hud-bloco` | coluna, `min-width: 64px`; `small`: `700 9.5px var(--font-mono)`, `letter-spacing .12em`, maiúsculas, `--ink-muted`; `b`: tabular-nums | `captura.json` |
| `.hud-progresso` | `height: 10px; border-radius: 99px; background: var(--hud-trilho, var(--surface-sunken)); box-shadow: inset 0 1px 2px rgba(0,0,0,.12)`; `span`: `linear-gradient(90deg, var(--good), color-mix(in srgb, var(--good) 60%, #fff))`; no modo polido `transition: width calc(600ms * var(--px-k)) var(--px-ease-out)` (base: `.45s var(--ease)`) | `captura.json`; `polimento.css:263-266` |
| `.hud-tempo` | `margin-top: 5px; height: 6px`; `span`: `linear-gradient(90deg, var(--accent), var(--warn)); transition: width .25s linear` | `jogos.css:11`; `captura.json` |
| `[data-pj=relogio]` | `800 12px var(--font-mono)`, tabular-nums; texto `"{s}s"` | `jogos.css:13`; `jogos.js:262` |
| `.hud-ajudas` | `display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end` | `captura.json` |
| `.btn.peq` | `min-height: 34px; padding: 0 12px; font-size: 12.5px` | `captura.json` |
| `.combo` | `inline-flex; align-items: baseline; gap: 2px; padding: 4px 12px; border-radius: var(--hud-raio, 12px); background: var(--hud-combo, var(--surface-hover)); font: 900 22px/1.1 var(--font-display); color: var(--ink-muted); transition: background-color .2s, color .2s`; `small` 12px; `em`: bloco, maiúsculas, `letter-spacing .06em`, `opacity .85`, `margin-left 6px`, `max-width 78px`, `line-height 1.2` | `captura.json` |
| `.combo.quente` | `background: linear-gradient(135deg, var(--warn), var(--accent)); color: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 30%, transparent), 0 8px 20px -6px color-mix(in srgb, var(--accent) 60%, transparent)`; polido: `transform .5s var(--px-mola)` | `captura.json`; `jogos.css:242` |
| `.combo-chama` | `position: absolute; right: -9px; top: -11px; 17×17px; color: var(--warn)`; `chama .6s ease-in-out infinite alternate` → `translateY(-3px) rotate(8deg) scale(1.1)` | `captura.json` |
| `.pj-instr` | flex centrado, `gap 8px; margin: 0 auto 16px; max-width: 62ch; font-size: 13.5px; color: var(--ink-muted); text-wrap-style: balance` | `jogos.css:17` |
| `.pj-miolo` | coluna centrada, `gap: 16px; min-height: 300px` | `jogos.css:19` |
| Cabeçalho em tela de jogo | `.cab { margin-bottom: 14px }`, `h1 { font-size: 24px; margin: 2px 0 0 }`, `.tela { padding-bottom: 72px }` | `captura.json` |
| ≤720px | `.px-partida { padding: 14px; border-radius: 20px }`; `.hud` em 3 colunas com `gap: 8px 12px`; `.hud-ajudas` ocupa a linha toda (`grid-column: 1/-1; order: 5; justify-content: flex-start`), botões `min-height: 40px`; `.combo em` escondido; `h1` 20px; Recomeçar vira só ícone 18px; selo de nível `padding: 0 12px` | `jogos.css:245-250`; `jogos3.css:157`; `celular.css:204, 233-239`; `jogos4.css:70` |

### 1.3 Pontos e combo

| Regra | Valor | Ref |
|---|---|---|
| Multiplicador `multDe(seq)` | ≥15 → ×5; ≥10 → ×4; ≥6 → ×3; ≥3 → ×2; senão ×1 | `jogos.js:81` |
| Acerto | `10 × mult + bonus`; `seq++`; `feitos++` (salvo `semProgresso`) | `jogos.js:224-233` |
| Acerto com dica (`comDica`) | vale 10 (mult 1), e `seq` vai a 0 | `jogos.js:225-230` |
| Difícil | +5 de bônus em todo acerto, inclusive com dica | `jogos4.js:117-122` |
| Erro | `erros++; seq = 0; comDica = false`; `feitos++` só com `{conta: true}` | `jogos.js:240-244` |
| Contagem dos pontos | 420 ms, ease-out cúbico (`1-(1-p)^3`) | `jogos.js:176`; `prototipo.js:141-152` |
| Rótulo do combo | `<small>×</small>{m}<em>{seq} seguidas</em>` (o `em` só com `seq > 1`); chama se `m > 1`; `aria-label="Multiplicador {m}, {seq} seguidas"` | `jogos.js:184-188` |
| Multiplicador sobe | `selo("Combo ×{m}")` + `vinheta('combo')` + combo `scale(1) → scale(1.5) rotate(-8deg) → scale(1)`, 640 ms, `MOLA` | `jogos.js:189-193` |

### 1.4 Retorno de acerto e erro

| Evento | O que dispara | Ref |
|---|---|---|
| Acerto | `sentir('acerto')`; `flutuar("+{g}" + " ×{m}" se m > 1, 'good')`; `vinheta('acerto')`; `rajada(centro, 14, 1)` | `jogos.js:234-238` |
| Erro | `sentir('erro')`; `vinheta('erro')`; `tremer(el)`; `flutuar(msg, 'erro')` se houver mensagem | `jogos.js:245-249` |
| `.ganho` (texto flutuante) | `position: fixed; z-index: 200; font: 900 15px var(--font-display); translate: -50% -100%`; posição `top = y − 8`; `sobe-ganho 1.1s var(--ease) forwards`: 0% `opacity 0; translate(-50%, 6px) scale(.8)` → 20% `opacity 1; translate(-50%, -4px) scale(1.08)` → 100% `opacity 0; translate(-50%, -46px) scale(1)`; removido em 1200 ms; cores: `.good` `--good-ink`, `.erro` `--error-ink`, padrão `--accent-ink` | `jogos.js:196-201`; `jogos.css:16`; `captura.json` |
| `.fx-vinheta` | `position: fixed; inset: 0; z-index: 125`; `vinheta .6s ease-out forwards` (opacidade 1 → 0); removida em 650 ms | `jogos.js:203-208`; `captura.json` |
| Vinheta `acerto` | `inset 0 0 90px color-mix(in srgb, var(--good) 30%, transparent)` | `captura.json` |
| Vinheta `erro` | `inset 0 0 0 3px color-mix(… var(--error) 70% …), inset 0 0 120px color-mix(… var(--error) 45% …)` | `captura.json` |
| Vinheta `combo` | `inset 0 0 0 3px color-mix(… var(--warn) 70% …), inset 0 0 140px color-mix(… var(--warn) 40% …)` | `captura.json` |
| `tremer` | classe `.pj-treme` = `treme .4s ease` (20%/60% `translate(-8px)`; 40%/80% `translate(8px)`); removida em 450 ms | `jogos.js:209-215`; `jogos.css:29` |
| `selo(t, classe)` | `.selo-combo`: `position: absolute; left: 50%; top: 38%; z-index: 6; font: 900 clamp(28px, 6vw, 54px)/1 var(--font-display); color: var(--warn-ink)`; `selo 1s cubic-bezier(0.34,1.56,0.64,1) forwards`: 0% `scale(.3) rotate(-12deg)` op 0 → 25% `scale(1.15) rotate(3deg)` → 70% `scale(1)` → 100% `scale(1.05) translateY(-30px)` op 0; removido em 1050 ms. `.fever`: `--accent-ink`, `clamp(34px, 7vw, 64px)` | `jogos.js:216-222`; `captura.json` |
| `rajada(x, y, 14, 1)` | 14 partículas; velocidade 110–330; raio 2–5.5; gravidade 520 | `prototipo.js:808-815` |

### 1.5 Relógio e contagem

| Regra | Valor | Ref |
|---|---|---|
| Passo do relógio | `setInterval` de 100 ms; largura da barra = `resto/total` | `jogos.js:251-275` |
| Estado "pouco" | `resto ≤ min(10000 ms, total × 0.34)`: barra `.pouco` (`background: var(--error)` + `pisca-leve .5s ease-in-out infinite`, 50% `opacity .55`); palco `.tenso` (`tenso 1s ease-in-out infinite`, 50% `inset 0 0 0 3px color-mix(… var(--error) 45% …)`); `sentir('tique')` a cada segundo | `jogos.js:263-267`; `captura.json` |
| Tempo por nível `pjSeg(s)` | `Math.round(s × {1.5 / 1 / 0.75})` | `jogos4.js:26-28` |
| Contagem (só no Duelo) | `.fx-contagem` com "3", "2", "1", "Vai!"; 620 ms cada, 480 ms no "Vai!"; `sentir('conta')` e `sentir('vai')` | `jogos.js:283-295` |
| `.fx-contagem` | `position: absolute; inset: 0; z-index: 5; background: color-mix(in srgb, var(--canvas) 55%, transparent); backdrop-filter: blur(6px)`; `span`: `900 min(26vw, 140px)/1`, `--accent-ink`; `conta .6s cubic-bezier(0.34,1.56,0.64,1) both`: 0% `scale(2.4)` op 0 `blur(8px)` → 35% `scale(1)` → 80% `scale(.92)` → 100% `scale(.6)` op 0; `.vai`: `--good-ink`, `min(20vw, 110px)` | `captura.json` |
| Pausa `pjPausar(true/false)` | para o intervalo; ao retomar soma o tempo pausado em `rel.fim`; chama `pj.aoPausa` (só o Rali implementa: pausa e retoma as animações da bola) | `jogos4.js:100-116`; `jogos3.js:169` |

### 1.6 Peças compartilhadas pelos tabuleiros

| Peça | Valores | Ref |
|---|---|---|
| `opcoesHtml` | `div.opcoes-blitz[.tres] > button[data-op][style=--i]` (+ `<kbd>` 1–4 quando `teclas`) | `jogos.js:83-84` |
| `.opcoes-blitz` | grid de 2 colunas, `gap 12px; max-width 620px`; botão `min-height 66px; border-radius 16px; border 2px; font 800 17px var(--font-display); box-shadow 0 4px 0 var(--border-strong); padding 8px 12px`; entrada `carta-entra .35s cubic-bezier(0.34,1.56,0.64,1) backwards`, atraso `--i × 50ms`; hover `translateY(-2px)` + sombra `0 6px 0`; active `translateY(3px)`; `.certa` fundo `--good` texto branco; `.errada` `--error-soft` / `--error` / `--error-ink`; `kbd` `700 11px mono` (some em `hover: none`); `.tres` 3 colunas (1 em ≤720); ≤720: `min-height 58px; font-size 16px; gap 8px` | `captura.json`; `jogos.css:31-36, 252-254` |
| `@keyframes carta-entra` | de `translateY(30px) rotate(-6deg) scale(.7)`, opacidade 0 | `captura.json` |
| `.pj-fora` | `opacity .4; text-decoration: line-through; pointer-events: none` | `jogos.css:30` |
| `tecladoHtml(linhas, acoes, classe)` | `div.teclado > div.fila > button[data-tecla]`; na última fila: `button.largo[data-tecla=Enter]` "Enviar palpite" (só com `acoes='ambas'`) e `button.largo[data-tecla=Backspace]` "Apagar" | `jogos.js:85-91` |
| `.teclado` | grid `gap 6px; max-width 540px`; fila `gap 5px`; botão `max-width 42px; height 48px; border-radius 9px; font 800 14px; box-shadow 0 2px 0 var(--border-strong)`; active `translateY(2px)`; `.largo` `max-width 72px`; estados `.certa` `--good` / `.lugar` `--warn` (texto `#1d1a16`) / `.fora` `opacity .45`; ≤720: `height 46px; max-width 40px; font-size 13px` (`.largo` 56px); `.vogais`: `max-width 58px; height 54px; font 18px` (≤720: 54 / 52 / 17) | `captura.json`; `jogos.css:53-55, 260-265` |
| `.letra` | `aspect-ratio 1; border-radius 10px; border 2px solid var(--border-subtle); font 900 22px var(--font-display)`; `.cheia`: borda `--border-strong` + `tecla .12s ease-out` (50% `scale(1.1)`); `.certa/.lugar/.fora`: `vira-letra .5s ease-in-out backwards`, atraso `--i × .11s` (vira em `rotateX` a 49–51%); cores `--good` / `--warn` (texto `#1d1a16`) / `color-mix(in srgb, var(--ink-muted) 70%, var(--surface))` | `captura.json` |
| `.linha-termo.venceu .letra` | `pula .5s cubic-bezier(0.34,1.56,0.64,1) backwards`, atraso `--i × 80ms + .55s`; 40% `translateY(-16px) scale(1.08)` | `captura.json` |
| `.pj-acoes` | flex centrado, `gap 10px`, com quebra | `jogos.css:26` |
| `.pj-aviso` | `min-height 20px; font 13px/700; color var(--warn-ink)`; `.erro` usa `--error-ink` | `jogos.css:24-25` |
| `.pj-link` | sublinhado, `600 12px`, `--ink-muted`; hover `--warn-ink` | `jogos.css:27-28` |
| Toque (polido) | `:active` `scale(.96)` em `.pj-carta, .pj-opcao, .pj-lista button` (transição .08s); `.pj-cova:active` `scale(.93)` | `jogos.css:239-241` |

## 2. Níveis

### 2.1 Mecânica geral

| Item | Valor | Ref |
|---|---|---|
| Nomes | `{facil: 'Fácil', medio: 'Médio', dificil: 'Difícil'}` | `jogos4.js:15` |
| `nv(f, m, d)` | devolve o valor do nível atual; o Médio é a regra do app | `jogos4.js:22-24, 29` |
| Armazenamento | `sessionStorage['px.nivel']` (último escolhido, serve de padrão) e `sessionStorage['px.niveis']` (JSON `{idDoJogo: nivel}`); padrão `'medio'` | `jogos4.js:16-21`; `jogos5.js:10-25` |
| Regra por jogo | ao abrir, um jogo sem nível próprio herda o último escolhido e passa a guardá-lo; trocar o nível de outro jogo depois não o altera | `jogos5.js:27-31` |
| Troca no meio da partida | se o nível mudou enquanto a explicação estava aberta, ao fechar o jogo recomeça (`abrirJogo(pjId)`) | `jogos4.js:240` |
| Pontuação | Difícil: +5 por acerto | `jogos4.js:121` |
| Tempo | `pjSeg`: ×1.5 no Fácil, ×0.75 no Difícil | `jogos4.js:26-28` |
| Quantidade de ajudas | finitas: `max(1, n + {+1 / 0 / −1})`; infinitas ficam infinitas | `jogos4.js:72` |
| Alternativas `distr` | `nv(2, 3, 3)` distratores → 3 opções no Fácil, 4 no Médio e Difícil (Duelo, Vitendawili, Tabu) | `jogos.js:82` |
| Sem níveis | Cadavre e Karaokê. Texto: "Este jogo não tem níveis: é produção livre, sem certo ou errado contra o relógio." | `jogos4.js:194` |

### 2.2 Por jogo

Os textos de `DIF` (Fácil / Difícil) aparecem na tela 3 da explicação; o do Médio é sempre "A regra normal do jogo" e o do Difícil ganha o sufixo ". Cada acerto vale 5 pontos a mais" (`jogos4.js:191`).

| id | Texto `DIF` Fácil / Difícil | O que o código muda (F / M / D) | Ref |
|---|---|---|---|
| `memory` | "6 pares, cartas abertas por mais tempo e 3 espiadas" / "As cartas fecham rápido e só há 1 espiada" | pares 6/8/8; espera antes de comparar 900/760/560 ms; par errado fecha em 1100/520/300 ms; Espiar dura 2400/1700/1300 ms; espiadas 3/2/1 | `jogos5.js:41, 50, 73, 93, 105` |
| `wordsearch` | "Só na horizontal e na vertical, e a pista mostra a primeira letra" / "Palavras também de trás para a frente" | direções: F `[0,1],[1,0]`; M + diagonal `[1,1]`; D + `[0,-1],[-1,0]`; no Fácil a pista ganha `<em class="pj-ini">X…</em>`; Radar 4/3/2 | `jogos.js:547, 563`; `jogos4.js:32` |
| `termo` | "8 tentativas e a primeira letra já vem" / "5 tentativas" | tentativas com 1 tabuleiro 8/6/5, com 2 tabuleiros 9/7/6; no Fácil `sabe[0]` vem preenchida; Dica 3/2/1 | `jogos4.js:31, 290, 294` |
| `scramble` | "A primeira palavra já vem no lugar" / "Não diz quantas palavras estão certas" | no Fácil a 1ª palavra entra na linha já presa; no Difícil o aviso é genérico e nenhum prefixo fica verde (`certas = 0`); Dica 4/3/2 | `jogos4.js:33, 446, 491, 495` |
| `blitz` | "90 segundos e 3 alternativas" / "45 segundos" | relógio 90/60/45 s; opções 3/4/4; "Cortar 2" corta 1/2/2 e existe 3/2/1 vezes | `jogos.js:737, 775, 787`; `jogos4.js:34` |
| `karuta` | "4 cartas na mesa e 12 segundos por carta" / "6 segundos por carta" | cartas 4/6/6; 12/8/6 s por carta | `jogos2.js:20, 31` |
| `choseong` | "A primeira vogal já vem aberta; 22 segundos" / "11 segundos por palavra" | no Fácil a 1ª vogal vem presa (só se a palavra tem mais de 1 vogal); 23/15/11 s (ver divergência B); "Abrir uma vogal" 3/2/1 | `jogos4.js:35, 535-538, 543` |
| `tenis` | "Bola lenta (11 s) e a primeira letra já vem" / "Bola rápida (6 s)" | `BASE` 11/8/6 s; tempo da bola `max(ceil(BASE/2), BASE − rali)` (piso 6/4/3 s); no Fácil o campo já vem com `alvo[0]`; "Primeira letra" 3/2/1 | `jogos3.js:29, 78, 86` |
| `koffer` | "4 vidas e mais tempo para olhar a mala" / "2 vidas, menos tempo e etiquetas sem tradução" | vidas 4/3/2; mala aberta por 3600/2700/1900 ms; no Difícil a paleta perde o `<small>` de tradução | `jogos3.js:185, 194, 253` |
| `bao` | "4 erros por palavra" / "2 erros por palavra" | erros por palavra 4/3/2 | `jogos2.js:361` |
| `vitendawili` | "3 alternativas e a tradução da frase" / "Uma tentativa só por enigma" | opções 3/4/4; no Fácil aparece `<p class="mut">` com a tradução; no Difícil o 1º erro encerra o enigma | `jogos2.js:392, 400-406` |
| `shiritori` | "A letra exigida já aparece; 22 segundos" / "11 segundos por elo" | no Fácil `.pj-letra` nasce visível (senão `hidden`); 23/15/11 s (divergência B); sempre 3 opções | `jogos2.js:447, 450` |
| `taboo` | "Uma palavra proibida a menos; 45 segundos" / "22 segundos por carta" | no Fácil o 1º `<s>` já vem `.livre` e o contador mostra n−1; 45/30/23 s (divergência B); opções 3/4/4 (divergência C) | `jogos2.js:545-550` |
| `escuta` | "3 alternativas" / "Sem o botão de ouvir devagar" | opções 3/4/4; no Difícil o botão "devagar" não existe | `jogos2.js:664-665` |
| `ditado` | "Vale com 70% e há segunda chance" / "Precisa de 90%, sem segunda chance" | limiar 70/80/90 %; segunda chance só no Fácil e no Médio; Dica 4/3/2 | `jogos2.js:720-721` |
| `conectores` | "A tela diz quantos conectores procurar" / "Precisa de 80 pontos de precisão" | limiar 60/70/80 (divergência C); no Fácil aparece `label-mono` "{n} conector(es) nesta frase" | `jogos2.js:782, 807` |
| `cadavre`, `karaoke` | sem níveis | sem selo no cabeçalho | `jogos4.js:30-46, 97` |

## 3. Ajudas

### 3.1 Regras gerais

| Regra | Valor | Ref |
|---|---|---|
| Formato | `[chave, ícone, rótulo, quantidade, custa?]` | `jogos.js:125-126` |
| Ajuda que "custa" | `seq = 0` e `comDica = true`: o próximo acerto vale 10 (+5 no Difícil) e não soma combo | `jogos.js:334-338` |
| Consumo | só se o jogo aceitar (`pj.ajuda(k)` não devolver `false`); o contador `.n` desce e o botão desabilita em 0 | `jogos.js:329-344` |
| Bloqueio | ajudas próprias não funcionam com `pj.trava` ou depois do fim | `jogos.js:332` |
| `tempo` ("+10 s", ícone `timer`) | grátis; quantidade 3/2/1; só nos jogos com `tempo = true` (`blitz, karuta, choseong, tenis, shiritori, taboo`); soma 10000 ms ao fim do relógio e ajusta o total; `flutuar("+10s", 'good')`; `sentir('moeda')`; não faz nada sem relógio ativo; texto: "Devolve 10 segundos ao relógio." | `jogos4.js:66-67, 75, 159-165` |
| `resposta` ("Ver resposta", ícone `eye`) | custa; quantidade 2/1/1; em todos menos `cadavre, karaoke, koffer, memory`; mostra `<div class="pj-resp" role="status">Resposta: <b>…</b></div>` por 3600 ms; `sentir('liga')`; funciona mesmo com `pj.trava`; texto: "Mostra a resposta por um instante. O acerto vale só o mínimo." | `jogos4.js:66, 68, 76, 166-177`; `jogos5.js:43` |
| `.pj-resp` | `position: absolute; left: 50%; top: 86px` (132px em ≤720)`; z-index: 8; padding: 10px 18px; border-radius: 14px; background: var(--ink); color: var(--ink-contrast, #fff); font: 600 14px var(--font-body); box-shadow: 0 14px 30px -12px rgb(0 0 0 / .5); max-width: 92%` com reticências; `b`: `900 17px var(--font-display)`, `letter-spacing .04em`; `pj-resp 3.6s var(--ease) forwards`: 0% op 0 `translateY(-10px) scale(.92)` → 8%–86% op 1 → 100% op 0 `translateY(-6px)` | `jogos4.css:14-16, 69` |
| Zera a contagem de erros seguidos | usar `tempo` ou `resposta` (`errSeg = 0`); acerto também zera | `jogos4.js:119, 178` |

### 3.2 Pulso após erros seguidos

| Item | Valor | Ref |
|---|---|---|
| Limiar | exatamente o 2º erro consecutivo (`errSeg === 2`); o 3º não repete | `jogos4.js:127-128` |
| Qual botão pulsa | entre as ajudas habilitadas, exceto `tempo`: primeiro uma que custa e não seja `resposta`; senão a primeira livre | `jogos4.js:130-133` |
| Efeito | classe `.pj-chama` por 3600 ms + `flutuar(botão, "quer uma ajuda?")` | `jogos4.js:134-136` |
| Animação | `border-color: var(--accent)`; `pj-chama .9s ease-in-out 4` (4 repetições = 3.6 s): 0%/100% `box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); scale(1)`; 50% `box-shadow: 0 0 0 10px transparent; scale(1.06)` | `jogos4.css:10-11` |
| Estado | quebrado como escrito (divergência A) | `jogos4.js:130` |

### 3.3 Por jogo (quantidades Fácil / Médio / Difícil)

| id | Ajudas próprias | Gerais |
|---|---|---|
| `memory` | **Espiar** (`eye`, custa) 3/2/1: abre todas as cartas fechadas por 2400/1700/1300 ms e marca todas como vistas (`jogos5.js:47, 100-109`) | nenhuma |
| `wordsearch` | **Radar** (`radar`, grátis) 4/3/2: as duas pontas de uma palavra aleatória ganham `.dica` por 4000 ms; flutua "achei as pontas" (`jogos.js:537, 628-635`) | resposta 2/1/1 |
| `termo` | **Dica** (`lightbulb`, custa) 3/2/1: revela a próxima letra desconhecida do 1º tabuleiro aberto; com 1 tabuleiro a letra entra presa na linha, com 2 aparece em `.revela` como `S·O··`; flutua "letra N". **Ouvir** (`volume-2`, grátis, ∞) (`jogos.js:403`; `jogos4.js:396-409`) | resposta (as palavras abertas unidas por " · ") |
| `scramble` | **Dica** (custa) 4/3/2: mantém o prefixo certo e encaixa a próxima palavra; flutua "palavra N". **Ouvir** (grátis, ∞) (`jogos.js:643`; `jogos4.js:501-511`) | resposta |
| `blitz` | **Cortar 2** (`scissors`, custa) 3/2/1: uma vez por pergunta, marca 1/2/2 erradas com `.pj-fora`; flutua "sobraram 2" (`jogos.js:727, 772-780`) | tempo 3/2/1; resposta |
| `karuta` | **Ouvir de novo** (`volume-2`, grátis, ∞) (`jogos2.js:16, 57`) | tempo; resposta |
| `choseong` | **Abrir uma vogal** (`lightbulb`, custa) 3/2/1: abre e prende a 1ª vogal ainda não certa (`jogos2.js:66`; `jogos4.js:597-606`) | tempo; resposta |
| `tenis` | **Primeira letra** (`lightbulb`, custa) 3/2/1: o campo passa a valer `alvo[0]` (`jogos2.js:148`; `jogos3.js:160-165`) | tempo (a bola refaz o voo até B no tempo restante, mín. 400 ms, altura 30, `jogos3.js:168`); resposta |
| `koffer` | **Espiar** (`eye`, custa, ∞): uma vez por nível, só na fase "lembrando"; reabre a mala por 1500 ms com a fala "Espiando…" (`jogos2.js:224`; `jogos3.js:289-301`) | nenhuma |
| `bao` | **Dica** (`lightbulb`, custa, ∞): uma vez por palavra, semeia o próximo pedaço (`jogos2.js:289, 368-372`) | resposta |
| `vitendawili` | **Ouvir** (grátis, ∞): narra a frase com pausa na lacuna (`jogos2.js:381, 387, 424`) | resposta |
| `shiritori` | **Ver a letra** (`lightbulb`, grátis, ∞): mostra `.pj-letra`; não consome se já está visível (`jogos2.js:433, 473-477`) | tempo; resposta |
| `taboo` | **Liberar 1** (`lightbulb`, custa, ∞): solta o 1º `<s>` ainda riscado; sempre sobra pelo menos 1; atualiza "N proibida(s)"; `sentir('liga')` (`jogos2.js:529, 567-573`) | tempo; resposta |
| `ditado` | **Dica** (`lightbulb`, custa) 4/3/2: completa o campo até a próxima palavra certa; flutua "palavra N" (`jogos2.js:695, 750-760`) | resposta |
| `escuta`, `conectores` | nenhuma | resposta |
| `cadavre`, `karaoke` | nenhuma | nenhuma |

## 4. Onboarding (`abrirOnb(pg, primeira, aoFechar)`, `jogos4.js:186-244`)

| Item | Valor | Ref |
|---|---|---|
| Quando abre sozinho | na 1ª vez de cada jogo por carregamento de página (`Set jaViu`, sem storage; divergência D). A casca aparece com rótulo "Antes de começar" e a partida não é montada; 450 ms depois abre `abrirOnb(0, true, partidaBase)`. O relógio só anda depois de fechar. | `jogos4.js:185, 245-253` |
| Reabrir | botão "Como se joga" no cabeçalho abre na tela 1; o selo de nível abre na tela 3 | `jogos4.js:256-257` |
| Pausa | sim: `pjPausar(true)` ao abrir (relógio e bola do Rali); retoma ao fechar | `jogos4.js:189, 241` |
| Fechamento | por botão, Esc ou toque fora; um intervalo de 120 ms detecta o diálogo removido e então retoma, ou recomeça se o nível mudou | `jogos4.js:236-243`; `telas.js:178-179` |
| Contêiner | `<dialog class="folha-de-baixo pj-como-folha" aria-label="Ações">` + `span.folha-pega` + `div.folha-corpo` | `telas.js:173-175` |
| Abrir a folha | `translateY(100%) → 0`, 560 ms, `MOLA_SUAVE`; filhos em cascata: `opacity 0; translateY(16px)` → normal, 420 ms, atraso `120 + min(i, 14) × 30` ms; `sentir('abre')`; fundo `rgb(0 0 0 / .4)` + `blur(8px)` | `telas.js:180-186`; `telas.css:39-43`; `sentidos.js:142` |
| Fechar a folha | `translateY(100%)`, 280 ms, `EG`; `sentir('fecha')` | `telas.js:163-172` |
| ≥721px | vira cartão central: `max-width: 540px; margin: auto; border-radius: 26px`; `.folha-pega` escondida | `jogos4.css:54-58` |
| Troca de tela | `opacity 0; translateX(±28px)` → normal, 320 ms, `EO`; `sentir('aba')` | `jogos4.js:229-233` |

Marcação: `div.pj-como.pj-onb` com 3 `section[data-pg]` (só a atual visível) e o rodapé `div.pj-onb-pe` (`jogos4.js:199-208`).

| Tela | Conteúdo | Origem do texto |
|---|---|---|
| 1 | `span.px-mini[data-mini=id]` com a miniatura sempre animada (`--mm: var(--accent)`); `label-mono` "Como se joga · 1 de 3"; `h2` com o título; `p.pj-onb-texto` com a instrução; `p.pj-onb-treina` com ícone `sparkles` e "**O que treina:** …" | por jogo: `titulo`, `instr`, `TREINA[id]` (`jogos4.js:47-65`; `jogos5.js:42`) |
| 2 | `label-mono` "Passo a passo · 2 de 3"; `h2` "Como jogar"; `ol` com 3 `li > span` | por jogo: `passos` (Rali e Mala usam os de `jogos3.js:21-25, 177-181`) |
| 3 | `label-mono` "Do seu jeito · 3 de 3"; `h2` "Nível e ajudas"; `div.pj-nivs[role=radiogroup]` com 3 `button.pj-niv[role=radio][data-nivel-op][aria-checked]` (`<b>` nome + `<span>` descrição); `ul.pj-onb-ajudas`; parágrafo fixo | gerado: `DIF[id]` e `ajudasDe(id)` |

- **Linha de ajuda (tela 3):** ícone + `<b>{rótulo}</b>` + " · {n} por rodada" (se finita) + `<small>` com o texto de `AJUDA_TXT` (só `tempo` e `resposta`) + `<em>` "zera o combo" (classe `custa`) ou "de graça". A lista se refaz ao trocar de nível (`jogos4.js:195-198, 222`).
- **Parágrafo fixo da tela 3:** "O nível vale só para este jogo. Travou? Depois de dois erros seguidos o jogo aponta uma ajuda. E o que você errar sai sozinho: não precisa apagar."
- **Rodapé:** `span.pj-onb-pontos` com 3 `<i>`; `button.pj-link[data-onb=fechar]` ("Pular explicação" na primeira vez, senão "Fechar"); `button.btn.btn-outline[data-onb=voltar]` "Voltar" (escondido na tela 1); `button.btn.btn-solid[data-onb=prox][autofocus]`.
- **Texto do botão principal:** "Próximo" nas telas 1 e 2; na 3: "Começar" (primeira vez), "Recomeçar no {Nível}" (nível mudou) ou "Continuar" (`jogos4.js:213`).
- **Escolher nível:** `definirNivel`, atualiza `aria-checked`, refaz a lista de ajudas, `sentir('aba')` (`jogos4.js:219-225`).

CSS da explicação (`jogos4.css:27-74`; `jogos.css:222-233`):

| Elemento | Valores |
|---|---|
| `.pj-onb` / `section` | `gap: 12px`; seção em coluna, `gap 10px; min-height: 250px` (0 em ≤720) |
| `.pj-como h2` | `900 22px/1.15 var(--font-display)` |
| `.pj-como li` | `14.5px/1.4`; marcador numerado em círculo de 22px, `--accent-soft` / `--accent-ink`, `800 11px mono` |
| `.pj-onb-texto` | `15px/1.45` |
| `.pj-onb-treina` | `padding 10px 12px; border-radius 12px; background var(--accent-soft); color var(--accent-ink); 13.5px/1.4` |
| `.pj-nivs` | grid de 3 colunas, `gap 8px` (1 coluna em ≤720) |
| `.pj-niv` | `padding 10px 11px; min-height 96px; border-radius 14px; border 2px`; `b`: `900 15px`; `span`: `12px/1.3`, `--ink-muted`; transição `border-color .15s, background-color .15s, transform .2s var(--px-mola)`; selecionado: borda `--accent`, fundo `--accent-soft`, `translateY(-2px)`; ≤720: em linha, `b` com 62px fixos |
| `.pj-onb-ajudas li` | `padding 8px 10px; border-radius 12px; border 1px; 13.5px`; `em`: `700 10.5px mono`, maiúsculas, `--good-ink` (`.custa`: `--warn-ink`) |
| `.pj-onb-pontos i` | 7×7px, `--border-subtle`; `.on`: `width 20px`, `--accent`; transição `width .3s var(--px-mola)` |
| `.pj-onb-pe .btn` | `min-height 46px`; o sólido ocupa o espaço restante |

## 5. Correções de atrito por jogo

| Jogo | Comportamento exato | Tempos | Ref |
|---|---|---|---|
| Termo | A linha nova já vem com as letras verdes escritas e presas (`.pj-fixa`); só com 1 tabuleiro. Com 2, as letras conhecidas aparecem em `.revela` como `S·O··`. Digitar preenche a 1ª casa vazia; apagar pula as presas. | Julgamento: 5 sons `vira` a cada 110 ms; resolução em `5×110 + 420 = 970` ms; subida de degrau em 1500 ms | `jogos4.js:270-316, 341-380` |
| `.letra.pj-fixa` | `background: color-mix(in srgb, var(--good-soft) 70%, var(--surface)); border-color: color-mix(in srgb, var(--good) 55%, var(--border-subtle)) !important; color: var(--good-ink)` | | `jogos4.css:19` |
| Termo incompleto | Enter com casas vazias: treme a linha + `sentir('erro')`; não conta erro | | `jogos4.js:319-322` |
| Frase embaralhada | Ao conferir errado: o prefixo certo fica (`.fixa`, verde); as demais ganham `.errou` (vermelho) e a linha `.errada`; depois voltam sozinhas ao banco com FLIP. Conta erro com o flutuante "Ordem incorreta". | Devolução em 750 ms; FLIP 460 ms `MOLA_SUAVE` | `jogos4.js:486-499, 431` |
| Avisos da Frase | "{n} palavra ficou / palavras ficaram no lugar certo. As outras voltaram: continue daqui." / "Ainda não. As palavras voltaram: tente começar por outra." / Difícil: "Ainda não. As que estavam fora de lugar voltaram." | | `jogos4.js:491` |
| Choseong | Ao preencher a última vaga: as certas ficam presas (`.pj-fixa`); só as erradas ganham `.pj-no` (vermelho + `treme .4s`) e saem. Conta erro, sem `conta`. | Limpeza em 520 ms | `jogos4.js:560-580`; `jogos4.css:20-21` |
| Rali | Letra errada fica vermelha (`.no`) e sai sozinha: o campo é cortado até antes da 1ª letra errada, se nada mudou no intervalo. `sentir('erro')` sem contar erro. Cada letra aparece certa ou errada na hora; completar certo devolve sozinho. | 380 ms | `jogos3.js:132-148` |
| Ditado | Segunda chance (Fácil e Médio, uma vez por frase, não ao pular): o prefixo certo fica no campo, o resto é apagado, a fala toca de novo. Zera o combo, `sentir('erro')`, treme a entrada; não incrementa `erros`. | Imediato | `jogos2.js:721-735` |
| Aviso do Ditado | "A primeira palavra ficou; o resto saiu." / "As {n} primeiras palavras ficaram; o resto saiu." / "Ainda não." + " Ouça de novo e complete: você tem mais uma tentativa." | | `jogos2.js:727` |
| Bao | A cova errada (`.errada`) desmarca sozinha; treme, zera o combo, `sentir('erro')`, sem `pjErro` até estourar o limite. | 700 ms | `jogos2.js:353-361` |
| Memória | Virar duas cartas nunca vistas não conta como erro (só zera o combo e toca `solta`); conta erro se uma das duas já tinha sido vista. As duas tremem e fecham sozinhas. | Fecham em 1100/520/300 ms | `jogos5.js:83-97` |
| Karuta | Carta errada pisca `.errada` e pode tentar outra; conta erro. | 420 ms | `jogos2.js:43-47` |
| Vitendawili e Shiritori | A alternativa errada é riscada e desabilitada (`.pj-fora`) e pode tentar de novo (no Vitendawili, exceto no Difícil). | | `jogos2.js:397-400, 460-464` |
| Cadavre | As palavras acendem (`.usada`) enquanto a pessoa escreve, com `sentir('encaixa')`. | A cada `input` | `jogos2.js:494-504` |

## 6. Cena de cada jogo

### 6.1 `memory` — Memória (`jogos5.js:44-111`)
- **Meta:** título "Memória: palavra e tradução"; rodada "Rodada · pares de palavra e tradução"; unidade "pares"; ícone `puzzle`.
- **Marcação:** `div.tabuleiro.w-full[aria-label=Tabuleiro]` (`margin: auto; grid-template-columns: repeat(4, 1fr); max-width: 720px`) com `button.carta[data-texto][data-par][data-en][style=--i]` contendo `span.verso` "?".
- **Carta:** `aspect-ratio 4/3; border-radius 14px; border 2px solid color-mix(in srgb, var(--accent) 75%, #000); font 800 15px`; fundo em gradiente do `--accent` com listras a 45°. `.virada`: `--surface`. `.par`: `--good-soft` / `--good` + brilho `0 0 0 3px color-mix(… var(--good) 35% …), 0 0 24px color-mix(… 40% …)`. Verso: `--font-marca` 22px. ≤720: `aspect-ratio 1/1.08; padding 4px; font 13px; gap 8px` (`captura.json`; `celular.css:206-213`).
- **Entrada:** as cartas saem de um monte abaixo do tabuleiro: `opacity 0; translate(centro, +240px) rotate(±(10 + 2i)deg) scale(.5)` → normal; 700 ms; atraso `120 + 45i` ms; `MOLA_SUAVE`.
- **Giro** (`prototipo.js:1011-1025`): `rotateY(90deg) scale(1.14)` em 190 ms `cubic-bezier(0.4, 0, 1, 1)`; troca a face; `rotateY(-90deg) scale(1.14)` → normal em 520 ms `MOLA_SUAVE`; `sentir('vira')`.
- **Hover (polido):** `translateY(-5px) scale(1.035)`; sombra `0 18px 28px -14px rgb(0 0 0 / .45)` (`efeitos.css:112-115`).
- **Par certo:** `pjAcerto` + voz em inglês; termina quando `feitos ≥ total`.

### 6.2 `wordsearch` — Caça-palavras (`jogos.js:534-637`)
- **Meta:** "Caça-palavras por definição"; "Rodada · 5 palavras"; 5 palavras de até 6 letras; grade 8×8; preenchimento com `ABCDEFGHILMNOPRSTUW`.
- **Marcação:** `div.caca > div.grade-caca[style=--n:8] > span[data-c]` + coluna com `label-mono` "Ache a palavra que significa:" e `ul.pistas > li[data-k]` (ícone `search` + tradução).
- **CSS:** `.caca` grid `minmax(0,1fr) 220px; gap 20px; max-width 760px`. Célula: `border-radius 8px; font 800 clamp(13px, 2.4vw, 18px) mono`. `.sel`: `--accent-soft`, `scale(1.08)`. `.achada`: `--good`, `achada .45s cubic-bezier(0.34,1.56,0.64,1) backwards`, atraso `--k × 45ms`, 40% `scale(1.25) rotate(-6deg)`. `.dica`: `box-shadow 0 0 0 3px var(--accent)` + `pisca-leve .6s infinite`. Pista feita: `--good-soft`, texto riscado a 75%, e `<b>` com a palavra (`800 13px mono`) (`captura.json`; `jogos.css:40-46`).
- **Interação:** arrasto por pointer events com captura; só linha reta (H, V, diagonal); aceita a palavra invertida. Seleção errada com mais de 1 célula: zera o combo, treme a grade, flutua "Tente de novo"; não incrementa `erros`.

### 6.3 `termo` — Soletrar (`jogos4.js:263-412`)
- **Meta:** "Soletrar (Termo)"; "Escada · 3 palavras"; degraus fixos: `STORM` (tempestade), depois `SHELF` (prateleira) + `TOWEL` (toalha) ao mesmo tempo.
- **Marcação:** `div.tabs-termo.pj-tabs[data-n] > div.tab-termo[data-tab] > header (span.pista + span.revela) + div.grade-termo > div.linha-termo[.atual] > span.letra[style=--i] × 5`, seguido do teclado QWERTY.
- **CSS:** `.pj-tabs`: `gap 14px; --lt: 44px; --tam: 5`; com 2 tabuleiros `--lt: clamp(24px, calc((100vw - 120px) / 10), 44px)` sem quebra. Letra: `font-size: calc(var(--lt) × 0.46)`. `.tab-termo`: `padding 10px; border-radius 16px`; `.resolvido` borda `--good`; `.falhou` borda `--error`. Linha atual: borda `color-mix(in srgb, var(--accent) 45%, var(--border-subtle))` (`jogos.css:49-52`; `captura.json`).
- **Fluxo:** acerto → selo "certa" (`.selo.ok`); errar todas → `.selo.erro` com a palavra e fim. Subida de degrau: `selo("Subiu!")`, `sentir('sobe')`, instrução vira "Subiu! Agora são duas ao mesmo tempo: o mesmo palpite vale para as duas."; 1500 ms.

### 6.4 `scramble` — Frase embaralhada (`jogos4.js:415-514`)
- **Meta:** 4 frases; ícone `puzzle`.
- **Marcação:** `div.pj-centro` (`label-mono` "Esta frase significa" + `p.pj-traducao`); `div.pj-linha[data-linha]` com `button.pj-peca.na-linha[.fixa]` ou `span.pj-vazio` "Toque nas palavras na ordem certa."; `p.pj-aviso`; `div.pj-pecas[data-banco]` com `button.pj-peca` (`.fantasma` invisível guarda o lugar); `div.pj-acoes` com "Recomeçar" e "Conferir" (desabilitado até a linha estar completa); `button.pj-link` "pular esta frase".
- **CSS** (`jogos.css:62-72`): linha `max-width 640px; min-height 68px; padding 10px; border 2px dashed`; `.certa` sólida `--good`; `.errada` `--error`. Peça: `min-height 44px; padding 8px 15px; border-radius 12px; border 2px; font 700 15px; box-shadow 0 3px 0`; `.na-linha` `--accent-soft`; `.fixa` `--good-soft` / `--good`; `.errou` `--error-soft` / `--error`. Tradução: `800 18px/1.3`, `--accent-ink`.
- **Fluxo:** acerto → voz, 1400 ms. Pular conta erro.

### 6.5 `blitz` — Duelo relâmpago (`jogos.js:724-790`)
- **Meta:** "Duelo relâmpago (contra o tempo)"; 12 palavras; ícone `zap`.
- **Marcação:** `div.blitz-palavra` (`label-mono` "Que palavra é" + `<b>` tradução) + `opcoesHtml` com teclas 1–4. Antes: "Prepare-se" / "···" e a contagem 3-2-1.
- **CSS:** `.blitz-palavra b`: `900 clamp(34px, 6vw, 54px)/1.1`; entrada `palavra-entra .35s cubic-bezier(0.34,1.56,0.64,1)` de `scale(.4) translateY(20px)`, op 0, `blur(6px)`.
- **Pontos:** bônus de velocidade `max(0, round(10 × (1 − ms/3000)))`; em FEVER soma `10 × mult`.
- **Tempo:** acerto em menos de 1500 ms devolve 2 s; em menos de 3000 ms, 1 s (flutua "+Ns" no relógio; teto: o total). Erro tira 2 s (flutua "−2s").
- **FEVER:** no 8º acerto seguido: `selo("FEVER ×2", 'fever')` + palco `.fever` (`fever-brilho 1.2s ease-in-out infinite`); sai no 1º erro.
- **Ritmo:** próxima pergunta em 420 ms (acerto) ou 650 ms (erro).

### 6.6 `karuta` (`jogos2.js:13-60`)
- **Marcação:** `div[data-pista]` com `span.pj-pista` (ícone `volume-2` + `span.pj-eq` de 5 barras + texto) e `div.pj-mesa > button.pj-carta[data-op][style=--i]`.
- **CSS** (`jogos.css:75-85`): pista em pílula, `padding 10px 16px; font 800 16px`; barras 3×6 px que crescem a 18 px (`pj-eq .5s ease-in-out infinite alternate`, atraso `--i × −.13s`) enquanto fala. Mesa: 3 colunas (2 em ≤720), `gap 12px; max-width 620px`. Carta: `aspect-ratio 4/3; border-radius 16px; font 900 clamp(16px, 3.4vw, 22px)`; entrada `carta-entra .4s`, atraso `--i × 55ms`; hover `translateY(-4px) rotate(-1deg)`; `.certa` verde; `.errada` vermelha; `.pega` `opacity .35`.
- **Fluxo:** narra o significado em pt-BR. Acerto: 800 ms. Tempo esgotado: revela a carta, flutua "o tempo acabou", 1000 ms.

### 6.7 `choseong` (`jogos4.js:517-609`)
- **Marcação:** `div.termo-dica` (`label-mono` "Significa" + `<b>`); `div.linha-termo.pj-cho` com `span.letra.pj-cons` (consoantes) e `span.letra.pj-vaga` (vogais); teclado `AEIOU` + apagar (classe `vogais`).
- **CSS** (`jogos.css:56-59`): colunas `minmax(0, 52px)`; consoante `--surface-hover` / `--ink-muted`; vaga vazia tracejada; `.cheia` `--accent` / `--accent-soft`; `.termo-dica b` `900 24px`.
- **Fluxo:** conferência automática ao preencher a última vaga. Acerto: 1100 ms. Tempo esgotado: vogais reveladas em `.lugar`, 1300 ms.

### 6.8 `tenis` — Rali (`jogos3.js:19-173`; `jogos3.css:9-59, 139-150`)

Marcação:
```
div.rl-arena
  div.rl-placar[aria-label="Placar do rali"]
    span > small "Você" + b[data-voce]
    span.rl-rali > b ([flame] + i[data-rali]) + small "rali"
    span > small "Babel" + b[data-ele]
  div.rl-quadra
    svg.rl-chao (viewBox 0 0 100 64, preserveAspectRatio none)
    span.rl-raq.ele · div.rl-rede · span.rl-sombra · span.rl-bola > i · span.rl-raq.eu
    div.rl-pista > small "Devolva escrevendo" + b
    p.rl-msg[role=status]
  div.rl-digita > div.rl-letras[aria-hidden] + input.rl-campo[aria-label="Sua devolução"]
  p.rl-dica "Enter devolve antes de completar. Tocar na quadra chama o teclado."
```

SVG da quadra (`jogos3.js:33`):
- Recorte `#rl-corte`: `polygon 26,0 74,0 98,64 2,64`.
- Gramado: `rect.g1` 100×64; faixas `rect.g2` em `y=5 h=7`, `y=20 h=10`, `y=40 h=12`.
- Linhas (`g.ln`): contorno do trapézio; laterais `(32,0)-(14,64)` e `(68,0)-(86,64)`; linhas de saque `(28.6,12)-(71.4,12)` e `(19.6,44)-(80.4,44)`; central `(50,12)-(50,44)`.

| Elemento | CSS |
|---|---|
| `.rl-arena` | `max-width: 780px`; coluna; `gap: 12px` |
| `.rl-placar` | grid `1fr auto 1fr; gap 10px; padding 8px 14px; border-radius 16px; background: color-mix(in srgb, var(--ink) 92%, var(--accent)); color: var(--ink-contrast, #fff)`; `small`: `700 10px mono`, `letter-spacing .14em`, maiúsculas, `opacity .7`; `b`: `900 30px/1` tabular; lado Babel espelhado (`row-reverse`). ≤720: `padding 6px 12px`, `b` 24px |
| `.rl-rali` | coluna; `padding 4px 16px; border-radius 12px; background rgb(255 255 255 / .1)`; `b` 22px; chama 18px a `opacity .4`. `.quente` (rali ≥ 2): `linear-gradient(135deg, var(--warn), var(--accent))`, chama cheia |
| `.rl-quadra` | `height: clamp(330px, 46vh, 420px)` (250px em ≤720)`; border-radius 22px` (18px)`; border 2px; cursor: text`; fundo `linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, var(--surface)) 0%, color-mix(… 8% …) 36%, color-mix(in srgb, var(--good) 26%, var(--surface)) 36%)` |
| Arquibancada (`::before`) | `inset: 0 0 66% 0; opacity .5`; pontos `radial-gradient(color-mix(in srgb, var(--ink) 35%, transparent) 2px, transparent 2.5px)`, 16×12 px; máscara `linear-gradient(180deg, #000 30%, transparent)` |
| `.rl-chao` | `top: 36%; height: 64%; z-index 1`; `.g1` `color-mix(in srgb, var(--good) 58%, var(--surface))`; `.g2` 48%; linhas `rgb(255 255 255 / .92)`, 3px, `non-scaling-stroke` |
| `.rl-rede` | `left/right: 16.5%; top: calc(60% − 30px); height 30px` (22px em ≤720)`; z-index 3; border-top 5px solid #fff`; malha em duas grades `rgb(20 20 20 / .5)` de 1.5px a cada 7px; postes 6×42 px a `top −9px` |
| `.rl-raq` | 44×74 px; `margin: −37px 0 0 −22px; transform-origin: 50% 92%; z-index 4; transition: left .5s var(--px-mola-suave)`; aro `::before` 44×52 px, `border 5px solid var(--accent)`, cordas brancas a cada 6px; cabo `::after` 8×24 px. `.ele`: `top 38%; scale .5; z-index 2`, aro escuro. `.eu`: `top 88%`. ≤720: `scale .8` / `.42` |
| `.rl-bola` | 30×30 px (24 em ≤720); `margin −15px; z-index 5`; `i`: `radial-gradient(circle at 34% 30%, #fffbe0, #e6f15a 46%, #b8c93a)` + sombras |
| `.rl-sombra` | 30×12 px; `margin: 12px 0 0 −15px; background rgb(0 0 0 / .35); filter blur(2px); z-index 2` |
| `.rl-pista` | placa no topo: `left 50%; top 12px; z-index 6; padding 8px 22px 10px; border-radius 16px; max-width 86%`; `small` `700 9.5px mono`; `b` `900 clamp(22px, 5vw, 30px)/1.1` |
| `.rl-msg` | `left 50%; bottom 14px; z-index 7; padding 8px 16px; border-radius 12px; --error-soft / --error-ink; font 800 14px`; some quando vazio |
| `.rl-letras span` | `width: clamp(30px, 9vw, 46px); aspect-ratio 1/1.1; border-radius 10px; border 2px; font 900 clamp(17px, 4.6vw, 24px)`, maiúsculas; `.vez`: borda `--accent` + anel de 4px a 18%; `.ok`: `--good`, texto branco, `translateY(-3px)`; `.no`: `--error-soft` / `--error` |
| `.rl-campo` | input invisível sobre as caixas (`opacity 0; inset 0; font-size 16px`); `maxLength` = tamanho da palavra |
| `.rl-dica` | `12.5px`, `--ink-muted`; escondida em ≤720 |

Comportamento:

| Passo | Valores | Ref |
|---|---|---|
| Início | placar zerado; 1º saque após 500 ms | `jogos3.js:170-171` |
| Saque | faixa `fx` sorteada entre 0.32, 0.5 e 0.68; origem A `{x: w(0.5 + (fx − 0.5) × 0.4), y: 0.4h, s: 0.42}`; destino B `{x: w·fx, y: 0.88h, s: 1.12}`; raquete adversária em `A.x + 16`, a sua em `B.x + 30`; `sentir('quique')` | `jogos3.js:74-91` |
| Bola como relógio | bola e sombra: `translate(x, y) scale(s)` de A a B, duração `seg × 1000` ms, `linear`; o miolo sobe `−0.3h` no meio (`ease-in-out`) | `jogos3.js:50-58, 93` |
| Batida da raquete | `rotate −46° → 34° (55%) → 0°`, 300 ms, `ease-out` | `jogos3.js:59` |
| Devolução certa | rali e "Você" +1; bola volta de onde está até A em 460 ms (altura 70); `pjAcerto`; próximo saque em 560 ms | `jogos3.js:116-123` |
| Devolução errada (Enter antes de completar) | rali zera; "Babel" +1; bola sai para `{x: 1.2w, y: y − 60, s: .7}` em 480 ms (altura 40); mensagem "Fora! Era: **{palavra}**"; erro; 1700 ms | `jogos3.js:124-130` |
| Bola caiu | rali zera; "Babel" +1; bola cai para `y = 1.2h, s 1.3` em 420 ms (altura 26); mensagem "A bola caiu na quadra. Era: **{palavra}**"; 1700 ms | `jogos3.js:94-106` |
| Placar do rali | pulsa `scale(1) → scale(1.3) rotate(-5deg) → scale(1)`, 520 ms, `MOLA` | `jogos3.js:61-68` |
| Entrada de texto | só `a–z` minúsculas; `sentir('tecla')` por letra; clicar na quadra foca o campo; teclas valem mesmo sem foco | `jogos3.js:132-159` |

A auditoria registra duas mudanças de regra em relação ao app: as caixas mostram o tamanho da palavra e dá para corrigir enquanto a bola não cai (`auditoria.html:234`).

### 6.9 `koffer` — Mala (`jogos3.js:176-304`; `jogos3.css:62-115, 151-159`)

Marcação:
```
div.ml-cena
  ol.ml-rota[aria-label="Rota dos níveis"] > li[data-n] "1".."5"  (+ span.ml-aviao no atual)
  div.ml-palco > div.ml-mala.{fechada|aberta}
    span.ml-alca
    div.ml-corpo > div.ml-slots > div.ml-slot[data-s] > i "n" (+ b palavra + small tradução)
    div.ml-tampa > span.ml-conta + div.ml-tags + div.ml-adesivos
    span.ml-fecho.e · span.ml-fecho.d
  div.ml-rodape > p.ml-fala[role=status] + span.vidas[aria-label="N vidas"] > span × N [heart]
div.pj-paleta.ml-paleta > button.pj-opcao[data-op] (palavra + small tradução)
```

| Elemento | CSS |
|---|---|
| `.ml-cena` | `max-width: 560px`; coluna centrada; `gap 14px` |
| `.ml-rota` | `max-width 440px`; `space-between`; linha tracejada 3px ao centro (`::before`, `left/right 20px`) |
| `.ml-rota li` | círculo 34×34 px; `border 2px; font 800 12px mono`; `.feito`: `--good`, branco; `.atual`: borda `--accent`, `scale(1.15)`; transição `transform .4s var(--px-mola)` |
| `.ml-aviao` | 22×22 px a `top −20px`, `--accent`, ícone preenchido e girado 45° |
| `.ml-palco` | `padding-top: 96px` (72px em ≤720), espaço para a tampa abrir |
| `.ml-mala` | `width: min(100%, 460px); aspect-ratio: 16/9.6; perspective: 1300px; perspective-origin: 50% 0%` |
| `.ml-alca` | 124×32 px a `top −24px`; `border 8px solid color-mix(in srgb, var(--ink) 78%, var(--accent))`, sem base; `border-radius 18px 18px 0 0`; some com a mala aberta (`opacity .2s`) |
| `.ml-corpo` | `border-radius 26px; padding 16px; border 5px solid color-mix(in srgb, var(--accent) 72%, #000)`; sombra interna `inset 0 12px 26px rgb(0 0 0 / .2)`; forro listrado a 45° sobre `color-mix(in srgb, var(--accent) 16%, var(--surface-sunken))`. ≤720: `20px / 10px / 4px` |
| `.ml-slot` | `flex: 0 0 calc(33.33% − 6px); min-height 62px` (50)`; border-radius 14px` (11)`; border 2px dashed`; número `i` no canto (`700 10.5px mono`); `b` `900 clamp(14px, 3.6vw, 17px)`; `small` 11.5px. `.cheio`: sólido, `--surface`, `box-shadow 0 3px 0`. `.nova`: `--accent` / `--accent-soft` |
| `.ml-tampa` (3D) | cobre a mala; `transform-origin: 50% 0; transition: transform .75s var(--px-mola-suave), filter .4s`; mesma borda do corpo; fundo com duas cintas escuras (16–21% e 79–84%) sobre gradiente a 160° do `--accent`. **Aberta:** `rotateX(104deg); filter: brightness(.82) saturate(.8)`; o conteúdo some (`opacity .2s`, com atraso de .25s ao fechar) |
| `.ml-conta` | pílula `800 11px mono`, maiúsculas, `rgb(0 0 0 / .2)`; texto "{n} palavra(s) na mala" |
| `.ml-tag` (etiqueta) | `min-height 38px; min-width 62px; padding 8px 12px 8px 22px; border-radius 6px 12px 12px 6px; font 900 15px; opacity .55; clip-path: polygon(12px 0, 100% 0, 100% 100%, 12px 100%, 0 50%)`; furo `::before` de 6px. `.ok`: `--good-soft` / `--good-ink` com a palavra. `.agora`: `--accent-ink` com "?", pulsando `ml-pulsa .9s ease-in-out infinite alternate` → `scale(1.1) rotate(-2deg)`. ≤720: `min-width 50px; font 13px` |
| `.ml-fecho` | 30×18 px a `bottom −7px`, em `left 22%` e `right 22%`; `linear-gradient(180deg, #f3e6b0, #c9a94a)`; `transition: transform .3s var(--px-mola) .45s`. Aberta: `translateY(8px) rotate(14deg)` sem atraso |
| `.ml-adesivo` | círculo 38×38 px; `--surface`; `border 2px dashed currentColor` (`--warn-ink`); `font 900 13px`; rotação `--r` sorteada entre −15° e 15°; entrada `ml-carimbo .5s cubic-bezier(0.34,1.56,0.64,1) backwards` de `scale(2.6) rotate(-30deg)`, op 0. Posições: 1º `left 6% bottom 10%`; 2º `right 7% top 12%`; 3º `left 8% top 14%`; 4º `right 6% bottom 12%`; 5º `left 46% bottom 5%` |
| `.ml-fala` | `900 clamp(16px, 4vw, 19px)/1.3`; `.erro` em `--error-ink` |
| `.ml-paleta .pj-opcao` | etiqueta de bagagem: `padding-left 30px; border-radius 32px 14px 14px 32px; box-shadow 0 3px 0`; furo `::before` de 8px; hover `translateX(3px) rotate(-1deg)`. Base `.pj-opcao`: `min-height 64px; border-radius 14px; border 2px; font 800 17px`; desabilitada `opacity .45`. Paleta: 3 colunas (2 em ≤720), `gap 10px; max-width 640px` |
| `.vidas` | `gap 4px`; coração 20px em `--error`; `.perdida`: sem preenchimento, `opacity .35`, `perde .4s ease-out` (de `scale(1.6)`) |

Comportamento:

| Passo | Valores | Ref |
|---|---|---|
| Início | 5 palavras; 1ª entrada após 350 ms | `jogos3.js:183, 302` |
| Entrar (fase `entrando`) | abre a mala (`sentir('abre')`, paleta desabilitada); fala "Guarde a ordem…"; a palavra nova cai no compartimento: `translateY(-170px) rotate(-12deg) scale(1.3)` op 0 → normal, 700 ms, atraso 420 ms, `MOLA_SUAVE`; aos 520 ms: voz + `sentir('encaixa')`; fecha após 3600/2700/1900 ms | `jogos3.js:238-254` |
| Avião na rota | a partir do nível 2: `translate(−largura/5, 6px) rotate(-12deg)` → `translate(0, −8px) rotate(6deg)` (60%) → repouso; 900 ms; `EIO` | `jogos3.js:201-210` |
| Fechar (fase `lembrando`) | `sentir('fecha')`; fala "Passo {p} de {n}: qual palavra entrou nesta posição?"; 620 ms depois os fechos batem: `sentir('encaixa')` + mala `translateY(5px) scale(1.01, .98)`, 320 ms, `MOLA` | `jogos3.js:227-237` |
| Toque certo | a palavra voa do botão até a etiqueta da vez (`voarTexto`: `.ganho` de 20px, `scale 1.1 → .8`, opacidade 1 → .3, 380 ms, `EIO`); voz; a etiqueta fica verde e a próxima vira a da vez | `jogos3.js:8-16, 269-276` |
| Toque errado | −1 vida; fala em vermelho "Não foi esta. A ordem conta, e a tentativa custou uma vida."; erro com o flutuante "−1 vida"; sem vidas → fim | `jogos3.js:257-268` |
| Nível refeito | cola um adesivo com o número do nível; `pjAcerto`; fala "Mala refeita. Entra mais uma palavra."; próximo nível em 1200 ms. No último: "Mala completa!", todos os pontos da rota ficam feitos, fim | `jogos3.js:277-287` |

### 6.10 `bao` (`jogos2.js:286-375`)
- **Marcação:** `div.termo-dica` (`label-mono` "Pista" + `<b>`); `div.pj-bao` com `div.pj-montada` (`label-mono` com ícone `sprout` "Palavra montada" + `b[data-montada]` + `small[data-conta]` "{f} de {n} pedaços"), `div.pj-covas > button.pj-cova[data-ped]` e `p.pj-aviso.erro`.
- **Corte da palavra:** `n = max(3, min(6, ceil(len/2)))` pedaços equilibrados.
- **CSS** (`jogos.css:197-209`): `.pj-bao` `max-width 560px; padding 20px; border-radius 28px; border 2px; background color-mix(in srgb, var(--warn-soft) 35%, var(--surface))`. Palavra montada `900 clamp(28px, 6vw, 38px)/1.2`, `letter-spacing .14em`; o resto aparece em pontos `·` a 50%. Covas: grid `repeat(auto-fit, minmax(96px, 1fr))`, `gap 14px`. Cova: círculo até 132px, gradiente radial escuro, sombra interna `inset 0 6px 12px rgb(0 0 0 / .16)` (`.4` no escuro), `font 900 clamp(18px, 4.4vw, 24px)`, `letter-spacing .1em`; hover `scale(1.04)`; `.semeada` verde com `check` de 26px; `.errada` vermelha.
- **Voo do pedaço:** `.ganho` de 22px vai da cova até a palavra, `scale 1 → 1.3`, opacidade 1 → .2, 420 ms, `EIO`.
- **Mensagens:** "Este pedaço não abre a palavra aqui. Restam {n}." / "A palavra era {PALAVRA}." (1600 ms). Acerto: 1000 ms.

### 6.11 `vitendawili` (`jogos2.js:378-427`)
- **Marcação:** `p.pj-enigma` com `span.pj-lacuna[aria-label="palavra apagada"]`; no Fácil `p.mut` com a tradução; `opcoesHtml`.
- **CSS** (`jogos.css:96-98`): enigma `max-width 22ch; font 900 clamp(22px, 4.6vw, 32px)/1.35`. Lacuna `min-width 3.2em; border-bottom 4px solid var(--accent); color var(--good-ink)`; `.cheia` com traço `--good`.
- **Acerto:** a palavra sai do botão e encaixa na lacuna (`translate(dx, dy) scale(.8)` op .4 → normal, 520 ms, `MOLA_SUAVE`); voz; 1300 ms. No Difícil, erro revela a certa e avança em 1400 ms.

### 6.12 `shiritori` (`jogos2.js:430-480`)
- **Corrente fixa:** storm → medicine → earth → hate → east → towel → light (6 elos).
- **Marcação:** `div.pj-corrente` (`label-mono` "A corrente até aqui ({i} de 7)" + `div.pj-elos` com `span` separados por setas); `div.pj-centro` (`label-mono` "Palavra na ponta" + `p.pj-ponta` com a última letra em `<u>` + tradução + `p.pj-letra` "A próxima começa com **X**"); `opcoesHtml` com classe `tres`.
- **CSS** (`jogos.css:99-109`): corrente `max-width 640px; padding 14px`. Elos com rolagem lateral; `span` `padding 6px 12px; border-radius 12px; font 700 13px mono`; o último com borda `--accent`. Ponta `900 clamp(38px, 8vw, 52px)/1.1`; `u` em `--accent`, sublinhado de 4px. `.pj-letra` em pílula `--accent-soft`.
- **Fluxo:** acerto 650 ms. Tempo esgotado: revela, "o tempo acabou", 1100 ms.

### 6.13 `cadavre` (`jogos2.js:483-523`)
- **Marcação:** `div.pj-quatro > div.pj-cartao[data-w]` (`<b>` + `<small>`); `label-mono` "Escreva UMA frase que use as quatro palavras"; `textarea.pj-texto` (3 linhas; placeholder "A sua frase pode ser absurda, só precisa usar as quatro."); "Conferir" (ícone `pen-line`, desabilitado se vazio); `div.pj-correcao`.
- **CSS** (`jogos.css:118-127`): grid 2 colunas, `gap 10px; max-width 560px`. Cartão `padding 14px; border 2px`; `b` `900 20px`; `.usada` verde; `.faltou` `opacity .6`. Texto `padding 14px 16px; font 600 16px/1.4`; foco com anel de 4px a 18%.
- **Conferir:** `erros += 4 − usadas`; um `pjAcerto` por palavra usada a cada 220 ms. Resultado: "palavras usadas: **n/4**. Produção livre: esta rodada não agenda revisão." + botões "Ouvir" e "Continuar" (este encerra a rodada).

### 6.14 `taboo` (`jogos2.js:526-576`)
- **Marcação:** `div.pj-tabu` com `header` (`label-mono` "Definição ({i} de 5)" + ícone `triangle-alert` + `span[data-n]` "{n} proibidas") e `<p>` com os termos óbvios em `<s>`; `opcoesHtml`.
- **CSS** (`jogos.css:110-115`): `max-width 640px; padding 18px 20px; border 2px`. Contador `800 11px mono`, maiúsculas, `--error-ink`. Texto `18px/1.6` (16.5px em ≤720). `s`: `--ink-muted`, risco `--error` de 2px. `s.livre`: sem risco, fundo `--warn-soft`.
- **Fluxo:** uma tentativa por carta. Acerto 700 ms; erro ou tempo 1300 ms ("o tempo acabou").

### 6.15 `karaoke` (`jogos2.js:579-644`)
- **Marcação:** `p.pj-frase > span` por palavra; `p.mut` com a tradução; ações "Ouvir" (`play`), "devagar" (`gauge`), "Falar agora" (`mic`); `div.pj-nota`; botão pequeno "Próxima" (ou "Terminar" na última) com `skip-forward`.
- **CSS** (`jogos.css:141-154`): palavra `900 clamp(22px, 4.6vw, 30px)/1.25`, `--ink-muted` a 55%; `.passou` tinta cheia; `.ativa` `--accent` + `scale(1.08)`; `.certa` `--good`; `.escapou` `--warn-ink` com sublinhado ondulado. Nota: `min-height 96px`; `.pj-pct` `900 38px/1`. "Ouvindo": 7 barras 4×8 px que crescem a 26 px (`pj-eq2 .42s ease-in-out infinite alternate`, atraso `--i × −.11s`).
- **Ouvir:** toca sozinho 350 ms após montar; as palavras acendem a cada 340 ms (560 ms em "devagar"), com `sentir('fala')`.
- **Falar:** `sentir('grava')`; "ouvindo você…" por 2400 ms; nota sorteada 72–98; abaixo de 90 uma palavra "escapa"; palavras pintadas a cada 90 ms; cor da nota `--good` (≥80) ou `--warn`. Texto: "{n} de {N} palavras · escapou: {palavra}" + "Nota de exemplo: no protótipo o microfone não é ligado." Pular sem ter falado conta erro.

### 6.16 `escuta` (`jogos2.js:647-689`)
- **Marcação:** ações com `button.btn.btn-solid.pj-grande` "Ouvir de novo" (`play`) + "devagar" (ausente no Difícil); `div.pj-lista > button[data-op]`; `p.pj-aviso`.
- **CSS** (`jogos.css:86-93`): lista `gap 8px; max-width 620px`. Botão `min-height 52px; padding 10px 16px; border-radius 14px; font 600 15px/1.3`, alinhado ao início; hover `translateY(-2px)`. `.pj-grande`: `min-height 56px; padding-inline 28px; font 16px`; enquanto toca, anel de 5px a 28%.
- **Fluxo:** toca sozinho em 350 ms. Depois da resposta aparece a tradução. Acerto 1000 ms; erro flutua "Ouça novamente", repete a fala, 2200 ms.

### 6.17 `ditado` (`jogos2.js:692-763`)
- **Marcação:** ações "Ouvir fala" (`.pj-grande`) + "devagar"; `div.pj-entrada` com `input` (placeholder "escreva o que ouviu…") + "Conferir" (`corner-down-left`); `div.pj-correcao`; `button.pj-link` "não consigo, pular".
- **CSS** (`jogos.css:128-138`): entrada em linha (coluna em ≤720), `gap 10px; max-width 560px`. Palavras da correção `800 16px`, com entrada `carta-entra .35s`, atraso `--i × 60ms`; `.ok` verde, `.no` vermelho com o que foi escrito riscado embaixo.
- **Correção:** compara palavra a palavra por posição, sem acento nem pontuação. Mostra "{c} de {n} palavras, {pct}%" + tradução. Acerto 1700 ms; erro flutua "Abaixo de {LIM}%", 3400 ms.

### 6.18 `conectores` (`jogos2.js:766-814`)
- **Marcação:** `p.pj-conect > button[data-w][aria-pressed]` por palavra; `p.mut` com a tradução; no Fácil `label-mono` com a contagem; "Conferir"; `div.pj-nota` (`min-height 56px`).
- **CSS** (`jogos.css:155-162`): botão `min-height 40px; padding 6px 10px; border-radius 10px; font 800 18px`; marcado `--accent`; `.alvo-ok` `--good` com texto branco; `.alvo-perdido` contorno `--good`; `.a-toa` `--error-soft` riscado.
- **Nota:** `F1 = round(200c / (2c + f + p))` (c certos, f à toa, p perdidos); "{F1} pontos de precisão" em `900 19px`; detalhe "{c} certo(s) · {f} marcado à toa · {p} passou batido". Acerto 1500 ms; erro flutua "Revise os conectores", 2800 ms.

## 7. Miniaturas do lobby

### 7.1 Contêiner e regra de movimento (`minis.js:37-50`; `minis.css:5-33`)

| Item | Valor |
|---|---|
| Inserção | `span.px-mini[data-mini=id][aria-hidden][style=--mm:{cor}]` como 1º filho de `.q-tile` (que ganha `.px-com-mini`); `--mm` é a cor da bolinha do grupo (`.qj-ponto`), senão `--accent`; só no modo polido |
| Caixa | `height: 112px` (86 em ≤720)`; border-radius 14px; gap 8px` (5)`; overflow hidden; font 800 12px/1; perspective 500px`; fundo com dois radiais de `--mm` (26% e 14%) sobre `--surface-sunken` |
| Parada (padrão) | toda animação em `animation-play-state: paused`, com atrasos negativos para parar no estado "pronto" (`minis.css:138-145`) |
| Hover ou foco no cartão | animações passam a `running`; a caixa cresce para `scale(1.03)` em `420ms × --px-k`, `--px-mola-suave` (só com ponteiro fino) |
| Sem hover (toque) | sempre rodando, mais devagar: `--d: 3.6s` |
| Padrões | duração `var(--d, 2.4s) × --px-k`; `infinite`; curva `--px-ease-in-out` (`cubic-bezier(0.77, 0, 0.175, 1)`) |
| Dentro da explicação | sempre rodando (`jogos.css:224`) |
| Movimento reduzido | `animation: none` quando segue o sistema |

Keyframes base (`minis.css:35-46`):

| Nome | Quadros |
|---|---|
| `mm-pula` | 0/100% `translateY(0)`; 50% `translateY(-9px)` |
| `mm-pisca` | 0–45% `opacity .15`; 55–100% `opacity 1` |
| `mm-pop` | 0/60/100% `scale(1)`; 75% `scale(1.16) rotate(-3deg)` |
| `mm-vira` | 0–30% `rotateY(0)`; 50% `rotateY(90deg)`; 70–100% `rotateY(0)` |
| `mm-esvazia` | `scaleX(1)` → `scaleX(.06)` |
| `mm-enche` | `scaleX(0)` → `scaleX(1)` |
| `mm-eq` | 0/100% `scaleY(.25)`; 50% `scaleY(1)` |
| `mm-cai` | 0% `translateY(-46px)` op 0; 30–100% repouso |
| `mm-vai` | 0/100% `rotate(-5deg)`; 50% `translate(var(--x), -7px) rotate(4deg)` |
| `mm-semeia` | passos de 34px: `(0,0)`, `(34,0)`, `(68,0)`, `(102,0)`, `(102,34)` |
| `mm-acende` | 0/100% `--surface` / `--ink`; 40–70% `--mm` / branco |

Peças comuns: `.mm-chip` (pílula `padding 6px 9px`, borda 1.5px; `.ok` verde); `.mm-carta` (42×56 px, raio 9px, gradiente de `--mm`); `.mm-l` (22×24 px, raio 6px); `.mm-som` (44×44 px, raio 14px; `.grande` 54px redondo); `.mm-eq` (barras de 6px, altura 44px, `--d: .9s`, atraso `--i × −.17s`).

### 7.2 Por jogo

| id | O que desenha | Como anima | Ref |
|---|---|---|---|
| `memory` | 4 cartas: "?", "sol", "sun", "?"; as do meio abertas, com borda verde | as duas abertas viram (`mm-vira`), atraso `--i × .25s`; 2.4 s | `minis.js:12`; `minis.css:52-55` |
| `wordsearch` | grade 6×3 com `MRCASAPTLUAEOSOLKV`; "CASA" destacada em faixa arredondada | as 4 letras acendem em sequência (`mm-acende`), atraso `(i − 2) × .12s` | `minis.js:13`; `minis.css:66-70` |
| `termo` | duas linhas de 5: "PORTA" (cinza, amarelo, cinza, cinza, verde) e "CASAS" (toda verde) | a 2ª linha salta (`mm-pop`), atraso `--i × .12s` | `minis.js:14`; `minis.css:71-77` |
| `scramble` | 3 pílulas fora de ordem: "today", "We", "ship" (inclinadas 6° e −8°) | flutuam (`mm-vai`) com `--x` −8 / 6 / −4 px e atrasos 0 / −.8 / −1.5 s | `minis.js:15`; `minis.css:81-83` |
| `blitz` | raio de 38px; barra de tempo de 96×8 px; pílulas "sol" (verde) e "lua"; "×3" de 20px | raio e combo saltam (`mm-pop`); a barra esvazia (`mm-esvazia`, 3 s, linear) | `minis.js:16`; `minis.css:84-88` |
| `karuta` | ícone de som + 3 cartas claras "lua", "sol", "mar"; a do meio levantada | o som salta (`mm-pop`); a carta do meio pula (`mm-pula`) | `minis.js:17`; `minis.css:56-58` |
| `choseong` | "CASA" em 4 caixas de 26×30 px: C e S verdes; as vogais tracejadas na cor do grupo | as vogais piscam (`mm-pisca`, 1.8 s), atraso `--i × .2s − 1.4s` | `minis.js:18`; `minis.css:78, 143` |
| `tenis` | quadra em perspectiva (190px; 150 em ≤720): gramado em trapézio listrado com linha central, rede, raquete adversária pequena e escura, a sua na cor do grupo, bola amarela de 12px, pílula "word" no canto | bola (`mq-bola`, 2.4 s, linear, atraso −.5 s): `translate(8px, -10px) scale(.6)` → `(6px, 4px) scale(.85)` → `(14px, 40px) scale(1.4)` → volta; a sua raquete bate (`mq-bate`: `rotate(-38deg)` aos 50%) | `jogos3.js:306`; `jogos3.css:118-129, 160` |
| `koffer` | mala de 128×74 px (104×58 em ≤720) com alça, corpo com 3 pílulas "sol", "mar", "lua", tampa com cintas e um adesivo tracejado | a tampa abre em 3D (`mk-abre`, 3.2 s, atraso −1.2 s): 0–12% fechada; 30–78% `rotateX(104deg)` + `brightness(.82)`; 96–100% fechada | `jogos3.js:307`; `jogos3.css:130-137, 161` |
| `bao` | tabuleiro 4×2 de covas de 28px (as ímpares com sementes) e uma semente escura de 10px | a semente anda cova a cova (`mm-semeia`, 2.6 s, `steps(1, end)`) | `minis.js:21`; `minis.css:98-101` |
| `vitendawili` | frase "We ___ it today" com lacuna tracejada de 54×30 px e a pílula "ship" dentro | a pílula cai na lacuna (`mm-cai`, 2.6 s, atraso −1.3 s) | `minis.js:22`; `minis.css:102-104, 139` |
| `shiritori` | 3 elos "cas**a**" → "**a**mo**r**" → "**r**io", com as letras de ligação coloridas e sublinhadas | os elos saltam em sequência (`mm-pop`), atraso `--i × .3s` | `minis.js:23`; `minis.css:105-107` |
| `cadavre` | 4 pílulas "sol", "mar", "rio", "lua" sobre uma barra de 150×8 px | a barra enche (`mm-enche`, 2.8 s) | `minis.js:24`; `minis.css:108-110` |
| `taboo` | cartão inclinado −3° com "casa", "lar", "morar" riscados em vermelho e um "?" de 34px | o "?" salta (`mm-pop`) | `minis.js:25`; `minis.css:111-113` |
| `karaoke` | microfone em círculo de 54px, 7 barras de equalizador e a nota "92" | microfone e nota saltam; as barras oscilam (`mm-eq`, .9 s, atraso sorteado) | `minis.js:26`; `minis.css:62-63, 114` |
| `escuta` | ícone de som + pílulas "ship" (verde) e "sheep" | o som e "ship" saltam (`mm-pop`) | `minis.js:27` |
| `conectores` | frase "We ship **but** later" com "but" em pílula verde | "but" salta (`mm-pop`) | `minis.js:28` |
| `ditado` | 4 barras de equalizador + "CASA" em caixas verdes + cursor de 3×26 px | as letras aparecem em sequência (`mm-pisca`, 2.4 s, atraso `--i × .3s − 2.2s`); o cursor pisca (.8 s) | `minis.js:29`; `minis.css:79-80, 144-145` |
| sem miniatura | ícone `gamepad-2` em círculo | `mm-pop` | `minis.js:42` |

## 8. Fim de rodada (`pjFim`, `jogos.js:296-328`; sugestão em `jogos4.js:138-153`)

| Item | Valor | Ref |
|---|---|---|
| Atraso | 900 ms após o fim (200 ms com `{ja: true}`: Duelo por tempo e Cadavre) | `jogos.js:303` |
| Ao encerrar | para o relógio, desliga cliques, teclas e ajudas, esconde a barra de tempo; o palco perde `.fever` e ganha `.pj-acabou` (esconde ajudas e instrução) | `jogos.js:298-311`; `jogos.css:212` |
| Estrelas | 0 sem nenhum acerto; 3 sem nenhum erro; 2 com `acertos/tentativas ≥ 0.7`; senão 1 | `jogos.js:304-306` |
| Título | `['Não foi desta vez', 'Rodada concluída', 'Boa rodada', 'Rodada perfeita'][estrelas]` | `jogos.js:313` |
| XP | `round(pontos / 5) + estrelas × 2`; barra sobre 400 | `jogos.js:307, 317-321` |
| Próximo jogo | o seguinte em `ORDEM_JOGOS` (circular): memory, wordsearch, termo, scramble, blitz, karuta, choseong, tenis, koffer, bao, vitendawili, shiritori, cadavre, taboo, karaoke, escuta, ditado, conectores | `jogos.js:116, 308-309` |
| Som e festa | 2 ou 3 estrelas: `confete(170)` (3) ou `confete(70)` (2), que toca `festa`; sem modo polido, `sentir('sucesso')`. 0 ou 1 estrela: `sentir('aviso')` | `jogos.js:323-326`; `sentidos.js:148` |
| Confete | partículas caindo do topo; raio 4–9; cores `#f04e23, #ffb347, #3f9b56, #5b6ee1, #f6d55c, #ff7aa2` | `prototipo.js:816-834` |

Marcação (substitui o conteúdo de `.pj-miolo`):
```
div.fim
  span.label-mono        "Rodada concluída · {curto}"
  h2                     {título}
  div.estrelas-fim[aria-label="{n} de 3 estrelas"] > span[.on][style=--i] × 3   [star]
  div.fim-numeros > div[style=--i] × 4
      "Acertos"       {acertos} de {tentativas}
      "Tempo"         m:ss
      "Pontos"        {pontos}
      "Melhor combo"  ×{mult do melhor}
  div.carimbo            [check] "sem nenhum erro"          (só com 3 estrelas)
  div.xp-fim > div.entre (b "+{xp} XP" + span.mut "Nível {n} · {xp} de 400") + div.hud-progresso > span
  div.pj-fim-acoes
      button.btn.btn-outline.pj-sugere[data-pj=trocar-nivel][data-n]         (se houver sugestão; entra primeiro)
      button.btn.btn-solid[data-pj=proximo][data-id]   "Próximo jogo: {nome}" [arrow-right]
      button.btn.btn-outline[data-acao=recomecar]      [rotate-ccw] "Jogar de novo"
      button.btn.btn-outline[data-pj=jogos]            [chevron-left] "Voltar aos jogos"
```

| Elemento | CSS e animação | Ref |
|---|---|---|
| `.fim` | centrado; `padding 30px 26px` (18px 6px em ≤720)`; max-width 560px`; `h2` `900 26px/1.15` | `captura.json`; `jogos.css:213-214, 272` |
| Estrelas | `gap 8px; margin 14px 0 6px`; ícone 44×44 px preenchido; apagada `--surface-sunken`, acesa `--warn`. Acesa cai: `estrela-cai .55s cubic-bezier(0.34,1.56,0.64,1) backwards`, atraso `.35s + --i × .32s`; 0% `translateY(-80px) scale(2.2) rotate(-30deg)` op 0 → 60% `translateY(4px) scale(.9) rotate(6deg)` → repouso | `captura.json`; `jogos.css:215` |
| Números | grid de 4 colunas, `gap 10px; margin 18px 0 6px`; bloco `padding 10px; border-radius 14px; background var(--canvas)`; entrada `carta-entra .45s cubic-bezier(0.34,1.56,0.64,1) backwards`, atraso `1.2s + --i × .08s`; rótulo `700 9.5px mono` maiúsculo; valor `900 20px` tabular | `captura.json`; `jogos.css:216` |
| Carimbo | `margin-top 10px; padding 6px 14px; border 3px solid var(--warn); border-radius 10px; color var(--warn-ink); font 900 14px`, maiúsculas, `rotate(-6deg)`; entrada `carimbo .5s cubic-bezier(0.34,1.56,0.64,1) 1.6s backwards`: de `scale(3) rotate(-20deg)` op 0 | `captura.json` |
| XP | `margin 14px auto 0; max-width 360px`; a barra enche com `width 1.2s var(--ease) .2s` | `captura.json` |
| Ações | grid de 2 colunas (1 em ≤720), `gap 8px; margin-top 18px`; botões `min-height 46px`; o primeiro ocupa a linha inteira (divergência G) | `jogos.css:217-219, 271` |

Sugestão de nível (só em jogos com níveis; entra 60 ms depois da tela de fim):

| Condição | Destino | Texto | Ícone |
|---|---|---|---|
| houve tentativas, `acertos/tentativas < 0.5` e o nível não é Fácil | um nível abaixo | "Ficou puxado? Jogar no {Fácil \| Médio}" | `heart` |
| senão: houve acerto, nenhum erro e o nível não é Difícil | um nível acima | "Foi tranquilo? Jogar no {Médio \| Difícil}" | `flame` |
| caso contrário | nenhuma sugestão | | |

- A condição de descer tem precedência (`jogos4.js:148`).
- Estilo: `.pj-sugere { grid-column: 1 / -1; border-style: dashed }` (`jogos4.css:7`).
- Clique: grava o nível para este jogo e recomeça (`definirNivel(n)` + `abrirJogo(pjId)`, `jogos4.js:258`).
