<!-- Inventário do protótipo (fonte: babel-play-lab/docs/prototipos/polimento-movimento-src). É a ESPECIFICAÇÃO da passada de fidelidade: cada item fecha com prova lado a lado. Estado dos itens: ver estado.md ao lado. -->

# Inventário do protótipo `polimento-movimento` (tudo exceto os tabuleiros dos minijogos)

Base: `C:\Users\Guilh\OneDrive\Área de Trabalho\babel-play-lab\docs\prototipos\polimento-movimento-src\`. Todas as referências `arquivo:linha` são relativas a essa pasta.

Li por inteiro os 17 arquivos pedidos. Não li `jogos*.js/css` nem `minis.*`. Dos `producao-*.css` só fiz uma busca pontual, sem resultado. As curvas `linear()` da seção 1 foram calculadas executando a função `mola()` do próprio protótipo.

Ordem de cascata do CSS (`montar.mjs:63-74`): `polimento → efeitos → celular → telas → telas2 → telas3 → paineis → minis → jogos → jogos3 → jogos4 → agua`. Quando duas regras colidem, vale a última; aponto os casos relevantes.

Ordem do JS (`montar.mjs:81`): `prototipo.js`, com `telas → telas2 → telas3 → direto → sentidos → minis → jogos… → agua` inseridos no marcador `/*MODULOS*/` (`prototipo.js:1488`). Tudo roda num único escopo.

---

## 1. Tokens e regras de movimento

### 1.1 Curvas

| Token | Valor exato | Onde |
|---|---|---|
| `EO` / `--px-ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | `prototipo.js:35`, `polimento.css:28` |
| `EIO` / `--px-ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | `prototipo.js:36`, `polimento.css:29` |
| `EG` / `--px-ease-gaveta` | `cubic-bezier(0.32, 0.72, 0, 1)` | `prototipo.js:37`, `polimento.css:30` |
| `MOLA` / `--px-mola` | `mola(0.5)`; sem suporte a `linear()`: `cubic-bezier(0.34, 1.56, 0.64, 1)` | `prototipo.js:49-52` |
| `MOLA_SUAVE` / `--px-mola-suave` | `mola(0.72)`; sem suporte a `linear()`: `EG` | `prototipo.js:51,53` |
| Onda de toque da Água | `cubic-bezier(0.16, 0.84, 0.3, 1)` | `agua.css:84` |
| Giro da carta (ida) | `cubic-bezier(0.4, 0, 1, 1)` | `prototipo.js:1017` |

**Gerador da mola** (`prototipo.js:39-48`): resposta ao degrau subamortecida, `zw = 6.9`, `wd = (zw/zeta)·√(1−zeta²)`, 45 pontos (`n = 44`), `p(t) = 1 − e^(−zw·t)·(cos(wd·t) + (zw/wd)·sin(wd·t))`, 4 casas decimais, último ponto forçado a 1.

`MOLA` (zeta 0,5; pico 1,1616):
```
linear(0, 0.0441, 0.1563, 0.309, 0.4785, 0.646, 0.798, 0.9261, 1.0258, 1.0966, 1.1402, 1.1603, 1.1616, 1.149, 1.1273, 1.1008, 1.073, 1.0466, 1.0233, 1.0044, 0.9902, 0.9807, 0.9753, 0.9734, 0.9743, 0.9771, 0.9811, 0.9855, 0.99, 0.9941, 0.9976, 1.0004, 1.0024, 1.0036, 1.0042, 1.0043, 1.004, 1.0035, 1.0028, 1.002, 1.0013, 1.0007, 1.0002, 0.9998, 1)
```
`MOLA_SUAVE` (zeta 0,72; pico 1,0384):
```
linear(0, 0.0213, 0.0766, 0.1545, 0.2457, 0.3429, 0.4406, 0.5347, 0.6223, 0.7017, 0.7718, 0.8323, 0.8833, 0.9253, 0.959, 0.9853, 1.0051, 1.0194, 1.0291, 1.0349, 1.0378, 1.0384, 1.0372, 1.0349, 1.0318, 1.0282, 1.0244, 1.0207, 1.0171, 1.0138, 1.0108, 1.0082, 1.006, 1.0041, 1.0026, 1.0013, 1.0004, 0.9997, 0.9992, 0.9988, 0.9986, 0.9985, 0.9985, 0.9986, 1)
```

### 1.2 Funções auxiliares de movimento

| Função | Parâmetros exatos | Onde |
|---|---|---|
| `anima(el, quadros, o)` (WAAPI) | padrão: `duration 240 ms`, `delay 0`, `easing EO`, `fill 'backwards'`; tudo multiplicado por `K()` | `prototipo.js:55-61` |
| `limpar(el)` | cancela todas as animações do elemento, engolindo a rejeição de `finished` | `prototipo.js:64-68` |
| `contar(pinta, de, ate, ms=600)` | rAF, curva `1 − (1−p)³`, `Math.round`; com reduzir movimento pinta direto o valor final | `prototipo.js:141-152` |
| `elastico(v, dim=120, c=0.55)` | `(v·dim·c) / (dim + c·|v|)` | `prototipo.js:698` |
| `molaFisica(de, ate, v0, aoPasso, zeta=0.8, resp=0.42)` | `k = (2π/resp)²`, `c = 2·zeta·√k`, `dt ≤ 0,032 s`, para quando `|x−ate| < 0,4` e `|v| < 6`; herda a velocidade do dedo | `telas.js:30-49` |
| Projeção de momento | `(v/1000)·0,998/(1−0,998)`, v em px/s (≈ 0,499·v px); fator ×0,35 no painel e ×0,4 na janela flutuante | `prototipo.js:439`, `telas.js:368-372` |
| Câmera lenta | `--px-k: 1`; `html[data-px-lento='on'] { --px-k: 5 }`; no JS, `K()` | `polimento.css:31-33`, `prototipo.js:21` |

### 1.3 Stagger (resumo; detalhe na seção 2)

| Contexto | Atraso |
|---|---|
| Título, por palavra | `60 + i·75 ms` |
| Blocos da tela | `90 + min(i,12)·60 ms` |
| Blocos revelados na rolagem | `i·70 ms` por lote |
| Painel de aba primária | `min(i,5)·60 ms` |
| `repintar` | `min(i,5)·55 ms` |
| Painel no computador: filhos / tiles | `120 + i·60` / `220 + i·55 ms` |
| Painel no celular | `140 + i·45 ms` |
| Diálogo nativo | `140 + min(i,10)·45 ms` |
| Folha de baixo | `120 + min(i,14)·30 ms` |
| Busca, por item | `120 + i·45 ms` |
| Barras do Início | `450 + k·140 ms` |

### 1.4 Chave "Polido vs Atual"

- `html[data-px="on"|"off"]`; `polido() = html.dataset.px === 'on'` (`prototipo.js:20`). O HTML montado nasce com `data-px="on"` (`montar.mjs:51`).
- Todo o CSS da camada está sob `html[data-px='on']` e é aditivo sobre o CSS de produção (`polimento.css:1-5`).
- `modo(v)` (`prototipo.js:1405-1415`): ao ir para `off`, remove as pílulas, apaga luz e inclinação, fecha painel aberto a seco e redesenha a tela atual com origem `'seco'` (sem animação).
- As telas redesenhadas (`redesenho[nome]`) só valem no Polido (`prototipo.js:98, 214`). Em Atual vale a marcação capturada.
- A entrada direta em Capturar/Intérprete só vale no Polido (`direto.js:10`).
- Para o porte: "Polido" é a especificação; "Atual" é a produção de hoje.

### 1.5 Reduzir movimento, transparência e contraste

- No protótipo, `reduz()` só é verdadeiro com "Seguir o sistema" ligado (`data-px-acess='on'`) **e** `prefers-reduced-motion: reduce` (`prototipo.js:22-25`).
- `aplicarAcess()` (`prototipo.js:26-33`) desliga (`'not all'`) as regras `@media` de `prefers-reduced-*` e `prefers-contrast` da folha `#polimento` enquanto "Seguir o sistema" está desligado.
- Decisão registrada: no app real, reduzir movimento troca tudo por fades curtos (`auditoria.html:292`). O comportamento do app é o do botão ligado.

| Item | Comportamento com reduzir movimento | Onde |
|---|---|---|
| Entrada de tela | só `opacity 0→1`, 160 ms `ease`; sem título por palavra, sem cascata | `prototipo.js:329-332` |
| Saída de tela | não existe; troca direta | `prototipo.js:238` |
| Aba primária | `opacity 0→1` (560 ms, mesmo stagger) | `prototipo.js:371-372` |
| Painel abrir / fechar | `opacity 0→1` 180 ms `ease` / `opacity→0` 140 ms `ease` | `prototipo.js:491-492, 531` |
| Pílula e interruptor | `transition-duration: 0.01ms` | `polimento.css:319-322` |
| Hover/active de cartão, recuo da tela | `transform: none !important` | `polimento.css:313-318` |
| Toast | sem deslize: `opacity 0↔1` 0,2 s; sem arrasto | `polimento.css:323-329`, `prototipo.js:710` |
| View transition do tema | `0.01ms`; `alternarTema`/`revelar` trocam direto | `polimento.css:330-331`, `prototipo.js:761`, `telas2.js:28` |
| Onda de toque, luz, inclinação, rajada, confete | não disparam | `prototipo.js:809, 818, 1232, 1278` |
| Partículas de fundo | param de se mover (continuam desenhadas) | `prototipo.js:851` |
| Vibração | não dispara (o som continua) | `sentidos.js:107` |
| Giroscópio | ignorado | `sentidos.js:207` |
| Diálogos, folhas, busca, oferta, flutuante | abrem e fecham sem animação | `telas.js:170,180,288,487,515`; `telas2.js:489,513` |
| Flutuante ao soltar | pula direto para o canto | `telas.js:373` |
| Painel de auditoria / segmentos da barra | sem transição | `polimento.css:502-505` |

| Preferência | Regra | Onde |
|---|---|---|
| `prefers-reduced-transparency` | `.q-mais` opaco (`var(--canvas)`), sem `backdrop-filter`; véu `#000 55%` sem blur | `polimento.css:333-344` |
| `prefers-contrast: more` | `.q-mais` opaco, `border-color: var(--ink)`, sem blur | `polimento.css:345-352` |
| Água | ver seção 6.9 | `agua.css:117-124` |

---

## 2. Animações da casca, uma a uma

Estrutura montada em `main` (`prototipo.js:80-85`): `canvas.px-particulas`, `div.px-aura`, `div.px-borda`, `div.px-tela`. O tema Água acrescenta `.ag-cena` (primeiro filho) e `.ag-frente` (último).

### 2.1 Resposta ao toque

| Item | Gatilho / seletor | Valores | Onde |
|---|---|---|---|
| Aperto de botão (já em produção, mantido) | todo botão | `scale(0.96)`, 120 ms, só `transform` | `auditoria.html:16` |
| Aperto de cartão-botão | `button:is(.q-tile,.q-linha):not(.apagado):not(:disabled):active` | `scale(0.985)`; durações `100ms, 100ms, .16s, .16s` | `polimento.css:109-112` |
| Transição base do cartão-botão | mesmo seletor | `transform 180ms EO`, `box-shadow 180ms EO`, `border-color .16s ease`, `background-color .16s ease` | `polimento.css:73-79` |
| Onda no toque | `pointerdown` em `.q-ctl, .btn, .q-chip, .q-aba, .q-tile, .q-linha, .q-item, .campo-idioma, .cmd-item` (não desabilitado) | `i.px-onda-caixa` (inset 0, raio herdado, overflow hidden, z 3) > `i.px-onda` círculo de diâmetro `2·hypot(w,h)` centrado no ponteiro, `background: currentColor`; `scale(0)/opacity .28 → scale(1)/opacity 0`; 750 ms `EO`, `fill forwards`; removida ao fim. Põe `position: relative` se o alvo for `static` | `prototipo.js:1276-1294`, `efeitos.css:75-88` |
| Aperto durante a inclinação 3D | `pointerdown` com tilt ativo | alvo de escala passa de 1,02 para 0,96 até o `pointerup` | `prototipo.js:1212, 1274-1277` |
| Interruptor | `.q-interruptor` | bolinha: `transform 460ms MOLA`, `width 200ms EO`; trilho: `background-color 220ms ease`, `box-shadow .16s ease`; `:active::after { width: 36px }`; ligado + ativo: `translate(24px)` | `efeitos.css:194-198`, `polimento.css:219-225` |
| Reflexo no botão principal | hover em `.q-ctl.pri, .btn-solid` | `::before` 40% de largura, `linear-gradient(90deg, transparent, rgb(255 255 255/.5), transparent)`; `translateX(-160%) skewX(-18deg)` → `translateX(260%) skewX(-18deg)`; 750 ms `EO` | `efeitos.css:116, 130-145` |
| Botão Falar (intérprete) | `.px-int .int-falar` | `:active scale(0.92)`; `[data-ouvindo] scale(1.1)`; `360ms MOLA` | `telas2.css:52-54` |
| Som e vibração | `pointerdown` em `button, [role=tab], summary, a` | `toque` (ver seção 3) | `sentidos.js:161-174` |

Interrupção: cada onda é independente e várias podem coexistir. Não há cancelamento.

### 2.2 Pílula das abas e do trilho

| Aspecto | Valor | Onde |
|---|---|---|
| Elemento | `span.px-pilula[aria-hidden]` como primeiro filho do grupo (`.q-abas` ou `.q-trilho`); o grupo ganha `.px-com-pilula` | `prototipo.js:182-197` |
| Medida | `x = ra.left − rg.left − clientLeft + scrollLeft`, idem `y`; `width/height` em px; `transform: translate(x,y)` | `prototipo.js:160-181` |
| Ativa | trilho: `.q-item[aria-current="page"]`; abas: `.q-aba[aria-selected="true"], [aria-checked="true"]` | `prototipo.js:155-158` |
| Estilo base | `position:absolute; left/top 0; z-index 0; border: 2px solid var(--q-acento, var(--accent)); border-radius: 999px; background: var(--q-suave)`; aba ativa fica `background/border transparent` | `polimento.css:115-137` |
| Transição (vale `efeitos.css`) | `transform`, `width`, `height`: `520ms MOLA_SUAVE`; `opacity .15s ease`; sombra `0 6px 16px -8px color-mix(acento 70%, transparent)` | `efeitos.css:49-56` (sobrepõe os 300 ms `EG` de `polimento.css:132-136`) |
| Trilho | `border-radius: 16px`; item atual transparente | `polimento.css:140-147` |
| Computador (`min-width:721px` e `data-dispositivo^='desktop'`) | `.q-abas`: `padding 5px; gap 4px; borda transparente; fundo var(--surface-sunken)`; pílula `border-width 1.5px; background var(--surface); box-shadow 0 1px 2px rgb(0 0 0/.08), 0 6px 14px -8px rgb(0 0 0/.3)`; no trilho: `background var(--q-suave); sem sombra` | `telas2.css:260-271` |
| Celular | pílula do trilho sem borda, raio 18 px, sem sombra; some (`opacity:0 !important`) quando Capturar é o atual | `celular.css:83-88` |
| Salto do ícone do trilho | `svg` do item recém-ativado: `scale(0.6) rotate(-14deg)` → `scale(1) rotate(0)`; 620 ms `MOLA` | `prototipo.js:225-227` |
| Ordem | a pílula responde no toque, antes de a tela trocar | `prototipo.js:240` |
| Re-render | a posição anterior é medida antes de trocar o HTML e a pílula nova nasce nela sem transição, depois desliza | `prototipo.js:191-196, 254, 268` |
| Resize / fontes prontas | reposiciona sem transição | `prototipo.js:202-211` |
| Aba fora da vista | `scrollLeft` centraliza a aba ativa após cada troca | `sentidos.js:292-305` |

Interrupção: é transição CSS, então redireciona do ponto atual.

### 2.3 Saída de tela (entre vistas)

`mostrar()` em `prototipo.js:233-252`.

- **Condição:** Polido, sem reduzir movimento, origem `'clique'`, existe tela atual e o destino é diferente.
- **Elemento:** `.px-tela` (`transform-origin: 50% 40%`, `polimento.css:14`).
- **Quadro único ("para onde"):** `{ opacity: 0, transform: translateY(${-18·dir}px) scale(0.985), filter: blur(5px) }`.
- **Duração / curva:** 150 ms, `ease-out`, `fill: forwards`.
- **Direção:** `dir = −1` se `ordem(destino) < ordem(atual)`, senão `+1`. `ordem` (`prototipo.js:232`): `inicio 0, capturar 1, aovivo 1.5, interprete 2, interpretando 2.5, jogar 3, jogo 3.5, estatisticas 4, personalizar 5, ajustes/biblioteca/planos/sobre/ajuda 7, sessao 7.2`.
- **Interrupção:** contador `vezDaTela`; `limpar(tela)` cancela a saída em curso; só a navegação mais recente executa `trocar`.
- **Som:** `nav` toca dentro de `trocar`, isto é, depois dos 150 ms de saída (`sentidos.js:155-158`).

### 2.4 Entrada de tela

`trocar()` (`prototipo.js:253-275`) e `entrar()` (`328-360`). A animação de produção é desligada: `.px-tela :is(.q-palco, .tela.entra) { animation: none }` (`polimento.css:211`).

| Peça | Seletor | Quadros | Duração / curva / atraso | Onde |
|---|---|---|---|---|
| Título por palavra | `h1` em `.q-cab h1, .cab h1` (só se o h1 não tiver filhos); cada palavra vira `span.px-pal > span` | `translateY(115%) rotate(7deg)` → `translateY(0) rotate(0)` | 760 ms `EO`; `60 + i·75 ms` | `prototipo.js:296-312`, `efeitos.css:25-32` |
| Sobrancelha | `.q-cab .q-sobre, .cab .sobrancelha` | `opacity 0, translateX(-14px)` → `1, 0` | 520 ms `EO` | `prototipo.js:313-314` |
| Blocos na vista (`top < innerHeight − 20`) | `pecas()`: filhos diretos de `.q-palco` e de `.tela`; `.q-grade` é aberta nos filhos; `.q-secao` com `.q-grade` direta também; exclui `.q-cab/.cab` e invisíveis | `ENTRA(30·dir)`: `{opacity 0, translateY(30·dir px) scale(0.96), blur(8px)}` → `{1, translateY(0) scale(1), blur(0)}` | 700 ms `EO`; `90 + min(i,12)·60 ms` | `prototipo.js:279-282, 317-340` |
| Blocos fora da vista | mesmos | ficam `opacity:0`; `IntersectionObserver` (`threshold 0.12`) dispara `ENTRA(34)` | 680 ms `EO`; `i·70 ms` por lote | `prototipo.js:283-294, 341-343` |
| Tela sem blocos | `.px-tela` | `ENTRA(28·dir)` | 620 ms | `prototipo.js:335` |

| Origem | Efeito | Onde |
|---|---|---|
| `'seco'` e `'teclado'` | nenhuma animação (busca por Enter, troca de modo) | `prototipo.js:271` |
| `'aba'` | usa `entrarAba` (2.5) | `prototipo.js:272` |
| tela `'jogo'` | só o título por palavra | `prototipo.js:273-274` |

Interrupção: `trocar` desconecta o observador, zera luz e inclinação e substitui o `innerHTML`; as animações antigas morrem com os nós.

### 2.5 Troca de aba primária e `repintar`

| Caso | Alvos | Quadros | Duração / atraso | Onde |
|---|---|---|---|---|
| Aba primária (`PRIMARIA`: `estatisticas → .qe-abas`, `personalizar → .qp-abas`, `ajustes → .q-abas:not(.q-seg)`) | irmãos seguintes ao ancestral das abas que é filho de `.q-palco/.tela/.px-tela` | `{opacity 0, translateX(70·dirAba px), blur(8px)}` → `{1, 0, blur(0)}` | 560 ms `EO`; `min(i,5)·60 ms` | `prototipo.js:88-92, 362-380` |
| `repintar(html, dir, deOnde)` (Planos, Sessão, Loja, Coleção) | irmãos após o grupo `deOnde` | `{opacity 0, translateX(56·dir px), blur(6px)}` → normal | 520 ms; `min(i,5)·55 ms` | `telas2.js:10-25` |
| Aba local (`abaLocal`) | só a pílula | — | — | `prototipo.js:1133-1139` |

- `dirAba = −1` se o índice novo é menor que o atual (`prototipo.js:237`).
- A rolagem é preservada na troca de aba (`prototipo.js:255, 264-265`). Não há animação de saída.
- `repintar` com `dir = 0` e `deOnde = '.px-nada'` não anima nada (usado depois de comprar, equipar e resgatar).
- Som: `aba`.

### 2.6 Borda de rolagem

`.px-borda`: faixa de 30 px no topo de `main`, `linear-gradient(var(--canvas), transparent)`, `z-index 5`, `opacity 0 → 1` em `0.18s ease` quando `scrollTop > 6` em `.q-palco/.rolagem` (atributo `main[data-px-rolou]`). `polimento.css:195-208`, `prototipo.js:266, 1296-1302`.

### 2.7 Painéis ("Mais", "O que você vai praticar") em computador e tablet (> 720 px)

`abrirFolha(tipo, gatilho)` em `prototipo.js:466-507`. Marcação capturada: `.q-mais-fundo > .q-mais`. O tipo `'fonte'` é inserido em `main`; os demais em `.q-casca`.

| Peça | Valores | Onde |
|---|---|---|
| Véu | produção anulada (`animation:none; background:transparent`); `::before` `color-mix(#000 40%, transparent)` + `backdrop-filter: blur(10px) saturate(140%)`; `opacity 0→1` em 240 ms `ease` (classe `.px-aberto`, aplicada num rAF); saída 160 ms (`.px-saindo`) | `polimento.css:150-168` |
| Material do painel | `background: color-mix(var(--canvas) 86%, transparent)`; `backdrop-filter: blur(28px) saturate(170%)`; `border-color: color-mix(var(--border-subtle) 70%, transparent)`; sombra `inset 0 1px 0 rgb(255 255 255/.55), 0 0 0 1px rgb(0 0 0/.04), 0 34px 80px -24px rgb(0 0 0/.5)`; escuro: `inset 0 1px 0 rgb(255 240 220/.08), 0 0 0 1px rgb(0 0 0/.3), 0 34px 80px -20px rgb(0 0 0/.8)` | `polimento.css:169-187` |
| Tela de trás recua | `main.px-recuado .px-tela`: `scale(0.93)`, `filter: blur(3px) saturate(0.85)`, `border-radius: 28px`, `overflow:hidden`; transição `transform 560ms MOLA_SUAVE, filter 360ms ease, border-radius 360ms ease` | `efeitos.css:35-46` (sobrepõe `scale(0.985)`/340 ms de `polimento.css:189-192`) |
| Origem | `transform-origin` = centro do gatilho relativo ao painel; sem gatilho, `50% 50%` | `prototipo.js:454-459` |
| Entrada | `{opacity 0, scale(0.55), blur(10px)}` → `{opacity 1, offset 0.35}` → `{opacity 1, scale(1), blur(0)}`; 640 ms `MOLA_SUAVE` | `prototipo.js:494-495` |
| Conteúdo | `:scope > *:not(.q-grade)`: `opacity 0, translateY(18px)` → normal; 520 ms `EO`; `120 + i·60 ms` | `prototipo.js:496` |
| Tiles | `.q-tile`: `opacity 0, translateY(22px) scale(0.9)` → normal; 620 ms `MOLA_SUAVE`; `220 + i·55 ms` | `prototipo.js:497-503` |
| Foco | vai para `[aria-label^="Fechar"]` ou para o painel, `preventScroll` | `prototipo.js:506` |
| **Saída** | quadro único `{opacity 0, scale(0.6), blur(8px)}`, 260 ms `EO`, `fill forwards`, origem recalculada no gatilho; véu `.px-saindo`; `pointer-events: none`; depois remove e devolve o foco ao gatilho | `prototipo.js:509-535` |
| Interrupção | o quadro único parte do valor que está na tela, mesmo no meio da entrada | `prototipo.js:529` |
| Fechar | clique no véu, botão "Fechar…", `Esc` | `prototipo.js:561-565, 1482-1485` |
| Trocar aba dentro do Mais (Atalhos ↔ Avisos) | conteúdo após as abas: `opacity 0, translateX(±50px), blur(6px)` → normal, 480 ms, `k·50 ms`; altura do painel `h0 → h1` em 520 ms `MOLA_SUAVE` com `overflow:hidden`, `fill:'none'` | `prototipo.js:537-557` |
| Som | `abre` / `fecha` | `sentidos.js:138-139` |

### 2.8 Diálogos nativos (submenus de Jogar, Capturar, Intérprete)

`abrirDialogo` / `fecharDialogo` em `telas2.js:484-526`.

| Aparelho | Entrada | Conteúdo | Saída |
|---|---|---|---|
| Computador / tablet | origem no centro do gatilho; `{opacity 0, scale(0.6), blur(10px)}` → `{opacity 1, offset 0.4}` → `{opacity 1, scale(1), blur(0)}`; 560 ms `MOLA_SUAVE` | `.dlg-corpo > *, .dlg-pe > *`: `opacity 0, translateY(14px)` → normal; 420 ms; `140 + min(i,10)·45 ms` | `{opacity 0, scale(0.94), blur(6px)}`, 200 ms `EO`, `fill forwards` |
| Celular | `translateY(100%)` → `0`; 600 ms `MOLA_SUAVE` | primeiros 10: `opacity 0, translateY(18px)` → normal; 440 ms; `140 + i·45 ms` | `translateY(100%)`, 300 ms `EG` |

- `::backdrop`: `rgb(0 0 0/.38)` + `blur(10px) saturate(140%)`; `[open]`: `inset 0 1px 0 rgb(255 255 255/.5), 0 40px 90px -30px rgb(0 0 0/.6)` (`telas2.css:250-257`).
- Fecha por: clique no backdrop, `Esc` (`cancel`), botão `.x`, qualquer botão em `.dlg-pe`, escolha de rádio numa lista de idiomas (`telas2.js:499-511`).
- **Assimetria:** a saída no computador não volta ao ponto de origem (a do `.q-mais` volta).

### 2.9 Busca (Ctrl+K)

`prototipo.js:604-679`.

- Aberta pelo teclado (`Ctrl/⌘+K`): **sem animação** (decisão mantida, `auditoria.html:289`).
- Aberta por clique (item "Buscar" do trilho ou botão "Buscar" no Mais): `dialog.paleta-cmd` `{opacity 0, scale(0.9) translateY(-24px), blur(8px)}` → normal, 480 ms `MOLA_SUAVE`; cada `.cmd-item` `opacity 0, translateX(-16px)` → normal, 420 ms, `120 + i·45 ms`.
- Fechamento: seco. Navegar por Enter usa origem `'teclado'` (tela entra sem animação); por clique, origem `'clique'`.
- Item extra "Planos" (`#cmd-planos`, ícone `sparkles`) depois do último item (`telas2.js:125-135`).

### 2.10 Folhas de baixo

Existem três tipos. **Só o tipo A tem arrastar para fechar.**

| Tipo | Elemento | Entrada | Conteúdo | Saída | Onde |
|---|---|---|---|---|---|
| A. Painel `.q-mais` no celular (Mais, "O que você vai praticar") | `.q-mais-fundo > .q-mais` | `translateY(100%)` → `0`; 620 ms `MOLA_SUAVE` | `.q-tile, :scope > .q-faixa, .q-secao`: `opacity 0, translateY(26px)` → normal; 520 ms; `140 + i·45 ms` | `translateY(105%)`, 340 ms `EG`, `fill forwards` | `prototipo.js:480-487, 524-528` |
| B. Folha da frase / palavra | `dialog.folha-de-baixo` com `span.folha-pega` + `.folha-corpo` | `translateY(100%)` → `0`; 560 ms `MOLA_SUAVE` | `.folha-corpo > *, .folha-acao, .folha-palavras button`: `opacity 0, translateY(16px)` → normal; 420 ms; `120 + min(i,14)·30 ms` | `translateY(100%)`, 280 ms `EG` | `telas.js:163-188` |
| C. Diálogo nativo no celular | `dialog:not(.paleta-cmd):not(.folha-de-baixo)` | ver 2.8 | ver 2.8 | ver 2.8 | `telas2.js:490, 514-518`, `paineis.css:8-47` |

Backdrop do tipo B: `rgb(0 0 0/.4)` + `blur(8px)`; animação de produção anulada (`telas.css:38-43`).

**Arrastar para fechar (tipo A)**, `arrastarFolha` em `prototipo.js:406-447`:

| Regra | Valor |
|---|---|
| Onde pega | só nos 76 px do topo do painel; nunca sobre `button, input, a` |
| Limiar para começar | 6 px de deslocamento vertical |
| Ao começar | `limpar(painel)` (cancela a entrada); classe `.px-arrastando` no fundo |
| Para baixo | segue o dedo 1:1 |
| Para cima (elástico) | `elastico(dy, 90)`, com `c = 0.55` |
| Véu acompanha | `--px-prog = max(0, 1 − t/alturaDoPainel)`; `.px-arrastando::before { transition:none; opacity: var(--px-prog,1) }` (`celular.css:200`) |
| Velocidade | px/s entre a primeira e a última das 6 amostras mais recentes |
| Decisão | `projetado = t + (vel/1000)·0,998/(1−0,998)·0,35`; fecha se `projetado > 0,4 · altura` |
| Fechar jogado | duração `max(160, 340 − |vel|/8)` ms, `EG`, até `translateY(105%)` |
| Voltar | `translateY(t)` → `0`; 520 ms `MOLA_SUAVE` |
| `pointercancel` | mesmo tratamento do `pointerup` |

CSS do tipo A no celular: ver seção 5.3.

### 2.11 Toast

`prototipo.js:681-751`. O elemento é o `.toast` de produção (`role="status" aria-live="polite"`); o conteúdo vira `<span class="dot"></span><span>mensagem</span>`.

| Aspecto | Valor | Onde |
|---|---|---|
| Posição / estilo | `top 18px; right 22px; padding 12px 16px; border-radius 14px`; sombra `inset 0 1px 0 rgb(255 255 255/.12), 0 14px 34px -10px rgb(0 0 0/.42)`; `touch-action:none; cursor:grab; user-select:none` | `polimento.css:228-245` |
| Fora da tela | `translateY(calc(-100% - 24px))`, `opacity 1` | `polimento.css:236-237` |
| Entrada (`.on`) | `transform 620ms MOLA`, `opacity 200ms ease`, `visibility 0s` | `efeitos.css:199-204` (sobrepõe os 400 ms `EO` de `polimento.css:241-250`) |
| Saída (`:not(.on)`) | `transform 220ms EO`, `opacity 200ms ease`, `visibility 0s linear 220ms`; sai pela mesma borda de cima | `polimento.css:251-256` |
| Tempo de vida | 3400 ms (× K) | `prototipo.js:688` |
| Pausa | `pointerenter` pausa; `pointerleave` rearma 1500 ms; aba oculta pausa e rearma 1500 ms ao voltar | `prototipo.js:701-708` |
| Arrasto | trava o eixo após 6 px (`hypot`); `.px-arrastando { transition:none; cursor:grabbing }` | `prototipo.js:709-727`, `polimento.css:257-260` |
| Sentidos livres | direita e cima seguem 1:1; esquerda e baixo usam `elastico(v)` (dim 120, c 0,55) | `prototipo.js:723-725` |
| Dispensar | distância ≥ 45 px **ou** velocidade > 0,11 px/ms (distância total ÷ tempo desde o `pointerdown`) | `prototipo.js:733-735` |
| Saída por arrasto | eixo x: `translateX(calc(100% + 40px))`; eixo y: `translateY(calc(-100% - 24px))`; `opacity 0`; remove `.on` após 230 ms | `prototipo.js:736-743` |
| Não dispensou | `transform` volta a `''` (com a transição de `.on`); rearma 1500 ms se não estiver em hover | `prototipo.js:744-747` |
| Celular | `left 12px; right 12px; top max(12px, env(safe-area-inset-top)); max-width none; width auto` | `celular.css:216` |
| Som | `aviso` | `sentidos.js:146` |

### 2.12 Troca de tema em círculo

| Aspecto | Valor | Onde |
|---|---|---|
| Claro ↔ escuro | `document.startViewTransition`; `clip-path: circle(0px at x y)` → `circle(raio at x y)` em `::view-transition-new(root)`; **850 ms**, `EIO` | `prototipo.js:755-775` |
| Trocar de tema/pele (`revelar`) | idem, **800 ms**, `EIO` | `telas2.js:27-37` |
| Centro | `ultimoPonto` = último `pointerdown` no documento (fase de captura) | `prototipo.js:754, 1275` |
| Raio | `hypot(max(x, W−x), max(y, H−y))` | `prototipo.js:763` |
| CSS | `html.px-vt::view-transition-old/new(root) { animation:none; mix-blend-mode:normal }`; old `z-index 0`, new `z-index 1`; classe `.px-vt` removida em `vt.finished` | `efeitos.css:207-213` |
| Sem a classe `.px-vt` | crossfade 280 ms `ease` | `polimento.css:305-309` |
| Sem `startViewTransition` | troca direta | `prototipo.js:761` |
| Depois da troca | atualiza o rótulo "Tema claro"/"Tema escuro" no Mais e a cor das partículas | `prototipo.js:756-760` |
| Som / vibração | `onda` | `sentidos.js:149-150` |

### 2.13 Aura que segue o ponteiro

- `.px-aura`: 620 × 620 px, círculo, `position:absolute; left/top 0; z-index 0`; `.px-tela` fica em `z-index 1` (`efeitos.css:8-22`).
- Claro: `radial-gradient(circle, color-mix(acento 26%, transparent), transparent 62%)`. Escuro: `13%` e `60%` (`efeitos.css:316-318`). Tema Água: `opacity 0.35` (`agua.css:46`).
- Movimento por quadro: `aura += (mouse − aura)·0,07`; `transform: translate(aura.x − main.left − 310, aura.y − main.top − 310)` (`prototipo.js:843-848`).
- No celular, `mouse` é alimentado pelo giroscópio (seção 3.3).

### 2.14 Luz dentro do cartão

| Aspecto | Valor | Onde |
|---|---|---|
| Alvos | `button.q-tile:not(.apagado):not(:disabled)`, `button.q-linha:not(:disabled)`; nunca com `pointerType === 'touch'` | `prototipo.js:1231-1233` |
| Elemento | `i.px-luz[aria-hidden]` anexado ao cartão; `.on` num rAF | `prototipo.js:1236-1244` |
| Estilo | `inset 0; raio herdado; z-index 2; opacity 0→1 em .35s ease`; `radial-gradient(280px circle at var(--mx) var(--my), rgb(255 255 255/.3), transparent 60%)` | `efeitos.css:59-72` |
| Escuro | `rgb(255 226 200/.07)` | `efeitos.css:69-71` |
| Cartão escuro / principal (`.escuro`, `.q-tile.pri`) | `rgb(255 232 210/.1)` | `efeitos.css:248-250` |
| Uma por vez | ao trocar de cartão, as outras perdem `.on` e são removidas 320 ms depois | `prototipo.js:1219-1225, 1245` |
| Apaga em | `pointerleave` da raiz e do documento, `blur` da janela, troca de tela, troca de modo | `prototipo.js:258-259, 1226-1230, 1270-1272` |

### 2.15 Inclinação 3D do cartão

`prototipo.js:1197-1218, 1255-1268`.

| Aspecto | Valor |
|---|---|
| Alvos | só `button.q-tile` que não seja `.em-linha`, `.apagado` nem desabilitado. `q-linha` recebe luz, mas não inclina |
| Força | `min(1, 320/largura)·8` graus |
| Alvo | `rotateY = ((x−left)/w − 0,5)·2·força`; `rotateX = −((y−top)/h − 0,5)·2·força`; `translateY −6px`; `scale 1,02` (0,96 apertado) |
| Mola | rAF, `v += (alvo − v)·0,16` por quadro |
| Transform | `perspective(900px) rotateX() rotateY() translateY() scale()` |
| Transição inline enquanto inclina | `box-shadow .25s ease, border-color .16s ease, background-color .16s ease` (tira `transform` da transição CSS) |
| Saída | alvo `[0,0,0,1]`; encerra quando `|rx|+|ry|+|y|+|s−1|·100 < 0,1` e limpa os estilos inline |
| Interrupção | trocar de cartão zera o anterior na hora; trocar de tela ou de modo também |

### 2.16 Partículas, rajada e confete

Canvas `.px-particulas`: `position:fixed; inset:0; pointer-events:none; z-index:38` (`polimento.css:16-23`); DPR limitado a 2 (`prototipo.js:786-791`).

| Sistema | Parâmetros | Onde |
|---|---|---|
| Partículas de fundo | 46 pontos; `r 1–3`; profundidade `z 0,2–1,2`; `vx ±3 px/s`; `vy −(4…16) px/s`; alfa `0,22–0,67`; cintila `0,65 + 0,35·sin(f)`, `f += dt·2`; paralaxe `(mouse/janela − 0,5)·60·z`; reaparece embaixo ao sair por cima; cor `--q-acento` ou `--accent` (padrão `#f04e23`) | `prototipo.js:783-785, 796-807, 841-865` |
| `rajada(x, y, n=14, força=1)` | ângulo `2π·i/n + rand·0,5`; velocidade `(110…330)·força`; `vy −80`; `r 2–5,5`; gravidade 520; vida cai `1,3/s`; alfa `clamp(vida·2)`; círculos na cor do tema | `prototipo.js:808-815, 866-886` |
| `confete(n=170)` | nasce em `y −20 … −0,5·H`; `vx ±80`; `vy 120–380`; `r 4–9`; gravidade 160; vida `0,3/s`; cores `#f04e23, #ffb347, #3f9b56, #5b6ee1, #f6d55c, #ff7aa2`; retângulo `2r × 0,9r` girando (`vg ±7 rad/s`) | `prototipo.js:816-834` |

- O laço pausa com a aba oculta e retoma em `visibilitychange` (`prototipo.js:888-895`).
- Modo Atual: sem paralaxe e sem cintilar.

### 2.17 Hover (só em `@media (hover: hover) and (pointer: fine)`)

| Alvo | Efeito | Onde |
|---|---|---|
| `button:is(.q-tile,.q-linha)` | `translateY(-2px)` + sombra `inset 0 1px 0 rgb(255 255 255/.6), 0 2px 4px rgb(38 36 31/.06), 0 18px 32px -16px rgb(38 36 31/.34)`. No `q-tile` o tilt inline assume o `transform` | `polimento.css:84-97` |
| `button.q-linha` | `translateY(-4px) scale(1.006)` | `efeitos.css:93` |
| `button.q-tile` (sombra funda) | claro `inset 0 1px 0 rgb(255 255 255/.6), 0 4px 8px rgb(38 36 31/.07), 0 30px 50px -22px rgb(38 36 31/.5)`; escuro `…rgb(255 240 220/.08), 0 4px 8px rgb(0 0 0/.4), 0 30px 50px -20px rgb(0 0 0/.9)` | `efeitos.css:94-105` |
| `button.q-tile.pri` | `inset 0 1px 0 rgb(255 255 255/.4), 0 0 0 4px color-mix(acento 28%), 0 24px 40px -18px color-mix(acento 90%)` | `polimento.css:98-103` |
| Ícone `.q-ic` do cartão | `scale(1.14) rotate(-6deg)`, `520ms MOLA` (fora do hover: `220ms EO`) | `efeitos.css:106-109`, `polimento.css:80-82` |
| `.q-logo` | `rotate(-10deg) scale(1.15)`, `520ms MOLA` | `efeitos.css:110, 118` |
| Ícone do item do trilho | `translateY(-2px) scale(1.1)`, `420ms MOLA` | `efeitos.css:111, 119` |
| `.px-premio` | `translateY(-4px) scale(1.04)` + `border-color: var(--rar)`; `320ms MOLA` | `telas2.css:175, 188`; `telas3.css:41` |
| `.px-item:hover .px-arte > *` | `scale(1.1) rotate(-3deg)`, `520ms MOLA` | `telas2.css:238-239` |
| Fala antiga na captura | `opacity 0.62 → 1` | `telas.css:14-15` |

### 2.18 Coisas que respiram (laços infinitos)

| Item | Seletor | Keyframes / duração | Onde |
|---|---|---|---|
| Brilho nas barras | `:is(.q-barra,.hud-progresso) > span::after` (40% de largura, branco 0,6) | `px-brilho`: `translateX(-130%)` → `60%,100%: translateX(330%)`; 2,6 s `EIO` | `efeitos.css:148-165` |
| Contador de avisos | `.q-contagem` | `px-pulso`: `box-shadow 0 0 0 0 acento 70%` → `70%,100%: 0 0 0 10px acento 0%`; 1,9 s `ease-out` | `efeitos.css:166-170` |
| Anéis do "Legendar agora" | `.q-tile.pri .q-ic::before/::after` (borda 2 px `currentColor`) | `px-anel`: `scale(1) opacity .55` → `scale(2.1) opacity 0`; 2,4 s `EO`; o `::after` atrasa 1,2 s | `efeitos.css:171-186` |
| Ícone de estado vazio | `:is(.q-vazio,.vazio) :is(.q-ic,.ib)` | `px-flutua`: `translateY(0)` ↔ `-5px`; 3,2 s `ease-in-out` | `efeitos.css:187-191` |
| Ponto "ao vivo" | `.px-vivo .cel-ponto`; `.int-status:not(:empty)::before` (8 px) | `px-ao-vivo`: `0 0 0 0 rgb(240 78 35/.7)` → `70%,100%: 0 0 0 9px rgb(240 78 35/0)`; 1,4 s (status: 1,2 s) `ease-out` | `telas.css:16-20`, `telas2.css:57-66` |
| Borda de luz do Premium | `.px-premium` | `@property --px-ang`; `px-gira` até 360deg; 5 s `linear` | `telas.css:85-94` |
| Céu da temporada | `.px-ceu` | `px-cintila`: `opacity .55 ↔ 1`; 4 s `ease-in-out` | `telas2.css:120-121` |
| Metade "lendo" (uma vez) | `.int-metade.px-lendo` | `px-lendo`: `inset 0 0 0 0 transparent` ↔ `50%: inset 0 0 60px -10px accent 45%`; 1,6 s `ease-in-out` | `telas2.css:55-56` |
| Anel do "pronto para legendar" (só celular) | `.px-pronto-miolo .q-ic::before` | `px-anel`, 2,4 s `EO` | `telas3.css:94-102` |

Todas as durações acima são multiplicadas por `--px-k`.

### 2.19 Outros da casca

| Item | Valores | Onde |
|---|---|---|
| Barras de progresso | `width 600ms EO` em `.q-barra > span, .hud-progresso > span` | `polimento.css:263-266` |
| Perguntas frequentes | altura `h0 → h1`, 420 ms `MOLA_SUAVE`, `overflow:hidden`, `fill:'none'`; ao abrir, o `<p>` faz `opacity 0, translateY(-8px)` → normal em 360 ms com 80 ms de atraso; seta gira 180° em `360ms MOLA_SUAVE` | `telas2.js:622-634`, `telas2.css:30-31` |
| Estados na própria tela (`alternarEstado`: Trilha, "Por que este?", Conversa virtual) | só as folhas novas (até 24): `opacity 0, translateY(-10px), blur(4px)` → normal; 420 ms; `i·22 ms`. Fechar não anima | `telas2.js:527-543` |
| Deslizar de lado troca a aba primária (celular) | ver 5.5 | `sentidos.js:306-329` |
| Tipografia | títulos `letter-spacing: -0.022em` + `text-wrap-style: balance`; subtítulos `-0.012em`; textos `text-wrap-style: pretty`; `tabular-nums` em `.q-rotulo, .q-chip, .q-num, .tn, .q-contagem, .q-aba .n, .hud b, .combo, .q-linha b`; `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility` | `polimento.css:36-52` |
| Sombra em camadas | `:is(.q-tile,.q-cartao,.q-linha):not(.apagado):not(.fundo)`: `inset 0 1px 0 rgb(255 255 255/.55), 0 1px 2px rgb(38 36 31/.05), 0 8px 18px -12px rgb(38 36 31/.22)`; escuro `inset 0 1px 0 rgb(255 240 220/.05), 0 1px 2px rgb(0 0 0/.35), 0 10px 22px -12px rgb(0 0 0/.65)`; `.q-tile.pri`: `inset 0 1px 0 rgb(255 255 255/.32), 0 1px 2px rgb(38 36 31/.1), 0 18px 34px -18px color-mix(acento 80%)` | `polimento.css:55-72` |
| Refino no computador | `.q-palco gap 22px`; `.q-cab h1/h2 34px`; `.q-sobre 12px / .12em`; `.q-aba min-height 44px, padding 0 18px, 15.5px`; `.q-ctl/.q-chip` borda 1 px; `.q-tile/.q-cartao/.q-linha` borda 1 px `color-mix(border-subtle 75%)`; `.q-secao h2 -0.015em` | `telas2.css:260-271` |
| Selo com ícone | `.q-tag:has(svg) { display:inline-flex; align-items:center; gap:6px; white-space:nowrap }`; svg 14 px | `telas3.css:5-6` |
| Documento não rola | `html, body { overflow:hidden }` | `efeitos.css:314` |

**Só do protótipo, não portar:** barra `.px-barra`, legenda `.px-legenda`, painel `.px-aud`, palco de aparelhos `.px-palco-ap` / `.px-moldura`, demonstração (`polimento.css:354-505`, `efeitos.css:215-311`, `prototipo.js:1304-1475, 1490-1556`).

---

## 3. Sentidos (`sentidos.js`)

### 3.1 Motor de som

- `AudioContext` criado sob demanda; ganho mestre **0,55** → `DynamicsCompressor` → destino; retoma se suspenso (`sentidos.js:14-26`). O áudio é destravado no primeiro `pointerdown` (`sentidos.js:165`).
- `nota(f, {t=0, d=0.12, tipo='sine', g=0.12, f2=null})`: oscilador; ganho `0,0001 → g` em 6 ms (exponencial) `→ 0,0001` em `d`; se `f2`, a frequência faz rampa exponencial até `f2` em `d`; para em `d + 0,02 s` (`sentidos.js:27-42`).
- `sopro(d, {g=0.06, de=400, ate=2400, t=0})`: ruído branco → passa-banda (`Q 1,2`, frequência `de → ate` exponencial em `d`) → ganho `0,0001 → g` em `0,3·d` `→ 0,0001` em `d` (`sentidos.js:43-64`).

### 3.2 Sons e vibrações

`SONS` em `sentidos.js:66-85`; `TATO` em `sentidos.js:87-90`.

| Nome | Síntese | Vibração (ms) | Quando dispara |
|---|---|---|---|
| `toque` | `nota(1700, d .028, g .035, triangle)` | `6` | `pointerdown` em `button, [role=tab], summary, a`, exceto `.carta`, `.q-item`, `[data-px-comprar]` e interruptores (`161-174`); também na borda sem mais abas (`325`) |
| `nav` | `nota(520 → 780, d .09, g .1)` | `8` | `trocar` com origem `'clique'` e tela diferente (`155-158`) |
| `aba` | `nota(700 → 940, d .06, g .08)` | `6` | `trocar` com origem `'aba'`; todo `repintar` (`156, 159`) |
| `abre` | `sopro(.22, 400→2600)` + `nota(330 → 660, d .2, g .07)` | `10` | abrir painel, diálogo, folha de baixo, busca, flutuante (`138-145`) |
| `fecha` | `sopro(.16, 2200→320, g .05)` + `nota(620 → 310, d .13, g .05)` | `6` | fechar os mesmos |
| `aviso` | `nota(880, d .12, g .08)` + `nota(1320, t .07, d .18, g .06)` | `[8, 40, 8]` | todo `toast` (`146`) |
| `sucesso` | `[523, 659, 784, 1047]`, cada `t = i·.075, d .24, g .1, triangle` | `[10, 50, 10, 50, 18]` | ativar o teste Premium (`151`); missão concluída, 380 ms depois (`152`); guardar palavra (`telas.js:246`); ligar "Som" na barra |
| `erro` | `nota(196 → 150, d .16, g .12, square)` + `nota(150 → 120, t .12, d .18, g .1, square)` | `[30, 40, 30]` | `placar` sem ganho de pontos (`154`) |
| `vira` | `sopro(.09, 1200→3400, g .05)` + `nota(420 → 640, d .05, g .04)` | `8` | `girar` carta (`153`) |
| `acerto` | `[659, 988, 1319]`, `t = i·.07, d .22, g .1, triangle` | `[10, 30, 16]` | `placar` com ganho; ligar "Vibração" na barra |
| `moeda` | `[1318, 1760, 2093]`, `t = i·.055, d .16, g .06, triangle` | `[8, 30, 8]` | compra concluída (`telas2.js:455`); resgate de prêmio (`telas2.js:598`) |
| `liga` | `nota(660 → 990, d .07, g .08)` | `10` | `pointerdown` em interruptor que vai ligar (`169`) |
| `desliga` | `nota(660 → 440, d .07, g .07)` | `8` | interruptor que vai desligar |
| `grava` | `nota(440, d .09, g .09)` + `nota(660, t .09, d .12, g .09)` | `14` | iniciar captura (`direto.js:51`); Falar no intérprete (`telas2.js:195`); iniciar o player da sessão (`telas3.js:37`) |
| `chega` | `nota(784, d .1, g .08)` + `nota(1175, t .08, d .16, g .07)` | `10` | oferta aparece (`147`); tradução chega no intérprete (`telas2.js:219`) |
| `fala` | `nota(1250, d .03, g .025)` | (sem) | tradução de uma fala chega na captura (`telas.js:156`) |
| `festa` | `[523, 659, 784, 1047, 1319, 1568]`, `t = i·.06, d .3, g .09, triangle` + `sopro(.6, 3000→9000, g .04, t .2)` | `[15, 40, 15, 40, 30]` | todo `confete` (`148`) |
| `onda` | `sopro(.55, 300→3200, g .05)` + `nota(220 → 440, d .5, g .04)` | `12` | `revelar` e `alternarTema` (`149-150`) |
| `mergulho` (Água) | `sopro(.7, 2600→220, g .07)` + `nota(520 → 130, d .5, g .05)` + `[1300, 1700, 2100]` com `t = .25 + i·.09, d .08, g .03, f2 = f·0,6` | `[14, 50, 8, 30, 6]` | equipar o tema Água (`agua.js:256-257, 276`) |
| `toque` no tema Água | `nota(1500 + rand·300 → 620, d .07, g .045)` + `nota(2400, t .03, d .04, g .018)` | `6` | substitui `toque` enquanto `data-theme='agua'` (`agua.js:254-255`) |
| Segurar para comprar (contínuo) | triangle, `280 → 980 Hz` exponencial em 1,1 s; ganho `→ 0,06` em 50 ms; ao soltar, `setTargetAtTime(0.0001, agora, 0.02)` e para em 0,1 s | — | `pointerdown` em `[data-px-comprar]` (`113-130`) |

**Regras de `sentir(nome)`** (`sentidos.js:94-111`):

- Só no Polido.
- Sons "fracos" (`toque`, `aviso`, `fala`) são suprimidos (som **e** vibração) se um som não-fraco tocou há menos de 160 ms.
- Vibração só com `sentidos.vibra`, padrão definido e sem reduzir movimento.
- Sem `navigator.vibrate` (iPhone): clica num `<label class="px-tato-ios"><input type="checkbox" switch></label>` escondido (Safari 17.4+), exceto para `toque` e `fala` (`sentidos.js:91-93, 109`; CSS em `celular.css:251`).
- O botão real "Som dos toques: ligado/desligado" no Mais comanda `sentidos.som` (`sentidos.js:183-191`, `prototipo.js:588-591`).

Vibrações diretas, fora de `TATO`:

| Onde | Padrão |
|---|---|
| Missão concluída (`prototipo.js:924`) | `12` |
| Par certo (`prototipo.js:1056`) | `10` |
| Guardar palavra (`telas.js:249`) | `10` |
| Ativar teste (`telas2.js:114`) | `[12, 60, 12]` |
| Tradução chega no intérprete (`telas2.js:221`) | `8` |
| Compra concluída (`telas2.js:467`) | `[10, 40, 16]` |
| Resgate de prêmio (`telas2.js:607`) | `12` |

### 3.3 Giroscópio

`sentidos.js:196-273`.

| Aspecto | Valor |
|---|---|
| Permissão | no primeiro `pointerdown` (uma vez): `DeviceOrientationEvent.requestPermission?.()`, erro engolido (`199-205`). No tema Água, também `DeviceMotionEvent.requestPermission?.()` no primeiro toque (`agua.js:239-243`). Só entrega em https (`auditoria.html:163`) |
| Zero adaptativo | `b0 += (beta − b0)·0,004`; `g0 += (gama − g0)·0,004` por evento |
| Normalização | `ax = clamp((gama − g0)/22, −1, 1)`; `ay = clamp((beta − b0)/22, −1, 1)` |
| Suavização | `x += (ax − x)·0,12` por quadro (idem y) |
| Ponteiro virtual | `mouse = [W·(0,5 + x·0,45), H·(0,45 + y·0,4)]`, o que move aura, paralaxe das partículas e toda a cena da Água |
| Alvos inclinados (até 16, visíveis) | `button.q-tile:not(.apagado):not(.em-linha)`, `.px-premium`, `.px-vitrine-tela`, `.px-item .px-arte`, `.carta:not(.virada):not(.par)` |
| Transform | `perspective(800px) rotateY(x·9·f deg) rotateX(−y·8·f deg)`, `f = 0,6` em cartas, 1 nos demais; pulado enquanto o elemento tiver animação finita rodando |
| Luz do giroscópio | nos 4 primeiros alvos (exceto `.carta`, `.px-arte`, `.px-vitrine-tela`): `i.px-luz.giro.on` com `--mx = (0,5 − x·0,6)·largura`, `--my = (0,4 − y·0,6)·altura`; `.px-luz.giro { transition:none }` (`celular.css:253`) |
| Recalcular alvos | 60 ms depois de cada `trocar` e `repintar` |
| Marca | `html[data-px-giro='on']` na primeira leitura |
| Simulação (só protótipo) | as molduras mandam `postMessage({pxGiro:[ny·24, nx·24]})` |

### 3.4 Jeito de celular (mesmo arquivo)

Ver seção 5.5: barra some ao rolar, deslizar troca de aba, aba ativa sempre à vista.

---

## 4. Telas, uma a uma

Rotas do trilho (`ROTAS`, `prototipo.js:87`): `inicio, capturar, interprete, jogar, estatisticas, personalizar`. Itens do trilho capturado, na ordem: Início, Capturar, Intérprete, Jogar, Estatísticas, Personalizar, Buscar (`.q-busca-botao`), Mais (`.q-mais-botao`, com `i.q-contagem` "1").

Destaque no trilho (`marcarTrilho`, `prototipo.js:217-228`): `jogo → Jogar`, `aovivo → Capturar`, `interpretando → Intérprete`; `ajustes, biblioteca, sessao, planos, sobre, ajuda → Mais`; no celular Polido, `estatisticas` e `personalizar → Mais`.

### 4.1 Início (`inicio`)

Marcação de produção (`casca.inicio`) com dados de exemplo.

| Mudança | Detalhe | Onde |
|---|---|---|
| Dados de exemplo | "Nível 3 · 240 XP", barra 60%, "Ofensiva de 4 dias. Faltam 160 XP", "420 Seeds"; missões `revisar 12/20`, `palavras 2/3`, `rodadaBoa 1/2` | `prototipo.js:104-138` |
| Selo do plano (novo) | no `.q-cab`: `button.q-chip.px-plano-chip[data-px="planos"]`, ícone `sparkles`, texto "Grátis · Ver planos" ou "Premium · em teste"; borda `color-mix(acento 50%, border-subtle)` | `telas2.js:136-139`, `telas2.css:39` |
| Barras enchem | `.q-barra > span`: `clip-path: inset(0 100% 0 0 round 999px)` → `inset(0 0 0 0 round 999px)`; 1100 ms `EO`; `450 + k·140 ms` | `prototipo.js:346-351` |
| XP conta | 0 → 240 em 1300 ms | `prototipo.js:352-353` |
| Missões contam | 0 → valor em 1200 ms | `prototipo.js:354-358` |
| Microfone pulsa | anéis `px-anel` no `.q-tile.pri .q-ic` | 2.18 |
| Missão feita | `.q-cartao.px-feita`: ícone `background var(--good,#3f9b56); color #fff`; barra verde; borda `color-mix(good 55%, border-subtle)`; transições 260 / 300 ms | `polimento.css:267-279` |
| Navegação | tiles "Legendar agora" → capturar, "Conversar" → interprete, "Jogar" → jogar; linha `[data-testid="progresso-no-inicio"]` → estatisticas | `prototipo.js:1174-1177` |

**Missão concluída** (`simularMissao`, `prototipo.js:905-964`; no protótipo dispara pelo botão "Simular missão"):

| Passo | Valores |
|---|---|
| Rolagem | `scrollIntoView({block:'nearest', behavior:'smooth'})` |
| Ícone antigo sai | `{opacity 0, blur(4px), scale(0.7)}`, 120 ms `ease`, `fill forwards` |
| Ícone "certo" entra (svg `M20 6 9 17l-5-5`, `stroke-width 2.6`) | `{opacity 0, blur(4px), scale(0.6)}` → normal; 320 ms `MOLA` |
| Caixa do ícone | `scale 1 → 1.14 → 1`; 420 ms |
| Faíscas | `rajada(centro do ícone, 30, 1.3)` |
| Cartão | `scale 1 → 1.06 → 1`, 700 ms `MOLA`; anel `0 0 0 0 rgb(63 155 86/.7)` → `0 0 0 26px rgb(63 155 86/0)`, 900 ms |
| Depois de 420 ms | Seeds conta `de → de+5` em 500 ms; chip `scale 1 → 1.06 → 1`, 360 ms |
| "+5" | `span.px-mais-um` (`font 800 15px mono; color var(--good-ink,#2f7a43)`; em `right − 34px, top − 6px` do chip): `{opacity 0, translateY(6px)}` → `{opacity 1, translateY(-10px), offset .3}` → `{opacity 0, translateY(-28px)}`; 950 ms `ease-out` |
| Toast | "Missão concluída: +5 Seeds" |
| Oferta | 2600 ms depois: `oferta('conquista')` |
| Vibração / som | `vibrate(12)` no mesmo quadro; `sucesso` 380 ms depois |
| Reduzir movimento | troca o ícone e o número direto, mais o toast |

### 4.2 Capturar

**Entrada direta** (`direto.js:1-67`): no Polido, em **todo aparelho** (decisão da rodada 8), `mostrar('capturar')` vira `'aovivo'`. A tela de entrada de produção (título, modelo, três passos) deixa de ser o caminho normal.

#### Captura pronta (`.px-vivo.px-pronto`)

Marcação base (`telas.js:78-91`): `div.cel.cel-gravando.quest-vivo.px-vivo` > `.cel-conversa > .q-leg > .q-historico[aria-live=polite]` + `.q-faixa[role=toolbar]`.

| Peça | Detalhe | Onde |
|---|---|---|
| Topo `.px-vivo-topo` (novo) | chip "Detectar → Português" (ícones `languages` e `chevron-down`); chip `.px-so-largo` "Modelo local · 589 MB" (ícone `cpu`, escondido no celular); espaço; botão-interruptor do microfone (`role=switch`, `aria-label="Microfone ativo"` ↔ "Microfone mudo"; desligado `opacity .5`); "Ajustes da captura"; "Ajuda" | `direto.js:25-32`, `telas3.css:75-78`, `paineis.css:6-9` |
| Miolo `.px-pronto-miolo` | ícone do microfone 84 × 84 px, raio 26 px (svg 38 px); `h2` "Pronto para legendar" (`900 26px/1.1`, `-0.02em`); parágrafo (`max-width 34ch`) | `direto.js:38-39`, `telas3.css:79-84` |
| Texto no celular | "Toque em Iniciar e deixe o celular perto do som. A legenda nos dois idiomas aparece aqui." | `direto.js:39` |
| Texto no computador | "O som do computador entra sozinho. Dê play no vídeo, aula ou chamada e clique em Iniciar. A legenda bilíngue aparece aqui e nas Legendas flutuantes." | `direto.js:39` |
| Faixa de baixo | relógio `00:00` (ponto parado, `opacity .4`); botão principal "Iniciar captura" (ícone `mic`, `data-px="iniciar"`); "Legendas flutuantes" (ícone pip); `A−`, `A+`, `EN → PT` | `telas.js:82-90`, `direto.js:40-42`, `telas3.css:85` |
| Animação de entrada | ícone `scale(0.4) → 1`, 700 ms `MOLA`, atraso 200 ms; `.px-vivo-topo > *` e os textos do miolo: `opacity 0, translateY(14px)` → normal, 480 ms, `120 + i·60 ms` | `direto.js:43-46` |
| Navegação visível | enquanto pronta, o trilho continua à vista: `.q-casca:has(.px-pronto) .q-trilho { display:flex !important }` | `paineis.css:5`, `telas3.css:90` |
| Segundo toque | tocar de novo em Capturar no trilho, já na tela pronta, começa a gravar | `direto.js:15-20` |
| Painéis | chips e botões do topo abrem os diálogos `capturar:Detectar`, `capturar:Modelo no dispositivo`, `capturar:Ajustes da captura`, `capturar:Ajuda`; "EN → PT" abre `capturar:Detectar` | `direto.js:84-85` |

O microfone **só liga no toque em Iniciar** (`direto.js:6`, `auditoria.html:181`).

#### Iniciar e captura ao vivo

| Momento | Valores | Onde |
|---|---|---|
| Iniciar | som `grava`; botão vira `<i class="q-quadrado"></i> Encerrar`; botão `scale 1 → 0.9 → 1`, 420 ms `MOLA`; miolo sai `{opacity 0, scale(0.9), blur(8px)}`, 260 ms; entra "Ouvindo… a legenda aparece aqui." | `direto.js:48-62` |
| Relógio | incrementa a cada 1000 ms | `telas.js:105-108` |
| Primeira fala | 1100 ms depois; as seguintes, 1500 ms após a tradução da anterior | `telas.js:109, 159` |
| Linha nova | `div.q-linha-da-fala.atual[data-fala]` > `button.q-fala` (`.q-meta > .tn` hora, `.q-t[lang=en]`) + `.q-acoes-da-fala` ("Ouvir de novo", "Opções da fala"); `opacity 0, translateY(26px) scale(0.98)` → normal, 520 ms | `telas.js:118-127` |
| Palavra por palavra | cada palavra é um `span` (`display:inline-block; white-space:pre`): `{opacity 0, blur(6px), translateY(6px)}` → normal, 320 ms; intervalo de 150 ms entre palavras | `telas.js:129-138`, `telas.css:12` |
| Indicador | `p.q-transcrevendo` com `.q-pontos` + "Transcrevendo…" | `telas.js:122` |
| Rolagem | vai ao fim em `smooth` a cada palavra | `telas.js:126` |
| Tradução assume a linha | espera 650 ms; texto sai `{opacity 0, blur(6px)}` em 140 ms `ease`; a original vira `span.q-o[lang=en]` (linha pequena) e `.q-t` recebe a tradução (`lang=pt`): `{opacity 0, blur(8px), translateY(10px)}` → normal, 480 ms; `.q-o`: `opacity 0, translateY(14px)` → normal, 420 ms; som `fala` | `telas.js:139-156` |
| Fala antiga esmaece | `.q-linha-da-fala:not(.atual) { opacity: 0.62 }` (hover 1); `transition: opacity .4s ease, background-color .3s ease` | `telas.css:13-15` |
| Encerrar | `ir('biblioteca')`; 1700 ms depois, `oferta('fim_de_sessao')` | `telas.js:530-533` |
| Tocar numa fala já traduzida | abre a folha da frase | `telas.js:535-536` |
| Celular | `.q-t 22px/1.2`; `.q-o 15px` | `telas.css:108-109` |

#### Folha da frase (`dialog.folha-de-baixo.folha-da-frase`)

`telas.js:197-222`.

- Estrutura: `p.folha-frase[lang=en]`, `p.folha-frase-trad[lang=pt]`, `.folha-grade` com 5 `button.folha-acao` ("Ouvir" como principal, "Ouvir devagar", "Ouvir tradução", "Repetir eu", "Copiar"), bloco da Nuance, `p.folha-rotulo` "Toque numa palavra", `.folha-palavras` com um botão por palavra (`data-nova` se tem glossário e não foi guardada; `data-aprendida` se guardada).
- **Nuance no Grátis:** `div.q-aviso.px-nuance` com cadeado, "Outras formas de dizer", prévia desfocada `.px-nuance-previa` (`filter: blur(4.5px); opacity .75; user-select:none`) com "Formal … Informal …", texto "Sua legenda já usa a Tradução rápida ao vivo, sem esperar." e botão "Conhecer o Premium" (→ Planos).
- **Nuance no Premium:** ícone `sparkles` e prévia `.nitida` (sem desfoque).
- Rótulos "Formal"/"Informal": `font 700 11px mono; uppercase; .08em; padding 3px 6px; raio 6px; fundo color-mix(ink 12%)` (`telas.css:23-36, 133`).
- A prévia desfocada é ideia do autor e precisava de aprovação do dono (`auditoria.html:130`).
- Botão de palavra: `transition: transform 320ms MOLA, background-color .16s, border-color .16s` (`telas.css:44`).

#### Folha da palavra (`dialog.folha-de-baixo.folha-da-palavra`)

`telas.js:223-255`.

- Estrutura: chip "Voltar à frase", `p.folha-pal`, `p.folha-ipa`, `p.folha-glosa` (ou "Sem tradução para esta palavra."), 3 ações ("Ouvir", "Falar eu", "Guardar" como principal), `p.folha-status[role=status]`.
- **Guardar:** o botão vira "Guardada" (ícone `check`); status "No seu caderno. Ela volta nos jogos e na revisão."; som `sucesso`; `vibrate(10)`; botão `scale 1 → 1.12 → 1`, 520 ms `MOLA`; ícone `scale(0) rotate(-90deg)` → `scale(1) rotate(0)`, 520 ms `MOLA`; `rajada(centro, 16)`.

#### Legendas flutuantes (`#leg-flut.leg-flut.modo-video`)

`telas.js:257-380`.

| Aspecto | Valores |
|---|---|
| Estrutura | `.leg-barra` (botão `.leg-tit` "Legendas" com ícone de alça, "Pausar legendas", "Fechar as legendas flutuantes") + `.leg-corpo` ("Esperando a primeira fala") |
| Material | `backdrop-filter: blur(20px) saturate(160%)`; `background rgb(20 18 16/.82)`; `border 1px solid rgb(255 255 255/.12)`; sombra `0 24px 50px -16px rgb(0 0 0/.7)` (`telas.css:50-58`) |
| Posição inicial | canto de cima à direita (`c0.xs[1], c0.ys[0]`). O comentário do código diz "canto de baixo à direita"; vale o código |
| Margem | 16 px; no computador, o x mínimo é a largura do trilho + 16; no celular, o y máximo desconta 86 px |
| Entrada | `{opacity 0, scale .7, blur(8px)}` → normal; 560 ms `MOLA_SUAVE` |
| Pegar | `.px-pegou`: `scale 1.04`, sombra `0 40px 70px -18px rgb(0 0 0/.85)`; `transition: scale 260ms MOLA_SUAVE, box-shadow .25s`; cursor `grab`/`grabbing` |
| Pegar no meio do voo | para as duas molas e continua de onde está |
| Fora dos limites | `elastico(excesso, 120)` |
| Soltar | velocidade por eixo nas últimas 6 amostras; destino = canto mais próximo de `pos + proj(v)·0,4`; uma `molaFisica` por eixo (zeta 0,8, resp 0,42) herdando a velocidade |
| Cresceu com fala nova | recoloca dentro dos limites |
| Fala nova no espelho | `.leg-fala.atual` (`.leg-o[lang=en]`, `.leg-t.discreta[lang=pt]`): `opacity 0, translateY(18px), blur(6px)` → normal, 420 ms; tradução `opacity 0, translateY(8px)` → normal, 380 ms; a anterior vira `.anterior`; mantém só as duas últimas |
| Fechar | `{opacity 0, scale .85, blur(6px)}`, 220 ms |
| Toast ao abrir | "Legendas flutuantes abertas: a janelinha fica por cima de tudo" |

### 4.3 Intérprete

**Entrada direta:** `mostrar('interprete')` vira `'interpretando'` (`direto.js:8-14`). A tela de entrada de produção continua existindo só como preparo da "Conversa virtual" (`direto.js:89-93`).

#### Tela de entrada (produção, ainda usada pelo modo virtual)

- Inverter idiomas (`prototipo.js:1096-1130`): seta gira +180° por clique com `scale 1 → 1.35 → 1`, 700 ms `EIO`, `fill forwards`; os dois textos `.par-idiomas .campo-idioma .v` fazem FLIP em arco: `translate(±dx, 0)` → `translate(±dx/2, ∓26px) scale(1.12)` (offset 0,5) → `translate(0,0)`, 760 ms `EIO`.
- `.campo-idioma` abre o diálogo `interprete:idioma`; "Conversa virtual" alterna o estado na própria tela; `[data-testid="comecar-conversa"]` vai para a conversa (`telas2.js:558-562`).

#### Conversa (`div.int.px-int`)

`telas2.js:148-182`.

- Estrutura: `section.int-metade[data-lado="outro"][data-virada]` ("A outra pessoa · English (US)") + `div.int-faixa[data-com-modo]` + `section.int-metade[data-lado="meu"]` ("Você · Português (BR)").
- Cada metade: `p.int-idioma`, `.int-frase` (dica: "Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta."), `p.int-status[role=status]`, `.int-acoes` ("Repetir", botão grande `.int-falar` "Falar", "Parar voz").
- Faixa do meio: `.int-esq` com "Trocar os lados", "Automático" (cadeado no Grátis, ícone `languages` no Premium) e "Conversa"; `.int-centro` com "Voz do aparelho" e `.int-aviso`; botão "Sair do modo intérprete".
- Acréscimos da entrada direta (`direto.js:68-74`): botão "Virtual" em `.int-esq` (`aria-label="Conversa virtual: traduzir uma chamada"`); em cada `.int-idioma`, um botão `.int-modo.px-int-idioma` "Trocar este idioma" (abre `interprete:idioma`; `min-height 32px`, `telas3.css:86-87`).
- O X volta para a tela de onde a pessoa veio (`telaDeOrigem`, padrão `inicio`) (`direto.js:21, 94`).
- A barra de navegação some em todos os tamanhos: `.q-casca:has(.px-int) .q-trilho { display:none }` (`celular.css:223`).

| Momento | Valores | Onde |
|---|---|---|
| Entrada | metades `opacity 0, translateY(∓60px)` → normal (a de cima vem de −60, a de baixo de +60), 700 ms `MOLA_SUAVE`; faixa `opacity 0, scaleX(0.6)` → normal, 600 ms, atraso 150 ms; botões Falar `scale(0.4) → 1`, 700 ms `MOLA`, atraso `300 + i·120 ms` | `telas2.js:272-279` |
| Falar | `[data-ouvindo]` (scale 1,1), rótulo "Parar", status "Ouvindo…", som `grava`; palavras `span.int-w`: `{opacity 0, blur(5px), translateY(5px)}` → normal, 300 ms, a cada 170 ms | `telas2.js:184-208` |
| Traduzindo | status "Traduzindo…" por 700 ms | `telas2.js:211-212` |
| Tradução do outro lado | `p.int-traducao` + `p.int-original`; status "Lendo a tradução"; som `chega`; `vibrate(8)`; faixa pisca `inset 0 0 0 0 transparent` → `inset 0 0 40px 0 accent 60%` → transparente, 700 ms `ease`; tradução `{opacity 0, translateY(26px) scale(0.94), blur(10px)}` → normal, 620 ms `MOLA_SUAVE`; original `opacity 0 → 1`, 400 ms, atraso 260 ms; metade ganha `.px-lendo` por 1700 ms | `telas2.js:215-232` |
| Lista da conversa | `section.int-conversa` (botão "Exportar", bolhas `.int-bolha[data-lado]`); bolhas `opacity 0, translateX(±30px) scale(0.96)` → normal (lado "meu" +30), 460 ms `MOLA_SUAVE`, `i·70 ms`; vazia: "A conversa aparece aqui conforme vocês falam." | `telas2.js:239-257` |
| Trocar os lados | FLIP por `translate`: `0 Δy` → `0 0`, 620 ms `MOLA_SUAVE`; alterna `data-virada` | `telas2.js:569-582` |
| Automático no Grátis | aviso "O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma." + botão "Conhecer o Premium"; botão treme `translateX 0, −5, 5, −3, 3, 0`, 360 ms `ease-out` | `telas2.js:258-265` |
| Automático no Premium | "Automático ligado: é só conversar. O app reconhece quem fala qual idioma."; rótulos "Falar" viram "Ouvir"; os turnos se alternam sozinhos com 500 ms de pausa | `telas2.js:266-270, 234-237` |

**Intérprete no tema claro** (`paineis.css:49-67`). Em produção a conversa é sempre escura; aqui acompanha o tema. Em `html[data-px='on']:not(.dark) .px-int`:

- `--int-escuro: var(--canvas)`, `--int-escuro-2: var(--surface)`, `--int-linha: var(--border-subtle)`, `--int-tinta: var(--ink)`, `--int-mut: var(--ink-muted)`, `--int-acento: color-mix(in srgb, var(--accent) 72%, var(--ink))`.
- `.int-faixa`: `background var(--surface-sunken)`.
- `.int-metade`: `linear-gradient(180deg, color-mix(accent 12%, canvas) 0%, canvas 62%)`.
- `.int-ib, .int-modo, .int-voz`: `inset 0 1px 0 rgb(255 255 255/.6), 0 1px 2px rgb(38 36 31/.08)`.
- `.int-bolha[data-lado='meu']`: `color-mix(accent 14%, surface)`.

**Aviso em linha própria** (`paineis.css:76-101`): `.int-faixa { flex-wrap:wrap }`; quando `.int-aviso` não está vazio, `.int-centro` ganha `order 9; flex 1 1 100%; flex-direction row; flex-wrap wrap; center; gap 8px 12px; padding 6px 4px 2px` e esconde `.int-voz`; `.int-aviso`: `max-width 62ch; centralizado; 14px/1.35`.

**Tela larga (≥ 900 px)** (`paineis.css:103-107`): `.int-metade { padding-inline: max(24px, calc((100% − 980px)/2)) }`; `.int-traducao 40px`; `.int-original, .int-ao-vivo, .int-dica 17px`.

Tamanhos de ícone: Falar 30 px; demais 18 px (`telas2.css:45-46`).

### 4.4 Jogar (lobby)

Marcação de produção (`cap.jogarTrilha`). Miniaturas e minijogos estão fora do meu escopo.

| Item | Detalhe | Onde |
|---|---|---|
| Entrada / rolagem | cascata e revelação na rolagem genéricas (2.4) | — |
| Submenus ligados | "Buscar e filtrar", "Favoritos e ordem", "Opções" (diálogos); "Por que este?" e a linha da trilha `.qj-trilha .q-linha` (estados na própria tela) | `telas2.js:611-615` |
| "Trocar…" | abre o painel "O que você vai praticar" (`abrirFolha('fonte')`, inserido em `main`); "Usar estas palavras" fecha | `prototipo.js:1180, 579-582` |
| Atalhos | "Partida rápida" e "Começar" → jogo | `prototipo.js:1181` |
| Estatísticas → Jogar | "Praticar agora" | `prototipo.js:1191` |
| Celular | ver 5.4 | `celular.css:128-150` |

A Memória antiga em `prototipo.js:966-1094` (distribuição do monte, giro em dois tempos, par, erro, confete) foi substituída pelo motor de jogos na rodada 14 (`auditoria.html:261`); fica com o outro agente.

### 4.5 Estatísticas

- Marcação de produção, 7 abas capturadas (`estatisticas/0…6`); aba primária `.qe-abas`.
- Nenhum redesenho próprio. Recebe só a camada genérica: entrada, pílula, painel entrando pelo lado.
- Celular: `.qe-kpis` vira carrossel (`flex 0 0 46%`, `scroll-snap-align: start`) e entra na lista de áreas que rolam de lado (`celular.css:114-126`, `sentidos.js:309`).
- Recomendação registrada: não animar gráficos nem números aqui (`auditoria.html:291`).

### 4.6 Personalizar

Cabeçalho comum (`telas2.js:348-351`): sobrancelha "Seu visual", `h1` "Personalizar", chip `.px-seeds` (ícone `sprout` verde + saldo + "Seeds"); abas `.q-abas.qp-abas[role=tablist]`: Coleção `4`, Maestria `0/18`, Temporada, Conquistas `0/40`, Loja.

- **Maestria e Conquistas ficam como em produção** (`telas2.js:406`).
- Correções de layout: `html .q-palco.px-personalizar { display:flex !important; flex-direction:column !important }` com filhos `flex 0 0 auto` (`telas3.css:51-52`); `html .q-palco.qp { grid-template-rows: max-content max-content; grid-auto-rows: max-content; align-content:start }` (`telas3.css:112`).

#### Coleção (ateliê)

`telas2.js:352-365`, `telas2.css:68-102`.

- `.px-atelie`: grade `minmax(280px, .9fr) minmax(0, 1.4fr)`, `gap 20px`; ≤ 900 px vira uma coluna e a vitrine deixa de ser `sticky` (`telas2.css:273-276`).
- **Vitrine** `section.q-cartao.px-vitrine` (`position:sticky; top:0`):
  - rótulo "Como está agora" (+ " · em prévia");
  - `.px-vitrine-tela` com legenda de exemplo (`We ship the roadmap today.` / `Entregamos o roteiro hoje.`; fundo `#1c1917`, tradução `#ffea00`, sublinhado verde), três cartões "nova / aprendida / dominada" e barra a 62%;
  - rodapé com o nome do tema e, se equipado, o selo "Equipado";
  - em prévia: "Voltar ao {tema equipado}" + "Equipar" (tema da coleção) ou botão com o rótulo do bloqueio.
- **Temas** `section.px-temas`: "Temas" / "Toque para experimentar no app inteiro. Nada muda de verdade até você equipar."; grade `repeat(auto-fill, minmax(150px, 1fr))`, `gap 12px`.
- Cada tema: `button.q-tile.px-tema[data-px-tema][aria-pressed]` com `.px-amostra` (4 faixas lidas do CSS: `--canvas, --surface, --accent, --ink`; a terceira com `flex 1.4`; altura 54 px), nome e estado; selecionado: `border-color acento` + `0 0 0 3px color-mix(acento 30%)`.
- Lista (`telas2.js:285-298`; "Água" inserida na posição 2 por `agua.js:10`): Babel Atelier (seu), Água (seu), Linear Indigo (nível), Papel, Jardim, Aurora, Mochi, Notion, Vercel, Rádio, Neon, Fliperama (loja), Observatório (temporada).
- Rótulos de estado: "Na sua coleção", "Chega no nível 4", "Na Loja", "Na Temporada 1"; "Equipado" no atual; cadeado nos que não são da coleção.
- Linhas-resumo (`.q-grade.g4` de `button.q-linha`): Tema, Partículas "Do tema", Fonte "Padrão (Inter)", Menu "Trilho de ícones".
- **Provar tema** (`telas2.js:409-428`): `revelar()` em círculo (800 ms `EIO`) a partir do clique; aplica `data-theme`, recolore as partículas e refaz a tela; não equipa. Sair do Personalizar desfaz a prévia.
- **Equipar** (`telas2.js:587`): `repintar` sem animação + toast "Tema equipado."
- Os nomes dos temas (fora Babel Atelier e Linear Indigo) e o custo de cada um são rascunho (`auditoria.html:147`).

#### Temporada

`telas3.js:108-150` (substitui a versão de `telas2.js:366-383`).

- **Cabeçalho** `section.q-cartao.px-temporada`: `.px-ceu` (6 estrelas em `radial-gradient` + brilho do acento, cintila em 4 s); texto "Temporada 1 · Observatório", `h2` "Nível 3 de 30", "De 1 de outubro a 25 de novembro · termina em 50 dias. O que você ganha não expira.", barra de XP (60/150), nota "60 / 150 XP · faltam 90 XP · a seguir: +70 Seeds, no nível 4. Sobe com o XP de estudo ganho na temporada."
- **Anel** `.px-anel` (`--pct`): 132 px (96 px no celular); `conic-gradient(var(--accent) calc(var(--pct)·1%), var(--surface-sunken) 0)`; miolo `var(--surface)`; texto `var(--ink)`. Acompanha o tema (`telas2.css:291-294`).
- **Cartão do fim** `button.q-linha.px-final[data-px-nivel="30"]`: "No fim da trilha · nível 30", "Tema Observatório", "Para quem estuda até o fim. Com a assinatura, também a Moldura Via Láctea, a única Lendária da temporada.", "Ver o fim"; dourado `#e9a918` / `#c98a00` (`telas3.css:37-40`).
- **Seção:** "Trilha de recompensas" / "{N} recompensas estudando · mais {M} com a assinatura. Dá para ver todas, até a última."; segmentos `.px-faixas` "1–10", "11–20", "21–30".
- **Trilha** `.px-trilha` (rolagem horizontal, sem snap, `telas3.css:27`):
  - rótulos fixos `.px-trilha-rotulos` ("Grátis / estudando", "Assinante / com a assinatura") como cartão: `112px` de largura, `margin-right 12px`, borda 1 px, raio 18 px, `var(--surface)`, sombra `12px 0 22px -14px rgb(0 0 0/.35)`; no celular `74px` (`telas3.css:114-127`);
  - 30 degraus `.px-degrau[data-nivel]` (`.feito`, `.proximo`, `.ultimo`): 148 px de largura (128 px no celular), linhas `92px 44px 92px`; linha de 4 px ao meio (acento quando feito); nó `.px-no` de 40 px.
- **Prêmio** `button.px-premio.r-{comum|raro|epico|lendario}[data-px-premio][data-rotulo]`: 132 px (116 px no celular), `min-height 78px`, raio 16 px; ícone (`lock`, `check`, `sprout` ou `star`), nome e estado ("resgatado", "resgatar", "com a assinatura" ou a raridade).
- Raridade (`telas3.js:115`): nível 30 do assinante = Lendário; > 20 = Épico; > 10 = Raro; senão Comum. Cores `--rar`: Comum `var(--ink-muted)`, Raro `#4f86e8`, Épico `#a260ee`, Lendário `#e9a918`; `border-top: 3px solid var(--rar)` (`telas3.css:29-36`).
- Estados visuais: resgatável = borda do acento + `0 0 0 3px accent 22%`; pego = borda verde; trancado = borda tracejada; último degrau = `0 0 0 3px rar 30%, 0 14px 28px -12px rar`.
- Aviso no Grátis: "A trilha de baixo tem {M} recompensas e vem com a assinatura. O que é de uma temporada volta à Loja com Seeds um ano depois do fim." + "Conhecer o Premium". Nota: "Não existe compra de nível: a temporada sobe só com o XP de estudo."
- **Ir para o nível** (`telas3.js:116-122`): `scrollTo({left: alvo.offsetLeft − 120, behavior:'smooth'})`; prêmios do degrau `scale 1 → 1.12 → 1`, 620 ms `MOLA`, atraso `420 + i·90 ms`.
- **Resgatar** (`telas2.js:593-609`): som `moeda`; toast "Resgatado: {rótulo}"; Seeds conta em 800 ms; `rajada(x, y, 24, 1.2)`; `vibrate(12)`.
- Toasts de bloqueio: trancado alcançado → "Esta recompensa vem com a assinatura."; não alcançado → "{rótulo}: chega no nível {n}[, com a assinatura]." (`telas3.js:160`).
- Lista completa dos 30 prêmios: `telas2.js:335-346` e `telas3.js:109-114`.

#### Loja

`telas2.js:384-403, 429-477`; `telas2.css:190-247`.

- **Carteira** `section.q-cartao.px-carteira`: ícone `sprout` 60 px; rótulo "Seeds"; `b.px-saldo` (`900 44px`, `tabular-nums`); texto "Vêm de estudar e compram tudo o que está na prateleira de Seeds. Não se compram com dinheiro."; botão "Ganhar jogando" (→ Jogar).
- **Categorias** `.q-abas.q-seg.px-cats`: Tudo, Temas, Legendas, Cartões, Efeitos de jogo, Partículas e rastros.
- **Grade** `.px-loja`: `repeat(auto-fill, minmax(260px, 1fr))`, `gap 16px`.
- **Item** `article.q-cartao.px-item[data-item]`: `.px-arte[data-arte]` (118 px, arte em CSS: `legenda`, `fita`, `pixel`, `cartao`, `brasa`, `paleta`, `confete`); selo "Comum" + categoria; `h3`; descrição; rodapé `.px-item-pe`.
- Rodapé: se comprado, "Na sua coleção". Senão, chip do preço e (a) barra + "Faltam N Seeds" ou (b) `button.q-ctl.pri.px-segurar[data-px-comprar]` "Segure para comprar"; sempre "Ver prévia".
- 9 itens (`telas2.js:315-325`): Legenda Cinema 350, Partículas Pixel 350, Acerto Pixel 350, Cartão Caderno 360, Combo Brasa 360, Legenda Fita 380, Paletas Pastel 380, Acerto Confete 380, Acerto Brasa 400.
- Vazio: "Nada nesta prateleira ainda".

**Segurar para comprar** (`telas2.js:435-477`):

| Passo | Valores |
|---|---|
| Enchimento | `.px-segurar-fundo` (`rgb(0 0 0/.28)`): `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`; **1100 ms `linear`**, `fill forwards` |
| Som | tom contínuo 280 → 980 Hz enquanto segura |
| Soltar antes (`pointerup` / `pointerleave`) | cala o tom, cancela, e o fundo recolhe: `{inset(0 0 0 0), opacity .6}` → `{inset(0 100% 0 0), opacity 0}`, 200 ms |
| Concluir | som `moeda`; debita; `repintar` sem animação; toast "{nome} agora é seu."; saldo e chip contam em 900 ms; `vibrate([10,40,16])`; `rajada(centro do cartão, 34, 1.4)`; cartão novo `scale(0.94) rotateY(60deg)` → normal, 760 ms `MOLA_SUAVE` |
| Prévia | `confete` → `confete(90)`; `pixel` / `brasa` → `rajada(x, y, 26, 1.3)`; demais → toast "Prévia aplicada na vitrine da Coleção." |

### 4.7 Painel "Mais"

Marcação de produção (`cap.maisFundo` / `cap.maisAvisos`).

| Mudança | Detalhe | Onde |
|---|---|---|
| Linha "Planos e Premium" (nova) | `button.q-linha.px-entrada-premium[data-px="planos"]` antes de `.q-faixa-do-mais`: ícone `sparkles`, "Planos e Premium", subtítulo "Você está no Grátis · teste o Premium por 14 dias, sem cartão" ou "Premium em teste · 14 dias", seta; borda `color-mix(acento 55%)`, fundo `linear-gradient(100deg, color-mix(acento 14%, surface), surface 70%)` | `telas2.js:119-124`, `telas2.css:37-38` |
| Tiles extras no celular | "Estatísticas" e "Personalizar" clonados de um tile sem `.q-pede-conta`, com os ícones do trilho, inseridos no início da grade (`data-px-extra`) | `prototipo.js:387-402` |
| Rotas dos tiles | Ajustes, Estatísticas, Personalizar, Biblioteca, Sobre, Ajuda e suporte | `prototipo.js:592-601` |
| Faixa de baixo | "Buscar" (fecha a seco e abre a busca), "Tema claro" / "Tema escuro" (círculo), "Som dos toques: ligado/desligado" | `prototipo.js:583-591` |
| Abas | Atalhos ↔ Avisos, com a animação de 2.7 | `prototipo.js:537-557` |

### 4.8 Busca

Ver 2.9. Destinos (`prototipo.js:605-615`): Iniciar captura, Início, Capturar, Intérprete, Jogar, Estatísticas, Personalizar, Ajustes, Biblioteca e Planos (novo). Filtra ao digitar, esconde grupos vazios, setas e Enter navegam.

### 4.9 Ajustes

- Marcação de produção, 6 abas (`ajustes/0…5`); aba primária `.q-abas:not(.q-seg)`; alcançada pelo Mais.
- Única adição: na aba de índice 5 (Conta), logo após as abas, `div.q-aviso.px-plano-na-conta` com "Seu plano: Grátis" (ou "Seu plano: Premium, em teste"), "Veja o que cada plano inclui, o seu consumo e a sua assinatura." e botão "Ver planos" (`telas2.js:140-143`, `telas2.css:40`).
- Celular: ver 5.4.

### 4.10 Biblioteca

Montada a partir de `BibliotecaDoQuest.tsx`, com 6 gravações de exemplo (`telas.js:382-435`).

- `div.q-palco.q-bib` > cabeçalho (sobrancelha "{n} gravações · {min} min · {palavras} palavras", `h1` "Biblioteca", chips "Mais recentes" e "Importar"), busca `label.q-campo.q-bib-busca` ("Buscar por título"), abas `.q-abas[role=group]` (Todas, Áudio, Vídeo, Texto, com contagem `.n`), corpo `.q-bib-corpo`.
- Coluna `.q-bib-col`: lista `.q-lista` de `button.q-linha[data-px-grav][aria-pressed]` (4 por página), linha "Capturar outra sessão" (`.q-bib-nova`: "O que você ouvir vira texto, palavras e jogos."), paginação `.q-faixa.q-bib-paginas` ("Anterior", "n / total", "Próxima").
- Painel `section.q-cartao.q-bib-det`: topo com tags ("Fixada", "Processando"), `dl.q-bib-fatos` (Palavras, Duração, Idioma, Data), ações ("Abrir" principal; "Jogar com esta", "Revisar palavras"; "Exportar transcrição", "Retomar captura"; "Fixar no topo" / "Desafixar", "Renomear", "Excluir").
- Vazio: "Nenhum resultado" / "Nenhuma gravação tem "…" no título." / "Limpar a busca".

| Ação | Animação | Onde |
|---|---|---|
| Trocar de gravação | painel `{opacity .2, scale(0.97), blur(8px)}` → normal, 460 ms; `.q-bib-fatos > div, .q-bib-acoes > *`: `opacity 0, translateY(12px)` → normal, 420 ms, `60 + i·45 ms` | `telas.js:447-450` |
| Página, filtro, busca | linhas `opacity 0, translateX(46·dir px)` → normal, 460 ms, `i·55 ms` (dir = sentido da página) | `telas.js:451-453` |
| Busca | filtra a cada tecla, mantendo foco e cursor | `telas.js:437-445, 550-556` |
| "Abrir" | vai para a Sessão | `telas3.js:153` |

Celular: lista em cima e painel embaixo (`.q-bib-corpo` em uma coluna, `gap 14px`); `.q-fim` da linha some; painel com `overflow hidden`; ações `flex 1 1 140px` (`telas.css:114-116`, `telas3.css:68-71`).

### 4.11 Sessão (player)

Montada a partir de `SessaoDoQuest.tsx` (`telas3.js:11-106`).

- `div.q-palco.qs.px-sessao` > cabeçalho (voltar; sobrancelha "Sessão de {tipo} · {min} min"; `h1`; `p.qs-sub` "Análise do texto, prática ativa e exercícios criados a partir desta mídia."; chip "Trocar de sessão"; "Exportar").
- Abas `.q-abas.qs-abas.px-abas-sessao`: Transcrição, Leitura, Jogos `4`, Visão geral & métricas. Trocar usa `repintar` com direção (`telas3.js:164-170`).

| Aba | Conteúdo |
|---|---|
| Transcrição | chips "Procedência", "Palavras desta sessão 37", "Ajustar exibição"; falas `.qs-fala[data-fala]` (quem, tempo, tag "Polida" na 2ª, `.qs-o` com **cada palavra em `span.w`**, `.qs-t`), ações "Ouvir este trecho" e "Opções da fala"; player |
| Leitura | segmentos "Modo interativo" / "Desenho livre", chips "Estudos & notas" e "Ajustar exibição"; `button.ql-frase` com `.ql-o` (palavras em `span.w`) e `.ql-t`; player com "Narrar" e "Voz, idioma e tom" |
| Jogos | "Jogos com esta sessão" / "As rodadas usam só as palavras e as falas desta gravação."; 4 tiles (Memória abre; os outros dão toast) |
| Visão geral & métricas | segmentos "Painel", "Inteligência lexical", "Fluência"; cartões de números, nuvem `.px-nuvem`, microdados, ritmo por falante |

**Player** `.q-faixa.px-player` (`telas3.js:69-70, 73`; `telas3.css:13-21, 54-55`):

- Botões: anterior, principal ("Ouvir" na Transcrição, "Narrar" na Leitura; vira "Pausar"), próxima; trilho `.px-trilho-do-player > .qs-posicao`; texto `.px-onde` ("Fala 1 de 6" / "Frase 1 de 6").
- Estilo: `position:sticky; bottom:0; z-index:3`; vidro `color-mix(surface 80%, transparent)` + `blur(18px) saturate(160%)` + sombra `0 18px 40px -16px rgb(0 0 0/.4)`; uma linha só (`flex-wrap: nowrap`).

**Marcação palavra por palavra** (`tocar`, `telas3.js:28-62`):

| Passo | Valores |
|---|---|
| Linha ativa | classe `ativa` (Transcrição) ou `narrando` (Leitura); `scrollIntoView({block:'center', behavior:'smooth'})`; `scale(0.985) → 1`, 420 ms `MOLA_SUAVE` |
| Palavra dita | a cada **210 ms** uma `span.w` ganha `.dita`: `color: var(--q-acento)`; no Polido também `background: color-mix(acento 16%)` e `box-shadow: 0 0 0 2px color-mix(acento 16%)`; `transition: color .22s, background-color .22s`; raio 5 px (`telas3.css:9-11`) |
| Entre linhas | **520 ms** |
| Barra de posição | `width = (i+1)/6 · 100%`; `transition: width 500ms EO`; gradiente `acento-2 → acento` |
| Linhas | `transition: background-color .3s, box-shadow .3s, border-color .3s` (`telas3.css:12`) |
| Som | `grava` ao iniciar |
| Parar | limpa classes e timers, restaura o rótulo; também ao sair da tela ou trocar de aba |
| Anterior / próxima | recomeça na linha vizinha (limitado a 0–5) |
| Tocar numa fala ou frase | abre a mesma folha da frase da captura (`telas3.js:175-177`) |

Celular: ver 5.4.

### 4.12 Planos (tela fixa)

`telas2.js:39-106`; estilos em `telas.css:64-94` e `telas2.css:7-40`.

**Onde ficou acessível** (quatro entradas fixas mais os convites):

1. Linha "Planos e Premium" no Mais (`telas2.js:119-124`).
2. Selo do plano no Início (`telas2.js:136-139`).
3. Cartão em Ajustes → Conta (`telas2.js:140-143`).
4. Item "Planos" na busca (`telas2.js:125-135`).
5. Qualquer botão "Conhecer o Premium" ou `[data-px="planos"]`: folha da frase, oferta, aviso da temporada, intérprete (`telas.js:528`, `telas2.js:549`).

**Estrutura:** `div.q-palco.px-planos-tela` > cabeçalho (sobrancelha "Planos"; `h1` "Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho", `max-width 24ch`; chip `.px-meu-plano` "Seu plano: Grátis" / "Premium · em teste") > abas `.px-abas-planos`: **Planos**, **Sua assinatura**, **Consumo do mês**.

| Aba | Conteúdo |
|---|---|
| Planos | dois cartões `.px-planos-grade` (`q-grade g2`, `align-items:start`); garantia "Pagamento seguro · 7 dias para desistir com reembolso · cancele quando quiser"; "Comparar em detalhe" (tabela `.px-compara`, 8 linhas, `telas2.js:43-52`; coluna Premium com fundo `acento 9%`) + nota "* uso justo: até 2 h de nuvem por dia e 40 h por mês; passando disso, a legenda segue no aparelho."; "Perguntas frequentes" (4 `details.q-cartao` em `.px-faq`, `telas2.js:53-58`) |
| Sua assinatura | `section.q-cartao.px-assinatura`: "Você está no Grátis" / "Premium, em teste", texto, e ações ("Testar 14 dias grátis" + "Comparar os planos", ou "Assinar Premium" + "Voltar ao Grátis agora") |
| Consumo do mês | 4 cartões `.q-cartao.q-num.px-consumo` com barra (Áudio transcrito na nuvem, Chamadas à IA de nuvem, Tokens de IA, Armazenamento); no Grátis, aviso "Chamadas e tokens de IA de nuvem fazem parte do Premium. A legenda no aparelho continua sem limite." + "Ver planos" |

**Cartão Grátis** (`section.q-cartao.px-plano`): rótulo "Seu plano"; `h3` "Grátis" (`900 26px`); preço `R$ 0` (`900 40px`, `-0.02em`) "para sempre"; "Sem cartão, sem conta."; 4 itens; botão "Continuar grátis" (→ Início).

**Cartão Premium** (`.px-plano.px-premium`): selo "Recomendado" (ou "Em teste") + "Tradução Nuance"; `h3` "Premium"; `R$ 19,90` "por mês"; "Para entender o jeito de dizer, não só a palavra."; "Tudo do Grátis, e:"; 5 itens (um com nota de uso justo); "Testar 14 dias grátis" (principal), "Assinar Premium"; nota "Sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado."

**Borda de luz do Premium** (`telas.css:85-94`): `border-color: transparent`; `background: linear-gradient(surface, surface) padding-box, conic-gradient(from var(--px-ang), acento, #ffc27a, acento 40%, color-mix(acento 30%, transparent) 60%, acento) border-box`; gira em 5 s `linear`; sombra `0 30px 60px -30px color-mix(acento 90%)`. Fora do Polido: `border 2px var(--q-acento)`.

| Ação | Efeito | Onde |
|---|---|---|
| Ativar teste | `conta.premium = true`; vai para "Sua assinatura" (`repintar`, dir 1); toast "Premium ativado por 14 dias. Sem cartão; no fim volta ao Grátis sozinho."; `vibrate([12,60,12])`; `confete(120)`; sons `sucesso` e `festa`. Abre o cadeado da Nuance e o automático do intérprete | `telas2.js:108-117` |
| Assinar | toast "No app, aqui abre o pagamento do Premium." | `telas2.js:554` |
| Voltar ao Grátis | toast "Você voltou ao Grátis. Nada foi cobrado." | `telas2.js:556` |

Celular: `h1` 22 px; grade em uma coluna com o Premium primeiro (`order: -1`); `.px-assinatura` em coluna; tabela 14 px (`telas.css:105-107`, `telas2.css:283-285`).

As perguntas frequentes são rascunho do autor (`auditoria.html:147`).

### 4.13 Oferta (`aside.qc-oferta`)

`telas.js:479-519`.

- Estrutura: ícone; `.qc-oferta-texto` (selo "Sugerido: 14 dias de Premium grátis, sem cartão", título, corpo); botão fechar; ações "Conhecer o Premium" (principal), "Agora não", "Não mostrar novamente".
- Momentos:
  - `fim_de_sessao`: ícone `book-open`, "Boa sessão!", "No Premium, toque numa frase para ver outras formas de dizer e escolher entre formal e informal."
  - `conquista`: ícone `trophy`, "Mais uma conquista", "Quer ir além da tradução rápida? A Tradução Nuance do Premium mostra o jeito de dizer."
- Regras: uma por vez; nunca sobre captura (`aovivo`), rodada (`jogo`) ou painel aberto; respeita "Não mostrar novamente" (toast "Combinado: esta sugestão não aparece mais.").
- Quando: 1700 ms depois de Encerrar; 2600 ms depois de uma missão concluída.
- Entrada: `{opacity 0, translate: 0 120%}` → normal, 680 ms `MOLA_SUAVE`; ícone `scale(0.4) rotate(-20deg)` → normal, 700 ms `MOLA`, atraso 180 ms; textos e ações `opacity 0, translateY(12px)` → normal, 420 ms, `200 + i·55 ms`.
- Saída: `{opacity 0, translate: 0 120%}`, 280 ms `EG`.
- Estilo: animação de produção anulada; sombra `0 30px 60px -20px rgb(0 0 0/.5), inset 0 1px 0 rgb(255 255 255/.5)` (`telas.css:95-98`).
- Som: `chega`. Celular: ver 5.4.

### 4.14 Sobre, Ajuda e suporte, submenus

- `sobre` e `ajuda`: marcação de produção (`D.sub['tela:Sobre']`, `['tela:Ajuda e suporte']`), alcançadas pelo Mais; só a camada genérica (`telas2.js:482-483`).
- Diálogos capturados: `jogar:Buscar e filtrar`, `jogar:Favoritos e ordem`, `jogar:Opções`, `capturar:Modelo no dispositivo`, `capturar:Ajustes da captura`, `capturar:Ajuda`, `capturar:Detectar`, `interprete:idioma`.
- Estados na própria tela: `jogar:Por que este?`, `jogar:Trilha`, `interprete:Conversa virtual`.

### 4.15 Vocabulário

**Não existe tela de Vocabulário no protótipo.** A palavra só aparece em textos de plano ("Jogos, vocabulário e revisão"). Nada a portar a partir destes arquivos.

---

## 5. Celular (`celular.css` e JS relacionado)

Corte único: `@media (max-width: 720px)`, o mesmo do app; no JS, `celular() = matchMedia('(max-width: 720px)').matches` (`prototipo.js:384-385`).

### 5.1 Barra flutuante

`celular.css:10-89`.

| Aspecto | Valor |
|---|---|
| Contêiner | `.q-casca { position: relative }`; `.q-trilho`: `position:absolute; left 12px; right 12px; bottom: max(12px, env(safe-area-inset-bottom)); z-index 30; height 68px; padding 6px 8px; gap 2px; justify-content: space-between; align-items: center; overflow: visible` |
| Material | `border: 1px solid color-mix(border-subtle 70%, transparent)`; `border-radius: 26px`; `background: color-mix(surface 78%, transparent)`; `backdrop-filter: blur(22px) saturate(170%)`; sombra `inset 0 1px 0 rgb(255 255 255/.5), 0 18px 40px -14px rgb(0 0 0/.45)`; escuro `inset 0 1px 0 rgb(255 240 220/.07), 0 18px 40px -12px rgb(0 0 0/.8)` |
| **Cinco destinos, nesta ordem** | **Início · Jogar · [Capturar] · Intérprete · Mais** (`order` 1–5 nos `nth-of-type` 1, 4, 2, 3, 8) |
| Escondidos | Estatísticas, Personalizar e Buscar (`nth-of-type` 5, 6, 7: `display:none`); os dois primeiros vão para o Mais como tiles; a busca fica pelo botão "Buscar" do Mais |
| Item | `flex 1 1 0; min-height 54px; padding 4px 0; gap 3px; border 0; border-radius 18px; sem fundo nem sombra`; rótulo `font 700 10.5px/1; letter-spacing .01em`; ícone 22 px; atual: `color: var(--q-acento)` |
| Capturar no centro | `flex 0 0 62px; height 62px; margin: -22px 6px 0; border-radius 50%`; `color: var(--q-sobre-acento, #fff)`; `background: linear-gradient(160deg, var(--q-acento-2, var(--q-acento)), var(--q-acento))`; sombra `inset 0 1px 0 rgb(255 255 255/.35), 0 0 0 5px color-mix(canvas 90%, transparent), 0 14px 24px -8px color-mix(acento 80%, transparent)`; sem rótulo; ícone 26 px; quando atual, o anel vira `color-mix(acento 30%, canvas)` e a pílula some |
| Pílula | sem borda, raio 18 px, sem sombra |
| Contagem do Mais | `top 0; right 14%; min-width 18px; height 18px; font-size 11px` |
| Some ao rolar | `.q-trilho { transition: transform 480ms MOLA_SUAVE }`; `.px-some { transform: translateY(150%) }`. Esconde se rolou mais de 6 px para baixo, `scrollTop > 90` e não está no fim (folga de 24 px); volta ao subir mais de 6 px ou no fim; reaparece em toda troca de tela (`celular.css:256-257`, `sentidos.js:279-304`) |
| Some na conversa do intérprete | `.q-casca:has(.px-int) .q-trilho { display:none }` (todos os tamanhos) |
| Fica visível na captura pronta | `.q-casca:has(.px-pronto) .q-trilho { display:flex !important }` |

### 5.2 Conteúdo e cabeçalhos

| Regra | Valor | Onde |
|---|---|---|
| Respiro para a barra | `:is(.q-palco,.rolagem) { overflow-x:hidden; padding-bottom:112px; scroll-padding-bottom:112px }`; `.q-palco gap 16px` | `celular.css:92-97` |
| Título | `.q-cab :is(h1,h2) 28px` | `celular.css:98` |
| Cabeçalho | `.q-cab gap 10px`; primeiro filho `flex 1 1 150px`; chips e botões `min-height 44px` | `celular.css:229-231` |
| Abas | sempre uma linha que rola: `flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; max-width:100%; align-self:stretch`; aba `flex 0 0 auto; min-height 46px; padding 0 14px; 15px` | `celular.css:226-227` |
| Abas de página | `.q-palco > .q-abas` e `.q-palco > * > .q-abas:not(.q-seg)`: sangram (`margin-inline -16px; padding-inline 16px`), sem fundo nem borda, com máscara `linear-gradient(90deg, transparent, #000 16px, #000 calc(100% − 28px), transparent)` | `celular.css:156-166` |
| Nada estoura | `:is(.q-cartao,.q-linha,.q-tile,.q-aviso)`, `.q-palco > *`, `.q-secao` e filhos: `min-width 0; max-width 100%`; textos com `overflow-wrap: anywhere` | `celular.css:245-247, 261-262` |
| Aviso | `.q-aviso` em coluna, `gap 12px; padding 16px`; botão centralizado | `celular.css:153-154` |

### 5.3 Folhas de baixo no celular

| Folha | Valores | Onde |
|---|---|---|
| Painel `.q-mais` | fundo `place-items: end center; padding 0`; painel `width 100%; max-height 90%; padding: 30px 16px max(20px, env(safe-area-inset-bottom)); gap 14px; border-radius 30px 30px 0 0; border-bottom 0; touch-action: pan-y; overflow-x hidden` | `celular.css:169-178`, `telas.css:121` |
| Alça | `::before` 40 × 5 px, `top 10px`, centralizada, raio 99 px, `color-mix(ink 28%, transparent)` | `celular.css:179-189` |
| Cabeçalho do painel | `flex-wrap: nowrap; touch-action: none; cursor: grab`; primeiro filho `flex 1 1 auto` | `celular.css:190-195` |
| Grade do Mais | 2 colunas, `gap 10px`; tile em linha `padding 12px; gap 10px; min-width 0`; ícone 38 px com raio 11 px; título 15 px; `.q-pede-conta` vira só ícone (`font-size 0`, svg 14 px) | `celular.css:196-199`, `telas.css:122-126` |
| Tela de trás | `.px-recuado .px-tela { transform: scale(0.9) translateY(-8px) }`; o blur 3 px, a saturação 0,85 e o raio 28 px de `efeitos.css` continuam | `celular.css:201` |
| Arrastar | ver 2.10 | — |
| Diálogos de ajuste | `width/max-width 100%; max-height 92dvh; margin: auto 0 0; border-radius 28px 28px 0 0; border-bottom 0; flex column` | `paineis.css:11-20` |
| Cabeçalho do diálogo | `.dlg-cab`: `center; gap 10px; padding 18px 16px 12px`; ícone 38 px; `h2 19px/1.15` balanceado; subtítulo `13.5px/1.3` | `paineis.css:22-27` |
| Corpo e pé | `.dlg-corpo`: `padding 12px 16px; flex 1 1 auto; overflow-y auto`; `.dlg-pe`: `padding: 10px 16px max(14px, env(safe-area-inset-bottom)); space-between; border-top 1px` | `paineis.css:28-29` |
| Linha de ajuste | `.op-linha, .q-ajuste`: texto em cima, controle embaixo ocupando a largura (`column; stretch; gap 10px`); exceção: com interruptor ou checkbox fica lado a lado | `paineis.css:31-42` |
| Controles | `.seg` ocupa a largura; botões `flex 1 1 0; min-height 44px; padding 4px 8px; white-space normal`; selects, inputs e `.campo` em 100%; `.q-abas` quebra linha com raio 22 px | `paineis.css:35-46` |
| Folha da frase / palavra | `dialog.folha-de-baixo { margin-inline: auto }` | `telas.css:130` |

### 5.4 Ajustes por tela no celular

| Tela | Correções | Onde |
|---|---|---|
| Início | grade `.q-grade.g3.q-cresce` em 2 colunas, `gap 12px`; o tile principal ocupa a linha inteira (`min-height 148px`); os outros `padding 16px`, título 18 px, descrição 14 px; linha de progresso quebra (`flex-wrap; gap 12px; padding 16px`); **missões em carrossel**: `display flex; gap 12px; margin-inline -16px; padding 4px 16px 10px; scroll-snap-type: x mandatory; overscroll-behavior-x: contain`, cada cartão `flex 0 0 78%` com `scroll-snap-align: center` | `celular.css:101-126` |
| Jogar | botões do cabeçalho dividem a largura; `.qj-ferramentas` vira faixa que rola (`nowrap; gap 8px`, sangrada); sugestão quebra e não vaza (`overflow hidden`), com as ações em faixa e `[data-sugestao]` primeiro; grade de jogos `.q-grade.g4` em 2 colunas (`gap 12px`; tile `padding 14px; gap 8px`; título 16 px; sem descrição; `.qj-conta 12px`) | `celular.css:129-150, 241-243`; `telas.css:118-120` |
| Estatísticas | `.qe-kpis` em carrossel (`flex 0 0 46%`, snap `start`); `.qe .q-cab > .q-abas { flex: 1 1 auto }` | `celular.css:114-126, 155` |
| Capturar (entrada de produção) | botões do `.cartao.estudio` com reticências; `.estudio-acoes` e `.linha` quebram com `gap 8px` | `celular.css:264-266` |
| Captura pronta | faixa com `margin-bottom 100px`, centralizada; botão principal `flex 1 1 auto; min-height 60px; 18px`; somem relógio, `.q-fica` e `.q-espaco`; anel pulsando no ícone | `telas3.css:88-106` |
| Intérprete | faixa `gap 6px; padding 8px`; `.int-esq` em flex com `gap 6px`; `.int-voz` com `padding 0 10px`; rótulos "Conversa" e "Voz do aparelho" somem. "Virtual" e "Automático" mantêm o rótulo | `paineis.css:68-74` |
| Ajustes | `.q-ajuste` quebra com `gap 10px`; rótulo `flex 1 1 200px` | `celular.css:259-262` |
| Biblioteca | uma coluna; `.q-fim` some; painel sem estouro | `telas.css:114-116`, `telas3.css:68-71` |
| Sessão | cabeçalho numa linha; subtítulo some; chip "Trocar de sessão" some; "Exportar" vira só ícone (`min-width 44px`); filtros em faixa que rola; `.q-palco.px-sessao { padding-bottom: 200px }`; **player fixo acima da barra**: `position:fixed; left 12px; right 12px; bottom 92px; z-index 20; padding 8px 10px; border-radius 22px; flex-wrap: wrap`; `.px-onde` em linha própria (12 px, centralizado); botões `min-height 46px`; "Voz, idioma e tom" some | `telas3.css:42-48, 56-67` |
| Planos | `h1` 22 px; Premium primeiro; uma coluna | `telas.css:105-107`, `telas2.css:283-285` |
| Oferta | `bottom 96px; width calc(100% − 24px); padding 14px`; grade `minmax(0,1fr) auto`; ícone some; ações em faixa que rola; selo quebra linha; texto 15 px | `telas.css:102-113` |
| Loja | carteira em faixa curta (`nowrap; gap 12px; padding 14px`; ícone 46 px; descrição some; saldo 32 px); grade em 2 colunas, `gap 10px`; item `padding 12px`; arte 84 px; título 16 px; sem descrição; botões `flex 1 1 100%; min-height 42px; 14px`; "Segure para comprar" quebra linha (13,5 px); artes reduzidas (`pixel .8`, `cartao .85`) | `celular.css:267-294` |
| Temporada | cabeçalho `column-reverse; padding 20px`; anel 96 px; `h2` 26 px; rótulos da trilha em 74 px sem subtítulo; degrau 128 px; prêmio 116 px; "Ver o fim" some | `telas2.css:277-289`, `telas3.css:47, 125-127` |
| Coleção | grade de temas em 2 colunas | `celular.css:285` |
| Toast | ocupa a largura (2.11) | `celular.css:216` |

### 5.5 Gestos de celular

| Gesto | Regra | Onde |
|---|---|---|
| Deslizar de lado troca a aba primária | só em telas com `PRIMARIA`; ignora o que já rola de lado (`.q-abas, .qj-ferramentas, .px-trilha, [data-testid="missoes-no-inicio"], .qe-kpis, .q-tabela-caixa, .q-acoes, input, .tabuleiro`); exige menos de 600 ms, `|dx| ≥ 70` e `|dy| ≤ 50`; `dx < 0` avança | `sentidos.js:306-322` |
| Sem mais abas para o lado | tela `translateX(0) → ±22px → 0`, 420 ms `MOLA_SUAVE`, com `toque` | `sentidos.js:323-327` |
| Aba ativa sempre à vista | `scrollLeft = offsetLeft − (larguraDoGrupo − larguraDaAba)/2` após trocar | `sentidos.js:292-305` |
| Barra some ao rolar | 5.1 | — |
| Arrastar o painel para fechar | 2.10 | — |
| Giroscópio no lugar do mouse | 3.3 | — |

---

## 6. Tema Água (`agua.js` + `agua.css`)

O tema entra na lista como `['agua', 'Água', 'seu']`, na posição 2 (`agua.js:10`). A cena só existe com `html[data-px='on'][data-theme='agua']` (`aguaLigada`, `agua.js:25`); as **cores e o fundo em degradê valem também fora do Polido**.

### 6.1 Paleta

`agua.css:10-43`.

| Token | Claro (piscina) | Escuro (mar fundo) |
|---|---|---|
| `color-scheme` | `light` | `dark` |
| `--canvas` | `#d3edf3` | `#06141d` |
| `--surface` | `#f2fbfd` | `#0e2634` |
| `--surface-hover` | `#e3f4f8` | `#153344` |
| `--surface-sunken` | `#bfdfe8` | `#040e15` |
| `--ink` | `#0b2a3b` | `#ddf3f8` |
| `--ink-muted` | `#3f6274` | `#8fb3c2` |
| `--ink-faint` | `#56788a` | `#7fa3b2` |
| `--ink-contrast` | `#e9f8fb` | `#06141d` |
| `--border-subtle` | `#a9d0dc` | `#1e4052` |
| `--border-strong` | `#7fb4c4` | `#2f5b70` |
| `--accent` | `#0a7ea4` | `#4fd3ea` |
| `--accent-soft` | `#cdeaf3` | `#12384a` |
| `--accent-ink` | `#086a8b` | `#6fddf0` |
| `--accent-contrast` | `#ffffff` | `#04202b` |
| `--good` / `-soft` / `-ink` / `-contrast` | `#1f8a5b` / `#d2eee1` / `#17714a` / `#ffffff` | `#5fd6a0` / `#143a2e` / `#5fd6a0` / `#06241a` |
| `--warn` / `-soft` / `-ink` / `-contrast` | `#b7791f` / `#f1e6cc` / `#8a5a12` / `#000000` | `#f0c26b` / `#3a3620` / `#f0c26b` / `#2e2410` |
| `--rare` / `-soft` / `-ink` | `#5b62c9` / `#dde0f6` / `#4a51b5` | `#a9afff` / `#252c55` / `#a9afff` |
| `--error` / `-soft` / `-ink` / `-contrast` | `#c2413a` / `#f6ddda` / `#a8322c` / `#ffffff` | `#ff8e86` / `#40242a` / `#ff8e86` / `#381f1d` |
| `--epic` / `-soft` / `-ink` | `#8a3f9a` / `#ebddf0` / `#7a3489` | `#e3a3f0` / `#3a2542` / `#e3a3f0` |
| `--hud-combo-tinta` | `#ffffff` | `var(--accent-contrast)` |
| `--ag-alto` / `--ag-meio` / `--ag-fundo` | `#e4f8fb` / `#b9e3ee` / `#79bfd8` | `#0f3d52` / `#0a2636` / `#030b11` |
| `--ag-luz` | `255 255 255` | `120 225 245` |
| `--ag-ar` | `rgb(255 255 255 / 0.62)` | `rgb(120 225 245 / 0.2)` |

Definidos só no bloco claro (o escuro herda):

- `--anel: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)`
- `--radius-card: 24px; --radius-btn: 20px; --r-card: 24px; --r-btn: 20px`
- `--hud-trilho: color-mix(in srgb, var(--accent) 14%, var(--surface))`
- `--hud-barra: linear-gradient(90deg, var(--accent), #4fd3ea)`
- `--hud-combo: color-mix(in srgb, var(--accent) 12%, var(--surface))`
- `--hud-combo-quente: linear-gradient(135deg, #4fd3ea, var(--accent))`
- `--hud-raio: 20px`

Fundo parado (`agua.css:45-46`): `main { background: linear-gradient(180deg, var(--ag-alto) 0%, var(--ag-meio) 42%, var(--ag-fundo) 100%) }`; `.px-aura { opacity: 0.35 }`.

### 6.2 Camadas da cena

Marcação em `agua.js:11-15`.

Atrás do conteúdo, `.ag-cena` (primeiro filho de `main`; `position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; contain:strict`), nesta ordem:

1. `div.ag-raios > i, i` (raios)
2. `div.ag-caustica.a > i` (cáustica distante)
3. `div.ag-caustica.b > i` (cáustica próxima)
4. `canvas.ag-bolhas` (bolhas)
5. `canvas.ag-mar` (superfície)

Na frente do conteúdo, `.ag-frente` (último filho de `main`; mesmas propriedades, `z-index:3`):

6. `div.ag-brilho` (brilho)
7. `i.ag-onda > b` (uma por toque)

### 6.3 Física da inclinação

`agua.js:147-172`.

| Grandeza | Fórmula |
|---|---|
| Entrada | `tx = clamp((mouse.x/W − 0,5)/0,45, −1, 1)`; `ty = clamp((mouse.y/H − 0,45)/0,4, −1, 1)`. `mouse` vem do ponteiro ou do giroscópio |
| Ângulo (mola pouco amortecida) | `vAng += (46·(−tx·7 − ang) − 4,4·vAng)·dt + sacode·dt·60`; `ang += vAng·dt` (alvo ±7) |
| Nível | `vNiv += (40·(ty·16 − niv) − 4,2·vNiv)·dt`; `niv += vNiv·dt` (alvo ±16 px) |
| Sacudida | `sacode *= 0,86` por quadro |
| Agito | `agito = min(1, |vAng|/26)`; `tempo += dt·(1 + agito·1,2)`; `ag.agito += (agito − ag.agito)·min(1, dt·5)` |
| `dt` | `min(0,05, Δt)` |
| Reduzir movimento | `ang = niv = 0` (a superfície continua desenhada, com ondas) |

### 6.4 Superfície (`canvas.ag-mar`)

Canvas de 100% × **200 px** no topo (`MAR_ALT = 200`), amostrado a cada **8 px** (`PASSO`), DPR ≤ 2. `agua.js:23-140`, `agua.css:73`.

| Elemento | Parâmetros |
|---|---|
| Nível | `nivelEm(x) = 48 + niv + (ang/7)·min(64, W·0,1)·((x − W/2)/(W/2))`: a ponta sobe ou desce até 64 px |
| Três ondas somadas | `(sin(x·0,0105 + t·0,85 + k·1,7)·7 + sin(x·0,0236 − t·1,35 + k·0,6)·3,6 + sin(x·0,049 + t·2,2 + k·2,9)·1,5)·(1 + agito·1,7)` |
| Respingo (fileira de molas) | 2 subpassos por quadro, `h = dt/2`: `v[i] += (−24·p[i] + 95·(esq + dir − 2·p[i]))·h`; `v[i] *= 1 − 1,5·h`; `p[i] += v[i]·h` |
| `respingo(x, força)` | soma `força·(1 − |d|/5)` à velocidade dos 9 pontos vizinhos (`d = −4…4`) |
| Altura por camada `k` | `nivelEm(x) + ondaEm(x, t·(1 − k·0,2), k) + p[x]·(1 − k·0,3) + k·8` |
| Três camadas de profundidade (`k = 2, 1, 0`) | preenchidas do topo até a curva; degradê vertical até `0,7·200 px`; alfa por camada: claro `[0,3; 0,42; 0,7]`, escuro `[0,08; 0,13; 0,24]` (índice `2 − k`); topo `a·1,25`, base `a·0,5` |
| Cor da luz | claro `255,255,255`; escuro `130,228,246` |
| Sombra azul (só no claro) | faixa entre a curva e a curva + 64 px; degradê `rgba(8,120,160,0.26)` → `0` de `nível − 10` a `nível + 70` |
| Luz sob a superfície | faixa de 18 px (claro) ou 56 px (escuro); degradê `rgba(luz, 0,3 / 0,2)` → `0` de `nível − 14` a `nível + 62` |
| Linha d'água | traço 9 px `rgba(luz, 0,2 / 0,1)`; depois traço 1,8 px `rgba(luz, 0,92 / 0,6)` com `shadowBlur 10`, `shadowColor rgba(luz, 0,9)`; pontas e junções arredondadas |
| Cintilações nas cristas | a cada 74 px a partir de 30; `xx = x + sin(x·12,9898)·26`; `f = max(0, sin(xx·0,05 + t·2,6 + sin(x)·6))^10`; desenha se `f ≥ 0,04`: elipse de `4 + 13f` × `1,3 + f`, `rgba(luz, 0,95·f)` |

### 6.5 Raios, cáustica e brilho

| Camada | Parâmetros | Onde |
|---|---|---|
| Raios (contêiner) | `left −30%; right −30%; top −12%; height 96%; transform-origin 50% 0`; JS: `rotate(ang·1,7 deg)` | `agua.css:53`, `agua.js:168` |
| Raio 1 | `repeating-conic-gradient(from 152deg at 50% -8%, transparent 0deg 5deg, rgb(var(--ag-luz)/.2) 7deg 9deg, transparent 12deg 17deg, rgb(var(--ag-luz)/.12) 19deg 20deg, transparent 23deg 28deg)`; `blur(7px)`; máscara `linear-gradient(180deg, #000 0%, rgb(0 0 0/.5) 45%, transparent 92%)`; `ag-balanca` 11 s `ease-in-out infinite alternate` | `agua.css:54-56` |
| Raio 2 | mesmo fundo; 17 s `alternate-reverse`; `opacity .6`; `blur(14px)` | `agua.css:57` |
| `@keyframes ag-balanca` | `rotate(-4deg) scaleX(1)` → `rotate(4deg) scaleX(1.08)` | `agua.css:58` |
| Cáustica A | contêiner `inset −40px`; `i`: `inset −420px`, `background-size 420px`, `opacity .5`, `mix-blend-mode: soft-light`, `blur(1.3px)`; SVG `feTurbulence fractalNoise baseFrequency 0.011 0.017, numOctaves 2, seed 7, stitchTiles` + `feColorMatrix` + `feFuncA table 0 0 0 0.05 0.9 0.05 0 0 0`; `ag-desliza` 46 s `linear`; JS: `translate(−tx·14, −ty·10)` px | `agua.css:61-63`, `agua.js:170` |
| Cáustica B | `background-size 560px`; `baseFrequency 0.008 0.012`, `seed 23`; 63 s `reverse`; `opacity .38`; JS: `translate(−tx·30, −ty·20)` px | `agua.css:64-65`, `agua.js:171` |
| Cáustica no escuro | `mix-blend-mode: screen; opacity .2` (B: `.14`); `blur(1.3px) hue-rotate(160deg) saturate(3)` | `agua.css:66-67` |
| `@keyframes ag-desliza` | até `translate(420px, 280px)` | `agua.css:68` |
| Brilho da frente | `left −40%; top −40%; 180% × 180%; mix-blend-mode: soft-light`; `radial-gradient(34% 26% at 42% 34%, rgb(255 255 255/.55), transparent 70%), radial-gradient(26% 20% at 66% 62%, rgb(255 255 255/.22), transparent 72%)`; escuro `screen`, `opacity .16`; JS: `translate(−ang·2,4 %, −ty·9 %)` | `agua.css:76-78`, `agua.js:172` |

### 6.6 Bolhas (`canvas.ag-bolhas`)

`agua.js:141-205`.

| Aspecto | Valor |
|---|---|
| Quantidade | `round(min(34, 14 + W/60))` |
| Bolha comum | `r 2–9`; velocidade `18–52 px/s`; vida infinita; nasce abaixo da tela |
| Bolhinha de toque | `r 1,5–4,5`; `vx ±45`; `vida 1`, caindo `0,7/s` |
| Movimento | `f += dt·2,2`; `x += (sin(f)·9 + ang·9 + vx)·dt`; `y −= v·(1 + r/9)·dt`; `vx *= 0,95`. Escorrega para o lado mais alto do aparelho |
| Estouro | quando `y < superfície(x) + r`: `respingo(x, −r·5)`; a comum renasce embaixo, a de toque é removida |
| Desenho | preenchimento `rgba(luz, 0,1·a)`; contorno 1,2 px `rgba(luz, 0,8·a)`; reflexo em `(x − 0,32r, y − 0,34r)` de raio `max(0,6; 0,22r)`, `rgba(luz, 0,95·a)`; `a = min(1, vida)·(0,75 claro / 0,5 escuro)` |
| Cor da luz | claro `255,255,255`; escuro `120,225,245` |

### 6.7 Toque e sacudida

| Efeito | Valores | Onde |
|---|---|---|
| Onda em anéis | `i.ag-onda` no ponto tocado (tamanho 0); três anéis (`::before`, `::after`, `b`) de 300 px: `border 1.5px solid rgb(var(--ag-luz)/.9)` (2º e 3º: 1 px); relevo `0 0 0 6px rgb(luz/.12), 0 4px 12px rgb(4 50 80/.22), inset 0 0 0 5px rgb(luz/.1), inset 0 -4px 12px rgb(4 50 80/.16), inset 0 3px 8px rgb(luz/.35)`; `ag-onda`: `0% scale(0.04) opacity 0` → `12% opacity .95` → `100% scale(1) opacity 0`; durações **1,5 s / 1,7 s / 1,9 s**, atrasos **0 / 0,18 s / 0,38 s**, `cubic-bezier(0.16, 0.84, 0.3, 1)`; removida após 2400 ms | `agua.css:80-87`, `agua.js:223-237` |
| Respingo do toque | `respingo(x, 220·max(0,12; 1 − y/420))`: quanto mais perto do alto, mais forte | `agua.js:236` |
| Bolhinhas | 7 por toque, espalhadas em ±11 px (x) e ±6 px (y) | `agua.js:238` |
| Som | `toque` vira som de gota (seção 3.2) | `agua.js:254-255` |
| Sacudir | `devicemotion`: se `|acceleration.x| > 1,2`, `sacode = clamp(sacode + a·0,5, −6, 6)` | `agua.js:247-251` |
| Escopo | só dentro de `main`, com a cena ligada e sem reduzir movimento | `agua.js:226` |

### 6.8 Peças do app dentro d'água

`agua.css:89-115`.

| Peça | Estilo |
|---|---|
| Vidro molhado (`.q-cartao, .q-tile, .q-linha, .q-aviso, .cartao, .palco-jogo, .px-premium, .q-abas, .q-chip, .q-ctl, .btn-outline`) | `background-color: color-mix(surface 58%, transparent)`; `backdrop-filter: blur(14px) saturate(1.5)`; `border-color: color-mix(rgb(var(--ag-luz)) 50%, border-subtle)`; `box-shadow: inset 0 1px 0 rgb(luz/.65), inset 0 -10px 18px -14px rgb(luz/.5), 0 14px 30px -20px rgb(6 60 90/.55)` |
| Vidro no escuro | `color-mix(surface 62%, transparent)`; borda `color-mix(accent 26%, border-subtle)`; `inset 0 1px 0 rgb(luz/.22), 0 14px 30px -18px rgb(0 0 0/.7)` |
| `.palco-jogo` | `background-image: none` |
| Botão principal "gota" (`.btn-solid, .btn-ink`) | `background-image: linear-gradient(180deg, rgb(255 255 255/.34) 0%, rgb(255 255 255/.06) 46%, transparent 52%), linear-gradient(160deg, #37c3df, var(--accent))`; `box-shadow: inset 0 1px 0 rgb(255 255 255/.6), 0 10px 22px -10px color-mix(accent 80%, transparent)` |
| Trilho | `color-mix(surface 70%, transparent)` + `blur(18px) saturate(1.5)` |
| Ícones boiam (`.q-ic`) | `ag-boia`: `translateY(-2.5px) rotate(-2deg)` ↔ `translateY(2.5px) rotate(2deg)`; 5,5 s `ease-in-out infinite alternate`; em `:nth-child(2n)`: atraso −1,8 s, 6,4 s; em `:nth-child(3n)`: atraso −3,1 s, 7,2 s |
| Barras de progresso | `background-image: linear-gradient(90deg, var(--accent), #5fdcf0)` |

O comentário da barra diz "com uma onda correndo por dentro" (`agua.css:114`), mas a regra só define o degradê; a "onda" é o brilho genérico `px-brilho` da seção 2.18.

### 6.9 Menos movimento e menos transparência

`agua.css:117-124`, `agua.js:154-156, 226`.

| Preferência | Efeito |
|---|---|
| Menos transparência | todas as peças de vidro e o trilho: sem `backdrop-filter`, `background-color: var(--surface)` |
| Menos movimento (CSS) | `.ag-raios i`, `.ag-caustica i` e `.q-ic` sem animação; `.ag-bolhas` com `display:none` |
| Menos movimento (JS) | `ang = niv = 0`; sem onda de toque, sem bolhinhas, sem respingo do toque |
| Custo registrado | o tema deve desligar o desfoque e as bolhas no modo de desempenho (`auditoria.html:283`) |

### 6.10 Como o tema é equipado

`equiparTema`, `agua.js:259-292`.

1. `revelar(troca)`: abre em círculo a partir do último clique, **800 ms `EIO`** (2.12).
2. A troca aplica `temaEquipado`, limpa a prévia, define `html.dataset.theme`, recolore as partículas, refaz o Personalizar se estiver aberto e reposiciona as pílulas.
3. Se o tema é `'agua'`: `sentir('mergulho')` (som + vibração `[14, 50, 8, 30, 6]`).
4. Um `MutationObserver` em `data-theme` e `data-px` liga ou desliga a cena; ao ligar, mede, semeia as bolhas e inicia o rAF. Um `ResizeObserver` em `main` remede.

- **Ordem dos sons:** `sentir('onda')` (do `revelar`) toca antes e `sentir('mergulho')` logo depois; os dois soam juntos, pois nenhum é "fraco".
- **Pela vitrine do Personalizar** (`provarTema` e depois "Equipar"): `provarTema` só chama `revelar` (som `onda`) e "Equipar" só faz `repintar` + toast. Nesse caminho **o `mergulho` não toca**. Ele só toca pelo botão "Tema Água" da barra do protótipo.
- `?pele=agua` abre já no tema (validado contra a lista de temas).

---

## Ambiguidades e pontos a decidir

1. **`mergulho` no fluxo real:** no protótipo só o botão da barra dispara (6.10). A sua descrição ("círculo + mergulho") sugere disparar ao equipar pela Coleção; o código não faz isso.
2. **Folhas B e C sem arrastar:** só o `.q-mais` tem arrastar para fechar. A folha da frase/palavra tem alça visual (`.folha-pega`), mas nenhum gesto. A auditoria fala de "painéis" em geral (`auditoria.html:120`).
3. **Saída do diálogo no computador:** não volta ao ponto de origem (`scale(0.94)` no lugar), ao contrário do `.q-mais`.
4. **Painel `D.planos`** (`telas.js:460-477`, tratado em `prototipo.js:575-578`): não encontrei nenhuma chamada a `abrirFolha('planos')` nos arquivos lidos. Parece código morto da rodada 3, substituído pela tela de Planos.
5. **Posição inicial das legendas flutuantes:** o comentário diz "canto de baixo à direita"; o código põe no de cima à direita (`telas.js:314, 324-326`).
6. **Trilho durante a gravação:** o protótipo só força o trilho visível com `.px-pronto`. O que o esconde enquanto grava deve vir do CSS de produção (`.cel-gravando`), que não li.
7. **Velocidade do toast:** é distância total ÷ tempo desde o `pointerdown`, não velocidade instantânea. A saída por arrasto usa a transição de `.on` (620 ms `MOLA`) cortada aos 230 ms, quando a classe sai.
8. **Som `nav`:** toca depois dos 150 ms de saída da tela, não no toque.
9. **`ordem()` de telas desconhecidas:** nomes fora da lista (por exemplo, a `partida` dos jogos) caem em `ROTAS.indexOf = −1`, isto é, "antes de tudo".
10. **Temporada duplicada:** `htmlDaTemporada` (`telas2.js:366-383`, níveis 1–10) foi substituída por `redesenho.temporada` (`telas3.js:123-150`). Vale a segunda.
11. **Memória em `prototipo.js:966-1094`:** substituída pelo motor de jogos; fora do meu escopo.
12. **Volume alto de propósito:** a auditoria recomenda, para uso diário, encurtar a troca de tela para cerca de 350 ms sem desfoque e escolher entre inclinação 3D e onda no toque (`auditoria.html:285-293`). Isso conflita com "portar exatamente" e é decisão do dono.
13. **Rascunhos do autor** (`auditoria.html:130, 147`): prévia desfocada da Nuance, nomes e custos dos temas, perguntas frequentes.
14. **Sons dos jogos:** nenhum `SONS.x =` novo aparece em `jogos*.js` na busca que fiz; se os jogos chamam `nota()` diretamente, isso está com o outro agente.

---

## 7. Lista de verificação do porte

### A. Fundamentos

| # | Item | Referência |
|---|---|---|
| A1 | Três curvas `cubic-bezier` (`EO`, `EIO`, `EG`) como tokens | `polimento.css:27-31` |
| A2 | `MOLA` (zeta 0,5) como `linear()` de 45 pontos + reserva `cubic-bezier(0.34,1.56,0.64,1)` | `prototipo.js:39-53` |
| A3 | `MOLA_SUAVE` (zeta 0,72) + reserva `EG` | `prototipo.js:51` |
| A4 | Padrão de animação: 240 ms, `EO`, `fill backwards` | `prototipo.js:55-61` |
| A5 | `molaFisica` (zeta 0,8; resp 0,42) herdando velocidade | `telas.js:30-49` |
| A6 | `elastico(v, 120, 0.55)` | `prototipo.js:698` |
| A7 | Projeção de momento (0,998) | `prototipo.js:439`, `telas.js:368` |
| A8 | Contador com curva cúbica | `prototipo.js:141-152` |
| A9 | Reduzir movimento: fades curtos em tudo | 1.5 |
| A10 | Menos transparência e mais contraste: painéis opacos | `polimento.css:333-352` |
| A11 | Tipografia: tracking, balance, pretty, `tabular-nums` | `polimento.css:36-52` |
| A12 | Sombra em camadas (claro, escuro, principal) | `polimento.css:55-72` |
| A13 | Refino do computador (abas rebaixadas, bordas 1 px, títulos 34 px) | `telas2.css:260-271` |
| A14 | Selo com ícone em linha | `telas3.css:5-6` |

### B. Casca: movimento

| # | Item | Referência |
|---|---|---|
| B1 | Aperto de cartão `scale(0.985)` 100 ms | `polimento.css:109-112` |
| B2 | Onda no toque (750 ms, opacidade 0,28) | `prototipo.js:1276-1294` |
| B3 | Interruptor com mola (460 ms) e estica ao pressionar (36 px) | `efeitos.css:194-198`, `polimento.css:224-225` |
| B4 | Reflexo no botão principal (750 ms) | `efeitos.css:130-145` |
| B5 | Pílula das abas (520 ms `MOLA_SUAVE`, sombra) | `efeitos.css:49-56` |
| B6 | Pílula do trilho (raio 16 px) | `polimento.css:140-147` |
| B7 | Pílula persiste entre re-renders | `prototipo.js:254, 268` |
| B8 | Salto do ícone do trilho (620 ms `MOLA`) | `prototipo.js:225-227` |
| B9 | Saída de tela (150 ms `ease-out`, −18·dir px, 0,985, blur 5) | `prototipo.js:247-251` |
| B10 | Regra de direção por ordem do menu | `prototipo.js:232, 236` |
| B11 | Interrupção: só a última navegação vale | `prototipo.js:235, 242-246` |
| B12 | Título palavra por palavra (760 ms; 60 + 75·i) | `prototipo.js:296-312` |
| B13 | Sobrancelha entra pela esquerda (520 ms) | `prototipo.js:313-314` |
| B14 | Cascata de blocos (700 ms; 90 + 60·i; 30 px; 0,96; blur 8) | `prototipo.js:334-340` |
| B15 | Revelação na rolagem (680 ms; 34 px; threshold 0,12) | `prototipo.js:283-294` |
| B16 | Origens `seco` e `teclado` sem animação | `prototipo.js:271` |
| B17 | Painel da aba entra pelo lado (560 ms; 70 px) | `prototipo.js:362-380` |
| B18 | `repintar` (520 ms; 56 px; blur 6) | `telas2.js:10-25` |
| B19 | Borda de rolagem (30 px; 0,18 s) | `polimento.css:195-208` |
| B20 | Painel nasce do gatilho (640 ms `MOLA_SUAVE`; 0,55; blur 10) | `prototipo.js:494-495` |
| B21 | Cascata do painel: filhos (520 ms) e tiles (620 ms) | `prototipo.js:496-503` |
| B22 | Painel sai pelo mesmo caminho (260 ms; 0,6; blur 8), interrompível | `prototipo.js:529-534` |
| B23 | Véu com blur (240 / 160 ms) | `polimento.css:150-168` |
| B24 | Material de vidro do painel | `polimento.css:169-187` |
| B25 | Tela de trás recua (0,93; blur 3; raio 28) | `efeitos.css:35-46` |
| B26 | Troca de aba no Mais com altura animada | `prototipo.js:537-557` |
| B27 | Diálogo nativo: entrada do gatilho (560 ms) | `telas2.js:520-525` |
| B28 | Diálogo nativo: saída (200 ms; 0,94) | `telas2.js:491` |
| B29 | Backdrop e sombra do diálogo | `telas2.css:250-257` |
| B30 | Busca por clique (480 ms) e por teclado sem animação | `prototipo.js:631-634` |
| B31 | Toast: entrada com mola pela borda de cima (620 ms) | `efeitos.css:199-204` |
| B32 | Toast: saída (220 ms) e vida de 3400 ms com pausa | `polimento.css:251-256`, `prototipo.js:688-708` |
| B33 | Toast: arrasto com trava de eixo, elástico e limiares 45 px / 0,11 px/ms | `prototipo.js:709-750` |
| B34 | Tema claro/escuro em círculo (850 ms `EIO`) | `prototipo.js:755-775` |
| B35 | Troca de pele em círculo (800 ms `EIO`) | `telas2.js:27-37` |
| B36 | Aura que segue o ponteiro (620 px; fator 0,07) | `efeitos.css:8-22`, `prototipo.js:843-848` |
| B37 | Luz no cartão, uma por vez (280 px) | `efeitos.css:59-72`, `prototipo.js:1231-1254` |
| B38 | Inclinação 3D (força 8°, fator 0,16, perspectiva 900 px) | `prototipo.js:1197-1268` |
| B39 | Partículas de fundo (46, paralaxe, cintilar) | `prototipo.js:796-865` |
| B40 | Rajada | `prototipo.js:808-815` |
| B41 | Confete | `prototipo.js:816-834` |
| B42 | Hovers só com mouse de verdade | `polimento.css:84-107`, `efeitos.css:92-117` |
| B43 | Brilho nas barras (2,6 s) | `efeitos.css:148-165` |
| B44 | Pulso do contador de avisos (1,9 s) | `efeitos.css:166-170` |
| B45 | Anéis no "Legendar agora" (2,4 s) | `efeitos.css:171-186` |
| B46 | Ícone de estado vazio flutua (3,2 s) | `efeitos.css:187-191` |
| B47 | Barras de progresso com transição de 600 ms | `polimento.css:263-266` |
| B48 | Perguntas frequentes com altura animada (420 ms) | `telas2.js:622-634` |
| B49 | Estados na própria tela: só o que é novo entra | `telas2.js:527-543` |

### C. Sentidos

| # | Item | Referência |
|---|---|---|
| C1 | Motor: ganho 0,55 + compressor; `nota` e `sopro` | `sentidos.js:14-64` |
| C2 | 18 sons com seus parâmetros | `sentidos.js:66-85` |
| C3 | Padrões de vibração por nome | `sentidos.js:87-90` |
| C4 | Supressão de sons fracos em 160 ms | `sentidos.js:96-99` |
| C5 | Fallback de vibração no iPhone | `sentidos.js:91-93, 109` |
| C6 | Tom contínuo de segurar (280 → 980 Hz) | `sentidos.js:113-130` |
| C7 | Onde cada som dispara | `sentidos.js:138-174` |
| C8 | "Som dos toques" comanda o som | `sentidos.js:183-191` |
| C9 | Giroscópio: permissão no primeiro toque | `sentidos.js:199-205` |
| C10 | Giroscópio: zero adaptativo (0,004) e normalização (÷22) | `sentidos.js:206-223` |
| C11 | Giroscópio vira ponteiro (aura, partículas, Água) | `sentidos.js:253` |
| C12 | Giroscópio inclina até 16 alvos e move a luz em 4 | `sentidos.js:225-265` |

### D. Telas

| # | Item | Referência |
|---|---|---|
| D1 | Início: selo do plano | `telas2.js:136-139` |
| D2 | Início: barras enchem (1100 ms) | `prototipo.js:346-351` |
| D3 | Início: XP e missões contam | `prototipo.js:352-358` |
| D4 | Início: estado "missão feita" | `polimento.css:267-279` |
| D5 | Missão concluída (ícone, anel, faíscas, +5, toast, oferta) | `prototipo.js:905-964` |
| D6 | Capturar abre direto na tela pronta, em todo aparelho | `direto.js:8-23` |
| D7 | Captura pronta: topo com idiomas, modelo, microfone, ajustes, ajuda | `direto.js:25-32` |
| D8 | Captura pronta: miolo e textos por aparelho | `direto.js:38-39` |
| D9 | Microfone só liga em Iniciar; segundo toque na barra inicia | `direto.js:15-20, 48-62` |
| D10 | Trilho visível enquanto pronta | `paineis.css:5` |
| D11 | Ao vivo: linha nova, palavra por palavra, tradução assume a linha | `telas.js:111-160` |
| D12 | Ao vivo: fala antiga esmaece; ponto pulsando | `telas.css:13-20` |
| D13 | Encerrar → Biblioteca → oferta em 1700 ms | `telas.js:530-533` |
| D14 | Folha da frase (estrutura e cascata) | `telas.js:197-222` |
| D15 | Nuance com cadeado e prévia desfocada; aberta no Premium | `telas.js:190-196`, `telas.css:23-36` |
| D16 | Folha da palavra e "Guardar" com faísca | `telas.js:223-255` |
| D17 | Legendas flutuantes: material, arrasto, jogar para o canto | `telas.js:291-380` |
| D18 | Legendas flutuantes: espelho das falas | `telas.js:261-280` |
| D19 | Intérprete abre direto na conversa | `direto.js:8-14` |
| D20 | Intérprete: duas metades, a de cima virada | `telas2.js:161-182` |
| D21 | Intérprete: entrada das metades, faixa e botões | `telas2.js:272-279` |
| D22 | Intérprete: falar, traduzir, ler (palavras, clarão, tradução) | `telas2.js:184-238` |
| D23 | Intérprete: lista da conversa | `telas2.js:239-257` |
| D24 | Intérprete: trocar os lados (FLIP) | `telas2.js:569-582` |
| D25 | Intérprete: automático com cadeado e tremida | `telas2.js:258-271` |
| D26 | Intérprete: botão "Virtual" e troca de idioma por lado | `direto.js:68-74` |
| D27 | Intérprete: X volta à tela de origem | `direto.js:94` |
| D28 | **Intérprete no tema claro** | `paineis.css:49-67` |
| D29 | Intérprete: aviso em linha própria | `paineis.css:76-101` |
| D30 | Intérprete: coluna central em tela larga | `paineis.css:103-107` |
| D31 | Intérprete (entrada): inverter idiomas em arco | `prototipo.js:1096-1130` |
| D32 | Jogar: submenus e estados ligados | `telas2.js:611-615` |
| D33 | Estatísticas: só a camada genérica | 4.5 |
| D34 | Personalizar: cabeçalho com Seeds e 5 abas | `telas2.js:348-351` |
| D35 | Personalizar: correções de layout | `telas3.css:51-52, 112` |
| D36 | Coleção: ateliê com vitrine fixa | `telas2.js:352-365`, `telas2.css:68-102` |
| D37 | Coleção: provar tema em círculo, sem equipar; desfaz ao sair | `telas2.js:409-428` |
| D38 | Temporada: cabeçalho com céu e anel que acompanha o tema | `telas3.js:134-139`, `telas2.css:291-294` |
| D39 | Temporada: cartão do fim (nível 30) | `telas3.js:140` |
| D40 | Temporada: trilha 1–30 com raridades e rótulos fixos em cartão | `telas3.js:141-146`, `telas3.css:26-36, 114-127` |
| D41 | Temporada: ir para o nível e resgatar | `telas3.js:116-122`, `telas2.js:593-609` |
| D42 | Loja: carteira, categorias, itens com arte | `telas2.js:384-403` |
| D43 | Loja: segurar para comprar (1100 ms linear) | `telas2.js:435-477` |
| D44 | Loja: prévia do efeito | `telas2.js:429-434` |
| D45 | Mais: linha "Planos e Premium" | `telas2.js:119-124` |
| D46 | Busca: item "Planos" | `telas2.js:125-135` |
| D47 | Ajustes → Conta: cartão do plano | `telas2.js:140-143` |
| D48 | Biblioteca: estrutura, busca ao digitar, filtros, páginas | `telas.js:408-434` |
| D49 | Biblioteca: troca de gravação com desfoque; páginas pelo lado | `telas.js:436-454` |
| D50 | Sessão: cabeçalho e 4 abas | `telas3.js:95-104` |
| D51 | **Sessão: player marca palavra por palavra** (210 / 520 ms) | `telas3.js:28-62`, `telas3.css:9-12` |
| D52 | Sessão: player em vidro, preso embaixo | `telas3.css:13-21, 54-55` |
| D53 | Sessão: tocar na fala abre a folha da frase | `telas3.js:175-177` |
| D54 | Planos: tela com 3 abas | `telas2.js:74-105` |
| D55 | Planos: cartões Grátis e Premium com os textos | `telas2.js:60-73` |
| D56 | Planos: borda de luz girando no Premium | `telas.css:85-94` |
| D57 | Planos: tabela de comparação e perguntas frequentes | `telas2.js:43-58, 79-84` |
| D58 | Planos: ativar teste (confete, toast, abre os cadeados) | `telas2.js:108-117` |
| D59 | Oferta: regras, entrada (680 ms), saída (280 ms), três saídas | `telas.js:479-519` |
| D60 | Sobre, Ajuda e submenus ligados | `telas2.js:482-483, 611-619` |

### E. Celular

| # | Item | Referência |
|---|---|---|
| E1 | Barra flutuante de vidro (68 px, raio 26, safe area) | `celular.css:11-33` |
| E2 | Cinco destinos: Início · Jogar · Capturar · Intérprete · Mais | `celular.css:53-59` |
| E3 | Capturar no centro (62 px, elevado 22 px) | `celular.css:61-82` |
| E4 | Estatísticas e Personalizar como tiles no Mais; destaque no "Mais" | `prototipo.js:221, 387-402` |
| E5 | Barra some ao rolar e volta | `celular.css:256-257`, `sentidos.js:279-304` |
| E6 | Barra some na conversa do intérprete | `celular.css:223` |
| E7 | Respiro de 112 px no conteúdo | `celular.css:92-96` |
| E8 | Abas em uma linha que rola, com máscara nas bordas | `celular.css:156-166, 226-227` |
| E9 | Aba ativa sempre à vista | `sentidos.js:292-305` |
| E10 | Deslizar de lado troca a aba; borda estica e volta | `sentidos.js:306-329` |
| E11 | Painel sobe de baixo, com alça e cascata | `celular.css:169-199`, `prototipo.js:480-487` |
| E12 | Arrastar o painel (76 px, elástico 90, projeção, limiar 0,4) | `prototipo.js:406-447` |
| E13 | Véu acompanha o arrasto | `celular.css:200` |
| E14 | Tela de trás: `scale(0.9) translateY(-8px)` | `celular.css:201` |
| E15 | Diálogos de ajuste viram folha (92dvh, raio 28) | `paineis.css:11-47` |
| E16 | Diálogo no celular: sobe (600 ms) e desce (300 ms) | `telas2.js:490, 514-518` |
| E17 | Folha da frase/palavra (560 / 280 ms) | `telas.js:163-188` |
| E18 | Início: 2 colunas e carrossel de missões | `celular.css:101-126` |
| E19 | Jogar: faixa de ferramentas e 2 colunas | `celular.css:129-150` |
| E20 | Estatísticas: carrossel de números | `celular.css:114-126` |
| E21 | Captura pronta no celular | `telas3.css:88-106` |
| E22 | Intérprete: faixa de 5 controles | `paineis.css:68-74` |
| E23 | Biblioteca em uma coluna | `telas.css:114-116` |
| E24 | Sessão: player fixo a 92 px da base | `telas3.css:56-67` |
| E25 | Planos: Premium primeiro | `telas.css:106-107` |
| E26 | Oferta acima da barra (96 px) | `telas.css:102-113` |
| E27 | Loja e Temporada compactas | `celular.css:267-294`, `telas2.css:277-289` |
| E28 | Toast ocupa a largura, com safe area | `celular.css:216` |
| E29 | Nada estoura a largura | `celular.css:245-247, 261-262` |

### F. Tema Água

| # | Item | Referência |
|---|---|---|
| F1 | Paleta clara | `agua.css:10-29` |
| F2 | Paleta escura | `agua.css:30-43` |
| F3 | Fundo em degradê (vale sem a cena) e aura a 0,35 | `agua.css:45-46` |
| F4 | Camadas `.ag-cena` e `.ag-frente` | `agua.js:11-15`, `agua.css:48-50` |
| F5 | Mola da inclinação (46 / 4,4) e do nível (40 / 4,2) | `agua.js:152-166` |
| F6 | Superfície: nível + três ondas | `agua.js:45-46` |
| F7 | Superfície: respingo em molas | `agua.js:47-65` |
| F8 | Superfície: três camadas, sombra, luz, linha d'água | `agua.js:66-129` |
| F9 | Superfície: cintilações | `agua.js:130-139` |
| F10 | Raios (11 s e 17 s) girando com o ângulo | `agua.css:53-58`, `agua.js:168` |
| F11 | Cáustica A e B (46 s e 63 s) com paralaxe | `agua.css:61-68`, `agua.js:170-171` |
| F12 | Brilho da frente | `agua.css:76-78`, `agua.js:172` |
| F13 | Bolhas (quantidade, subida, deriva, estouro) | `agua.js:141-205` |
| F14 | Onda de toque em três anéis | `agua.css:80-87`, `agua.js:229-237` |
| F15 | Bolhinhas e respingo no toque | `agua.js:236-238` |
| F16 | Sacudir agita | `agua.js:247-251` |
| F17 | Som de gota no `toque` | `agua.js:254-255` |
| F18 | Som e vibração `mergulho` | `agua.js:256-257` |
| F19 | Vidro molhado, claro e escuro | `agua.css:90-101` |
| F20 | Botão principal "gota" | `agua.css:104-107` |
| F21 | Trilho em vidro | `agua.css:108` |
| F22 | Ícones boiam (5,5 / 6,4 / 7,2 s) | `agua.css:110-113` |
| F23 | Barras de progresso em degradê | `agua.css:115` |
| F24 | Menos transparência | `agua.css:118-120` |
| F25 | Menos movimento | `agua.css:121-124`, `agua.js:154-156` |
| F26 | Equipar: círculo de 800 ms + `mergulho` | `agua.js:260-277` |
| F27 | Cena liga e desliga por observador de `data-theme` | `agua.js:208-220` |
