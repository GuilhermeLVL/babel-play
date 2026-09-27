# Otimização por dispositivo — Meta Quest e celulares (camada gratuita, tudo no navegador)

Data: 2026-09-26 · Branch: `feat/perfis-de-dispositivo` (worktree `.claude/worktrees/fx-dispositivos`, base `050a16f`) · sem push.

Base de pesquisa: `docs/pesquisa/2026-09-auditoria-seguranca-performance-dispositivos.md` (§3 Quest, §4 celulares, §5 matriz).
Roteiro para o aparelho real: `docs/testar-no-quest.md`.

## Resumo

1. **Perfil por capacidade** (`src/lib/dispositivo/perfil.ts`): Quest, celular fraco, celular bom, desktop sem GPU e desktop com GPU. A classificação lê `getDisplayMedia`, WebXR, toque, `deviceMemory`, `crossOriginIsolated`, adaptador WebGPU real e `saveData`/`effectiveType`. O UA só entra como pista quando revela `OculusBrowser`.
2. **Modelos por aparelho**: fora do desktop, o Whisper vai em **base q8 no WASM (80 MB)**. Na bancada ele empata com o híbrido de 209 MB. O **tiny q8 foi medido agora** e ficou fora (41,6% de WER). O small só entra no desktop com GPU. STT e tradutor carregam um de cada vez, só o tradutor que a pessoa usa é baixado, e os workers são liberados ao sair da captura.
3. **Dois defeitos achados na medição e corrigidos**:
   - A sessão do **Whisper q8 não abria no navegador**, com o erro `TransposeDQWeightsForMatMulNBits`. O fallback q8 que o app já tinha falhava do mesmo jeito.
   - No cenário só-microfone, a preparação baixava o **tradutor do sentido errado**.
4. **Captura sem `getDisplayMedia`**: o microfone é a fonte e a tela explica o motivo. Nenhuma rota de "áudio do sistema" é oferecida.
5. **Aviso de download** com o tamanho real (193 MB), antes do primeiro byte.
6. **`reduzirEfeitos()`** é o sinal único do modo leve. Ele usa a chave do "Modo desempenho" de Ajustes. Os alvos da captura e das Legendas flutuantes passam a 48 px (celular) e 56 px (Quest).
7. **COEP `require-corp` para o iOS: não aplicado.** Medido: ele quebra as imagens do Openverse e do Wikimedia no Chrome.

## Interface para o agente de telas

```ts
import {
  reduzirEfeitos, EVENTO_REDUZIR_EFEITOS, perfilDoDispositivo,
} from 'src/lib/dispositivo/perfil'

reduzirEfeitos()      // boolean, síncrona e barata: pode ser chamada no render
window.addEventListener(EVENTO_REDUZIR_EFEITOS, (e) => (e as CustomEvent<boolean>).detail)
perfilDoDispositivo() // { tipo, leve, poucaMemoria, threadsWasm, alvoMinimoPx, capturaDoSistema, ... }
```

- **Regra de `reduzirEfeitos()`**: a escolha manual em Ajustes → "Modo desempenho" (`babel.performance_mode`) vence. Sem escolha manual, liga sozinho no Quest, no celular fraco, no desktop com ≤ 2 núcleos ou ≤ 2 GB e com `prefers-reduced-motion`.
- **No React**: o `performanceMode` do `useAparencia` já é esse sinal. O automático é refeito quando o `requestAdapter()` responde (`reduzirEfeitosMedido()`).
- **No CSS**: `<html data-dispositivo="quest|celular-fraco|celular-bom|desktop-…" data-modo-leve="true|false">`, além da classe antiga `body.performance-mode`.
- **O que eu mesmo fiz no domínio de telas (o mínimo)**:
  - `ParticleCanvas` não monta no modo leve (`App.tsx`).
  - O desfoque da legenda flutuante sai no modo leve (`styles/dispositivo.css`).
  - Partículas, blur, transparências e animações dos jogos continuam com o agente de telas.

## Implementação, arquivo por arquivo

| Item | Arquivos | Testes |
| --- | --- | --- |
| Perfil | `src/lib/dispositivo/perfil.ts`, `src/main.tsx` | `tests/perfilDoDispositivo.test.ts` (26) |
| Rota STT por aparelho, tamanhos por dtype | `src/gateway/sttRouter.ts`, `AiEnginePanel.tsx`, `Onboarding.tsx`, `nuvemDaImportacao.ts` | `tests/sttRouterPorDispositivo.test.ts`, `tests/sttRouter.test.ts` |
| dtype/device/threads da rota; `liberar()` | `whisperLocal.ts`, `whisperWorker.ts`, `opusMtLocal.ts`, `gateway/index.ts` | `tests/whisperLocal-perfil.test.ts`, `tests/whisperWorker-q8.test.ts` |
| Carga serial; tradutor certo; sem aquecer 2 tradutores | `pipelineDeFala.ts`, `salvarSessao.ts` | e2e + medição |
| Captura só por microfone, aviso de download | `LiveCapture.tsx`, `src/lib/dispositivo/avisoDeDownload.ts` | `tests/avisoDeDownload.test.ts`, e2e |
| Modo leve / alvos | `useAparencia.ts`, `Settings.tsx`, `App.tsx`, `src/styles/dispositivo.css` | e2e (altura dos botões) |
| Medição | `scripts/perf/latencia-legenda/medir.mjs --dispositivo`, `tests/e2e-estatica/_dispositivos.mjs` | `tests/e2e-estatica/perfis-de-dispositivo.e2e.ts` |

### Matriz aplicada (camada gratuita, conteúdo não-inglês, qualidade "automática")

| Perfil | STT | Download STT | Tradutor | Outros |
| --- | --- | --- | --- | --- |
| Quest | whisper-base **q8**, WASM, até 4 threads | 80 MB | opus-mt q8 de UM sentido, depois do STT | só microfone; modo leve; alvos 56 px |
| Celular fraco / bom | whisper-base **q8**, WASM | 80 MB | idem | só microfone; aviso > 100 MB; liberar ao sair |
| Desktop sem GPU | whisper-base híbrido (como antes) | 209 MB | como antes | — |
| Desktop com GPU | whisper-small híbrido (como antes) | 589 MB | como antes | — |
| Qualquer um com `saveData` | base q8; em inglês, moonshine-tiny (32 MB) | 80 / 32 MB | — | confirma qualquer download |

- **Inglês**: moonshine-base (67 MB). No celular fraco ou com economia de dados, moonshine-tiny (32 MB).
- **"Rápido"**: tiny **híbrido** (nunca o tiny q8).
- **"Preciso"**: base q8 fora do desktop; o small nunca.
- A troca continua no seletor de qualidade que já existia na gaveta da captura.

## Números

### Qualidade: bancada FLEURS pt_br, 100 falas, Node (`scripts/eval-fala/bancada/stt.mjs`)

| Sistema | WER pt [IC 95%] | RTF | Download | Fonte |
| --- | --- | --- | --- | --- |
| whisper-base híbrido | 18,2% [15,8–20,6] | 0,066 | 209 MB | `%LOCALAPPDATA%\babel-bancada\log_local_dtypes.txt` (medição anterior) |
| whisper-base **q8** | 18,9% [16,5–21,4] | 0,090 | **80 MB** | idem; Δ +0,71 [−0,99; 2,23], empate |
| whisper-tiny híbrido | 29,2% | 0,04 | 117 MB | `docs/auditoria/eval/bancada-2026-09.md` |
| whisper-tiny **q8** | **41,6% [36,4–47,2]** | 0,120 | 44 MB | **medido nesta rodada**; Δ +12,46 [9,40; 15,86], piora significativa. Bruto: `docs/auditoria/eval/bancada-2026-09/stt_local-tiny_local-tiny-q8_fleurs_pt.json` |

### Tamanhos (API de árvore do Hub, 2026-09-26)

| Modelo q8 | Arquivos | Total |
| --- | --- | --- |
| whisper-tiny | encoder 10,12 + decoder_merged 30,72 + tokenizer/configs 2,77 MB | 43,6 MB |
| whisper-base | 23,20 + 53,69 + 2,77 MB | 79,7 MB |
| whisper-small | 92,3 + 156,8 + 2,78 MB | 251,9 MB |
| opus-mt ROMANCE-en / es-en | 52,90 + 60,21 MB | 113 MB |
| opus-mt en-fr | — | 107,5 MB |
| opus-mt de-en | — | 106,0 MB |

O aviso usa **113 MB por tradutor** (o maior par) e anuncia **193 MB** (80 + 113) no Quest e no celular.

### Captura com áudio falso: edição estática, Chromium headless do Playwright

**Método**
- Áudio: 12 falas FLEURS pt (`conversa_pt_12.wav`, 117,7 s).
- Cenário: microfone, "falo português, traduzir para inglês".
- Emulação: `tests/e2e-estatica/_dispositivos.mjs`.
- Memória: bytes privados do processo renderer da aba, que incluem os workers e o heap do WASM.
- **Limitações**:
  - A máquina é compartilhada com outros agentes, então as latências absolutas têm ruído alto.
  - O throttling de CPU por CDP vale para o renderer; o efeito sobre os workers não foi verificado.
  - O `measureUserAgentSpecificMemory()` respondeu "not available" no headless, mesmo com `crossOriginIsolated`.
  - Os JSONs brutos ficam em `scratchpad/dispositivos/rodadas/`.

| Rodada | Rota | Fim da fala → legenda (p50/p95) | → tradução (p50/p95) | RTF p50 | Perdidas | STT pronto | Pico de memória da aba |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quest frio (CPU 4×) | base q8, isolado | 4,43 / 5,16 s | 5,35 / 6,01 s | 0,74 | 0/12 | 8,3 s (com download) | 1.416 MB |
| Quest estável | base q8 | 4,03 / 5,16 s | 4,41 / 6,42 s | 0,68 | 0/12 | cache | 1.412 MB |
| Pixel 7 frio (CPU 2×) | base q8 | 6,96 / 10,01 s | 7,69 / 11,88 s | 1,17 | 0/12 | 9,7 s | 1.338 MB |
| Pixel 7 estável | base q8 | 6,25 / 8,32 s | 6,95 / 9,08 s | 1,04 | 0/12 | cache | 1.378 MB |
| iPhone 14 frio (sem isolamento, 1 thread) | base q8 | 6,94 / 7,83 s | 8,44 s | 1,53 | **8/12** (a página fechou aos ~58 s; causa não determinada) | 9,2 s | 1.334 MB |
| iPhone 14 estável | base q8 | 6,49 / 9,32 s | 7,01 / 9,95 s | 1,16 | 0/12 | 6,7 s | 1.305 MB |
| Desktop sem GPU, conversa, **antes do perfil** (híbrido, 2 tradutores, identificação de voz) | base híbrido | 8,08 / 19,86 s | 8,94 / 21,52 s | 1,60 | 0/12 | cache | **3.979 MB** |
| Desktop, o mesmo com dtype q8 | base q8 | 6,06 / 8,48 s | 7,05 / 10,00 s | 1,12 | 0/12 | cache | 3.010 MB |

**O que os números dizem**
- **Memória (o ganho mais firme)**: o caminho do aparelho (q8 + um tradutor + carga serial + sem identificação de voz) fica em **~1,3–1,4 GB** de pico, contra **4,0 GB** no caminho de desktop.
- **Latência no Quest emulado**: a legenda chega **~4 s** depois do fim da fala e a tradução em ~4,4–5,4 s, com zero falas perdidas. O primeiro texto (parcial) aparece 3,8–4,6 s depois do início da voz.
- **Tradutor certo**: antes da correção, o opus-mt útil só ficava pronto **45 s** depois do Iniciar. Agora fica em **14,7–20 s**, com 1 download em vez de 2.
- **Celulares emulados (RTF ≥ 1)**: a fila cresce e o p95 passa de 8 s.
  - Testei subir as threads de 2 para 4: RTF 1,04 → 1,28, dentro do ruído, então não resolveu.
  - Testei o tiny híbrido no iPhone sem isolamento: RTF 0,89, mas a memória **subiu** para 1.757 MB e o WER é 29%. Revertido.
  - Conclusão: no celular, o que falta é medir no aparelho (roteiro), não ajustar às cegas.
- **Risco no iOS**: ~1,3 GB de pico está perto do limite de 1,5 GB por processo do WebKit (web-llm#386). É medida do Chromium, não do WebKit.

### E2E da edição estática (`npx playwright test -c playwright.estatica.config.ts`)

- **Resultado: 9 passaram, 3 pulados** (os testes de aparelho rodam uma vez só, no projeto desktop).
- `perfis-de-dispositivo.e2e.ts` confere, para **Quest, Pixel 7 e iPhone 14**:
  - tipo detectado: `quest`, `celular-fraco`, `celular-fraco`;
  - modo leve ligado;
  - selo "80 MB";
  - aviso "a legenda vem do microfone" (com o texto específico do Quest);
  - Iniciar habilitado, com ≥ 56 px (Quest) ou ≥ 48 px;
  - gaveta sem rota de áudio do sistema;
  - aviso "cerca de 193 MB" antes de qualquer `.onnx`;
  - **zero erros de console**.
- Screenshots em `C:\Users\Guilh\AppData\Local\Temp\claude\C--Users-Guilh-OneDrive--rea-de-Trabalho-babel-play-lab\29047203-e9be-40cb-a50d-a6c9e8e5ab81\scratchpad\dispositivos\`: `{quest,pixel7,iphone14}-{capturar,ajustes,aviso-download}.png`.
- **Limitação do iPhone**: sem WebKit instalado (instalar seria download), ele foi emulado no Chromium com o UA e o viewport do iPhone 14, sem `deviceMemory`/`connection` e com `crossOriginIsolated` forçado a `false`.

## iOS e COEP (item 6): avaliado, NÃO aplicado

Teste empírico (script descartável): a mesma edição estática servida com COOP `same-origin` e com cada valor de COEP, no Chromium.

| | `credentialless` (atual) | `require-corp` |
| --- | --- | --- |
| `crossOriginIsolated` | true | true |
| Modelos do HF (fetch com CORS) | 200 | 200 |
| Google Fonts (CORP `cross-origin`) | carrega | carrega |
| Miniatura do Openverse (`<img>` sem `crossorigin`) | carrega | **bloqueada** (`ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`) |
| Imagem do Wikimedia | carrega | **bloqueada** |

- **Por que não aplicar agora**: `require-corp` quebraria as capas e imagens de hover (`BuscaDeCapa.tsx`, `Analysis.tsx`, `Reading.tsx`) no Chrome e no Pages.
- **Caminho para quando for aplicar**:
  - Openverse e Wikimedia respondem `Access-Control-Allow-Origin: *` quando a requisição tem `Origin` (conferido com curl). Então dá para pôr `crossOrigin="anonymous"` nessas `<img>`, mais um proxy para hosts sem CORS. Isso é trabalho do agente de telas.
  - Depois disso, trocar a linha em `public/_headers` e em `server/http/app.ts:288`, e ajustar a conferência de `scripts/build-estatica.mjs:62`, que hoje exige `credentialless`.
- **Até lá**: no iPhone, `crossOriginIsolated` é `false` e o Whisper roda em 1 thread (medido acima: RTF 1,16).

## Gates

| Gate | Resultado |
| --- | --- |
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` | 0 |
| `vitest run --maxWorkers=3` | **496 arquivos, 5.124 passaram, 2 pulados** |
| `i18n:orfas`; `pseudo --check`; `cobertura --check` | 0 órfãs; em dia (812 chaves; en 100%) |
| `npm run build` / `npm run build:estatica` | ok / ok |
| `scripts/perf/orcamento-bundle.mjs` | "orçamento do bundle ok" (LiveCapture 152,8 KB, 53,1 KB gzip) |
| `morto:ciclos` | nenhum ciclo |
| `morto:arquivos` (knip) | **não concluiu**: `RangeError: Array buffer allocation failed`. A máquina ficou sem memória várias vezes durante a sessão (outros agentes) |

## Commits (branch `feat/perfis-de-dispositivo`)

- `beeae3a` — perfil por capacidade e modelos de STT por aparelho
- `482e152` — modo leve único (`reduzirEfeitos`) e alvos de 48/56 px na captura
- `6f256f1` — e2e da edição estática em Quest, Pixel 7 e iPhone 14 emulados
- `9b64542` — Whisper q8 abre no ORT-web e o celular/Quest baixa só o tradutor que usa
- `3a75db1` — modo leve refeito com o adaptador real; teto de threads volta a 4
- (este relatório) — ver `git log`

## Pendências e incertezas (viram itens do roteiro `docs/testar-no-quest.md`)

1. **WebGPU em página 2D do Quest**: sem doc oficial. O app assume que não há e usa WASM. A sonda da §3 responde.
2. **`crossOriginIsolated`/threads no Quest real**, e o limite de memória por aba (~1,4 GB medido no Chromium; 4,4/5,75 GiB é o teto do app nativo).
3. **Web Speech no Quest**: só há relato de 2022. A sonda confere.
4. **Latência real no XR2**: a emulação dá ~4 s. Se o aparelho passar de ~8 s, trocar para moonshine (inglês) ou tiny híbrido, medindo a memória.
5. **Celulares com RTF ≥ 1** na emulação: medir no aparelho antes de mudar a rota.
6. **iPhone**: a página fechou numa rodada fria (8/12 perdidas). A causa não foi determinada (pode ser a pressão de memória da máquina). No iOS real, observar se a aba recarrega.
7. **Achado colateral**: no desktop, o cenário conversa ainda aquece os DOIS tradutores e a identificação de voz no Iniciar (pico de 4,0 GB). Fora do escopo; fica a sugestão de aplicar a carga serial também ali.
