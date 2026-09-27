# Auditoria de performance do frontend — telas e jogos (26/09/2026)

Branch `perf/frontend-2026-09` (worktree `.claude/worktrees/fx-frontend`, a partir de `main` em `050a16f`, com
`main` mesclada no fim). Escopo: render, re-render, listas, animações CSS/canvas, jogos, bundle por rota, fontes,
imagens e INP. Fora do escopo (agente de dispositivos): perfis Quest/celular, escolha de modelo, captura,
`src/gateway/**`, `src/lib/captura/**` e o "modo leve" — este é **consumido**, não recriado (ver §6).

Regra do dono respeitada: **nenhuma mudança de aparência**. As quatro correções mudam QUANDO/ONDE o navegador
trabalha (chunk sob demanda, ordem da rede, thread do desenho, diagramação do que está fora da tela).

## 0. Resumo

| Correção | Onde | Efeito medido |
|---|---|---|
| **Partículas num Worker** (`OffscreenCanvas`) | `src/lib/motorDeParticulas.ts`, `src/lib/particulas.worker.ts`, `src/components/ParticleCanvas.tsx` | tela **parada**, thread principal (CPU 4×, trace, 3 pares intercalados): Início **838–889 → 498–601 ms/s**, Jogar **744–822 → 255–280 ms/s**; rAF 114–172 → **0** ms/s, Commit 158–201 → 0–16 ms/s |
| **`content-visibility` nas peças** da Loja/Personalizar | `src/styles/desempenho.css:15-18` | troca para "Meu visual": **INP 2.136–2.736 → 296–416 ms** (experimento isolado); rodada intercalada: Loja INP **2.152 → 384 ms**, Personalizar TBT de carga **1.838 → 300 ms** |
| **Servidor em memória sob demanda** + **núcleo sem efeito colateral** | `src/data/funil.ts:33-78`, `vite.config.ts:116-130`, `scripts/vite/preCarregarEfemero.ts` | **JS inicial 197,6 → 163,3 KB gzip** (596,2 → 504,8 KB bruto; brotli 165,2 → 136,2); chunk de entrada 138,2 → 104,0 KB gzip; JS não usado na `/` (Lighthouse) **46 → 30 KB** |
| **Fontes do Google pelo HTML** (preconnect + `<link>`), não `@import` | `index.html:25-30` (links nas linhas 28-30), `src/index.css:1-3` | FCP do Lighthouse mobile **2.410 → 2.111 ms** nas 8 rotas (mediana de 3; soma com o JS menor) |

- **Orçamento do bundle** apertado: teto do JS inicial **215 → 180 KB gzip** (`scripts/perf/suite/slo.json:38`). No fim da branch, já com a `main` mesclada (o perfil de dispositivo entrou no arranque), o JS inicial é **165,4 KB gzip / 138,1 KB brotli**.
- **Piores itens encontrados, em ordem:** (1) a troca de aba da Loja/Personalizar (INP 2,1–6,1 s num celular médio),
  (2) o laço de partículas ocupando ~9–11 ms de thread principal por quadro em TODA tela (Jogar a 24 FPS parado sob
  carga), (3) 34 KB gzip de código de quem não tem conta no arranque de todo mundo, (4) as fontes em série.
- **Jogos:** INP de 16–192 ms em todos os 17 minigames (bom < 200) antes e depois; o ganho neles é de carga (TBT −7 a
  −30 %) e das comemorações (a Mala cumulativa passou de **47,7 → 60 FPS** jogando). Nenhuma mecânica tocada.
- **Honestidade sobre o ruído:** a máquina é compartilhada com outros agentes (125 processos Node no pico, memória de
  commit esgotada duas vezes). Rodadas sequenciais antes/depois deram diferenças enormes que eram carga da máquina;
  por isso o relatório usa **medição intercalada** (A e B na mesma rodada, alternando a ordem) e **traces**, que medem
  tempo de thread principal por segundo e não dependem do relógio de parede. Onde a diferença ficou dentro do ruído,
  está dito.

## 1. Método

| Item | Valor |
|---|---|
| Build | `npm run build` servido por `dist-server/server.cjs` (`NODE_ENV=production`, self-host, banco da suíte de carga: `local-owner` com 3.000 cartões e 5 sessões); edição estática por `npm run build:estatica` + `tests/e2e-estatica/_servidor-estatico.mjs` |
| Antes / depois | antes = `050a16f` (cópia do `dist` guardada fora do repo); depois = `19ad1bb` (as 4 correções, antes da mescla da `main`, para isolar o efeito delas do trabalho de dispositivos) |
| Celular médio | Chromium do Playwright 1.62, viewport 412×915, DPR 2,625, toque, UA Android; **CPU 4× e 6×** por `Emulation.setCPUThrottlingRate` (DevTools) |
| Visitante | um que VOLTA: o aquecimento fecha as celebrações da primeira visita e o `storageState` é reusado; contexto novo por execução (cache HTTP frio) |
| Métricas | LCP, CLS, FCP (PerformanceObserver); TBT = Σ(tarefa longa − 50 ms); **INP** = pior interação, cada uma = maior entrada `event` com o mesmo `interactionId` (Event Timing, limiar 16 ms); FPS/jank por rAF (3 s parado, 4 s no jogo); React: commits e fibras que renderizaram por gancho `__REACT_DEVTOOLS_GLOBAL_HOOK__` (funciona no build de produção); heap e contadores do motor por `Performance.getMetrics` |
| Interações | Início: filtros Áudio/Tudo, sino, ir à Biblioteca · Capturar: Ajustes da captura, Ajuda · Jogar: 5 filtros de categoria · Biblioteca: filtros · Vocabulário: nível A1 ×2, "Mostrar mais", abas · Estatísticas: 7/90/30 dias · Loja: Meu visual ↔ Desafios · Ajustes: 4 abas · Personalizar: "Ver tudo", Equipar · **cada jogo**: abre pela vitrine com a trilha, 4 toques nas peças + 1 tecla |
| React Profiler | `scripts/perf/telas/build-perfil.mjs` (`react-dom/profiling` + `keepNames`) dá o tempo próprio por componente |
| Lighthouse 13 | `scripts/perf/frontend.mjs --raiz=…` (novo parâmetro), mobile e desktop, 8 rotas, mediana de 3 |

Reprodução (tudo em `scripts/perf/telas/`, contas puras travadas em `tests/perf-telas.test.ts`):

```bash
npm run build
node scripts/perf/telas/medir-telas.mjs --raiz=<antes> --raiz-b=<depois> --execucoes=3 --cpu=4   # intercalado
node scripts/perf/telas/medir-telas.mjs --cpu=6 --jogos=nenhum                                     # 6×
node scripts/perf/telas/trace-tela.mjs --rota=/ --segundos=4 [--clicar="Meu visual"] [--jogo=…]      # trace
node scripts/perf/telas/composicao-bundle.mjs --chunk=index                                         # o que há no chunk
node scripts/perf/telas/build-perfil.mjs --saida=<pasta> && node scripts/perf/telas/medir-telas.mjs --raiz=<pasta>
node scripts/perf/telas/comparar.mjs <antes.json> <depois.json>
MSYS_NO_PATHCONV=1 node scripts/perf/frontend.mjs --raiz=<pasta> --rotas=/,/capturar,… --sem-cwv
```

Os JSON de cada rodada estão em `dados/` (nomes na legenda de cada tabela).

## 2. Diagnóstico (antes)

### 2.1 Onde vai o tempo com a tela PARADA — traces (CPU 4×, 4 s, `dados/trace-parado-antes_*`)

| Tela | ocupado (ms/s) | FireAnimationFrame (ms/s) | Commit (ms/s) | por quadro |
|---|---:|---:|---:|---|
| Início | 838–889 | 114–120 | 158–168 | rAF ~4,2 ms + Commit ~6,9 ms |
| Jogar | 744–822 | 154–172 | 183–201 | idem |
| Biblioteca / Loja | — | rAF 3,8 / 0,7 ms por quadro | Commit 5,4 / 4,9 ms por quadro | |

A única função de rAF é o laço do `ParticleCanvas` (`index-*.js:337`, `function ge` dentro de `ay` = ParticleCanvas).
O ambiente de partículas redesenha um canvas de janela inteira a 60 Hz em toda tela, e cada quadro custa o desenho
**e** o Commit da camada na thread principal. Isolado com o interruptor "Animações e efeitos" desligado
(`--sem-animacoes`, `dados/antes-sem-animacoes.json`): **Jogar INP 760 → 176 ms, TBT das interações 3.105 → 250 ms,
FPS 24 → 60**. O custo não é React: no build de perfil a troca de categoria do Jogar renderiza `Play` 13 vezes por
clique mas soma só 25,6 ms (`dados/perfil-react.json`).

### 2.2 A Loja/Personalizar — a pior interação do app (`dados/trace-loja-troca-de-aba-antes.resumo.json`)

Trocar para "Meu visual" monta ~130 `.cartao.peca`. Trace: uma tarefa de **1.527 ms, 1.360 ms dela em Layout**.
O React gasta pouco (Inventario 12,2 ms, 129 × MiniaturaDoItem 6,6 ms no build de perfil) — o custo é diagramar e
pintar 130 cartões, a maioria três telas abaixo. Rodada sequencial CPU 4×: **Loja INP 3.656 ms, Personalizar TBT de
carga 3.477 ms** (`dados/seq-antes-cpu4.json`).

### 2.3 O chunk de entrada (`scripts/perf/telas/composicao-bundle.mjs`, 187 módulos, 666 KB pré-minificação)

| O que estava na entrada e não é de quem abre a Início | KB (pré-min.) | Por quê |
|---|---:|---|
| servidor em memória (`src/data/efemero/**`) + `idb` + `data/migracao` | 38,8 + 10,9 + 4,9 | importado estaticamente por `data/funil.ts:31` — só serve a quem está SEM conta |
| minigames do núcleo (`src/core/minigames/**`: termo, escuta, caça-palavras, estado dos jogos…) | 42,4 | o Hub importa do barril `@core`; `const X = f(...)` de topo conta como efeito colateral para o Rollup e o módulo entra inteiro |
| lista CEFR `src/data/trilha/niveis/en.json` | 20,5 | idem, via `core/learning/cefrWordlist.ts` |

### 2.4 Fontes

`src/index.css:1` era `@import url('https://fonts.googleapis.com/css2?…14 famílias…&display=swap')`: a folha do
Google só era pedida depois que o CSS do app chegava e era lido — HTML → CSS → CSS de outra origem → fontes, em série.

### 2.5 O que foi medido e está bem

- **CLS 0** em todas as telas e jogos (celular, 4× e 6×). O CLS 0,098 do Jogar e 0,21 do Vocabulário no Lighthouse
  **desktop** não aparecem no celular; não mexi (não há mudança de performance que não mude o desenho aí).
- **Jogos**: INP 24–192 ms, FPS 56–60 parado e jogando — com uma exceção, a Mala cumulativa (15–17 FPS jogando na
  rodada sequencial, 47,7 na intercalada): é a chuva de confete da comemoração desenhada na thread principal.
- **Imagens**: 9 `<img>` no app, todas pequenas e sob demanda (capas, foto de perfil, QR); `public/` tem só `og.png`
  (52 KB, não carregado pelas telas). Nada a otimizar sem mudar o desenho.
- **Memória JS**: 5–18 MB por tela; sem crescimento entre execuções.

## 3. Correções

### 3.1 Partículas num Worker (`OffscreenCanvas`) — `e9b92b5`

O corpo de simulação e desenho saiu de `ParticleCanvas.tsx` para `src/lib/motorDeParticulas.ts` **sem mudar conta
nenhuma** (mesmas formas, atritos, vidas, poda de 420, pool, cache de emoji). Ele roda em
`src/lib/particulas.worker.ts` sobre o canvas transferido (`transferControlToOffscreen`); onde não houver
`OffscreenCanvas`, roda na página como antes. O componente virou a ponta da página: lê o que só o DOM sabe (token de
cor, `data-particulas`, `data-fonte`, pack, croma, retângulo) no instante do pedido e manda uma mensagem. Um canal por
canvas (o StrictMode roda o efeito duas vezes e `transferControlToOffscreen` só pode ser chamado uma vez) e pausa com a
aba escondida (`visibilitychange`). Conferência visual: com e sem animação, tema escuro, topo 412×450 da tela de
Ajustes — **159 px** com partícula antes, **165** depois (a posição é aleatória). `tests/motorDeParticulas.test.ts`
trava o contrato das mensagens e o sono do laço.

Orçamento de quadro: o ambiente deixa de disputar o quadro com a interface — no Worker ele tem a thread dele. A
pausa por aba escondida é explícita. O "modo leve" continua desligando o canvas inteiro (`performanceMode`).

### 3.2 `content-visibility` nas peças — `19ad1bb`

`src/styles/desempenho.css` (folha nova, carregada por último em `src/main.tsx`): `.cartao.peca { content-visibility:
auto; contain-intrinsic-size: auto 230px }`. O cartão na tela é desenhado igual; o de fora espera chegar perto.
Experimento isolado (mesma página, CSS injetado, CPU 4×, 3 execuções): **INP 2.136 / 2.152 / 2.736 → 416 / 344 /
296 ms**; com animações desligadas o INP continuava 1.808–2.216 ms — o custo era mesmo a diagramação.
`tests/desempenho-css.test.ts` trava a regra e proíbe cor/fonte/borda/sombra/espaçamento nessa folha.

### 3.3 Bundle — `ea3d795`, `01e76e5`

- `src/data/funil.ts`: o servidor em memória vem por `import()` na primeira chamada; `useGateDeConta` importa o evento
  da folha `efemero/nucleo` e o `store` sob demanda; `ModalDeMigracao` importa a migração quando abre.
  `tests/grafo-de-arranque.test.ts` refaz o grafo de imports estáticos a partir de `src/main.tsx` (vermelho com o
  código antigo: 9 módulos do `efemero` no arranque; verde depois).
- `vite.config.ts`: `treeshake.moduleSideEffects` marca `src/core/**` como sem efeito colateral de importação (é TS
  puro; o único comando de topo, `cefrWordlist.ts:77`, enche um mapa do próprio módulo).
- **Sem cascata para quem usa o servidor em memória**: a medição intercalada da edição estática mostrou +300 ms de LCP
  na Início em 2 das 3 execuções. Agora a edição estática recebe o chunk como `<link rel="modulepreload">`
  (`scripts/vite/preCarregarEfemero.ts`, conferido no `dist/index.html`) e o funil começa a baixá-lo na carga quando é
  edição estática ou modo público sem sessão do Supabase guardada (`deveAdiantarServidorEfemero`,
  `tests/efemeroSobDemanda.test.ts`). Self-host e quem tem conta não baixam nada.
- O `Play` cresce 92,6 → 101,1 KB gzip: os minigames do núcleo foram para onde são usados.

| | antes | depois |
|---|---:|---:|
| JS inicial gzip (produção) | 197,6 KB | **163,3 KB** |
| JS inicial brotli (o que o servidor entrega) | 165,2 KB | **136,2 KB** |
| chunk de entrada gzip | 138,2 KB | **104,0 KB** |
| JS inicial gzip (edição estática, com o `modulepreload` do servidor em memória) | 185,4 KB | **164,7 KB** |
| JS transferido na carga (Playwright, brotli): Início / Estatísticas / Loja | 189 / 202 / 224 KB | **163 / 175 / 198 KB** |

### 3.4 Fontes — `1acdab3`

`index.html:25-30` (links nas linhas 28-30): `preconnect` para `fonts.googleapis.com` e `fonts.gstatic.com` (crossorigin) e o `<link
rel="stylesheet">` com a MESMA URL (14 famílias, mesmos pesos, `display=swap`). `tests/fontes-no-html.test.ts`.
`scripts/perf/orcamento-bundle.mjs` passou a ignorar folha de outra origem (teste novo em `tests/perf-suite.test.ts`).

## 4. Antes × depois

### 4.1 Rodada intercalada, CPU 4×, mediana de 3 (`dados/ab-antes-cpu4.json` × `dados/ab-depois-cpu4.json`)

| Tela | LCP ms | TBT carga ms | JS KB | INP ms | TBT interações ms | FPS parado | jank | heap MB |
|---|---|---|---|---|---|---|---|---|
| Início | 1.836 → 3.128 ¹ | 1.953 → 3.169 ¹ | 189 → 163 | 384 → 296 | 3.932 → 751 | 32,8 → 38,2 | 18 → 4 | 5,9 → 5,7 |
| Capturar | 768 → 1.164 ¹ | 600 → 556 | 373 → 351 | 448 → 552 ¹ | 595 → 808 ¹ | 43,1 → 56,4 | 11 → 3 | 6,3 → 5,6 |
| Jogar | 1.660 → 1.448 | 587 → 551 | 304 → 299 | 144 → 472 ¹ | 136 → 845 ¹ | 60 → 60 | 0 → 0 | 10,7 → 15,8 |
| Biblioteca | 1.112 → 1.404 | 233 → 268 | 306 → 279 | 96 → 120 | 29 → 44 | 60 → 60 | 0 → 0 | 5,9 → 5,0 |
| Vocabulário | 1.300 → 1.220 | 373 → 339 | 359 → 338 | 88 → 136 | 280 → 183 | 60 → 60 | 0 → 0 | 11,8 → 10,3 |
| Estatísticas | 924 → 820 | 282 → 124 | 202 → 175 | 72 → 80 | 5 → 9 | 60 → 60 | 0 → 0 | 9,2 → 8,1 |
| **Loja** | 2.252 → 1.864 | 1.022 → 661 | 224 → 198 | **2.152 → 384** | **2.304 → 466** | 59 → 60 | 2 → 0 | 7,1 → 6,5 |
| Ajustes | 380 → 372 | 171 → 183 | 250 → 224 | 80 → 88 | 21 → 29 | 60 → 60 | 0 → 0 | 5,5 → 5,9 |
| **Personalizar** | 364 → 380 | **1.838 → 300** | 224 → 198 | **680 → 416** | **938 → 403** | 59,3 → 60 | 0 → 0 | 7,9 → 6,2 |

¹ Ruído da máquina: as execuções individuais variam de 1.804 a 3.608 ms (LCP da Início antes) e de 2.180 a
4.332 (depois) — ver as linhas em `dados/ab-*.json`. Por isso a rodada de 5 abaixo.

**Rodada intercalada de 5, telas ruidosas, máquina mais calma** (`dados/ab5-*.json`): Início INP 64 → 64, LCP 1.112 →
1.120; Capturar INP 192 → 224; Jogar INP 120 → 128, LCP 1.748 → 1.384; Vocabulário TBT das interações 330 → 164.
**Leitura honesta:** com a máquina calma, um Ryzen 5 a 4× ainda responde às telas leves dentro de "bom", e a
diferença de INP nelas fica no ruído (±30 ms). O ganho aparece quando a thread principal está disputada — o
caso do celular médio de verdade —, e é isso que os traces da §4.3 medem sem depender do relógio.

### 4.2 Jogos, intercalado, CPU 4×, mediana de 3

| Jogo | TBT carga ms | INP ms | FPS jogando |
|---|---|---|---|
| Memória | 524 → 456 | 56 → 64 | 60 → 60 |
| Caça-palavras | 741 → 566 | 64 → 72 | 60 → 60 |
| Soletrar (Termo) | 749 → 626 | 48 → 48 | 60 → 60 |
| Frase embaralhada | 471 → 435 | 32 → 32 | 60 → 60 |
| Karaokê | 469 → 413 | 32 → 24 | 60 → 60 |
| Qual foi a fala? | 536 → 389 | 40 → 48 | 60 → 60 |
| Ditado | 501 → 442 | 32 → 16 | 60 → 60 |
| Duelo relâmpago | 504 → 365 | 40 → 32 | 60 → 60 |
| Karuta | 536 → 399 | 32 → 32 | 60 → 60 |
| Choseong | 544 → 410 | 32 → 32 | 60 → 60 |
| Rali cronometrado | 482 → 404 | 32 → 32 | 60 → 60 |
| **Mala cumulativa** | 515 → 393 | 40 → 32 | **47,7 → 60** |
| Bao | 560 → 393 | 64 → 32 | 60 → 60 |
| Vitendawili | 496 → 398 | 32 → 24 | 60 → 60 |
| Shiritori | 472 → 355 | 40 → 32 | 60 → 60 |
| Cadavre exquis | 514 → 385 | 24 → — ² | 60 → 60 |
| Tabu | 465 → 433 | 32 → 32 | 60 → 60 |

² Nenhuma interação ≥ 16 ms registrada. Conectores precisa de uma gravação com conectores e não abriu com a trilha.

### 4.3 Thread principal com a tela parada — traces intercalados, CPU 4× (`dados/trace-parado-*`)

| Tela | ocupado ms/s (3 pares) | rAF ms/s | Commit ms/s |
|---|---|---|---|
| Início | 889 / 838 / 868 → **573 / 498 / 601** | 114–120 → **0** | 158–168 → 14–16 |
| Jogar | 822 / 744 / 788 → **267 / 255 / 280** | 154–172 → **0** | 183–201 → **0** |

O que sobra na Início parada (≈ 300 ms/s de estilo+pintura) é a animação CSS `respira` (`box-shadow`, 2,4 s, infinita)
do contador de "Revisar agora" (`src/styles/prototipo.css:1733`, gerado) — ver §5.

### 4.4 CPU 6×, sequencial (`dados/seq-*-cpu6.json`; antes e depois em horários diferentes)

| Tela | LCP ms | TBT carga ms | INP ms | TBT interações ms |
|---|---|---|---|---|
| Início | 2.356 → 1.740 | 1.641 → 995 | 192 → 128 | 368 → 156 |
| Capturar | 676 → 540 | 1.087 → 787 | 504 → 544 | 473 → 566 |
| Jogar | 3.008 → 2.904 | 1.795 → 1.716 | 288 → 296 | 559 → 476 |
| Vocabulário | 2.672 → 2.392 | 1.111 → 981 | 264 → 224 | 1.413 → 1.091 |
| Estatísticas | 2.208 → 1.356 | 931 → 682 | 232 → 136 | 172 → 114 |
| **Loja** | 672 → 3.412 ³ | 2.736 → 1.837 | **4.144 → 816** | **5.157 → 1.278** |
| Ajustes | 1.316 → 496 | 836 → 512 | 216 → 184 | 280 → 211 |
| **Personalizar** | 576 → 504 | **5.260 → 942** | **1.784 → 840** | **3.123 → 968** |

³ Uma execução do "antes" terminou o LCP antes do diálogo; o LCP da Loja varia com o que abre por cima.
A rodada sequencial a 4× (`dados/seq-*-cpu4.json`, máquina muito carregada) mostrou Jogar 24 → 60 FPS parado e INP
760 → 168 ms — coerente com o trace, mas a magnitude é da carga da máquina naquela hora.

### 4.5 Lighthouse 13, mediana de 3 (`dados/lighthouse.json`)

| Rota | mobile perf | mobile FCP ms | mobile LCP ms | mobile TBT ms | thread principal ms | JS não usado KB | desktop perf | desktop TBT |
|---|---|---|---|---|---|---|---|---|
| `/` | 68 → 70 | 2.413 → 2.111 | 4.281 → 4.099 | 554 → 566 | 2.088 → 1.788 | **46 → 30** | 97 → 98 | 39 → 54 |
| `/capturar` | 65 → 61 | 2.411 → 2.117 | 6.186 → 6.350 | 378 → 541 | 1.847 → 2.027 | 163 → 147 | 95 → 96 | 0 → 0 |
| `/jogar` | 48 → 48 | 2.415 → 2.116 | 8.919 → 9.088 | 1.138 → 1.403 | 3.878 → 3.343 | 98 → 88 | 89 → 89 | 4 → 0 |
| `/biblioteca` | 73 → 64 | 2.410 → 2.111 | 5.275 → 5.278 | 230 → 573 | 1.922 → 1.933 | 136 → 120 | 97 → 97 | 0 → 0 |
| `/vocabulario` | 61 → 55 | 2.412 → 2.111 | 5.916 → 8.498 | 571 → 756 | 3.247 → 2.446 | 139 → 123 | 82 → 83 | 43 → 21 |
| `/estatisticas` | 70 → 66 | 2.411 → 2.111 | 6.846 → 6.829 | 201 → 377 | 1.880 → 1.905 | 50 → 34 | 94 → 95 | 0 → 0 |
| **`/loja`** | **46 → 59** | 2.411 → 2.110 | 5.551 → 4.749 | **2.919 → 944** | **6.194 → 2.845** | 47 → 31 | **74 → 98** | **494 → 8** |
| `/ajustes` | 75 → 66 | 2.410 → 2.113 | 5.268 → 5.237 | 188 → 500 | 1.727 → 1.967 | 50 → 34 | 97 → 97 | 0 → 0 |

Leitura: FCP mobile −300 ms em todas as rotas e o JS não usado cai 16 KB em todas; a Loja é o ganho grande. O TBT
mobile de Ajustes/Biblioteca/Estatísticas subiu nesta rodada (sequencial, antes e depois em horários diferentes)
**sem subir o tempo de thread principal** do mesmo relatório (1.727 → 1.967, 1.922 → 1.933, 1.880 → 1.905): é a
variância do Lighthouse com a máquina compartilhada, e as mesmas telas não pioraram na medição intercalada (§4.1).
No desktop o FCP subiu 590 → 750 ms: o modelo simulado do Lighthouse conta o `<link>` de fonte de outra origem como
bloqueante e não contava o `@import` (que também bloqueia no navegador). Numa página real o `<link>` só antecipa a
folha; se o dono preferir, o custo some com a folha auto-hospedada (§5, item 3).

### 4.6 Edição estática, intercalada, CPU 4×, mediana de 3 (`dados/ab-estatica-*.json`)

| Tela | LCP ms | TBT carga ms | JS KB | INP ms |
|---|---|---|---|---|
| Início | 1.106 → 1.110 | 266 → 244 | 559 → 506 | 48 → 48 |
| Jogar | 1.364 → 1.278 | 457 → 378 | 924 → 929 | 128 → 128 |
| Estatísticas | 876 → 801 | 172 → 138 | 586 → 533 | 56 → 48 |
| **Loja** | 810 → 746 | 125 → 78 | 648 → 595 | **440 → 272** |
| **Personalizar** | 1.157 → 333 | **443 → 71** | 648 → 595 | **1.584 → 264** |
| Mala (jogando) | — | 663 → 494 | — | FPS **46,1 → 60** |

(O servidor estático não comprime; JS KB aqui é bruto. Esta rodada é do build **antes** do `modulepreload` do §3.3.)

## 5. Não feito, e por quê — com o próximo passo

1. **`respira` na Início e no Vocabulário** (≈ 300 ms/s de estilo+pintura a 4×, com a tela parada). Trocar
   `box-shadow` animado por um pseudo-elemento com `opacity` muda o desenho no meio do ciclo (o halo passa a
   esmaecer em vez de crescer): decisão de design, não de performance. Está em `prototipo.css` (gerado). O modo leve
   já desliga.
2. **`Play` re-renderiza 13× por clique de categoria** (66 commits em 5 cliques, 25,6 ms de React no build de perfil).
   Barato hoje, e o `Play.tsx` está com o agente de jogos (`feat/jogos-premium`): fica como recomendação — memoizar a
   vitrine por `listaDeJogos`/`categoriaAtiva`.
3. **Fontes auto-hospedadas e com subconjunto.** São 14 famílias do Google; auto-hospedar (woff2 no `dist`, `unicode-
   range` latino) tira as duas origens externas e o `preconnect`. Muda licença/CSP/deploy: fica para o dono.
4. **Mala cumulativa**: sobra uma tarefa de ~885 ms (4×) num `setTimeout` a cada rodada (`dados/trace-mala-jogando-depois.resumo.json`, sem URL de
   script — provável fala sintetizada/timer do jogo). Mecânica do jogo: fora do combinado com o agente de jogos.
5. **`crossOrigin="anonymous"` nas capas do Openverse/Wikimedia** (pedido do agente de dispositivos, para COEP
   `require-corp` no iOS). **Não feito**: a capa é gravada com a URL ORIGINAL de qualquer acervo
   (`SeletorDeCapa.tsx`, comentário em `server/http/csp.ts`), e um `<img crossorigin>` de servidor sem
   `Access-Control-Allow-Origin` (Flickr e museus, por exemplo) deixa de carregar — mudaria a aparência de capas já
   gravadas. Caminho seguro: servir as capas por um proxy do próprio app (mesma origem) antes de ligar o atributo.
6. **CLS desktop 0,098 (Jogar) e 0,21 (Vocabulário)** no Lighthouse desktop: não reproduz no celular; investigar com
   o dono (é reserva de espaço, mexe no desenho).

## 6. Fronteira com o agente de dispositivos

- O sinal do modo leve é o de `src/lib/dispositivo/perfil.ts` (`reduzirEfeitos()`), que chega ao `ParticleCanvas` como
  `performanceMode` pelo `useAparencia` — o canvas nem monta no modo leve. Nenhum sistema paralelo foi criado;
  `prefers-reduced-motion` continua decidindo o padrão do interruptor de animações.
- Mesclada a `main` (`3c11bec`): conflito só em `src/main.tsx` (as duas folhas novas, `dispositivo.css` e
  `desempenho.css`, ficam nessa ordem).

## 7. Arquivos tocados

- **Jogos: nenhum arquivo de `src/components/minigames/**`, `Play.tsx` ou `src/core/minigames/**` foi editado.** O
  que mudou para os jogos veio de fora deles (partículas no Worker, bundle).
- Produto: `index.html`, `src/index.css`, `src/main.tsx`, `src/styles/desempenho.css` (novo),
  `src/components/ParticleCanvas.tsx`, `src/lib/motorDeParticulas.ts` (novo), `src/lib/particulas.worker.ts` (novo),
  `src/data/funil.ts`, `src/lib/estado/useGateDeConta.ts`, `src/components/conta/ModalDeMigracao.tsx`,
  `vite.config.ts`, `scripts/vite/preCarregarEfemero.ts` (novo), `server/http/csp.ts` (comentário).
- Medição e orçamento: `scripts/perf/telas/*` (novo), `scripts/perf/frontend.mjs` (`--raiz`),
  `scripts/perf/orcamento-bundle.mjs`, `scripts/perf/suite/slo.json`, `docs/slo.md`.
- Testes novos: `tests/perf-telas.test.ts`, `tests/grafo-de-arranque.test.ts`, `tests/fontes-no-html.test.ts`,
  `tests/motorDeParticulas.test.ts`, `tests/desempenho-css.test.ts`, `tests/efemeroSobDemanda.test.ts`; caso novo em
  `tests/perf-suite.test.ts`.

## 8. Portões (árvore final, com a `main` mesclada)

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` | 0 |
| `vitest run --maxWorkers=3` | 512 arquivos, 5.222 testes passando, 2 pulados |
| `npm run i18n:orfas` | ok |
| `npm run build` | ok |
| `npm run build:estatica` | ok (`modulepreload` do servidor em memória presente no `dist/index.html`) |
| `scripts/perf/orcamento-bundle.mjs` | ok — JS inicial 165,4 KB gzip (teto 180), CSS 49,7 KB (teto 55) |
