> Retroativa: a Fase A está na `main` desde o merge `cd0aa88`. Cada `[x]` cita o commit principal e o teste que o
> cobre. Os `[ ]` são dívidas que a própria fase registrou: relatórios do A0, do A6b e do A6c em
> `openspec/audits/2026-09-29-bancada-captura/`, e mensagens de commit. Branches e merges estão em `design.md`
> ("Context").

## A0 — Bancada de desempenho da captura

- [x] 0.1 Métricas por rodada, agregação e conferência contra o SLO (`metricas-captura.mjs`, `comparar.mjs`,
      `slo-captura.json`), que sai com 1 quando algo piora. Commit `314dd69`; teste
      `tests/bancada-desempenho-captura.test.ts`.
- [x] 0.2 Áudio da bancada versionado: 8 falas FLEURS en, µ-law, 532 KB, em `tests/fixtures/bancada-captura/`.
      `ruidoEntre` compara duas execuções. Commit `2624b86`; mesmo teste.
- [x] 0.3 Sonda:

  - `sonda.js` conta os renders do React pelo gancho do DevTools, sem uma linha no bundle;
  - `medir.mjs` amostra CPU e memória pelo CDP;
  - o perfil `fraco` fica em `APARELHOS_DA_BANCADA` (`tests/e2e-estatica/_dispositivos.mjs`).

  Commit `1758e65`.

- [x] 0.4 Orquestrador `bancada-captura.mjs`:

  - porta própria, que recusa uma porta já ocupada;
  - aquecimento e N rodadas;
  - `--alvos` com rodadas intercaladas, `--gravar-linha-de-base` e `--contra`;
  - o freio de CPU do CDP solto antes da janela de silêncio.

  Commit `f9df244`; mesmo teste.

- [x] 0.5 `.github/workflows/desempenho.yml`: roda em PR que toca a captura e sob demanda. O artefato
      `bancada-desempenho` sai sempre, a tabela vai ao resumo do job, e sem base o job só relata. Commit `bde13bd`.
- [x] 0.6 Os HEADs ao Hub saem do cache em disco; a linha de base `local-win32` e as tolerâncias vêm do ruído medido.
      Commits `1d0b01d` e `533ad93`.
- [x] 0.7 Relatório do A0 (`relatorio.md`): como rodar, a linha de base, o ruído, o antes × depois
      (`9209cec` × `cd6f54b`) e os achados. Commit `6ecb500`.
- [ ] 0.8 Gravar a linha de base `ci-ubuntu`:

  - rodar o `desempenho` com `gravar_linha_de_base` e `rodadas` = 5;
  - baixar o `slo-captura.json` do artefato e commitá-lo (hoje só existe `local-win32`).

  Essa execução também é a 1ª prova do caminho Linux, que o A0 não rodou: `RssAnon`, CPU por thread em `/proc` e o
  microfone falso no Ubuntu.

- [ ] 0.9 Conferir no runner o aceite de ruído (≤ 10%) com duas execuções das mesmas entradas. Se o ruído passar
      disso, usar `rodadas` = 5.
- [ ] 0.10 Na sonda, desligar o `PressureObserver` ou registrar os estados dele, para a carga de outras frentes não se
      passar por regressão (recomendação do A6c).

## A1 — Progresso e streaming sem tempestade de mensagens

- [x] 1.1 O progresso dos modelos só sai a cada 1% ou 200 ms com byte novo (`modelProgress.ts`). Commit `8395084`;
      teste `tests/modelProgress.test.ts`.
- [x] 1.2 Streaming do decode: a 1ª palavra sai na hora e as seguintes no máximo a cada 120 ms; o que ficou retido é
      postado antes do `result`. Commit `8ac275e`; teste `tests/whisperWorker-streaming.test.ts`.
- [x] 1.3 Um `setState` por quadro para o streaming e o progresso (`agendarNoQuadro.ts`); o final nunca é coberto
      por um parcial velho. Commit `669a867`; testes `tests/agendarNoQuadro.test.ts` e
      `tests/pipelineDeFala-latencia.test.ts`.

## A2 — Ondas e rolagem sem re-render da tela

- [x] 2.1 `OndasDoNivel` lê o pico por ref e escreve `style.height` direto: a `LiveCapture` deixa de re-renderizar a
      20 fps. Commit `9957fe0`; testes `tests/ondasDoNivel.test.tsx` e `tests/capturaNoCelular.test.tsx`.
- [x] 2.2 A rolagem da conversa roda num rAF, só quando o número de falas ou o texto das duas últimas cresce. Commit
      `97ada1b`; sem teste próprio (a bancada mede os renders/s).

## A3 — Orçamento de threads

- [x] 3.1 `distribuirThreads`:

  - whisper = `clamp(núcleos − 3, 1, 4)`, com 2 no leve;
  - mt = 2 com ≥ 8 núcleos;
  - tudo 1 sem isolamento;
  - o `whisperLocal` e o `opusMtLocal` mandam as threads ao worker.

  Commit `27d8bdf`; testes `tests/orcamentoDeThreads.test.ts`, `whisperWorker-threads`, `mtWorker-threads`,
  `opusMtLocal-orcamento` e `whisperLocal-perfil`.

- [x] 3.2 VAD numa thread, com SIMD (`MicVAD` e `NonRealTimeVAD`, `ortDoVadNumaThread`). Commit `27d8bdf`; teste
      `tests/vad-uma-thread.test.ts`.
- [x] 3.3 Uma cópia só do `onnxruntime-web` (`overrides` do `@ricky0123/vad-web`). Commit `88fa074`, que entrou pela
      `perf/a9b-bergamot-e-ort`; teste `tests/ort-uma-copia.test.ts`.
- [ ] 3.4 **VAD fora da thread principal.** A 1ª sessão do ORT instancia o `ort-wasm-simd-threaded.wasm` (12 MB) na
      thread principal: 172 ms, e 883 ms com a CPU 4× mais lenta.
  - Com `ort.env.wasm.proxy = true` o quadro some, mas o vad-web reusa o tensor `sr` e o 2º `run` quebra com
    `DataCloneError`.
  - O worker do proxy num bundle do Vite ainda precisa ser provado.
  - Fica como mudança própria, com a sua medição (`a6c-regulador-e-abertura-do-vad.md`).

## A4 — whisper-small só com GPU provada

- [x] 4.1 O adaptador WebGPU de reserva (SwiftShader) conta como sem GPU, e `smallComGpuProvada` entra em
      `sttRouter.ts`. Commit `ed72ae1`; testes `tests/adaptadorWebGpu.test.ts`, `sttRouterPorDispositivo` e
      `perfilDoDispositivo`.
- [x] 4.2 As estimativas de download usam a sonda guardada, a mesma entrada da rota real (`useSondaGuardada.ts`).
      Commit `add7987`; teste `tests/useSondaGuardada.test.tsx`. O e2e `stt-sem-adaptador.e2e.ts` confere que o
      small nunca entra (`c08f81c`).

## A5 — Parciais só onde o aparelho acompanha

- [x] 5.1 A tradução do parcial vai em greedy (beam 1, teto 128); a do final continua em beam 2 com teto 256.
      Commit `68f3846`; teste `tests/mtWorker-geracao.test.ts`.
- [x] 5.2 A captura pergunta `querParcial()` antes de copiar o áudio, e `intervaloDosParciais()` substitui o 1,1 s
      fixo. Commit `cfc682d`; teste `tests/captura-final-especulativo.test.ts`.
- [x] 5.3 O pipeline:

  - reúne as regras do parcial em `querParcial`;
  - espaça os parciais em 2,2 s no aparelho leve;
  - não roda o final especulativo no leve, no modo desempenho ou com os parciais cortados.

  Commit `e9e0aeb`; teste `tests/pipelineDeFala-latencia.test.ts`.

- [x] 5.4 A costura em `fontesDeAudio.ts`: com a Web Speech do aparelho no áudio do sistema, o parcial nem se monta.
      Commit `d7564f5`; testes `tests/fontesDeAudioMicrofone.test.ts` e `fontesDeAudioWebSpeechDoSistema`.

## A6 — Regulador rápido

- [x] 6.1 No núcleo:

  - gatilho `travamento` (≥ 400 ms em 10 s);
  - caso grave (RTF > 1,5 com fila);
  - `origem: 'parcial'`;
  - `configDoReguladorPara` (o leve desce com 2 trechos e 6 s).

  Commit `b1dd61a`; teste `tests/reguladorDeDesempenho.test.ts`.

- [x] 6.2 Vigia da thread principal: LoAF, com `longtask` de recuo; no-op onde o navegador não mede. Commit `a19badd`;
      teste `tests/vigiaDoMainThread.test.ts`.
- [x] 6.3 O regulador da captura ouve o parcial e o vigia, e o modo desempenho vem ligado no aparelho leve. Commit
      `4b9f1cc`; testes `tests/reguladorDaCaptura.test.ts` e `tests/pipelineDeFala-latencia.test.ts`.
- [x] 6.4 O modo leve automático não vira preferência salva em `ui.perfMode`. Commit `2d81e8d`; sem teste próprio.
- [ ] 6.5 **CPU alta depois da descida de modelo.** Em 3 das 12 rodadas do A0, a troca moonshine-base → tiny logo
      depois do último final deixou a aba a 97–188% de um núcleo no silêncio, com pico de 2,3–2,5 GB, até o fim da
      sessão.
  - Investigar o pool de threads do ORT no worker novo e o worker antigo que não some.
  - Rever também a descida no último final, que ninguém aproveita (achado 3 do A0).

### A6b — Um parcial por fala no modo desempenho automático

- [x] 6.6 `primeiroParcialComMs`: o 1º parcial da fala pode esperar mais fala. Commit `b7946db`; teste
      `tests/captura-final-especulativo.test.ts`.
- [x] 6.7 O automático pede um parcial por fala, com 1,5 s dela; o modo escolhido pela pessoa segue sem parcial.
      Na bancada, a 1ª legenda do fraco foi de 4 942 para 2 004 ms. Commit `2d888d8`; teste
      `tests/pipelineDeFala-latencia.test.ts`.
- [x] 6.8 A base `local-win32` → `fraco` → `primeiraLegendaMs` foi regravada de 5 003 para 2 004. O teto de ~4,0 s
      reprova a volta aos 5 s. Commit `80650fd`; relatório `a6b-primeira-legenda.md` em `a8ce778`.
- [x] 6.9 Ligado sozinho, o interruptor diz o que faz: "uma prévia no começo de cada frase e a legenda no fim"
      (`captura/ModoDesempenho.tsx`). Commit `f5c67a2`; teste `tests/modoDesempenho.test.tsx`.

### A6c — O regulador não corta os parciais pela abertura do VAD

- [x] 6.10 Três mudanças:

  - `marcarAberturaDoVad` marca o intervalo do `MicVAD.new`, e o vigia descarta o quadro que começa dentro dele;
  - a janela do bloqueio começa no `reiniciar`;
  - cada decisão vai ao console com o motivo.

  No fraco, a prévia passou de 1 para 6 das 8 falas. Commit `03edd13`; testes `tests/vigiaDoMainThread.test.ts`,
  `reguladorDaCaptura` e `captura-final-especulativo`; relatório `a6c-regulador-e-abertura-do-vad.md` em `08fe92a`.

## A7 — Memória e um modelo de cada vez

- [x] 7.1 opus-mt:

  - LRU de dois com `dispose()` (`lruDePipes.ts`);
  - cargas numa fila só de carga;
  - o adapter é avisado de quem saiu (`descarregado`).

  Commit `559a42b`; testes `tests/lruDePipes.test.ts`, `mtWorker-fila` e `opusMtLocal-orcamento`.

- [x] 7.2 Três regras de carga:

  - `umModeloDeCadaVez`: juntos só no desktop com GPU e ≥ 8 GB;
  - o pré-aquecimento aquece um sentido só;
  - a captura solta os modelos 90 s depois de a pessoa sair.

  Commit `ecc20c4`; testes `tests/memoriaDosModelos.test.ts` e `tests/preaquecer-um-par.test.ts`.

- [ ] 7.3 Medir o aceite "pico −25%" num cenário que o exercite: Whisper (pt), dois sentidos de tradução e sair e
      voltar da captura. O cenário da bancada tem um STT só e não o mostra (relatório do A0, "Fora do escopo").

## A8 — Isolamento de origem ligado de fábrica

- [x] 8.1 `server/http/isolamento.ts`:

  - completo por padrão (COOP + COEP `credentialless` + DIP);
  - `dip` deixa só o DIP;
  - `0`/`false`/`off` desliga;
  - valor desconhecido liga, com aviso no log;
  - montado em `criarApp()`, antes do Vite e do estático.

  Commit `95943db`; teste `tests/integration/isolamento-de-origem.test.ts`.

- [x] 8.2 O isolamento medido no app de pé, registrado no cabeçalho do módulo: `crossOriginIsolated` `true` e whisper
      4 / mt 2. Commit `b9d7f84`.
- [x] 8.3 Documentação: `.env*.example`, `fly.toml`, `README*.md` e `docs/LANCAMENTO.md`, onde o bucket precisa só de
      CORS e a conferência antes de abrir ganha o `crossOriginIsolated`. Commit `62d411e`.

## A9a — Nativo primeiro no desktop fraco

- [x] 9.1 "Legenda sem baixar nada": no desktop sem GPU provada, com o pacote de idioma do navegador, a oferta pede o
      idioma do vídeo e manda o áudio da aba à Web Speech local; celular e Quest ficam de fora. Commit `9336e87`;
      teste `tests/legendaSemBaixar.test.tsx`.
- [x] 9.2 Quando a transcrição não baixa modelo, o selo diz "reconhecimento do navegador". Commit `6ea21d1`; teste
      `tests/legendaSemBaixar.test.tsx`.
- [x] 9.3 E2E na edição estática, do começo ao fim sem nenhum pedido aos pesos do Hub nem aos workers do Whisper e do
      opus-mt. Commit `bb2029f`; teste `tests/e2e-estatica/legenda-sem-baixar.e2e.ts`, no CI pelo job `e2e-estatica`
      desde `248f629`.
- [x] 9.4 O Whisper não aquece quando o áudio da aba vai ao reconhecedor do navegador (`resolverMotorDoSistema` antes
      de aquecer). Commit `ed9fbba`; teste `tests/preaquecer-nativo-primeiro.test.ts`.
- [x] 9.5 Sem o clique, o pré-aquecimento do opus-mt pergunta ao nativo se o par está `available`, com prazo de
      1,5 s (`atendeSemBaixar`). Commit `4503302`; teste `tests/tradutorNativoSemClique.test.ts`.
- [ ] 9.6 Aplicar a decisão do dono sobre o tradutor do navegador em `downloadable`. Hoje o opus-mt aquece e baixa
      junto (Pergunta 1 da proposta).

## A9b — Bergamot no pt→en

- [x] 9.7 Escada do tradutor: o Bergamot vem antes do opus-mt só no pt→en (`bergamotVenceNoPar`). Commit `e236ef6`;
      teste `tests/roteadorDeTraducao.test.ts`.
- [x] 9.8 Worker, `BergamotLocal` e `TradutorLocalComBergamot`:

  - o sha256 do conteúdo descomprimido é conferido;
  - enquanto o Bergamot carrega, o opus-mt não baixa junto;
  - qualquer falha começa a carga do opus-mt.

  Commit `612cb8c`; testes `tests/bergamotLocal.test.ts`, `bergamotWorker` e `registroDeMotores`.

- [x] 9.9 O build baixa os modelos do bucket da Mozilla e confere o sha256:

  - o motor sai do próprio domínio;
  - o cache é `immutable`;
  - a CSP libera a origem com `VITE_BERGAMOT_MODELOS_URL`;
  - `BERGAMOT_BAIXAR=0` desliga.

  Commit `1cb46d0`; testes `tests/baixarModelosBergamot.test.ts`, `integration/cache-da-spa` e
  `seguranca/csp-estreita`.

- [x] 9.10 O download anunciado (31 MB em vez de 113) e a lista de modelos refletem o Bergamot. Commit `fac80f9`;
      testes `tests/modelCache.test.ts`, `versaoDoModelo` e `sttRouterPorDispositivo`.
- [x] 9.11 O Bergamot só diz 100% no `ready`. A prova real no navegador é manual:
      `scripts/perf/bergamot-no-navegador.mjs`. Commit `f6dce4c`; teste `tests/bergamotLocal.test.ts`.
- [x] 9.12 O worker diz o heap do WASM ao ficar pronto: 548 MB reservados depois do aquecimento. Commit `1b43802`.
- [x] 9.13 Soltar os modelos cancela a tradução em voo sem cair no opus-mt (`ChamadaCancelada`). Commit `c853bf7`;
      teste `tests/bergamotLocal.test.ts`.
- [x] 9.14 O worker do Bergamot é ponto de entrada no `knip.json`. Commit `cd45c7b`.
- [x] 9.15 O e2e do Android com o tradutor do navegador baixando bloqueia também o Bergamot. Commit `8299abc`; teste
      `tests/e2e/captura-no-celular.e2e.ts`.
- [ ] 9.16 Medir no Quest e no celular o heap do Bergamot (548 MB reservados no Chromium do desktop) (`1b43802`).
- [ ] 9.17 O opus-mt também diz 100% ~0,5 s antes de a sessão do ORT existir. Fica registrado fora do A9b
      (`f6dce4c`).

## A10 — Nuvem de alívio do Grátis

- [x] 10.1 `FRANQUIA_DE_ALIVIO` (10.800 s, 540 mil tokens, 4.000 chamadas e US$ 0,13 por conta no mês), com a
      conta de custo no comentário, e a regra pura em `src/core/nuvemDeAlivio.ts`. Commit `07a9e1e`; teste
      `tests/nuvemDeAlivio-regra.test.ts`.
- [x] 10.2 Migração 0040: a flag `nuvem_gratuita_alivio` nasce desligada, com `planos: ["free"]`, e entra em
      `docs/flags.md`. Commit `9282d82`; teste `tests/flags-nuvem-gratuita-alivio.test.ts`.
- [x] 10.3 Servidor:

  - as travas em `server/lib/nuvemDeAlivio.ts`;
  - os contadores `alivio` em `usageQuota`;
  - a faixa `alivio` na admissão;
  - `/api/ai/stt/available` e `/api/me/uso` com o mesmo veredicto da porta.

  Commit `81cdbd3`; teste `tests/caracterizacao/nuvem-de-alivio.test.ts`.

- [x] 10.4 Cliente: o aceite vale para a aba, o cabeçalho `x-nuvem-alivio` só vai depois dele, e uma recusa pausa
      a nuvem sem venda. Commit `ba5fb79`; teste `tests/nuvemDeAlivio-cliente.test.ts`.
- [x] 10.5 A faixa "Usar a nuvem grátis (restam X)", sem plano nem preço, grava o consentimento de nuvem antes de
      aceitar. Commit `477ef0a`; teste `tests/ofertaDaNuvemDeAlivio.test.tsx`.
- [x] 10.6 A captura oferece o alívio na preparação e no chão da escada do regulador, e liga a rota na hora; a faixa
      já aberta não pergunta ao servidor de novo. Commits `c3ea21f` e `aab36aa`; testes
      `tests/pipelineDeFala-alivio.test.ts` e `tests/nuvemDeAlivio-cliente.test.ts`.

## Registro

- [x] 11.1 Esta change retroativa: `proposal`, `design`, `tasks` e as specs de `desempenho-da-captura`,
      `motores-no-aparelho`, `cabecalhos-cors-brute-force` e `matriz-de-planos`.
- [x] 11.2 Conferência na `cd0aa88`, em 30/09/2026: os 49 arquivos de teste unitário e de integração citados acima
      passam no `vitest` (655 casos). Os e2e e a bancada não foram rodados nesta conferência.
