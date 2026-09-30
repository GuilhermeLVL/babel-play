# Bancada de desempenho da captura (A0 do plano "grátis sem travar")

**Data:** 29/09/2026. **Branch:** `perf/a0-bancada-desempenho`, criada da `perf/gratis-leve` em `cd6f54b` (A1–A7 já dentro). **Alvo:** edição estática (`npm run build:estatica`), servida por `tests/e2e-estatica/_servidor-estatico.mjs` com COOP/COEP; `crossOriginIsolated` foi `true` em todas as rodadas.

**Máquina local:** Ryzen 5 5600 (12 threads), 16 GB, Windows 11, Chromium headless do Playwright 1.62.1. A máquina estava **compartilhada** com outras seis sessões (tsc, builds, Playwright): os números locais servem para validar a bancada e comparar lados medidos juntos, não como número de produto. A linha de base que vale para o CI sai do próprio Actions.

## Resposta curta

- A bancada roda de ponta a ponta e mede os seis números do A0 em dois perfis: frames longos, 1ª legenda, RTF p50/p95, memória de pico, CPU no silêncio e renders/s.
- **Antes (`9209cec`) × depois (`cd6f54b`)**, rodadas intercaladas:
  - renders/s no silêncio: **600 → 30** (−95%) nos dois perfis;
  - CPU da aba no silêncio, desktop: **90% → 15%** de um núcleo (−83%);
  - notebook fraco: frames > 50 ms **18 → 3** (−83%), > 100 ms **5 → 2** (−60%), soma **2,6 → 1,1 s** (−57%);
  - RTF p95 no fraco −31%; memória de pico igual neste cenário (−2%).
- **Ruído entre duas execuções seguidas** (mediana de 3 rodadas cada): ≤ 10% em 8 das 10 métricas no desktop e em 6 das 10 no fraco. Ficam acima a 1ª legenda no desktop (salta ~1,2 s com o tique dos parciais), os frames longos contados no fraco (poucos eventos, máquina carregada) e a CPU no silêncio do fraco quando uma rodada tem descida do regulador. Essas métricas levam folga absoluta no SLO.
- Dois achados para o dono estão na seção "Achados": a descida do regulador no fim da sessão deixa a aba a 1–2 núcleos no silêncio, e a 1ª legenda do perfil leve foi de 2,3 para 5,0 s.

## O que a bancada mede, e como

| Métrica (chave no SLO) | Como | Janela |
|---|---|---|
| Frames longos (`framesLongos.n50`, `.n100`, `.somaMs`) | Long Animation Frames da sonda (`PerformanceObserver`, `longtask` onde não houver LoAF): contagem > 50 e > 100 ms, soma | do clique em "Iniciar captura" ao fim do áudio |
| 1ª legenda (`primeiraLegendaMs`) | início da 1ª voz (relógio do bipe-âncora) → primeiro balão com texto, parcial ou final | — |
| RTF (`rtf.p50`, `rtf.p95`) | (resultado − post do decode final) ÷ duração do áudio, só falas postadas com o modelo pronto; p50/p95 das falas das N rodadas somadas | — |
| Memória de pico (`memoriaPicoMb`) | processo renderer da aba (pid pelo CDP `SystemInfo.getProcessInfo`): bytes privados no Windows, `RssAnon` no Linux | sessão |
| CPU no silêncio (`cpuSilencio.processoPct`) | Δ `ProcessTime` (CDP `Performance.getMetrics`) ÷ Δ relógio, em % de um núcleo; também a thread principal (`ThreadTime`) e, no Linux, as `DedicatedWorker` por `/proc/<pid>/task` | silêncio final: ≥ 3 s depois da última voz e 1,5 s depois do último balão |
| Renders/s (`rendersPorS.silencio`, `.fala`) | componentes renderizados por commit do React, por segundo | silêncio final; da 1ª voz a 1 s depois da última |

Informativos (no `resultado.json`, fora do SLO): commits/s, CPU da thread principal e fora dela, "STT pronto", fim → tradução p50 e as **trocas de modelo do regulador**.

**Renders/s sem uma linha no bundle.** A sonda instala o gancho do React DevTools antes do app. O react-dom de produção chama `onCommitFiberRoot` a cada commit, e a sonda conta os componentes que renderizaram pelo critério do próprio DevTools: fibra montada agora ou com a flag `PerformedWork`. Ela não desce em subárvore intocada. Sem a sonda, nada disso existe; o JS inicial não mudou (nenhum arquivo de `src/` foi tocado).

## Cenário e perfis

- **Áudio:** `tests/fixtures/bancada-captura/fleurs-en-8.{wav,json}`, 8 falas do FLEURS em inglês com 2–4,5 s de voz, aparadas e normalizadas. É µ-law de 8 bits (532 KB), sob CC BY 4.0 (`FONTES.md`).
  - `montar-audio.mjs --fixture` monta a rodada: 4 s de silêncio, o bipe, as 8 falas com pausas de 1,2–2,4 s e 20 s de silêncio final (71,4 s no total).
  - É igual em qualquer máquina. O WAV montado do FLEURS local continua byte a byte o de antes.
- **Cenário mídia:** conteúdo em inglês com legenda em português, microfone mudo e o áudio do sistema pela sonda.
  - A rota escolhe **Moonshine base q8 (WASM) + opus-mt en→ROMANCE** nos dois perfis: são os menores modelos que ela escolhe ali.
  - O "Modo desempenho" fica no de fábrica do aparelho.
- **Perfis:**
  - `desktop` é o navegador da máquina como está. Headless, o WebGPU não tem adaptador, então o perfil é `desktop-sem-gpu` sem modo leve.
  - `fraco` é um notebook de entrada emulado (`APARELHOS_DA_BANCADA`): sem WebGPU, 2 núcleos, `deviceMemory` 2 e CPU 4× mais lenta pelo CDP. Vira `desktop-sem-gpu` "modesto", com modo leve e pouca memória.
- **Regime:** uma rodada de aquecimento num perfil de navegador novo leva os pesos do cache em disco (`--cache-modelos`) para o Cache Storage.
  - Depois vêm N rodadas medidas no mesmo perfil. Nelas o pré-aquecimento acontece ao abrir a tela, e nada é baixado. Sobram 2 pedidos ao Hub por rodada, `GET /api/models/<id>`: é a conferência da revisão publicada (`modelManifest.ts`), fora do caminho da legenda, e eles continuam indo à rede.

## Como rodar

```
npm run build:estatica
node scripts/perf/latencia-legenda/bancada-captura.mjs [--perfis desktop,fraco] [--rodadas 3] [--porta 4181]
```

- **Porta própria:** a bancada sobe o servidor numa porta só dela. Se a porta já responde, ela recusa: seria o `dist/` de outra worktree.
- **Saída:** os brutos, as métricas por rodada, o `resultado.json` e a tabela de comparação vão para `%TEMP%/bancada-captura/<data>` (ou `--saida`).
- **Ruído contra uma execução anterior:** `--contra <resultado.json>`.
- **Antes × depois:** sirva as duas builds e passe `--alvos`. As rodadas ficam intercaladas (A, B, A, B):
  ```
  DIST_ESTATICA=<worktree-antes>/dist node tests/e2e-estatica/_servidor-estatico.mjs 4182
  DIST_ESTATICA=<worktree-depois>/dist node tests/e2e-estatica/_servidor-estatico.mjs 4183
  node scripts/perf/latencia-legenda/bancada-captura.mjs --alvos antes=http://127.0.0.1:4182,depois=http://127.0.0.1:4183
  ```
- **Comparar um resultado à mão:** `node scripts/perf/latencia-legenda/comparar.mjs --resultado <resultado.json> --ambiente <nome>`. O código de saída é 1 quando algo piora.
- **CI:** `.github/workflows/desempenho.yml`.
  - Roda em PR que toca a captura (`LiveCapture`, `captura/`, `ChatTranscript`, `src/gateway/**`, `lib/captura`, `lib/dispositivo`, `core/harness`), a própria bancada, o lock ou o `vite.config.ts`, e sob demanda.
  - Os pesos ficam em `actions/cache` (chave: `revisoesDosModelos.ts`), o artefato `bancada-desempenho` leva os brutos e o SLO usado, e a tabela vai para o resumo do job.
- **Linha de base do CI:** rode o workflow com `gravar_linha_de_base` (sugestão: `rodadas` = 5), baixe o `slo-captura.json` do artefato e commite. Até lá, o ambiente `ci-ubuntu` não tem base e o job só relata, sem reprovar.

## Números

### Linha de base local (`local-win32`, 6 rodadas: as duas execuções somadas)

| Métrica | desktop | fraco |
|---|---|---|
| frames > 50 ms na sessão | 1 | 4 |
| frames > 100 ms na sessão | 1 | 2 |
| soma dos frames longos (ms) | 228 | 1 270 |
| início da 1ª fala → 1º texto (ms) | 1 228 | 5 003 |
| RTF p50 / p95 | 0,096 / 0,158 | 0,110 / 0,153 |
| memória de pico do processo da aba (MB) | 1 294 | 1 174 |
| CPU da aba no silêncio (% de um núcleo) | 25,3 | 7,3 |
| renders/s no silêncio | 31 | 30,6 |
| renders/s com fala | 104 | 89 |

No silêncio há ~1 commit/s com ~30 componentes cada: é o relógio da sessão. A CPU do desktop no silêncio (25%) fica acima da do fraco (7%). A explicação provável são as threads a mais (o orçamento dá até 4 ao STT no desktop e 2 no modo leve), mas no Windows a bancada não separa as threads.

### Ruído entre duas execuções seguidas (mediana de 3 rodadas cada)

| perfil | métrica | 1ª execução | 2ª execução | ruído |
|---|---|---|---|---|
| desktop | frames > 50 ms | 1 | 1 | 0% |
| desktop | frames > 100 ms | 1 | 1 | 0% |
| desktop | soma dos frames longos (ms) | 237 | 219 | 7,9% |
| desktop | 1ª legenda (ms) | 2 347 | 1 210 | **63,9%** |
| desktop | RTF p50 | 0,092 | 0,100 | 7,3% |
| desktop | RTF p95 | 0,154 | 0,154 | 0,1% |
| desktop | memória de pico (MB) | 1 322 | 1 265 | 4,4% |
| desktop | CPU no silêncio (%) | 25,0 | 25,5 | 2,1% |
| desktop | renders/s no silêncio | 31,4 | 30,8 | 1,7% |
| desktop | renders/s com fala | 100 | 104 | 3,9% |
| fraco | frames > 50 ms | 7 | 4 | **54,5%** |
| fraco | frames > 100 ms | 4 | 2 | **66,7%** |
| fraco | soma dos frames longos (ms) | 1 788 | 1 188 | **40,3%** |
| fraco | 1ª legenda (ms) | 4 972 | 5 018 | 0,9% |
| fraco | RTF p50 | 0,116 | 0,104 | 10,0% |
| fraco | RTF p95 | 0,159 | 0,130 | **20,0%** |
| fraco | memória de pico (MB) | 1 179 | 1 173 | 0,5% |
| fraco | CPU no silêncio (%) | 9,9 | 7,2 | **31,0%** |
| fraco | renders/s no silêncio | 30,0 | 30,6 | 1,9% |
| fraco | renders/s com fala | 89,5 | 89,4 | 0,1% |

Leitura, e o que foi feito com cada métrica ruidosa:

- **1ª legenda no desktop.** O valor salta entre ~1,2, ~2,4 e ~3,9 s: o primeiro parcial sai no 1º, 2º ou 3º tique. Com 3 rodadas, a mediana cai de um lado ou do outro. No SLO, a métrica leva folga de 1,5 s: ainda pega o que importa (um modelo que não fica pronto a tempo soma segundos), sem reprovar pelo tique. No fraco ela é estável porque não há parcial.
- **Frames longos no fraco.** São de 2 a 8 eventos por rodada, com a thread principal 4× mais lenta numa máquina que outras seis sessões disputavam. No SLO: tolerância de 50% e folga de 5 (> 50 ms) e 3 (> 100 ms). O ganho do antes × depois (18 → 3) fica muito acima desse ruído.
- **CPU no silêncio no fraco.** A 1ª execução teve uma rodada com descida do regulador (159% de um núcleo), que puxou a mediana de 7,2 para 9,9. Tolerância de 40% e folga de 5 pontos.
- **RTF p95 no fraco** (20%): tolerância de 35%.
- **Máquina carregada.** O ruído daqui é o teto, não o piso. A definição do aceite (≤ 10%) deve ser conferida no runner: duas execuções do workflow com as mesmas entradas. Se lá ainda sobrar ruído, o caminho é `rodadas` = 5.

### Antes × depois (`9209cec`, a `main` antes da Fase A × `cd6f54b`), 3 rodadas intercaladas por perfil

As duas builds foram feitas com o mesmo `node_modules`: entre os dois commits, a única dependência que mudou é o `undici`, do servidor. Cada build teve o próprio perfil de navegador e o próprio aquecimento.

| perfil | métrica | antes | depois | Δ |
|---|---|---|---|---|
| desktop | frames > 50 ms | 1 | 1 | 0% |
| desktop | frames > 100 ms | 1 | 1 | 0% |
| desktop | soma dos frames longos (ms) | 188 | 207 | +10% |
| desktop | 1ª legenda (ms) | 2 345 | 2 382 | +2% |
| desktop | RTF p50 / p95 | 0,090 / 0,185 | 0,091 / 0,168 | +1% / −10% |
| desktop | memória de pico (MB) | 1 257 | 1 234 | −2% |
| desktop | **CPU no silêncio (%)** | **90,1** | **15,3** | **−83%** |
| desktop | **renders/s no silêncio** | **600** | **30** | **−95%** |
| desktop | renders/s com fala | 683 | 139 | −80% |
| fraco | **frames > 50 ms** | **18** | **3** | **−83%** |
| fraco | **frames > 100 ms** | **5** | **2** | **−60%** |
| fraco | **soma dos frames longos (ms)** | **2 640** | **1 141** | **−57%** |
| fraco | 1ª legenda (ms) | 2 301 | 5 014 | **+118%** |
| fraco | RTF p50 / p95 | 0,127 / 0,207 | 0,122 / 0,142 | −4% / −31% |
| fraco | memória de pico (MB) | 1 188 | 1 160 | −2% |
| fraco | CPU no silêncio (%) | 8,4 | 7,3 | −13% |
| fraco | **renders/s no silêncio** | **601** | **31** | **−95%** |
| fraco | renders/s com fala | 682 | 91 | −87% |

Contra os aceites da tabela da Fase A:

- **A2 (ondas por ref):** "~0 renders/s em silêncio (era 20)". Os commits/s no silêncio foram de ~20 para ~1, e os renders/s de 600 para 30. Sobra o relógio da sessão, com ~30 componentes por segundo. Frames longos −70%: no fraco, −83% (> 50 ms) e −57% (soma).
- **A1 (progresso e streaming):** "frames > 100 ms −50%". No fraco, −60%. A parte "renders de início −80%" não é medida à parte: os renders/s com fala caíram 80–87%.
- **A3 (orçamento de threads):** "CPU no silêncio ≤ 5%". Se os 5% forem de um núcleo, ainda não se chega lá no desktop desta máquina: 90 → 15%, e 25% na linha de base local. O fraco fica em 7%. Não foi medido no runner.
- **A7 (memória):** "pico −25%". Não aparece neste cenário, que tem um STT (Moonshine) e um opus-mt. A carga em série, o LRU de dois tradutores e a liberação ao sair pedem outro cenário (ver "Fora do escopo").
- **A6 (regulador):** ver o achado 3.

## Achados

1. **O freio de CPU do CDP gira um núcleo.** `Emulation.setCPUThrottlingRate` põe o processo da aba em 99,9% de um núcleo mesmo ocioso (0,2% sem o freio), e freia só a thread PRINCIPAL. Num laço na principal, foram 491 ms com o freio e 107 sem; num worker, 343 e 320.
   - Na bancada: `medir.mjs --soltar-cpu-no-silencio` solta o freio 2 s depois da última voz, e a janela de silêncio começa depois disso. Sem isso, a CPU do fraco no silêncio media 105%.
   - Consequência: no perfil "fraco", os workers rodam na velocidade da máquina. O que o perfil mede é a thread principal (frames longos, renders) e o orçamento de threads com 2 núcleos, não o RTF de um aparelho fraco.
2. **Relógio das amostras.** O `Timestamp` de `Performance.getMetrics` com `timeDomain: 'threadTicks'` atrasou ~11 s em 75 s. O `t` das amostras passou a vir do relógio do Node, calibrado contra o `performance.now()` da página.
3. **Descida do regulador no fim da sessão (depois; o antes não desce).** Em 3 das 12 rodadas das duas execuções, o regulador trocou moonshine-base → moonshine-tiny logo depois do ÚLTIMO final (~57 s).
   - Nessas rodadas, a CPU no silêncio ficou em **97–188% de um núcleo** (contra 15–25%) e o pico de memória em **2,3–2,5 GB** (contra 1,2–1,3 GB).
   - Não é só o custo da carga: o tiny fica pronto ~5 s depois, e o patamar continua até o fim da sessão, sem nada para decodificar.
   - A causa não foi investigada (fora do A0). Os candidatos são o pool de threads do ORT no worker novo e o worker antigo que não some.
   - Descer no último final de uma sessão é, além disso, uma descida que ninguém aproveita.
   - **Recomendação:** investigar antes de dar o A6 por fechado. A bancada mostra o caso: `regulador.trocasDeModelo` no `resultado.json` e a CPU/memória da rodada.
4. **1ª legenda no perfil leve: 2,3 → 5,0 s.** Com o A6, o "Modo desempenho" vem ligado de fábrica no perfil leve e não há parciais. A primeira coisa na tela passa a ser o final da fala (no fim da voz + ~1,3 s). **Decisão do dono:** aceitar a troca (menos CPU e menos frames longos) ou manter um parcial espaçado no leve.
   - **Medido no A6b** (`a6b-primeira-legenda.md`): o modo automático passou a guardar um parcial por fala, com 1,5 s dela. No fraco, a 1ª legenda ficou em 2,0 s, com frames longos e CPU iguais aos de sem parcial. O modo que a pessoa liga continua sem parcial.

## Fora do escopo, e limites

- **Linux não foi rodado aqui:** o Docker estava parado. O caminho do runner está escrito, mas só a 1ª execução do Actions o prova:
  - `RssAnon` e CPU por thread em `/proc`;
  - o microfone falso em headless no Ubuntu.
  
  Se algo falhar, o artefato traz os brutos.
- **Base do `ci-ubuntu` não commitada:** sai do `workflow_dispatch`, e quem aprova a base é quem a commita. O `slo-captura.json` traz a base `local-win32` como referência, marcada como máquina compartilhada.
- **O `.e2e.ts` do plano virou script.** O plano previa `tests/e2e-estatica/desempenho-captura.e2e.ts`, e ficou `scripts/perf/latencia-legenda/bancada-captura.mjs`. O config da edição estática roda todo `*.e2e.ts` com timeout de 180 s e reaproveita o servidor da porta 4175. A bancada precisa de ~12 min e de uma porta própria, e `medir.mjs`/`rodar-matriz.mjs` já eram scripts Node dirigindo o Playwright.
- **CPU dos workers à parte só no Linux.** No Windows, "fora da principal" também leva o compositor e o áudio.
- **Memória (A7):** o cenário tem um modelo de STT. O −25% pede outro cenário: Whisper (pt) + dois sentidos de tradução, e sair/voltar da captura (liberar em 90 s). Ele custaria o download do Whisper no CI (80–209 MB).
- **Rodadas:** 3 por perfil no PR, por causa do tempo do CI (~12 min de rodadas); 5 para gravar a base.
- **OpenSpec:** a change da Fase A não existe na `perf/gratis-leve`, e não a criei (o A0 é um item dela).

## Arquivos

- `scripts/perf/latencia-legenda/`:
  - `bancada-captura.mjs` (novo): o orquestrador;
  - `metricas-captura.mjs` (novo): rodada → métricas → mediana;
  - `comparar.mjs` (novo): SLO, tabela, linha de base, ruído, antes × depois;
  - `slo-captura.json` (novo);
  - `wav.mjs` (novo): PCM16 e µ-law;
  - `medir.mjs`: amostras de CPU/memória, cache dos pesos, freio solto, `--desempenho padrao`;
  - `sonda.js`: renders do React, `longtask`;
  - `montar-audio.mjs`: `--fixture`, `--gerar-fixture`, `--silencio-final`;
  - `analisar.mjs`: `tPostFinal`.
- `tests/`:
  - `bancada-desempenho-captura.test.ts` (33 casos);
  - `fixtures/bancada-captura/`;
  - `e2e-estatica/_dispositivos.mjs` (`APARELHOS_DA_BANCADA`);
  - `e2e-estatica/_servidor-estatico.mjs` (`DIST_ESTATICA`).
- `.github/workflows/desempenho.yml`.
- `dados/`: as duas execuções, a linha de base local, antes e depois (resultados condensados; os brutos, 0,1–0,2 MB por rodada, ficaram fora do git).
