> **Change retroativa.** Documenta a Fase A ("grátis sem travar") do plano aprovado `functional-doodling-crane`,
> que já está na `main` pelo merge `cd0aa88` (a `perf/gratis-leve`). Aqui não há trabalho novo. Em `tasks.md`, cada
> `[x]` aponta o commit e o teste do item, e cada `[ ]` é uma dívida que a própria fase deixou registrada. Os números
> vêm da bancada do A0 (`openspec/audits/2026-09-29-bancada-captura/`), medidos numa máquina **compartilhada**:
> servem para comparar lados medidos juntos e não são número de produto.

## Why

A camada gratuita faz a legenda no aparelho: o Whisper ou o Moonshine, o opus-mt e o VAD Silero, todos no navegador.
Antes da Fase A, a tela de captura custava caro mesmo parada. O relatório do A0 comparou a `main` anterior (`9209cec`)
com a `perf/gratis-leve` em `cd6f54b`, onde A1–A7 já estavam: com a tela em silêncio, o antes renderizava **600
componentes/s** e a aba gastava **90% de um núcleo** no desktop. No notebook fraco emulado, a sessão tinha **18
frames > 50 ms**, que somavam **2,6 s**.

As causas estão nas mensagens de commit da fase:

- **Tempestade de mensagens.** O progresso do download virava um `postMessage` e um `setState` a cada chunk, até
  vindo do cache (`8395084`). O streaming do decode também gerava um render por token (`8ac275e`). E as ondas do
  nível eram um `setLevels` a cada 50 ms, que re-renderizava a `LiveCapture` inteira (`9957fe0`).
- **Threads em disputa.** Cada motor pedia threads sem saber dos outros: num desktop de 8 núcleos eram 4 + 4 threads
  de inferência, mais a thread principal com a interface e o VAD (`27d8bdf`).
- **Regulador cego para a tela.** Ele só ouvia o final da fala, e a aba congelava antes de ele reagir (`b1dd61a`).
- **Memória.** STT e tradutor carregavam juntos no desktop sem GPU (`ecc20c4`), e o `mtWorker` guardava cada opus-mt
  num `Map` sem fim (`559a42b`). Além disso, o whisper-small (589 MB) caía no WASM, e a legenda chegava 18,6 s
  depois da fala (`ed72ae1`).
- **Sem isolamento de origem.** A edição com servidor só isolava com `CROSS_ORIGIN_ISOLATION=1`, que o Fly nunca
  definiu. Sem isolamento, o WASM do ONNX Runtime roda em 1 thread (`95943db`).
- **Download evitável.** O desktop fraco baixava o Whisper e o opus-mt mesmo quando o navegador já transcrevia ou
  traduzia o par no aparelho (`9336e87`, `4503302`).

Há ainda uma decisão do dono de 29/09/2026 (comentário de `FRANQUIA_DE_ALIVIO` em `src/core/planos.ts`): o Grátis
ganha **3 h/mês de nuvem para aparelho fraco**. O aparelho continua sem limite.

## What Changes

- **A0: bancada de desempenho da captura.** `scripts/perf/latencia-legenda/bancada-captura.mjs` (novo) mede seis
  números em dois perfis (`desktop` e `fraco`, com CPU 4× mais lenta pelo CDP): frames longos, 1ª legenda, RTF
  p50/p95, memória de pico, CPU no silêncio e renders/s.
  - Arquivos novos: `metricas-captura.mjs`, `comparar.mjs`, `slo-captura.json` e `wav.mjs`. Mudaram `medir.mjs`,
    `sonda.js` (renders do React pelo gancho do DevTools), `montar-audio.mjs` e `analisar.mjs`.
  - O áudio versionado fica em `tests/fixtures/bancada-captura/` (FLEURS en, CC BY 4.0).
  - O CI roda em `.github/workflows/desempenho.yml`: em PR que toca a captura e sob demanda.
  - O relatório está em `openspec/audits/2026-09-29-bancada-captura/relatorio.md`.
- **A1: progresso e streaming sem tempestade.** O progresso dos modelos só sai a cada 1% ou 200 ms com byte novo
  (`src/gateway/adapters/modelProgress.ts`). O streaming do decode manda a 1ª palavra na hora e as seguintes no máximo
  a cada 120 ms (`whisperWorker.ts`). A tela recebe um `setState` por quadro (`src/lib/captura/agendarNoQuadro.ts`).
- **A2: ondas e rolagem.** As ondas do nível viraram folha: `OndasDoNivel.tsx` escreve `style.height` direto, sem
  estado React. A rolagem da conversa roda num rAF, só quando a conversa cresce (`LiveCapture.tsx`).
- **A3: orçamento global de threads** (`src/lib/dispositivo/orcamentoDeThreads.ts`).
  - Whisper = `clamp(núcleos − 3, 1, 4)` (2 no modo leve); tradutor = 2 com ≥ 8 núcleos; VAD e voz = 1. Sem
    `crossOriginIsolated`, tudo 1.
  - O VAD roda com 1 thread e SIMD (`ortDoVadNumaThread`).
  - O projeto passa a ter uma cópia só do `onnxruntime-web` (`overrides` no `package.json`).
- **A4: whisper-small só com GPU provada.** O adaptador WebGPU de software passa a contar como "sem GPU"
  (`adaptadorWebGpu.ts`), e `smallComGpuProvada` entra em `sttRouter.ts`. As estimativas de download usam a sonda
  guardada (`src/lib/dispositivo/useSondaGuardada.ts`).
- **A5: parciais só onde o aparelho acompanha.**
  - A captura pergunta `querParcial()` antes de copiar o áudio (`systemAudio.ts`).
  - O aparelho leve espaça os parciais para 2,2 s (`pipelineDeFala.ts`), e o final especulativo não roda no leve.
  - A tradução do parcial vai em greedy (beam 1, teto 128); a do final não muda (`mtWorker.ts`).
- **A6: regulador rápido.**
  - Gatilho `travamento`: thread principal bloqueada por ≥ 400 ms numa janela de 10 s.
  - Caso grave: RTF > 1,5 com fila desce já no 1º final.
  - Amostra do parcial; no aparelho leve o regulador desce com 2 trechos e 6 s entre degraus
    (`src/core/harness/reguladorDeDesempenho.ts`).
  - Vigia da thread principal com Long Animation Frames (`src/lib/captura/vigiaDoMainThread.ts`).
  - O modo desempenho vem ligado de fábrica no aparelho leve e não vira preferência salva.
  - **A6b:** o modo automático guarda **um parcial por fala**, com 1,5 s de fala (`primeiroParcialComMs`). A 1ª
    legenda do fraco caiu de 4,94 s para **2,00 s**; o modo que a pessoa liga continua sem parcial
    (`captura/ModoDesempenho.tsx`).
  - **A6c:** o vigia descarta o quadro da abertura do VAD (`marcarAberturaDoVad`), e a janela do bloqueio começa no
    `reiniciar` da sessão.
- **A7: memória e um modelo de cada vez.**
  - STT e tradutor carregam juntos só no desktop com GPU e ≥ 8 GB (`umModeloDeCadaVez`,
    `src/lib/captura/memoriaDosModelos.ts`).
  - O pré-aquecimento aquece um sentido só, e a captura solta os modelos 90 s depois de a pessoa sair.
  - O tradutor fica num LRU de dois opus-mt, com `dispose` e cargas em série (`src/gateway/adapters/lruDePipes.ts`).
- **A8: isolamento de origem ligado de fábrica** (`server/http/isolamento.ts`, montado em `server/http/app.ts`).
  - O padrão é COOP `same-origin` + COEP `credentialless` + `Document-Isolation-Policy: isolate-and-credentialless`.
  - `CROSS_ORIGIN_ISOLATION=dip` deixa só o DIP; `0`/`false`/`off` desliga.
- **A9a: nativo primeiro.**
  - No desktop fraco aparece a oferta "Legenda sem baixar nada": escolher o idioma do vídeo manda o áudio da aba à
    Web Speech do aparelho, com `processLocally` (`src/lib/captura/legendaSemBaixar.ts`,
    `captura/LegendaSemBaixar.tsx`).
  - O Whisper não aquece quando o áudio vai a esse reconhecedor.
  - Em qualquer aparelho com a Translator API, o pré-aquecimento do opus-mt primeiro pergunta se o par já está no
    disco (`atendeSemBaixar` em `chromeTranslator.ts`, `src/gateway/index.ts`).
- **A9b: Bergamot no pt→en.**
  - O build baixa do bucket da Mozilla os três `.gz` do par, confere o sha256 de cada um e os serve do próprio
    domínio (`scripts/baixar-modelos-bergamot.mjs`, `src/gateway/adapters/modelosDoBergamot.json`, `vite.config.ts`,
    `Dockerfile`). `BERGAMOT_BAIXAR=0` desliga.
  - No aparelho, o worker faz a tradução (`bergamotWorker.ts`, `bergamotLocal.ts`, `bergamotModelo.ts`) e o opus-mt
    fica de reserva.
  - O en→pt continua no opus-mt.
- **A10: nuvem de alívio do Grátis.**
  - `FRANQUIA_DE_ALIVIO` (`src/core/planos.ts`): 10.800 s, 540 mil tokens, 4.000 chamadas e teto de US$ 0,13 por conta
    no mês.
  - A regra pura de elegibilidade fica em `src/core/nuvemDeAlivio.ts`.
  - A flag `nuvem_gratuita_alivio` nasce **desligada** (migração 0040).
  - As travas no servidor estão em `server/lib/nuvemDeAlivio.ts`, `usageQuota.ts` (modo `alivio`), `admissao.ts`
    (faixa `alivio`), `convidado.ts`, `routes/ai.ts` e `routes/me.ts`.
  - No cliente: `src/lib/nuvemDeAlivio/{estado,consulta}.ts`, o cabeçalho `x-nuvem-alivio` em `groqWhisper.ts` e
    `serverLlmMt.ts`, a faixa `captura/OfertaDaNuvemDeAlivio.tsx` e `ligarNuvemDeAlivio` no `pipelineDeFala.ts`.

## Impact

- **Cliente (captura e motores):**
  - `src/components/views/LiveCapture.tsx`, `src/components/views/captura/{OndasDoNivel,ModoDesempenho,LegendaSemBaixar,OfertaDaNuvemDeAlivio}.tsx`,
    `captura/celular/CapturaNoCelular.tsx`, `src/components/{AiEnginePanel,Onboarding,VocabularyPanel}.tsx`.
  - `src/lib/captura/{pipelineDeFala,reguladorDaCaptura,vigiaDoMainThread,agendarNoQuadro,memoriaDosModelos,legendaSemBaixar,fontesDeAudio,tiposDaFala}.ts`,
    `src/lib/dispositivo/{orcamentoDeThreads,useSondaGuardada}.ts`, `src/lib/nuvemDeAlivio/*`, `src/lib/uso.ts`.
  - `src/core/harness/{reguladorDeDesempenho,roteadorDeTraducao,registroDeMotores}.ts`,
    `src/core/{planos,nuvemDeAlivio}.ts`.
  - `src/gateway/{index,sttRouter,adaptadorWebGpu,modelCache,modelManifest,offlineTranscribe}.ts`,
    `src/gateway/capture/systemAudio.ts`,
    `src/gateway/adapters/{modelProgress,whisperWorker,whisperLocal,mtWorker,opusMtLocal,lruDePipes,chromeTranslator,bergamotWorker,bergamotLocal,bergamotModelo,groqWhisper,serverLlmMt}.ts`,
    `modelosDoBergamot.json`.
- **Servidor:** `server/http/{isolamento,app,csp,estaticos}.ts`,
  `server/lib/{nuvemDeAlivio,usageQuota,convidado,config,limpezaDeConvidados}.ts`,
  `server/ai/{admissao,reservaDeNuvem,sttProxy,mtProxy}.ts`, `server/routes/{ai,me}.ts`.
- **Migração:** `0040_flag_nuvem_gratuita_alivio.sql`, uma semente idempotente (`INSERT OR IGNORE`) com a reversão no
  comentário.
- **Flag:** `nuvem_gratuita_alivio`, desligada, `planos: ["free"]` (`docs/flags.md`).
- **Variáveis de ambiente:**
  - `CROSS_ORIGIN_ISOLATION`: passa a vir ligada sem definir nada; `dip` e `0` são as saídas.
  - `BERGAMOT_BAIXAR=0` (build) e `VITE_BERGAMOT_MODELOS_URL` (opcional; libera a origem no `connect-src`).
  - `ALIVIO_TETO_USD_MES` e `ALIVIO_POOL_USD_DIA`: registradas em `server/lib/config.ts`, fora dos `.env*.example`.
- **Build e deploy:**
  - `vite.config.ts` (plugin `modelos-do-bergamot`, `__BERGAMOT_PT_EN__`), `Dockerfile`, `public/_headers`
    (cache `immutable` do Bergamot), `.gitignore` (`/public/modelos/`), `knip.json`, `package.json` (Bergamot em
    `dependencies`, `overrides` do `onnxruntime-web`).
  - `fly.toml`, `.env*.example`, `README*.md`, `docs/LANCAMENTO.md`, `FONTES.md`.
- **CI:** `.github/workflows/desempenho.yml` (novo). O e2e `tests/e2e-estatica/legenda-sem-baixar.e2e.ts` roda no job
  `e2e-estatica` do `ci.yml` (`248f629`).
- **Testes:** um por item, listados em `tasks.md`. Os principais são `tests/bancada-desempenho-captura.test.ts`,
  `reguladorDeDesempenho`, `vigiaDoMainThread`, `reguladorDaCaptura`, `orcamentoDeThreads`, `memoriaDosModelos`,
  `integration/isolamento-de-origem`, `legendaSemBaixar`, `bergamotLocal`, `bergamotWorker`,
  `baixarModelosBergamot`, `nuvemDeAlivio-regra` e `caracterizacao/nuvem-de-alivio`.
- **JS inicial:** a oferta do alívio e a consulta ao servidor entram por `import()`/lazy. O JS inicial seguiu em
  179,9 KB gzip (`c3ea21f`).

## Perguntas ao dono

1. **Tradutor do navegador em `downloadable`.** Hoje, com o pacote de idioma ainda a baixar (ou sem resposta em
   1,5 s), o opus-mt aquece e baixa como antes, junto com o do navegador (`4503302`). Esperar o pacote do navegador
   ou manter os dois?
2. **Traduzir a prévia do parcial único.** No A6c, a prévia chegou a 6 das 8 falas no fraco, e a CPU dos workers na
   fala subiu cerca de 39% sem o freio do CDP; a tradução da prévia custa ~1,2 s de worker por sessão
   (`a6c-regulador-e-abertura-do-vad.md`). Manter a tradução da prévia ou só a do final?
3. **Aceite do A3, "CPU no silêncio ≤ 5%".** O relatório do A0 mediu 15–25% de um núcleo no desktop e ~7% no fraco,
   e não diz se os 5% são de um núcleo. Qual é a unidade, e o desktop fica como está?
4. **Aceite do A7, "pico −25%".** O cenário da bancada não o mede. Medir exige o Whisper (pt) e os dois sentidos de
   tradução, o que no CI custaria o download do Whisper (80–209 MB) a cada execução. Medir no CI ou só localmente?
5. **Quando ligar `nuvem_gratuita_alivio`.** `docs/flags.md` põe como condição `AI_BUDGET_USD_DAY` definido e a
   retenção zero da Groq ligada no console.
