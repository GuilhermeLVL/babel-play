# Engenharia reversa de extensões e leitores: o que o Frasy pode trazer (22/11/2026)

Escopo: recursos (funcionalidade e UX) de Language Reactor, Migaku, Toucan (Babbel), Trancy, Readlang e Yomitan.
Nada de código, texto ou arte foi copiado: o que está aqui são nomes de recursos, mecanismos observados e chaves de
configuração, usados só como ideia. Só código público do cliente (pacote de extensão baixado da loja, JS público do
site, GitHub). Nenhum login foi burlado, nenhuma API privada foi chamada, `robots.txt` do Readlang respeitado (só
`/` e `/features`).

## 1. Como o REA foi usado

- Ferramenta: `rea-agents` 6.10.1 (MIT), instalada só no scratchpad da sessão, com Node 22 local (wrapper `rea.sh`).
  Não rodei `setup`, nada global, `~/.claude` intocado.
- Download: URL pública de atualização do Chrome Web Store (`clients2.google.com/service/update2/crx?...x=id%3D<ID>%26uc`).
  O `.crx` é um zip com cabeçalho; `unzip` extrai com aviso ("extra bytes at beginning"), sem erro.
- Comando (um por extensão, diretório novo em `.../scratchpad/ext/<nome>`): `rea.sh analyze-javascript-application <dir> --json`.
  Os seis alvos saíram com exit 0, sem falha repetida (nenhum caso das "2 tentativas").

| Alvo                | ID na loja                         | Versão | Pasta analisada                                                                | Evidence (JSON) |
| ------------------- | ---------------------------------- | ------ | ------------------------------------------------------------------------------ | --------------- |
| Language Reactor    | `hoombieeljmmljlkjmnheibnpciblicm` | 6.0.1  | 70 arquivos, 13 JS                                                             | 183 MB          |
| Migaku              | `lkhiljgmbeecmljiogckofcalncmfnfo` | 1.32.1 | só `manifest` + `assets/*.js` (122 arquivos; `core/` de 979 MB e `.wasm` fora) | 255 MB          |
| Toucan by Babbel    | `lokjgaehpcnlmkebpmjiofccpklbmoci` | 2.19.8 | 103 arquivos, com source maps                                                  | 159 MB          |
| Trancy              | `mjdbhokoopacimoekfgkcoogikbfgngb` | 7.9.8  | 33 arquivos                                                                    | 98 MB           |
| Readlang Web Reader | `odpdkefpnfejbfnmdilmfhephfffmfoh` | 0.9.46 | 14 arquivos, com source maps                                                   | 128 MB          |

Os IDs foram achados por busca na web (as páginas da loja não são buscáveis por script). Dois IDs que eu tinha de
memória estavam errados (o `.crx` veio com 198 bytes, "End-of-central-directory not found"); corrigi o ID, não
repeti o mesmo pedido.

### O que veio de cada método

**REA (análise estática do grafo da aplicação).** Devolve grafo de módulos, nós `endpoint` (literais de rede e de
mensagens), grafo semântico (funções, chamadas, literais) e, nos casos com source map, os nomes dos módulos de origem.
O que rendeu de verdade:

- Toucan: 184 nomes de operações do protocolo interno em `static/js/background.js`, que formam um inventário de
  features (ex.: `getLearningShortcuts`, `getExtraPractice`, `markWordAsKnown`, `getLocalTranslationProgressionInfo`,
  `batchIncrementHomonymProgression`, `changeDailyGoalsEnabledState`, `getHighlightToTranslateInfo`,
  `temporarilyPausedDomains`, `requestSafariInAppPayments`, `setUserReferralRewardInfo`, `translateChunk`,
  `fetchTextToSpeech`).
- Migaku: chaves de configuração reveladoras (flags): `playMode.type`, `playMode.autoResume`,
  `playMode.autoResumeDelay`, `playMode.autoLookupFirstUnknown`, `playMode.pauseOffset`,
  `playMode.dynamicUnpause.enabled|minDuration|readingSpeed|basedOnSecondary`, `playMode.custom.pause.trigger|targets|pauseOnSecondary`,
  `playMode.custom.obscuring.target|secondary`, `audioPadding.start|end`, `WHISPER_URL`, e o patch `VikiMediaPlayer.create`.
- Readlang (com source map): módulos `rangeTranslator`, `spanTranslatorPopoverLayer`, `hoverLinks`, `wordSegmenter`,
  `webReaderUserWords`, `embeddedWebReader`; chaves `ttsPrefs`, `toolbarLook`.
- Language Reactor e Trancy: pouco além de `localhost:8765` (AnkiConnect) e chaves de analytics. O código é minificado
  em bundles de 1 a 3 MB e as strings de UI não aparecem como nós de rede.

**Leitura manual (grep em Python com `-I`, sobre os arquivos extraídos).** Foi o método principal para os recursos:
`manifest.json` (permissões, content scripts, comandos), `_locales/*/messages.json` e `ui_strings/en.json` (1.484
chaves do Language Reactor), tabela de i18n embutida no bundle do Trancy (`edvideo-main.js`), changelog embutido no
`dashboard-*.js` do Migaku (versões 1.23 a 1.32, datas de 2025 e 2026), README, `templates.md` e esquema de opções do
Yomitan (GitHub, GPL-3.0: só ideias), página pública `readlang.com/` e `/features`.

### Limitações

- Análise estática: não executei as extensões, não vi rede nem telas. Mecanismo = o que o código e as strings
  indicam; onde digo "provavelmente" é inferência.
- O REA não extrai strings de UI; para isso o grep manual foi melhor. O REA é bom para inventário de mensagens/RPC e
  chaves de configuração, e fraco em bundles minificados sem source map.
- Os bundles do Language Reactor ficam em `pageScript_*.min.js` (3,3 MB) e não foram lidos linha a linha.
- Preços e limites vêm das strings da extensão e da página do Readlang; podem estar desatualizados (confirmar na
  página oficial antes de decisão comercial).
- Não analisei apps logados, apps móveis nem a Lingopie/Trancy web.
- Descoberta sensível (não copiar): o Migaku inclui `mgk-hijack.js`, `mgk-stitch.js` e `mgk-capture-worker.js`, cópias
  de um projeto de baixar áudio do YouTube (intercepta `MediaSource`/`SourceBuffer` e requisições `videoplayback`).
  É um caminho de risco para os termos do YouTube; o Frasy não deve seguir por aí.

## 2. Achados por app

### Language Reactor (Dioco)

- Manifest MV3; permissões mínimas (`storage`, `contextMenus`, `activeTab`, `scripting`), hosts `i.ytimg.com`; content
  scripts separados por site (`content_netflix.js`, `content_youtube.js`, `content_amazon.js`, `content_dioco.js`).
- Netflix: usa a API interna do player da página (`getVideoPlayerBySessionId`) e o manifesto de faixas de legenda
  (`timedtexttracks`, baixáveis em WebVTT) para obter legendas originais; mostra a legenda sobre o vídeo e um painel
  lateral (side panel) com a lista de falas. Texto de UI: "Subtitles now appear over the video", "New side panel shows all subtitles".
- Controles (strings): pausa automática a cada legenda (`autoPause`, tecla Q), repetir (`repeat`) e repetição infinita
  (`toggleLoopSub`), voltar/repetir/avançar legenda (A, S, D), "Slow speech segments" (0,8x só durante a fala),
  "Show the next blurred subtitle" (tecla E), "Hide translation", "Blur translation", "Hide for known words",
  "Subtitles then translation / Translation then subtitle", tamanho e opacidade do fundo da legenda, gesto de deslizar
  uma legenda (direita salva, esquerda copia).
- Vocabulário: nível de vocabulário escolhido numa lista crescente ("Click the last row where you know all the words"),
  palavras coloridas por estágio (conhecida branca, marcada para aprender laranja, acima do nível roxa), "Suggested
  words", "Words from this video, sorted by frequency", cobertura ("You know X% of the words on this page", "Learn N
  more words to reach Y%"), faixa por dificuldade de conteúdo (Easy / Comfortable / Sweet spot / Challenging / Hard) com
  filtro em YouTube, Netflix, podcasts e livros.
- Exportação: Anki `.apkg` com screenshots e clipes de áudio ("Anki Package (.apkg)", "Only new items since last export"),
  CSV, Excel, JSON, SRT original e bilíngue.
- IA: "Lexa" (dicionário com chat que "vê a palavra, a frase, o vídeo e as palavras suas devidas para revisão"; prompts
  editáveis), "Aria" (parceira de conversa com voz, memória editável e com botão "Forget everything"), "Pronunciation
  Lab" (grava, compara com referência), PhrasePump (frases que a pessoa quase entende, reforçando palavras devidas),
  FSI courses, player de arquivo local com SRT/VTT/ASS, busca no OpenSubtitles e checagem de sincronia ("Checking
  subtitle sync", "Framerate corrected, subtitles shifted by N").
- Pago (Pro): reconhecimento de fala para faixas dubladas, tradução automática de legenda original, cobertura
  e exportação Anki, Lexa melhor, memória da Aria, legendas melhoradas no YouTube; teste de uma ou duas semanas
  (`freeWeek_title`, `useProForFreeTwoWeeks`), pagamento por Paddle.

### Migaku

- Manifest: `tabCapture`, `offscreen`, `webRequest`, `clipboardRead/Write`, content scripts em `<all_urls>`.
  Atalhos: Alt+Q cria cartão, Alt+Shift+Q cria sem exigir palavra-alvo, Alt+R liga/desliga a gravação, mais um comando
  para enviar ao Card Creator. Changelog: Alt+Shift+E liga/desliga, Alt+Shift+F alterna modo completo/leve, Alt+1 a 7
  troca abas do dicionário, N pula para a próxima palavra desconhecida.
- Mecanismo do cartão (inferido de permissões, `ffmpeg/`, `captureVisibleTab`, `audioPadding.*`): a gravação da aba
  roda num documento `offscreen` e fica em buffer; ao criar o cartão, o áudio do intervalo da legenda (com folga
  `audioPadding.start/end`) é cortado com ffmpeg em WASM, a imagem vem de `captureVisibleTab`, e a frase, tradução e
  explicação são preenchidas; o cartão vai para o "Migaku Memory" (SRS próprio, banco SQLite no navegador) ou para o
  Anki (`isUsingAnki`, `isAnkiConnected`). Também há criação "em um clique" a partir da legenda atual e envio direto
  (`send-card`).
- Modos de reprodução (changelog 1.24, e as chaves `playMode.*` do REA): presets e modo "Custom" em que se configura
  quando e como aparecem legenda alvo e secundária, auto-pausa por tempo da legenda e/ou por status da palavra
  (`pause.trigger`, `pause.targets`), "Auto-lookup first unknown on pause", retomada automática após X segundos
  (`autoResume`), retomada dinâmica pelo tempo de leitura (`dynamicUnpause.readingSpeed`, `minDuration`), legenda
  borrada ("Blur until hover"), "Pause on interaction" (ao passar o mouse na legenda ou ao consultar palavra),
  "Remove bracketed subtitles" (tira `[música]`).
- Subtitle Browser (lista de falas) com filtros: "Sentences with all Known words", "Sentences with 2+ Unknown
  words", "Unique 1 Unknown", Tracked, Learning, All.
- Compreensão (1.26): rótulos por % de palavras conhecidas (menos de 60% Ambitious, 60 Challenging, 70 Approachable,
  80 Good, 90 Great, 95 Excellent, 99+ Exceptional), mais "average frequency" e "recommended sentences".
- Geração de legendas por IA no YouTube e no player local, inclusive legenda secundária 1:1 traduzida; modo
  "Lightweight" (só consulta por Shift+hover, sem alterar a página); "Plaintext Lookups"; consulta recursiva (Shift
  dentro do pop-up); aba de flexões (DE, PT, EN, FR, ES); "Inline Word Translations" abaixo de palavras desconhecidas
  usando a configuração de saída de GPT; status "Tracked" (pata) separado do status "Known"; Word Browser com
  filtro e ação em lote; avaliação de nível ("Add new words via assessment", EN/JA/ZH); Reader (epub, html, txt, rtf, e
  legendas) com leitura em voz e virada automática de página; player local com playlist e retomada; instalação de
  dicionários e listas de frequência por idioma; analisadores locais por idioma (`core/*.db`, kuromoji para japonês).
- Pago: assinatura (a extensão exige conta; ver `Failed to fetch sale config from Strapi`).

### Toucan by Babbel

- Não é de legenda: troca palavras de páginas comuns por palavras do idioma alvo (hosts em 300+ sites populares),
  com passar o mouse para ver a tradução; atalho para pausar (Alt+E) e painel lateral (Alt+S).
- Recursos (locale `en` e RPC do REA): "Highlight to Translate" (tradução sob demanda de até 100 palavras, premium),
  salvar palavra (`addWordToWordList`), "I know that word" (`markWordAsKnown`, premium; ao saber, "we'll expand the
  translation to include more of the sentence" = progressão palavra para frase), prática com quiz (significado,
  como se diz, ortografia, artigo correto, "are we using this word correctly?"), "Extra Practice" (mini-sessões
  em sites populares: Google, YouTube), "Shortcuts" (tópicos de situação: pedir comida, fazer amigos; "words and
  phrases you'll actually use"), densidade de traduções por página e nível de dificuldade (`updateDifficultyTier`),
  meta diária de palavras vistas, relatório diário por notificação, sequência de dias, "top X% of learners",
  pronúncia ao passar o mouse, listas de domínios bloqueados/pausados (pausa por 1 h, hoje, etc.), reportar erro de
  tradução ("does not make sense in this context"), indicação com mês grátis.
- Pago (Premium): "I know this", salvar palavra, sessões de prática ilimitadas, Shortcuts, density/level, highlight;
  teste de 7 dias; limites diários de perguntas gratuitas.

### Trancy

- Atalhos (manifest): Ctrl/Cmd+E modo vídeo, Alt+E tradução imersiva da página, Alt+D tradutor rápido, Alt+C legendas
  bilíngues, comando de transcrição por IA (YouTube).
- Legendas duplas e "Word-by-word highlight" (estilos: progresso, sublinhado, marca-texto, preenchimento), tamanho e
  cor por faixa, "Combine Sentences", exportar legendas e palavras salvas com timestamp, "Words in this video" e
  "Words on this page", livro de aprendizagem (`learning_book`), destaque de novas palavras (negrito, transparência,
  sublinhado), definição precisa por IA no contexto, "Sentence analysis" (frase, expressões-chave, dicas de gramática),
  dicionário com etimologia, exemplos, sinônimos, formas.
- Modo de prática sobre a legenda do vídeo: Listening, Speaking (grava/ouve a própria gravação), Selection, Filling,
  Dictation, com "Accuracy", "Your answer / Correct answer", som de teclado; "Practice mode for non-members is limited
  to 1 minute per video".
- IA (premium): transcrição de legendas no YouTube (fila "AI Subtitles transcription Queue", até 12 horas, etapas
  "Audio transcription, Subtitle generation"), "Force AI Translation", sentenças ilimitadas, análise ilimitada.
- Plataformas: YouTube, Netflix, Disney+, HBO, Prime, Coursera, edX, Udemy.

### Readlang

- Mecanismo (source map): módulo que encontra a palavra sob o cursor (`caretRangeFromPoint`), traduz por clique ou
  arrastar, e envolve só o trecho traduzido sem reescrever o texto da página. Frases crescem: ao traduzir um trecho
  vizinho, as traduções absorvidas viram uma frase maior. Estilos de tradução: "gloss" (abaixo da palavra), pop-up e
  monolíngue; transliteração (furigana, pinyin); toque longo traduz, deslizar rola; links são traduzidos ao passar o
  mouse; funciona dentro de legendas de outros players (cita "ASB Player").
- Salva a frase de contexto com cada palavra; cartões com repetição espaçada priorizados por utilidade; lembrete diário
  por e-mail; exportar para Anki; Vocab Manager (estrela, editar, apagar); player de vídeo com transcrições
  sincronizáveis; dicionário personalizável; "Ami" (conversa com IA com correção); leitor web por extensão ou bookmarklet
  (também Ctrl+Shift+I para importar o texto da página); app iOS/Android.
- Pago (página pública): Grátis (tradução de palavra ilimitada, 10 frases e 10 explicações de contexto por dia, 6
  palavras por frase), Premium US$ 6/mês ou US$ 48/ano (frase até 12 palavras, IA melhor, voz de qualidade, 2 reparos
  de ofensiva por mês), Premium Plus US$ 15/mês ou US$ 120/ano (voz para textos inteiros, melhor modelo).

### Yomitan (GPL-3.0; só ideias)

- Janela de definição ao passar o mouse com modificador, varredura por mouse, caneta e toque (`scanOnTouch*`,
  `scanOnPen*`), pop-up aninhado (`popupNestingMaxDepth`), busca por clipboard, página própria de busca,
  desconjugação por regras (`useDeinflections`), vários dicionários por idioma (importados), ordenação por
  dicionário de frequência (`sortFrequencyDictionary`, `averageFrequency`, `frequencyDisplayMode`), tags de
  classe gramatical, diagramas de acento tonal, ordem dos traços dos kanjis.
- Anki via AnkiConnect, com marcadores de modelo: `sentence`, `cloze-prefix|body|suffix`, `audio`, `screenshot`,
  `clipboard-image`, `frequencies`, `frequency-harmonic-rank`, `pitch-accents`, `part-of-speech`, `conjugation`,
  `document-title`, `popup-selection-text`. Opções de duplicata (`checkForDuplicates`, `duplicateScope`) e de captura
  de tela (`screenshot`). O desenho do "campo de cartão por marcador" é boa referência para o `src/core/anki/mapeamento.ts`.

## 3. Tabela: recurso, app, mecanismo, como o Frasy faria, esforço, e o que já existe

Esforço: P (dias), M (1 a 3 semanas), G (mais). A última coluna vem de `rg`/leitura nas pastas `src/components/views`,
`src/core` e `src/lib` (não exaustivo). O Frasy não tem extensão de navegador: capta o áudio da tela/aba pelo
navegador e mostra legenda em janela flutuante/PiP.

| #   | Recurso                                                                                              | App de origem                                                              | Mecanismo                                                                                                          | Como o Frasy faria                                                                                                                                                                                                                       | Esforço | Tem algo parecido no Frasy?                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Auto-pausa por legenda, auto-retomada e retomada pelo tempo de leitura                               | Migaku (`playMode.*`), Language Reactor (`autoPause`)                      | Intercepta o `<video>`; pausa no fim da fala, volta após X s ou pelo tempo estimado de leitura da frase            | Só onde o Frasy controla a mídia: player local de vídeo/áudio com legenda importada (não dá para pausar Netflix de uma aba externa). Modo "estudo" com pausa no fim da frase e retomada por palavras/segundo                             | M       | Não. Há ritmo de leitura da legenda (`lib/captura/ritmoDaLegenda`) e legenda em PiP, mas nada pausa a mídia                   |
| 2   | Repetir trecho, loop de frase e velocidade 0,8x na fala                                              | Language Reactor (`loopSub`, `slowSpeechSegments`), Trancy (repetir linha) | `currentTime` volta ao início da legenda; `playbackRate` só durante a fala                                         | Mesmo player local (item 1); no leitor/áudio-livro já há tocar trecho                                                                                                                                                                    | P       | Parcial: ouvir trecho no leitor; sem loop de frase em vídeo                                                                   |
| 3   | Cartão com áudio do trecho + quadro do vídeo                                                         | Migaku, Language Reactor (Anki com screenshot e áudio)                     | Buffer da gravação da aba + corte por tempo com folga (`audioPadding`) + captura de quadro + ffmpeg WASM           | Com opt-in, guardar os últimos 30 s de áudio no aparelho (anel de memória), recortar a frase salva com folga e anexar ao cartão; quadro só se a pessoa autorizar a captura de tela. Menores: sem retenção, só se for para o cartão local | G       | Não: cartão tem frase, nota, `escrita` de `.apkg`; nenhum áudio de trecho nem imagem (`core/anki/campo.ts` sem mídia)         |
| 4   | Painel de compreensão por mídia (% conhecidas, faixas Ambitious a Exceptional)                       | Migaku, Language Reactor                                                   | Cruza as palavras das falas com o conjunto de conhecidas; rótulo por limiar (60, 70, 80, 90, 95, 99)               | Mostrar, no resumo da sessão de captura e no livro, "você já sabe X%" com a mesma régua de Nation que a leitura ativa usa; só com número honesto (>= N sessões)                                                                          | M       | Parcial: `core/leitura/coberturaDoTexto.ts` (só leitura ativa, só inglês)                                                     |
| 5   | "Palavras desta mídia por frequência" e palavras sugeridas                                           | Language Reactor, Trancy, Migaku                                           | Lista de frequência por idioma ordena as palavras novas do vídeo; "sugestões" após praticar as salvas              | Lista de frequência por par de idiomas (`cefrWordlist` como base) para ordenar "novas para você" no fim da sessão, com botão "salvar as 10 mais úteis"                                                                                   | M       | Parcial: etiqueta `nova-para-voce` (`core/vocabulario/etiquetas.ts`) e `cefrWordlist`; sem ordenar por frequência na sessão   |
| 6   | Filtro i+1 nas falas ("1 desconhecida", "todas conhecidas") e PhrasePump                             | Migaku (Subtitle Browser), Language Reactor (PhrasePump)                   | Por frase, conta palavras não conhecidas; mostra as com exatamente 1 e reforça as devidas                          | Prática: frases capturadas pela própria pessoa com 1 palavra nova + palavra devida do FSRS (jogos já têm lacuna)                                                                                                                         | M       | Parcial: jogos de lacuna (`core/learning/cloze.ts`); sem filtro i+1 sobre as falas capturadas                                 |
| 7   | Auto-avaliação de nível para semear "conhecidas"                                                     | Language Reactor (lista crescente), Migaku (assessment EN/JA/ZH)           | Escolhe a linha em que "sei todas"; marca como conhecidas as faixas acima na lista de frequência                   | Teste curto de 20 itens + lista de frequência → conhecidas em lote; evita o início frio e libera o número de cobertura                                                                                                                   | P a M   | Parcial: `Diagnostico.tsx`, `cefrWordlist.ts`; verificar se semeia conhecidas                                                 |
| 8   | Prática sobre a legenda: escutar, falar, escolher, preencher, ditado                                 | Trancy                                                                     | Modo em cima da fala atual: esconde a palavra, valida, mostra acurácia                                             | Na sessão de captura, ao encerrar: "refazer as 5 falas" com ditado/lacuna corrigidos no aparelho (já planejado `exercicios-de-frase`)                                                                                                    | M       | Parcial: `pronunciation.ts` (pontuação por similaridade), ditado/retradução em plano                                          |
| 9   | Pop-up de consulta recursiva, aba de flexões e ordem de abas                                         | Yomitan, Migaku                                                            | Consulta dentro do pop-up abre outro (profundidade máxima); desconjugação por regras                               | No `CartaoDaPalavra`, tocar numa palavra da explicação abre o cartão dela (pilha de 2 níveis) com flexões do `core/texto`                                                                                                                | M       | Parcial: `CartaoDaPalavra.tsx` existe; consulta aninhada não verificada                                                       |
| 10  | Memória do assistente visível, editável e apagável; prompts editáveis                                | Language Reactor (Aria/Lexa)                                               | Lista de "memórias" por tipo (sobre você, preferência, marco) com "esquecer isto" e "esquecer tudo"                | Boa para LGPD/ECA: se o assistente lembrar algo, mostrar, editar e apagar; para menores, desligado por padrão                                                                                                                            | M       | Não verificado: há `captura/assistente`; sem tela de memória                                                                  |
| 11  | Envio direto ao Anki (AnkiConnect) e marcadores de modelo                                            | Yomitan, Migaku, Language Reactor                                          | `POST localhost:8765` (`addNote`, `storeMediaFile`) com campos por marcador (`sentence`, `cloze-*`, `frequencies`) | Botão "enviar ao Anki" no desktop quando o AnkiConnect responder; marcadores no `core/anki/mapeamento.ts`. Exige liberar a origem do Frasy no AnkiConnect                                                                                | P a M   | Parcial: leitura e escrita de `.apkg` (`lib/anki`, `core/anki/escrita.ts`); AnkiConnect: nenhum                               |
| 12  | Tradução inline abaixo das palavras desconhecidas, com densidade/nível                               | Migaku (Inline Word Translations), Toucan, Readlang (gloss)                | Anotação sob a palavra com a tradução de saída configurada; densidade por nível                                    | Na legenda e no leitor: glosa curta só sob palavras `nova-para-voce`, com controle de densidade                                                                                                                                          | P a M   | Parcial: modos de tradução da legenda (`sempre/discreta/oculta/toque`), `nivelDeTraducao.ts` (nível de modelo, não densidade) |
| 13  | Progressão palavra para frase conforme a pessoa aprende                                              | Toucan ("I know that word", `batchIncrementHomonymProgression`)            | Quando a palavra vira conhecida, a tradução passa a cobrir mais da frase                                           | Quando a palavra fica `dominada`, a legenda para de glosá-la e glosa o trecho ao redor; combina com o item 12                                                                                                                            | M       | Não                                                                                                                           |
| 14  | Frase que cresce: traduções vizinhas se fundem numa frase                                            | Readlang (`rangeTranslator`)                                               | Ao traduzir uma palavra colada a outra já traduzida, une num trecho maior e re-traduz                              | No leitor, selecionar palavra vizinha estende a seleção e a salva como frase                                                                                                                                                             | P       | Parcial: `leitor/BarraDaSelecao.tsx`, `PainelDaTraducao.tsx`                                                                  |
| 15  | Tópicos por situação ("Shortcuts") e microprática                                                    | Toucan                                                                     | Lista curada de frases por situação, priorizadas pelo motor                                                        | Trilhas "pedir comida / aeroporto" na trilha do Frasy com a mesma FSRS                                                                                                                                                                   | M       | Parcial: `core/learning/trilha.ts`, `PainelTrilha.tsx`                                                                        |
| 16  | Metas diárias de palavras vistas, relatório diário, "top X% dos aprendizes"                          | Toucan                                                                     | Contador diário de palavras vistas vs meta; notificação de relatório                                               | Relatório diário opcional (e-mail ou aviso no app), sem ranking para menores                                                                                                                                                             | P       | Parcial: `core/missoes.ts` (meta e sequência), `Estatisticas.tsx`; sem relatório diário                                       |
| 17  | Reparo de ofensiva (streak repair)                                                                   | Readlang                                                                   | Item de plano que recupera dia perdido                                                                             | Só adultos e sem pressão (copy-br-etica); avaliar para o plano pago                                                                                                                                                                      | P       | Não encontrado em `src/core`                                                                                                  |
| 18  | Sincronização e correção de legenda importada (deslocamento e taxa de quadros), busca de legenda     | Language Reactor (`vfp_subSync*`, OpenSubtitles)                           | Compara o áudio com o tempo das falas, aplica deslocamento; busca por API                                          | Ao importar SRT, ajustar o tempo com um controle +/- e detector simples por energia de áudio; sem busca externa (menores)                                                                                                                | M       | Parcial: `lib/import/legendas.ts` importa; sem ajuste de tempo                                                                |
| 19  | Legenda gerada por IA para faixa que a plataforma não legendou, com legenda secundária traduzida 1:1 | Migaku, Trancy, Language Reactor                                           | Transcrição em nuvem do áudio, tradução por falas alinhadas                                                        | Já é o núcleo do Frasy (transcrição e tradução ao vivo, no aparelho)                                                                                                                                                                     | n/a     | Sim: `LiveCapture`, `core/traducao`                                                                                           |
| 20  | Palavra colorida por status; contador de conhecidas; ignorar                                         | Migaku, Language Reactor, LingQ                                            | Conjunto de status por palavra                                                                                     | Já planejado (`vocab-conhecidas-e-ignoradas`)                                                                                                                                                                                            | n/a     | Parcial: etiquetas `salva/aprendendo/dominada/nova-para-voce`                                                                 |
| 21  | Modo leve (só consulta, sem alterar a página)                                                        | Migaku (Lightweight/Plaintext)                                             | Consulta por Shift+hover sem reescrever o DOM                                                                      | Não se aplica a web app sem extensão; ideia: consulta em texto colado                                                                                                                                                                    | n/a     | n/a                                                                                                                           |
| 22  | Extensão de navegador (Netflix/YouTube)                                                              | Todos                                                                      | Content script no player                                                                                           | Fora do escopo web puro; o caminho do Frasy é a captura de áudio da aba                                                                                                                                                                  | G       | Não (decisão de produto)                                                                                                      |

## 4. Riscos e cuidados

- Menores: gravação de tela/áudio do trecho (item 3), memória do assistente (10) e relatório diário (16) precisam
  de opt-in, local por padrão e retenção zero para menores.
- Itens 1 e 3 dependem de o Frasy controlar a mídia ou autorizar captura de tela; a extração de áudio do YouTube feita
  pelo Migaku não é um caminho recomendável.
- Yomitan é GPL-3.0: usar apenas a ideia (marcadores de modelo, aninhamento), nunca trechos de código.
- Gemini continua proibido; as ideias com IA (10, 19) devem usar os provedores aprovados em `ops/ia-provedores*.json`.

## 5. Próximos passos sugeridos

1. Itens 4 e 5 (cobertura e "palavras novas por frequência" no resumo da sessão): reaproveitam código existente e dão o
   número que Migaku e Language Reactor usam como argumento de venda.
2. Item 11 (AnkiConnect) com marcadores de modelo: barato e fecha a lacuna de exportação.
3. Item 3 (cartão com áudio do trecho) como protótipo atrás de flag, só adultos, depois de decidir a política de captura.

## Fontes

Pacotes públicos do Chrome Web Store (IDs na seção 1), `readlang.com/` e `/features` (respeitando `robots.txt`),
`github.com/yomidevs/yomitan` (README, `docs/templates.md`, `ext/data/schemas/options-schema.json`, GPL-3.0).
Artefatos locais (não versionados): `.../scratchpad/ext/<app>/` e `.../scratchpad/reaout/*.json`.
