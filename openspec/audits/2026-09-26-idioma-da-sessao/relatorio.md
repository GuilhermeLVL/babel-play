# Idioma da sessão → vocabulário, Biblioteca e Jogar (2026-09-26)

Branch `fix/idioma-da-sessao` (a partir de `main` 050a16f). Relato do dono, na edição estática: uma
sessão capturada em **português** virava material de prática tratado como **inglês**. Os cartões
eram lidos com pronúncia inglesa, algumas palavras saíam lidas errado e a separação de palavras e
frases parecia errada.

## 1. Rastreamento ponta a ponta (antes da correção)

| Etapa | Onde | O que era gravado ou usado |
|---|---|---|
| Fala capturada | `lib/captura/pipelineDeFala.ts` | `s.lang` = idioma **detectado** (motor pelo áudio, senão detector de texto). No "Detectar", `from` é vazio e o `lang` vem da medição. As palavras (`s.words`) eram extraídas **antes** de a detecção chegar, com `from \|\| idiomaDoMotor \|\| sourceLang`. |
| Fala salva | `lib/captura/salvarSessao.ts` → `utterances.source_lang` | Correto: o idioma detectado vencia (`s.lang ? toBcp47(s.lang) : …`). |
| **Sessão salva** | `createSession({ sourceLang, targetLang })` | **Errado**: `sourceLang` era o `config.mine` ("eu falo"), não o idioma do conteúdo. A Biblioteca mostra e filtra por esse campo (`Recording.idioma`). |
| **Cartões** | `salvarSessao.ts`, laço das palavras | **Errado (causa raiz)**: `srcLang = isSys ? targetLang : sourceLang`. É o idioma do **seletor**, ignorando `s.lang`. Com o par "falo pt / estudo en", o áudio do sistema em português virava cartão `srcLang: 'en'`, com as **stopwords inglesas** ("porque", "também", "quando" viravam cartão). |
| Biblioteca | `data/rotas/sessoes.ts` → `Library.tsx` | Lê `sessions.source_lang`, que era o `mine` e não o conteúdo. |
| Jogar | `core/minigames/itemSource.ts` → `item.lang = card.srcLang` → `speak(…, { lang: item.lang })` | O cartão `en` punha a palavra portuguesa na rodada de inglês e a fazia falar com voz inglesa. Na aba Jogos de uma gravação, o idioma da rodada era `cfg.studying`, e não o da sessão. |
| TTS | `lib/tts.ts` | `u.lang = 'pt'` (sem região). **Sem voz do idioma, `u.voice` ficava vazio e o navegador lia com a voz padrão do sistema, em geral inglesa.** |
| Segmentação | `core/learning/keywords.ts` | Uma regex única (`[\p{L}][\p{L}'-]*`) para todos os idiomas: japonês/chinês/tailandês viravam uma "palavra" só, e em português saíam `d'água`, `fazê-lo`, `dá-me`. |

Havia ainda três defeitos agravantes:

- **Retomar uma sessão** reidratava as falas **sem** `lang`. O salvar reetiquetava tudo com o seletor.
- **`vocabRepo.relabel`** (servidor, usado pela Auditoria de idioma) trocava `src_lang` mas deixava `norm_key` (`idioma|palavra`) no idioma antigo. A próxima captura da mesma palavra criava um segundo cartão.
- Os dados gravados antes de `fix/idioma-detectado` têm falas em português etiquetadas `en`.

## 2. Reprodução

- **Unidade** (`tests/idiomaDaSessao.test.ts`, bloco "causa raiz"): a regra antiga aplicada a uma fala do sistema detectada como `pt`, com o par `pt-BR`/`en-US`, dá `en-US`. As regras novas dão `pt-BR` → `en-US`. Sem "porque" e sem "você", com "reunião".
- **Edição estática + Playwright** (`tests/e2e-estatica/idioma-da-sessao.e2e.ts`): o teste semeia no IndexedDB `babel-local` duas sessões **no formato que a versão antiga gravava**. A fala portuguesa fica etiquetada `en`, os cartões ficam `srcLang: 'en-US'` com chave `en|…` e a sessão fica com `sourceLang: 'pt-BR'` = `mine`. Uma sessão em inglês serve de controle. O teste intercepta `speechSynthesis.speak` e registra `utterance.lang` e a voz de cada fala.

## 3. Correção

| Peça | Arquivo | O que faz |
|---|---|---|
| Idioma da fala, verso e sessão | `src/lib/captura/vocabularioDaSessao.ts` (novo) | `idiomaDaFala` usa o detectado e só cai no par quando nada foi medido. `idiomaDoVerso` usa o *outro* idioma do par: pt → en mesmo vindo do sistema. `idiomaDominante` e `parDaSessao` gravam o idioma do **conteúdo**, pesado por palavras. `palavrasDasFalas` **re-extrai** as palavras no idioma final da fala, e o contexto do cartão passa a ser a **frase** que contém a palavra. |
| Salvar | `salvarSessao.ts` | Usa as funções acima para as falas, a sessão e os cartões. |
| Retomar | `LiveCapture.tsx` | As falas voltam com `lang`. O par da sessão **não** sobrescreve mais o seletor, porque agora é o idioma do conteúdo. |
| Segmentação | `src/core/texto/segmentacao.ts` (novo) | `Intl.Segmenter` com o locale da fala. Palavras: sem pontuação nem número solto; composto com hífen fica inteiro; clítico pt sai (`dá-me`→`dá`, `fazê-lo`→`fazer`, `dar-lhe-ei`→`darei`); elisão sai (`d'água`→`água`, fr/it/ca); possessivo inglês sai. Frases: ICU, e o corte depois de abreviação ou inicial (`Dr.`) é desfeito. Sem `Intl.Segmenter`, cai na regex antiga. `keywords.ts` passa a usar este módulo, com piso de 2 caracteres em idiomas sem espaço. |
| Chave por idioma | já era `chaveDedup(palavra, idioma)` (`lang\|palavra`) | Agora o idioma que entra nela é o certo. O reparo e o `relabel` recalculam a chave junto com o idioma. |
| TTS | `src/lib/tts.ts` | `codigoDeFala`: `pt`→`pt-BR`, e a região informada é mantida. **Sem voz do idioma (com a lista de vozes já carregada), não fala** e dispara `aoFaltarVoz` uma vez por idioma. O `Toast` mostra um aviso `info` discreto (`VolumeX`, i18n). Com a lista ainda vazia ("não sei"), fala com o `lang` BCP-47 e o navegador escolhe. Nova API **`falar(texto, idioma)`**. |
| Idioma do cartão | `src/core/texto/idioma.ts` | `idiomaDoCartao(card)` e `idiomaDominanteDosCartoes(cards)`, sem default para `en`. |
| Jogar dentro de uma gravação | `Play.tsx` (efeito novo, 1 ponto) | Com `recording`, o idioma da rodada vem dos cartões da gravação, senão de `recording.idioma`. |
| Detector de texto | `src/core/texto/detectarIdioma.ts` | A heurística saiu de `lib/langDetect.ts` para o núcleo (mesmo código), para servir ao reparo no navegador e no servidor. |

## 4. Dados antigos

- **Plano puro e idempotente**: `src/core/texto/reparoDeIdioma.ts`.
  - Fala: reetiquetada quando o texto dá evidência, com confiança ≥ 0,5 e ≥ 4 palavras.
  - Sessão: passa a ter o idioma dominante das falas.
  - Cartão: só material **capturado** (com `sessionId`). A evidência vem, nesta ordem, da frase do cartão, da fala que contém a frase ou da sessão, e a sessão só conta se for monolíngue. O verso é trocado quando ficaria igual à frente.
  - Sem evidência, nada muda. Nada é apagado.
- **Local (edição estática)**: `src/data/efemero/reparoDeIdioma.ts`. Roda uma vez por carregamento, antes do primeiro `GET /api/sessions*` ou `/api/vocab*` (`efemero/servidor.ts`). Recalcula `normKey`. Se a chave nova já é de outro cartão, o antigo fica como está e é contado como conflito, sem fusão.
- **Servidor**:
  - `vocabRepo.relabel` passa a gravar `norm_key` junto e recusa colisão, inclusive dentro do mesmo lote.
  - Novo comando `node dist-server/operacao.cjs reparar-idiomas [--aplicar]` (`server/operacao/reparoDeIdioma.ts`) aplica o mesmo plano por usuário. Sem `--aplicar` é só **ensaio**, e o comando é idempotente.
  - **Sem migration drizzle**: nenhuma coluna muda, e a decisão depende de detecção de texto, que SQL não faz. Por isso não há `REVERSAO:`, nem `conferir.mjs`, nem snapshot de schema. O contrato da API não muda de forma (`POST /api/vocab/relabel` responde igual).

## 5. Verificação

- `tsc --noEmit` 0 · `tsc -p src/core/tsconfig.json` 0 · `eslint src server server.ts tests --max-warnings 0` 0.
- `vitest run --maxWorkers=3`: 5097 passaram, 0 falharam, 2 pendentes. Os testes novos passaram depois, isoladamente:
  - `tests/idiomaDaSessao.test.ts` (21)
  - `tests/ttsIdiomaDoTexto.test.ts` (6)
  - `tests/reparoDeIdiomaLocal.test.ts` (3)
  - `tests/integration/reparo-idioma-servidor.test.ts` (2, junto com `lotes-sqlite`)
- `i18n:orfas` 0 órfãs · `npm run build` ok · `npm run build:estatica` ok.
- **Playwright na edição estática** (`idioma-da-sessao.e2e.ts`) passou.
  - Após a primeira leitura, os cartões da sessão pt ficam `srcLang: 'pt'`, `tgtLang: 'en-US'`, `normKey: 'pt|reuniao'`. A sessão en fica `sourceLang: 'en'`, `targetLang: 'pt-BR'`.
  - Na Memória, as falas pedidas são `reunião/terminar/trabalho/atrasou` → `lang=pt-BR`, voz "Francisca (Portuguese)", e `finish/think/report` → `lang=en-US`, voz "Aria (English)".
  - Evidências (`falas.json` e screenshots) em `…\scratchpad\idioma-sessao\`.
  - O `edicao-estatica.e2e.ts` existente também passou.
- **Limite da verificação**: na edição estática, **Biblioteca e a tela da sessão exigem conta** (`exigeConta`: `library`, `analysis`). Não dá para abri-las lá. O que elas leem, `sessions.source_lang` e o idioma dos cartões, foi conferido no IndexedDB. Jogar foi exercido por `/jogar?fonte=sessao&sessao=…&idioma=…`, e a aba Jogos embutida (efeito novo em `Play.tsx`) não foi exercida em navegador. A captura com áudio falso FLEURS não foi rodada: a máquina estava sem memória com outros agentes em paralelo. O caminho de salvar foi coberto por testes de unidade da função pura que ele chama.

## 6. Para o agente de jogos (não mexi em `src/components/minigames/**`)

- Para falar, use **`falar(texto, idiomaDoCartao(card))`** (`lib/tts` + `@core/texto/idioma`). Ela devolve `false` quando não há idioma, e aí não se fala. `speak(…, { lang })` continua valendo e agora normaliza para BCP-47 e recusa voz de outro idioma.
- `TermoGame.tsx` (linhas ~372 e ~508) ainda faz `toBcp47(rod.lang || 'en')`, um default silencioso para inglês. Troque por `falar(w, rod.lang)`.
- Para quebrar frase ou palavra (Scramble, Escuta, Bingo usam `split(/\s+/)`), use `palavrasDoTexto(texto, idioma)` e `frasesDoTexto(texto, idioma)` de `@core/texto/segmentacao`. `split(/\s+/)` não funciona em japonês, chinês e tailandês e deixa pontuação colada.
- `frasesDoAcervo` (`core/minigames/source.ts`) usa `card.sentence` inteiro. Desde esta correção, o `sentence` dos cartões novos já é a frase da palavra, não a fala inteira.

## 7. Pendências

- `PATCH /api/sessions/:id` não aceita `sourceLang`. Na **retomada**, a sessão mantém o par antigo até o reparo rodar: sozinho no modo local, com `reparar-idiomas` no servidor.
- `chaveDaPalavra` remove acentos para todos os idiomas, então `avó` e `avô` colidem. Mudar isso muda chaves gravadas e exige migração de dados; fica registrado, não foi feito.
