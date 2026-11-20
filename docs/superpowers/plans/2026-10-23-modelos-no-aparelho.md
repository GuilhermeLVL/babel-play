# Modelos no aparelho — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parakeet v3 como transcrição padrão do automático em pt/es onde cabe (incl. Safari do Mac), menos CPU no silêncio, e uma tela "Modelos no aparelho" para ver, baixar, apagar e fixar modelos.

**Architecture:** O roteador puro (`src/gateway/sttRouter.ts`) já sabe rotear para o Parakeet atrás de `parakeetLigado()`; muda o padrão da chave, a regra de quem cabe e passa a respeitar um modelo fixado. Proteções de memória ficam em `src/lib/captura/memoriaDosModelos.ts` e numa sentinela de queda. O VAD ganha um portão de energia na frente do Silero. A tela é um painel novo na aba Processamento dos Ajustes, sobre um catálogo puro de modelos.

**Tech Stack:** React 19 + Vite, TypeScript, vitest (jsdom), Playwright, transformers.js 4.2 / onnxruntime-web, Cache Storage `transformers-cache`, manifestos em localStorage (`src/gateway/modelManifest.ts`).

**Spec:** `docs/specs/2026-10-23-modelos-no-aparelho.md` (aprovada; ver "Decisões do dono").

## Global Constraints

- Textos de UI, comentários e docs em pt-BR; toda frase nova de UI passa por `t()` e entra em `public/i18n/{en,es,ar}.json` (+ `npm run i18n` ou o script que regenera `xx`/`cobertura.json`, como nos commits anteriores).
- Camadas: `src/core/` não importa de gateway/components/lib (ESLint). Funções de decisão são puras e testadas.
- Nenhum custo novo de nuvem; nada de áudio sai do aparelho por esta mudança.
- Gemini é proibido. Licença do Parakeet: CC-BY-4.0 ⇒ crédito "Parakeet TDT v3 · NVIDIA · CC-BY-4.0" na tela.
- Nunca enfraquecer teste existente; teste cuja premissa a spec mudou (chave desligada de fábrica) é REESCRITO para a nova regra, com o motivo no comentário.
- `npm run typecheck`, `npm run lint` e os testes do arquivo tocado passam antes de cada commit. Commits na `main`, `git pull --rebase` antes do push.
- Alvos de toque ≥ 44 px; `role="progressbar"` com `aria-valuenow` no download; selos nunca só por cor.

## Review Focus

1. Aparelho que caiu (aba do Safari morreu) com o Parakeet carregado: na abertura seguinte o automático NÃO pode escolher o Parakeet de novo (Task 3).
2. Parakeet escolhido mas ainda não baixado no automático: a captura não pode travar esperando 672 MB; sai pelo Whisper e oferece baixar (Task 2 + 4).
3. Idioma fora de pt/es com o Parakeet fixado na tela: a rota ignora a fixação e cai no automático, e a tela diz por quê (Task 2 + 6).
4. Fala baixinha no microfone logo após um silêncio longo: o portão de energia não pode comer o começo da fala (Task 5).
5. Apagar o modelo em uso pela tela com a captura aberta em outra aba: o próximo início rebaixa sem erro (Task 6).

---

### Task 1: Medir o que falta (bancada; sem código de app)

**Files:**

- Modify (se preciso): `scripts/eval-fala/bancada/navegador/{rodar.mjs,pagina.html,pontuar.mjs}`
- Create: `docs/auditoria/2026-10-23-bancada-complementar.md`

- [ ] **Step 1:** Parakeet v3 int8 WASM × Moonshine base q8 em `fleurs_en` (100 falas, 4 threads), com `node scripts/eval-fala/bancada/navegador/rodar.mjs` e o pontuador; dados em `~/babel-bancada` (já preparados).
- [ ] **Step 2:** Reconhecimento local do Chrome (`SpeechRecognition` com `processLocally: true`, chamando `install()` no perfil da bancada, entrada por `MediaStreamTrack` de um `<audio>` com o WAV) em `fleurs_pt`, `fleurs_es`, `fleurs_en`, 50 falas cada: WER com IC 95% e RTF. Prazo de 1 h; se a API não aceitar faixa de áudio ou não instalar sem gesto, registrar o motivo e parar.
- [ ] **Step 3:** Escrever o doc com tabelas, limitações e versões; commit `docs(bancada): Parakeet × Moonshine em inglês e reconhecimento local do Chrome`.

### Task 2: Parakeet no automático, Mac Apple e modelo fixado

**Files:**

- Modify: `src/gateway/adapters/parakeetModelo.ts` (`parakeetLigado`)
- Modify: `src/gateway/sttRouter.ts` (`DispositivoDaRota`, `parakeetCabeNoAparelho`, `routeStt`, `SttRouteInput`)
- Modify: `src/lib/dispositivo/perfil.ts` (`dispositivoDaRota` passa `fornecedorGpu`)
- Create: `src/gateway/modeloFixo.ts`
- Test: `tests/sttRouter-parakeet.test.ts` (reescrever a premissa "desligada de fábrica"), `tests/modeloFixo.test.ts`

**Interfaces:**

- Produces: `parakeetLigado(): boolean` — `true` salvo `localStorage['babel.stt.parakeet'] === '0'`; sem localStorage, `false`.
- Produces: `DispositivoDaRota.fornecedorGpu?: string` (de `sonda.sinais.webGpu.fornecedor`, minúsculo).
- Produces: `parakeetCabeNoAparelho(d)`: desktop, sem `economiaDeDados`, e (`memoriaGb >= 8` com `poucaMemoria === false`) **ou** `fornecedorGpu === 'apple'` (todo Mac com chip Apple tem ≥ 8 GB; vale com `poucaMemoria` por falta de isolamento, porque a Task 3 serializa os modelos).
- Produces: `SttRouteInput.parakeetNoAparelho?: boolean` — no `auto`, o Parakeet só entra se `true` (cópia completa); senão o automático segue no Whisper do aparelho e a rota leva `parakeetDisponivelParaBaixar: true`. No `accurate`, entra mesmo sem cópia (a folha de início já confirma downloads; ver Step 4).
- Produces: `SttRoute.parakeetDisponivelParaBaixar?: boolean`.
- Produces: `modeloFixo.ts`: `type ModeloFixo = 'auto' | 'parakeet' | 'whisper-small' | 'whisper-base' | 'whisper-tiny' | 'moonshine-base' | 'moonshine-tiny'`; `lerModeloFixo(): ModeloFixo` (chave `babel.stt.modeloFixo`, padrão `'auto'`); `gravarModeloFixo(m: ModeloFixo): void`; `modeloFixoServe(m: ModeloFixo, idiomas: string[]): boolean` (parakeet só pt/es — `IDIOMAS_DO_PARAKEET`; moonshine só en; whisper qualquer).
- Produces: `SttRouteInput.modeloFixo?: ModeloFixo`; quando ≠ `'auto'`, serve aos idiomas e o aparelho permite (parakeet: `parakeetCabeNoAparelho`; small: `permiteSmall`), a rota local é a do modelo fixado com rótulo `local · escolhido por você (<nome>)` e `preferCloud: false`; senão é ignorado.

- [ ] **Step 1: testes que falham**
  - `parakeetLigado` sem chave → `true`; `'0'` → `false`; `'1'` → `true`.
  - `routeStt({quality:'auto', contentLang:'pt', dispositivo: desktop 8 GB, parakeetNoAparelho: true})` → `localModel === ID_DO_PARAKEET`.
  - mesmo com `parakeetNoAparelho: false` → `localModel === WHISPER_MODELS.base` (ou small com GPU provada) e `parakeetDisponivelParaBaixar === true`.
  - `{tipo:'desktop-com-gpu', poucaMemoria: true, memoriaGb: null, fornecedorGpu:'apple'}` → `parakeetCabeNoAparelho === true`; `fornecedorGpu:'intel'` sem memória → `false`.
  - `contentLang:'fr'` com `modeloFixo:'parakeet'` → rota do automático (Whisper); `contentLang:'pt'` com `modeloFixo:'whisper-base'` → `WHISPER_MODELS.base` e rótulo contém "escolhido por você".
  - A impressão `IMPRESSAO_DE_ANTES` continua valendo para `parakeet: false` (garantia 1 do arquivo, com o comentário atualizado: "desligada pela pessoa = nada muda").
- [ ] **Step 2:** `npx vitest run tests/sttRouter-parakeet.test.ts tests/modeloFixo.test.ts` → FAIL.
- [ ] **Step 3:** Implementar o descrito em Interfaces. Os chamadores de `routeStt` (`src/lib/captura/pipelineDeFala.ts`, `src/components/views/LiveCapture.tsx`) passam `parakeetNoAparelho: temCopiaNoAparelho(ID_DO_PARAKEET)` e `modeloFixo: lerModeloFixo()`.
- [ ] **Step 4:** `src/lib/dispositivo/perfil.ts`: no desktop, `confirmarDownloadAcimaDeMb` passa de `null` a `300` (o Parakeet de 672 MB e o small de 589 MB pedem confirmação na folha de início; o base de 80 MB não). Atualizar o teste de perfil correspondente.
- [ ] **Step 5:** Rodar `npx vitest run tests/sttRouter*.test.ts tests/perfil*.test.ts tests/parakeet*.test.ts tests/inicioDaCaptura*.test.ts` → PASS; typecheck e lint.
- [ ] **Step 6:** Commit `feat(stt): Parakeet no automático de pt/es onde cabe (Mac Apple incluso) e modelo fixado pela pessoa`.

### Task 3: Memória e sentinela de queda

**Files:**

- Modify: `src/lib/captura/memoriaDosModelos.ts` (`umModeloDeCadaVez`)
- Create: `src/lib/captura/sentinelaDoModelo.ts`
- Modify: onde o worker do Parakeet carrega e libera (`src/gateway/adapters/parakeetLocal.ts`) e o boot da captura que consulta `modeloProibido` (`src/lib/captura/pipelineDeFala.ts`)
- Test: `tests/memoriaDosModelos.test.ts`, `tests/sentinelaDoModelo.test.ts`

**Interfaces:**

- Produces: `umModeloDeCadaVez(perfil, sttPesado = false): boolean` — `true` também quando `sttPesado`.
- Produces: `marcarCarregando(id: string, agora = Date.now()): void` (grava `babel.sentinela.<id>` = timestamp), `desmarcar(id: string): void`, `quedaSuspeita(id: string, agora = Date.now()): boolean` (marca presente com menos de 30 min ⇒ `true`; marca mais velha é apagada e dá `false`).
- Consumes: `proibirModelo(id, motivo)` de `src/lib/dispositivo/sonda.ts:372` e `modeloProibido(id)` (`:427`).

- [ ] **Step 1: testes que falham** — `umModeloDeCadaVez({tipo:'desktop-com-gpu', poucaMemoria:false, sinais:{memoriaGb:8}}, true) === true`; sentinela: marcar → `quedaSuspeita` true; desmarcar → false; marca de 31 min → false e chave removida.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar. Carregar o Parakeet chama `marcarCarregando(ID_DO_PARAKEET)`; liberar o worker e `pagehide` chamam `desmarcar`. No início da captura, se `quedaSuspeita(ID_DO_PARAKEET)`, chamar `proibirModelo(ID_DO_PARAKEET, 'a aba caiu com o modelo carregado')` e `desmarcar`; a rota já respeita o veto (confirmar no roteador; se não respeitar, `parakeetNoAparelho` vira `false` quando `modeloProibido`). O pipeline passa `sttPesado: rota.localModel === ID_DO_PARAKEET` a `umModeloDeCadaVez`.
- [ ] **Step 4:** rodar os testes da Task 2 e 3 + `tests/pipelineDeFala*.test.ts` → PASS.
- [ ] **Step 5:** Commit `fix(memoria): com o Parakeet, tradutor depois; aba que caiu com ele volta ao Whisper`.

### Task 4: Baixar em segundo plano e oferta na Captura

**Files:**

- Create: `src/gateway/baixarModelo.ts`
- Modify: `src/components/ModelPrepPanel.tsx` (linha de oferta) e quem o alimenta em `src/components/views/LiveCapture.tsx`
- Test: `tests/baixarModelo.test.ts`, `tests/modelPrepPanel-oferta.test.tsx`

**Interfaces:**

- Produces: `baixarModelo(id: string, aoProgresso?: (fracao: number) => void, sinal?: AbortSignal): Promise<'baixado' | 'cancelado' | 'falhou'>` — para o Parakeet, usa o caminho de carga do worker dele (que já grava no Cache Storage e o manifesto) e libera o worker ao terminar; para Whisper/Moonshine, o `pipeline()` do transformers.js no worker existente com o dtype/device da rota. Uma aba por vez com `navigator.locks.request('babel.baixar.' + id, …)` quando existir.
- Produces: prop `ofertaDoPreciso?: { mb: number; aoBaixar: () => void; progresso: number | null }` em `ModelPrepPanel`.

- [ ] **Step 1: testes que falham** — `baixarModelo` com worker falso: progresso chega a 1 e devolve `'baixado'`; `AbortSignal` abortado devolve `'cancelado'`; com `navigator.locks` falso, a segunda chamada simultânea espera a primeira. `ModelPrepPanel` com `ofertaDoPreciso={{mb:672,…}}` mostra "Baixar o modelo preciso (672 MB) para as próximas capturas" e o botão chama `aoBaixar`; com `progresso: 0.4` mostra `role="progressbar"` `aria-valuenow=40`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar; `LiveCapture` passa a oferta quando a rota veio com `parakeetDisponivelParaBaixar` e não há economia de dados.
- [ ] **Step 4:** rodar → PASS; typecheck/lint; i18n das frases novas.
- [ ] **Step 5:** Commit `feat(modelos): baixar o modelo preciso em segundo plano, oferecido na Captura`.

### Task 5: Portão de energia antes do VAD

**Files:**

- Create: `src/gateway/capture/portaoDeEnergia.ts`
- Modify: `src/gateway/capture/vadEmWorker.ts` (`VadEmWorker.new`, o `(q) => modelo.process(q)` do `FrameProcessor`)
- Test: `tests/portaoDeEnergia.test.ts`
- Doc: acrescentar a medição a `docs/auditoria/2026-10-22-carga-local.md`

**Interfaces:**

- Produces: `comPortaoDeEnergia(modelo: Pick<ModeloDoVad,'process'|'reset'>, opcoes?: { pisoRms?: number; quadrosQuietos?: number }): Pick<ModeloDoVad,'process'|'reset'> & { quadrosPulados(): number }`. Padrões: `PISO_RMS = 0.0015` (~ −56 dBFS), `QUADROS_QUIETOS = 8` (~770 ms com quadros de 96 ms).
- Regra: o quadro vai ao modelo sempre que o RMS ≥ piso; abaixo do piso, os primeiros `QUADROS_QUIETOS` consecutivos ainda vão ao modelo; dali em diante devolve `{ isSpeech: 0, notSpeech: 1 }` sem chamar o modelo. O primeiro quadro acima do piso depois de pulos chama `modelo.reset()` antes de processar.

- [ ] **Step 1: testes que falham** — 20 quadros de zeros: o modelo é chamado 8 vezes e `quadrosPulados() === 12`; zeros e depois um quadro com seno de amplitude 0,01: `reset` chamado 1 vez e o modelo recebe esse quadro; ruído com RMS 0,002 contínuo: nenhum quadro pulado.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar e envolver o modelo no `VadEmWorker.new`.
- [ ] **Step 4:** rodar `tests/portaoDeEnergia.test.ts` e `tests/vadEmWorker*.test.ts` e os de captura (`tests/systemAudio*.test.ts`) → PASS.
- [ ] **Step 5:** Medir com o roteiro de `docs/auditoria/2026-10-22-carga-local.md` (Chromium headless, fala falsa + 60 s de silêncio): registrar CPU no silêncio antes/depois; alvo < 8%. Se não atingir, registrar o número e seguir (não ajustar o piso para cima sem medir fala baixa).
- [ ] **Step 6:** Commit `perf(vad): em silêncio claro o Silero não roda a cada 96 ms`.

### Task 6: Tela "Modelos no aparelho" (Ajustes → Processamento)

**Files:**

- Create: `src/gateway/catalogoDeModelos.ts`
- Create: `src/components/views/ajustes/ModelosNoAparelho.tsx`, `src/styles/modelosNoAparelho.css`
- Modify: `src/components/views/ajustes/quest/AjustesDoQuest.tsx` (painel `contas`, abaixo do `AiEnginePanel`)
- Modify: `src/components/views/captura/ModeloNoDispositivo.tsx` (link "Ver todos os modelos" → Ajustes, aba `contas`)
- Test: `tests/catalogoDeModelos.test.ts`, `tests/modelosNoAparelho.test.tsx`, `tests/e2e/modelos-no-aparelho.e2e.ts`

**Interfaces:**

- Consumes: `lerModeloFixo`/`gravarModeloFixo`/`modeloFixoServe` (Task 2), `parakeetCabeNoAparelho`, `baixarModelo` (Task 4), `modeloDisponivel`, `apagarModelo`, `baixadoEm` (`modelManifest.ts`), `navigator.storage.estimate`.
- Produces: `catalogoDeTranscricao(): ItemDoCatalogo[]` com `ItemDoCatalogo = { fixo: ModeloFixo; id: string; nome: string; idiomas: string[] | 'todos'; mb: number; erroPtPorCem?: number; peso: 'leve' | 'medio' | 'pesado' }`, valores:
  | fixo | nome | idiomas | mb | erroPtPorCem | peso |
  |---|---|---|---|---|---|
  | parakeet | Preciso | pt, es | 672 | 6 | medio |
  | whisper-small | Preciso com placa de vídeo | todos | 589 | 11 | pesado |
  | whisper-base | Equilibrado | todos | 80 | 19 | leve |
  | whisper-tiny | Rápido | todos | 44 | 29 | leve |
  | moonshine-base | Inglês | en | 67 | — | leve |
  | moonshine-tiny | Inglês, rápido | en | 32 | — | leve |
  (mb do base/tiny = q8 de `sttRouter.ts`; ids de `WHISPER_MODELS`, `MOONSHINE_MODELS`, `ID_DO_PARAKEET`.)
- Produces: `tradutoresGuardados(): Array<{ id: string; titulo: string; bytes: number }>` — dos manifestos em localStorage (prefixo de `chaveDoManifesto`) cujo id não está no catálogo de transcrição.

Tela (copy fixa, em `t()`):

- Título "Modelos no aparelho". Linha: "Os modelos rodam no seu aparelho: nada do que você ouve sai daqui."
- Interruptor "Automático (recomendado)" (ligado = `modeloFixo 'auto'`) e a frase do porquê: com Parakeet cabendo, "Seu computador aguenta o modelo preciso de português e espanhol."; sem, "Para este aparelho, o equilibrado é o que roda sem esquentar."
- "Espaço usado: X de Y" (barra) e botão "Apagar todos os modelos" (confirmação).
- Lista "Transcrição": por item, nome, idiomas, "Erra cerca de N em 100 palavras" (quando há), selo de peso ("Leve", "Médio", "Pesado" com ícone + texto), tamanho, estado ("No aparelho · baixado em <data>" / "Não baixado"), botões "Baixar" (com progresso), "Usar este" (desliga o automático e fixa; desabilitado quando não cabe, com o motivo: "Precisa de 8 GB de memória" ou "Só para inglês"/"Só para português e espanhol"), "Apagar".
- Lista "Tradução": os `tradutoresGuardados()` com tamanho e "Apagar"; vazia: "Os tradutores baixam quando você traduz um par de idiomas pela primeira vez."
- Botão "Testar a velocidade do aparelho": roda o microbenchmark existente (`src/lib/dispositivo/benchmark.ts`, ≤ 3 s, força nova medida) e mostra "Medido agora: <leve|bom|forte>" a partir das pontuações; o resultado atualiza a sonda.
- Rodapé de créditos: "Parakeet TDT v3 · NVIDIA · CC-BY-4.0. Whisper · OpenAI · MIT. Moonshine · Useful Sensors · MIT. Bergamot · Mozilla · MPL-2.0."

- [ ] **Step 1: testes que falham** — catálogo: 6 itens na ordem da tabela, `modeloFixoServe('parakeet',['fr']) === false`; `tradutoresGuardados` com dois manifestos (um Whisper, um opus-mt) devolve só o opus-mt. Componente (jsdom, Cache Storage falso): mostra os 6 nomes; "Usar este" no Equilibrado grava `babel.stt.modeloFixo = 'whisper-base'` e desliga o interruptor; "Apagar" chama `apagarModelo` com o id e a linha passa a "Não baixado"; item que não cabe tem o botão desabilitado e o motivo visível.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar; i18n de todas as frases.
- [ ] **Step 4:** e2e `tests/e2e/modelos-no-aparelho.e2e.ts`: abrir Ajustes → Processamento, ver "Modelos no aparelho", fixar o Equilibrado, voltar ao automático; axe sem violação grave (`violacoesGraves` de `tests/e2e/_acessibilidade.ts`), também em 375 × 812.
- [ ] **Step 5:** `npx vitest run tests/catalogoDeModelos.test.ts tests/modelosNoAparelho.test.tsx` + `npx playwright test tests/e2e/modelos-no-aparelho.e2e.ts` → PASS; typecheck/lint.
- [ ] **Step 6:** Commit `feat(ajustes): tela Modelos no aparelho — automático, espaço usado, baixar, fixar e apagar`.

### Task 7: Fechamento

- [ ] Suíte completa (`npm test`, `npm run typecheck`, `npm run lint`) pelo `verificador`; revisão final (`revisor-critico`) do intervalo inteiro.
- [ ] Deploy no staging (`gh workflow run deploy-worker.yml --ref main --field ambiente=staging --field ref=main`) e `/api/health` com a versão nova.
- [ ] Atualizar a spec (status "implementado", o que mudou) e a memória do projeto.
