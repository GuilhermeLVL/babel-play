# Carga local no navegador: medição e cortes (22/10/2026)

Relato do dono: "os modelos locais estão sobrecarregando o computador; meu PC está super quente;
fiscalize os itens relacionados e deixe somente o necessário". Não só no Safari.

## Como foi medido

- Playwright Chromium 156 (headless shell, **sem GPU**: o Whisper vai ao WASM, o pior caso de CPU) e
  WebKit 27.2, no Mac do dono, contra `npm run dev:local` (porta 3177).
- CPU = soma do `cputime` dos processos do navegador a cada 2 s (média e pico no intervalo); memória =
  RSS somada. Sem GPU, o compositor rasteriza na CPU: os números de repouso são um TETO, não o que uma
  máquina com placa paga, mas mostram o que fica acordado.
- Microfone/tela falsos: uma fala em português sintetizada (`say -v Luciana`, 11 s em laço) entra pelo
  `getUserMedia`/`getDisplayMedia` sobrescritos no `addInitScript`. Roteiro em scratchpad (`medir.mjs`).
- Estados: Início parado; Capturar pronta sem Iniciar; gravando com fala contínua (60 s); gravando em
  silêncio; folha de Encerrar aberta; depois de descartar; Início 20 s depois da captura.

## O que estava pesando (inventário + medição)

| Item                                                                                       | Onde                                                             | Custo medido / evidência                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Partículas de ambiente, a 60 fps em toda tela desde o boot                                 | `App.tsx` (`ambient`), `motorDeParticulas.ts`                    | Auditoria de 10/10 (G11): processo da GPU 117 → 34 ms/s sem elas; worker 14–22 ms/s |
| 8 animações CSS infinitas no Início (`px-brilho` ×4, `px-anel` ×2, `px-pulso-composto` ×2) | `polimento/efeitos.css`, `telas3.css`, `polimentoDesempenho.css` | Início parado 17% de um núcleo; com `animations-off`, 1%                            |
| Parciais do Whisper a cada 1,1 s, cada um redecodificando a fala inteira                   | `systemAudio.ts`, `pipelineDeFala.ts`                            | 76 parciais para 16 finais; 2,6 núcleos cheios durante a fala                       |
| Dois tradutores vivos a sessão inteira (um por sentido)                                    | `salvarSessao.ts`                                                | ~113 MB e um worker cada                                                            |
| Modelos presos 90 s depois de sair da captura                                              | `memoriaDosModelos.ts`                                           | 1,8 GB no Início após a captura                                                     |
| Microbenchmark CPU+GPU no ocioso logo após o primeiro Iniciar                              | `pipelineDeFala.ts`, `sonda.ts`                                  | segundos de carga disputando com o modelo                                           |
| Medidores de nível a 20 Hz com `setState`                                                  | `systemAudio.ts`, `fontesDeAudio.ts`                             | 2 laços de 50 ms                                                                    |
| Onda e ponto de gravação animando sob a folha de Encerrar                                  | `prototipo.css` (`.ondas i`, `.ponto.vivo`)                      | 56% de um núcleo parado na folha                                                    |
| O regulador só reage a ATRASO (rtf), nunca a calor                                         | `reguladorDeDesempenho.ts`                                       | numa máquina rápida nada é cortado                                                  |

## Cortes feitos

1. Partículas de ambiente desligadas (`ambient={false}`); rajadas curtas continuam.
2. Animações decorativas infinitas → 3 ciclos (`px-brilho`, `px-anel`, `px-pulso-composto`).
3. Parciais: 1,1 s → 2 s entre eles e teto por fala (3 com isolamento, 2 no aparelho leve, 1 sem
   `crossOriginIsolated` — Safari/Firefox); parcial descartado pelo pipeline não gasta a cota.
4. Tradutor: só o sentido conteúdo→você sem microfone; o seu sentido aquece com o microfone.
5. Modelos soltos 20 s depois de sair da captura (eram 90).
6. Microbenchmark fora da captura: no ocioso DEPOIS de sair, só se houve captura, cancelado se outra
   captura começa.
7. Medidores de nível a 10 Hz.
8. Onda e ponto de gravação pausam enquanto qualquer diálogo está aberto por cima.

## Antes → depois (Chromium sem GPU; CPU média, pico; memória de pico)

| Estado                         | Antes                                             | Depois                                                                            |
| ------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Início parado                  | 35% (pico 38%), 1,0 GB                            | **11%** (25%), 1,0 GB                                                             |
| Capturar pronta, sem Iniciar   | 29% (32%), 1,0 GB                                 | **2%** (7%), 1,0 GB                                                               |
| Gravando, fala contínua (60 s) | **259%** (321%), 3,2 GB · 76 parciais / 16 finais | **172%** (309%), 3,2 GB · 46 parciais / 16 finais (com teto 2: 124%, 31 parciais) |
| Gravando, silêncio             | 37% (42%), 3,2 GB                                 | **19%** (22%), 3,2 GB                                                             |
| Folha de Encerrar aberta       | 79% (84%)                                         | 63% (69%) — ainda alto; investigar o que anima sob a folha                        |
| Depois de descartar            | —                                                 | **2%** (3%)                                                                       |
| Início 20 s depois da captura  | 32% (34%), 1,8 GB                                 | **8%** (16%), 1,8 GB (os modelos soltam aos 20 s)                                 |

WebKit 27.2 (microfone, Whisper base no WebGPU), só DEPOIS: Início 39%, pronta 35%, fala 95% (pico 133%), silêncio 62%, folha 56%, depois de descartar 35%. ATENÇÃO: a soma incluiu processos `com.apple.WebKit` de outros apps do Mac (15 processos); os números do WebKit são um teto e precisam de nova medida com o filtro estrito.

## O que ainda pesa (não feito; decisões ou dívidas)

- O VAD Silero roda a cada quadro de 96 ms mesmo em silêncio (é a maior parte do custo em silêncio).
- Uma fala longa em pedaços de 6 s multiplica os parciais por pedaço; o texto fica parado ~1,4 s
  entre o último parcial e o final.
- `backdrop-filter` nas barras e folhas (compositor; já desligado no modo leve) — decisão visual.
- O final especulativo pode pagar um decode a mais quando a fala volta.
- O regulador não lê temperatura (o navegador não expõe); lê pressão de CPU só no Chromium.
