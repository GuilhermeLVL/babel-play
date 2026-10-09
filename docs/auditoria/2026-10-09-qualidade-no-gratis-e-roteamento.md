# Qualidade no Grátis e lógica de roteamento

Pesquisa de 09/10/2026, pedida pelo dono. Complementa `2026-10-09-aparelhos-planos-e-nuvem.md` (não
repete a matriz de aparelhos, os custos nem os planos). Nada aqui foi implementado nem medido por mim:
é leitura de fontes mais leitura do nosso código.

**Marcas.** **[C]** confirmado em fonte primária (documentação, repositório, artigo, contrato), com
data. **[R]** relato de terceiro, blog ou fórum. **[I]** inferência minha. "Não achei" quer dizer que
procurei e não encontrei; não é prova de que não existe.

**Limites desta pesquisa (leia antes de confiar).**
- A skill `last30days` está instalada, mas nunca foi configurada nesta máquina; a primeira execução
  pede consentimento do dono (leitura de cookies do navegador, instalação de ferramentas, gravação de
  configuração). Não rodei. A parte de fórum saiu de busca comum, e veio fraca: quase tudo que achei
  de relato são issues do GitHub de 2024 a 03/2026, não conversa de Reddit/HN do último mês.
- Li as páginas por um resumidor automático. Datas de "última atualização" das páginas do Chrome
  vieram inconsistentes em três casos; onde isso pesa, digo.
- Números de erro (WER) de fontes diferentes não se comparam entre si (áudio, normalização e
  quantização mudam). Use-os para ordenar candidatos, não para prometer resultado.

---

## Resumo de uma página (para o dono)

**1. O maior ganho no Grátis é em português, no computador.** Hoje o português local usa Whisper
base ou small. Na nossa bancada o base errou 18 de cada 100 palavras. Existe um modelo aberto, o
Parakeet v3 da NVIDIA, que numa medição de terceiros errou 5 em 100 em português, com download do
tamanho do nosso small e rodando 7 vezes mais rápido que a fala no processador de um notebook de 2020.
Ele já roda em navegador em projetos de terceiros, mas com ressalvas técnicas. É a aposta que mais
muda a qualidade do Grátis; pede uma medição nossa antes (um dia de trabalho, custo zero).

**2. Em inglês o Grátis já é bom e pode ficar melhor sem custo.** A família Moonshine ganhou uma
segunda geração (02/2026) que mostra o texto enquanto a pessoa fala e erra menos (7,8 contra 10 em
100). Também existe para espanhol e alemão. Não existe para português.

**3. O que o navegador dá de graça ajuda menos do que parece em português.**
- O tradutor embutido do Chrome (e agora do Edge) funciona em português, é no aparelho, e já usamos.
  Só existe no computador.
- O reconhecimento de fala "no aparelho" do Chrome existe desde 08/2025, mas não achei lista oficial
  de idiomas. O do Edge está só em versões de teste e lista português de Portugal, não do Brasil.
- A inteligência embutida do Chrome (Gemini Nano) não fala português (só inglês, espanhol, japonês,
  alemão e francês), não existe no celular, e exige 22 GB livres. Não serve para corrigir legenda em
  português.
- No celular e no Quest nada disso existe. Lá o grátis depende do nosso modelo pequeno, e o limite é
  o aparelho.

**4. "Nuvem grátis" não sustenta uma amostra para todo mundo.** A camada grátis da Groq vale para a
nossa conta inteira, não por usuário: 20 pedidos por minuto. Uma única pessoa em legenda ao vivo gasta
10 a 15. A do Google treina com os dados e permite revisão humana, o que não combina com menores nem
com a LGPD. A única que fecha a conta para uma amostra pequena é a da Cloudflare (que já é nossa
fornecedora): cerca de 3,5 horas de transcrição por dia para a conta inteira, e para sozinha quando
acaba. Dá para oferecer "10 minutos de precisão por dia" a umas vinte pessoas por dia, não a mil.

**5. Corrigir a legenda com um "modelo pequeno" no aparelho é arriscado.** A literatura mostra que
ele conserta pouco e, quando erra, inventa. O que funciona sem risco: dar ao reconhecedor as palavras
do usuário, barrar frases inventadas no silêncio, e só mexer no texto quando o próprio reconhecedor
está inseguro.

**6. Roteamento.** A regra proposta: (a) modelo no aparelho, se o aparelho provou que acompanha a
fala naquele idioma; (b) recurso do navegador, deixando claro quando ele manda o áudio para o Google,
a Microsoft ou a Apple; (c) nossa nuvem, só se o plano tem e se a medição diz que compensa. Hoje todo
pagante vai à nuvem primeiro, mesmo quando o aparelho dele daria o mesmo resultado em inglês; isso
gasta cota e não melhora nada.

**7. Transparência.** Três etiquetas bastam, sempre visíveis na captura: "No aparelho", "Pelo
navegador (sai do aparelho)", "Nuvem do Babel". Perfil infantil: só "No aparelho". Uma pesquisa de
2025 mostrou que dizer "roda no aparelho" não basta para a pessoa se sentir segura; ajuda mostrar o
que acontece (o modo avião continua funcionando) e deixar a troca na mão dela.

---

## 1. Tirar mais do modelo local

### 1.1 Onde estamos (lido no código, 09/10)

- Whisper tiny/base/small do `onnx-community` e Moonshine tiny/base (só inglês), em
  `@huggingface/transformers` 4.2.0 e `onnxruntime-web` 1.26 dev. Quantização já escolhida por
  medição própria: `hybrid` (encoder fp32 + decoder q4) no computador, q8 no WASM fora dele,
  `hybrid-fp16` na GPU do celular/Quest quando a sonda prova. `src/gateway/sttRouter.ts`.
- Sonda de capacidade, regulador de desempenho e troca de backend em sessão já existem.
- AEC, redução de ruído e ganho automático já desligados para som do sistema e ligados no microfone.
  `src/gateway/capture/systemAudio.ts`.
- Filtro de alucinação próprio (`src/gateway/alucinacao.ts`), decode final especulativo dentro dos
  800 ms, detector de fim de fala.
- `initial_prompt` foi avaliado e não entrou porque a biblioteca não expõe `prompt_ids` no pipeline
  (`src/gateway/adapters/whisperWorker.ts`, linha 32).
- VAD: `@ricky0123/vad-web` 0.0.30.

Ou seja: boa parte do "ajuste fino" clássico já está feita. O que sobra de ganho grande está na
escolha do modelo por idioma.

### 1.2 Modelo por idioma (o que as fontes dizem)

Português, FLEURS teste, todos em Q8, notebook Ryzen 4750U (CPU e GPU integrada via Vulkan, nativo,
não navegador) **[R]** (models.handy.computer, sem data na página; lista modelos de 03/2026, então é
de 2026):

| Modelo | Erro em pt (%) | Velocidade CPU (× tempo real) | Tamanho |
|---|---|---|---|
| whisper-large-v3-turbo | 4,17 | 0,8 | 0,83 GB |
| canary-1b-v2 | 4,50 | 6,7 | 1,10 GB |
| **parakeet-tdt-0.6b-v3** | **4,96** | **7,5** | **0,72 GB** |
| Qwen3-ASR-0.6B | 6,57 | 4,3 | 0,79 GB |
| whisper-small | 7,65 | 3,4 | 0,25 GB |
| nemotron-3.5-asr-streaming-0.6b | 8,52 | 7,5 | 0,70 GB |
| whisper-base | 13,91 | 11,9 | 0,08 GB |
| whisper-tiny | 24,07 | 24,8 | 0,04 GB |

Conferência cruzada: o artigo da NVIDIA dá Parakeet v3 em pt no FLEURS com 4,76% e Canary v2 com
4,39% **[C]** (arXiv 2509.14128, 09/2025). As duas fontes concordam na ordem. A nossa bancada mediu
whisper-base em 18,2% (100 falas FLEURS pt): mais alto que os 13,9% de terceiros, o que é esperado
(normalização e dtype diferentes) e lembra que só a nossa medição vale para decidir.

**Parakeet TDT 0.6b v3** (25 idiomas europeus, licença CC-BY-4.0, exige atribuição):
- Roda em navegador em projetos de terceiros (parakeet.js, parakeet_web, Keet) via ONNX Runtime Web,
  WASM e WebGPU **[R]**.
- Ressalvas reportadas pelos próprios empacotadores **[R]**: o export int8 dá resultado errado no
  WebGPU; a saída foi encoder fp16 de 1,24 GB (o fp32 tem 2,3 GB). Em WASM o int8 bateu com a
  referência de CPU em inglês e alemão; português não foi testado. O encoder exportado cobre cerca de
  35 s de áudio por vez. Não é modelo de streaming: texto parcial sai rodando de novo sobre uma janela
  deslizante.
- Não achei medição de velocidade em navegador nem de erro em pt-BR conversacional.
- **[I]** Se o int8 em WASM confirmar ~5% em pt a ≥ 2× o tempo real num notebook comum, ele substitui
  o whisper-small como "preciso" do Grátis fora do inglês e passa a servir quem não tem placa de
  vídeo, que hoje fica no base. É a maior melhoria possível do Grátis em português.

**Moonshine v2 (streaming)** **[C]** (documentação Moonshine, tabela de modelos; artigo arXiv
2602.12241 de 12/02/2026): inglês medium 245M 6,65%, small 123M 7,84%, tiny 34M 12,00%; espanhol
small 4,9% e tiny 6,2%; alemão small 7,5%; árabe, japonês, mandarim, tagalo, vietnamita no tiny.
Licença MIT nos de streaming. **Português não existe** em nenhuma geração. O que usamos hoje
(base 58M, não streaming) aparece com 10,07%. Há pacote JavaScript (`@moonshine-ai/moonshine-js`,
em beta, WASM) **[C]**; não confirmei se ele já carrega os modelos v2 nem se o `onnx-community` tem
os v2 em formato que o transformers.js abra. É a primeira coisa a verificar.

**Nemotron 3.5 streaming 0.6b** (40 idiomas, 0,56 s de atraso, 8,52% em pt): há ONNX int4 do
`onnx-community` **[C]**, mas só achei execução em CPU/CUDA/DirectML, nenhuma em WebGPU **[R]**.
Licença OpenMDW. Candidato a "texto durante a fala em português no aparelho", atrás do Parakeet em
erro. Portar seria trabalho novo.

**Descartados para o navegador hoje:** Voxtral Mini 4B Realtime (2,5 GB em Q4, roda em aba via
Rust/WASM+WebGPU num projeto de terceiro, pesado demais para o Grátis) **[R]**; Kyutai STT (só
inglês e francês, sem build de navegador) **[R]**; Canary 1b v2 (1,1 GB, sem relato de navegador).

### 1.3 Quantização e backend

- Estudo de 11/2025 **[C]** (arXiv 2511.08093, LibriSpeech): int8 dinâmico não piora o small; no
  base o áudio difícil sobe de 12,87 para 14,72; no tiny de 23,69 para 24,64, e com 4 bits (nf4) vai
  a 32,19. Coincide com a nossa bancada (tiny q8 41,6 contra 29,2; base empata). Regra: quanto menor
  o modelo, menos quantização ele aguenta.
- Estudo Interspeech 2026 **[R]** (só o resumo): a precisão das ativações pesa mais que a dos pesos;
  baixar ativações de 16 para 8 bits custa 1 a 3 pontos.
- **Atenção, afeta código nosso.** Issue aberta no transformers.js **[C]** (#1590, 17 a 30/03/2026,
  ainda aberta na leitura): no runtime WebGPU novo da v4, o encoder do Whisper em fp16 perde precisão
  (texto incompleto, um segmento só). O mantenedor confirmou que encoder fp32 resolve. Nós usamos
  v4.2 e temos a rota `hybrid-fp16` no celular/Quest com GPU. A nossa bancada precisa conferir o erro
  dessa rota contra `hybrid` no mesmo áudio; se piorar, a rota volta para q8 no WASM.
- Relatos antigos (2024) **[R]**: q8 no WebGPU chega a ser 5 vezes mais lento que no WASM (não há
  kernel int8 na GPU), e há vazamento de memória de GPU em sessão longa. O código já evita o
  primeiro; o segundo pede teste de 30 minutos.
- transformers.js 4.3 adicionou WebGPU no Safari 26+ **[C]** (notas de versão). Vale subir de 4.2
  para 4.3 antes de medir iPhone.
- **WebNN**: em teste de origem no Chrome 146 (02/2026), atrás de flag, NPU só com Windows 11 24H2 e
  configuração manual **[C]/[R]**. Não é caminho para usuário comum em 2026. Não investir.

### 1.4 VAD e corte

- Silero v6.2 **[R]** (post do mantenedor): treino refeito, ganho declarado é estabilidade em casos
  de borda, mudança visível pequena. Um porte de terceiros mediu F1 de trecho subindo de ~86% (v5.1.2)
  para ~94% na variante de 256 ms, com alarme falso indo de 0% a 7,8%; a variante de 32 ms mantém a
  interface. Uma base, um limiar: indicativo.
- TEN VAD **[R]** (comparação do próprio fornecedor): diz ter mais precisão e menos custo que o
  Silero; tem build WASM. Não achei comparação independente em navegador.
- **[I]** O ganho aqui é de segunda ordem. Os 800 ms já foram medidos por nós. O que ainda rende é o
  silêncio adaptativo (fechar antes quando o detector de fim de fala tem certeza), que o código já
  tem. Trocar de VAD só depois de medir no nosso áudio de música e jogo.

### 1.5 Texto parcial estável

- "Local agreement" com duas passadas **[C]** (arXiv 2307.14743): roda o modelo no buffer inteiro a
  cada pedaço novo, confirma só o prefixo em que duas passadas seguidas concordam, corta o buffer no
  fim da última palavra confirmada e realimenta as últimas ~200 palavras como contexto. Atraso médio
  de 3,3 s em GPU de servidor.
- **[I]** No navegador isso só cabe onde o modelo roda a ≥ 4× o tempo real (computador com GPU, ou
  Moonshine/Parakeet em CPU). Em celular e Quest, não: gasta a bateria e atrasa o final.
- Armadilha **[R]**: duas passadas concordam também em alucinação de silêncio. O VAD tem que barrar
  antes.
- Modelos de streaming de verdade (Moonshine v2, Nemotron) dispensam essa técnica; é mais um motivo
  para preferi-los onde existem.

### 1.6 Contexto, vocabulário do usuário e nomes próprios

- Whisper: o `initial_prompt` continua fora do alcance do pipeline do transformers.js (confirmado no
  nosso código; não achei mudança na 4.3). **[I]** Dá para montar `decoder_input_ids` à mão com
  `<|startofprev|>` + vocabulário, mas é trabalho de baixo nível e o ganho em modelos tiny/base é
  incerto. Baixa prioridade.
- Web Speech: existe `phrases` (lista de frases com peso de 0 a 10) pensado para o modo no aparelho
  **[C]** (MDN, marcado experimental). Não achei em que versão do Chrome saiu. Detectar por
  `'phrases' in SpeechRecognition.prototype`. Onde existir, alimentar com o vocabulário do usuário e
  nomes do conteúdo.
- **Sem custo e sem risco [I]:** correção determinística depois do reconhecimento, só para palavras
  do vocabulário do usuário e nomes do título do vídeo, por distância fonética/edição com limiar
  conservador. Não inventa texto, e mexe exatamente no que o usuário mais nota.

### 1.7 Pontuação, maiúsculas, idioma, silêncio

- Whisper e Parakeet v3 já pontuam e capitalizam **[C]**. Moonshine também. Não adicionar modelo de
  pontuação.
- Detecção de idioma: o `LanguageDetector` do Chrome é estável desde o 138, só no computador **[C]**.
  Serve para o texto já transcrito (conferir se o idioma detectado bate com o configurado), não para
  o áudio. Para áudio, a detecção do próprio Whisper nos primeiros segundos continua sendo o caminho.
- Alucinação: um estudo de 2026 **[C]** (arXiv 2606.23060) treinou um classificador só com os sinais
  de confiança do Whisper (log-prob médio, razão de compressão, prob. de não-fala) e obteve F1 de
  23,6%: limiar sozinho não detecta. O que funciona **[R]**: VAD antes, lista de frases típicas
  ("Obrigado por assistir", "Legendas pela comunidade"), detector de repetição, e redecodificar o
  trecho suspeito (a alucinação raramente se repete igual). O nosso filtro já cobre parte; vale
  conferir se tem a redecodificação.

### 1.8 Pré-processamento

Já resolvido no código (processamento desligado para som do sistema, ligado no microfone). Um detalhe
**[R]**: desligar só o `echoCancellation` derruba junto os outros dois em alguns navegadores; conferir
com `track.getSettings()` o que foi de fato aplicado e registrar na telemetria local.

---

## 2. Recursos nativos grátis por plataforma (outubro/2026)

| Recurso | Onde existe | pt-BR | Sai do aparelho? | Como detectar |
|---|---|---|---|---|
| `Translator` | Chrome 138+ e Edge 148+, só computador **[C]** | Sim (`pt`; Chrome lista 39 idiomas, Edge diz 145+) | Não | `'Translator' in self`, depois `Translator.availability({sourceLanguage, targetLanguage})` |
| `LanguageDetector` | Idem **[C]** | Sim | Não | `'LanguageDetector' in self` |
| `Summarizer` | Chrome 138+, computador **[C]** | Não (Gemini Nano: en, es, ja, de, fr desde o 149) | Não | `'Summarizer' in self` |
| Prompt API (`LanguageModel`) | Chrome computador; página atualizada em 26/08/2026 **[C]**; um guia diz "ligada por padrão no 154" **[R]** | Não | Não | `'LanguageModel' in self` + `availability()` |
| Proofreader, Writer, Rewriter | Teste de origem **[C]** | Não | Não | idem |
| Fala no aparelho (`processLocally`) | Chrome 139+ computador (Windows, Mac, Linux) **[C]**; Edge só Canary/Dev 150+ atrás de flag **[C]** | Chrome: **não achei lista**. Edge: en-US, de-DE, it-IT, **pt-PT**, es-ES, ko-KR | Não | `SpeechRecognition.available({langs:['pt-BR'], processLocally:true})` |
| Fala padrão (`webkitSpeechRecognition`) | Chrome computador e Android, Safari | Sim | **Sim** (servidor do Google no Chrome; Apple no Safari) | `'webkitSpeechRecognition' in window` |
| `start(MediaStreamTrack)` | Chrome/Edge computador **[C]** (MDN e doc do Edge); versão exata não achei | n/a | conforme o modo | `try { rec.start(track) }` |
| `phrases` (vocabulário) | Chrome, experimental **[C]**; versão não achei | n/a | n/a | `'phrases' in SpeechRecognition.prototype` |
| WebGPU | Chrome/Edge; Safari 26 (inclui iOS 26) **[C]**; Firefox Windows 141, Mac 145/147, Linux e Android ainda não **[C]** (wiki gpuweb, 28/05/2026) | n/a | n/a | `navigator.gpu?.requestAdapter()` |
| WebNN | Teste de origem/flag **[C]** | n/a | n/a | `'ml' in navigator` |

**Chrome e Edge no computador.**
- Requisitos do Gemini Nano **[C]**: 22 GB livres no volume do perfil; GPU com mais de 4 GB de VRAM,
  ou CPU com 16 GB de RAM e 4 núcleos. A máquina do dono (16 GB, RX 6800) entra; o notebook típico do
  nosso usuário, não.
- Tradutor **[C]**: traduz em fila (um pedido por vez), não funciona em Web Worker, baixa o par na
  primeira vez. Sem cota documentada.
- Pacote de idioma da fala no aparelho: ~60 MB **[C]** (intent to ship, 01/2025). Instalar idioma
  diferente do preferido do usuário, ou fora de Wi-Fi, pede permissão explícita **[C]** (revisão TAG).
- Há proposta de nível de qualidade (`quality: 'command' | 'dictation' | 'conversation'`) revisada
  pelo TAG e fechada em 01/05/2026 "com ressalvas" **[C]**. Sem data de entrega. Mozilla e WebKit:
  "ainda não".
- Bug reportado **[R]**: `available()` devolvendo "indisponível" no macOS no Chrome 142.
- Edge: o post de 02/06/2026 **[C]** anuncia Translator/LanguageDetector no 148 e um modelo novo,
  Aion-1.0-Instruct, menor que o Phi-4-mini e que roda em CPU, ainda só em Canary/Dev.

**Windows (Copilot+, Phi Silica, Legendas ao vivo).** Nada disso é alcançável por página web. O que a
web alcança é o que o Edge expõe (acima). **[I]**

**Android.** A documentação diz textualmente que Translator e LanguageDetector "não funcionam em
aparelhos móveis" e que as APIs com Gemini Nano não têm suporte no Chrome para Android **[C]**. Em
12/2025 a equipe do Chrome disse que levaria "API por API" e que haveria novidades em 2026 **[C]**;
não achei anúncio até hoje. A fala no aparelho não lista Android. Sobra o `webkitSpeechRecognition`
padrão (sai do aparelho, frases curtas).

**Safari, iOS e macOS.** WebGPU ligado por padrão no Safari 26 **[C]**. SpeechAnalyzer e o framework
Translation são só para apps nativos; um desenvolvedor que investigou não achou nenhuma ponte para
JavaScript **[R]**. O `webkitSpeechRecognition` segue com os problemas antigos (para sozinho, falha
na primeira tentativa, não funciona instalado na tela inicial segundo relatos) **[R]**; relatos são
anteriores ao iOS 26 e não achei confirmação nova. Bug aberto de queda do WebGPU no iOS 26.0/26.1
depois de ~70 s com muitos objetos **[C]** (WebKit 302711); não é sobre modelos de fala, mas pede
teste de sessão longa.

**Firefox.** Sem API de tradução para páginas (a tradução local é só da interface) **[R]**.
Reconhecimento de fala em desenvolvimento: bug com alvo no Firefox 158, build Nightly de 03/09/2026
**[C]**. WebGPU no Android atrás de flag. No Firefox o Grátis é 100% modelo nosso.

**Meta Quest.** As notas de versão de 2026 **[C]** mostram o navegador no Chromium 146 (04/2026) e
150 (08/2026), com WebGPU "experimental" para WebXR. Nenhuma nota menciona fala. Os relatos de "sem
reconhecimento e sem voz" que temos são de quando o navegador estava em Chromium antigo. **[I]** Com
base 146+, vale repetir a página de diagnóstico no aparelho: pode ter mudado.

---

## 3. Corrigir e melhorar com modelo pequeno grátis

**Pós-correção da transcrição por LLM.** O que a literatura diz **[C]/[R]**:
- Sobrecorreção é o defeito central: o modelo puxa a fala para a língua escrita e mexe no que estava
  certo. Num estudo com GPT-4, os acertos eram pequenos e os erros eram frases longas inventadas (WER
  de 0,5 para 3,0 num exemplo) (arXiv 2506.16528).
- O que reduz o dano: só corrigir trechos de baixa confiança do reconhecedor (Interspeech 2024,
  Naderi et al.), dar várias hipóteses e pista fonética (Interspeech 2025), e rejeitar saída muito
  diferente da entrada.
- Um estudo de 2026 em língua de poucos recursos alerta que ganhos publicados podem ser contaminação
  de dados de treino (arXiv 2605.19711).
- Não achei estudo de 2025/2026 que isole modelo pequeno (< 2 B) corrigindo português.

**Para nós, pior ainda [I]:** quem estuda idioma precisa ver o que foi dito, não uma versão "bonita".
Uma correção que troca a palavra ouvida por outra plausível ensina errado. Recomendação: não usar LLM
para reescrever a legenda no Grátis. Usar só correção determinística de vocabulário (1.6).

**Gemini Nano.** Sem português, sem celular, 22 GB **[C]**. Fora.

**Modelos em WebLLM/transformers.js.** Números conflitantes **[R]**: Qwen3 0.6B com download de 335 a
500 MB e 1,4 a 4 GB de memória de GPU conforme a fonte; Phi-4-mini 2,3 GB e Gemma 3n E4B 1,5 GB a
"15 a 40 tokens/s em GPU de consumo", sem método. Único dado sólido: no artigo do WebLLM, Phi-3.5-mini
a 71 tokens/s num M3 Max. No Safari de iPhone o limite por buffer vai de 256 MB a 993 MB **[R]**, o
que barra quase tudo. Não achei número confiável em celular Android.

**Tradução.**
- TranslateGemma (01/2026, 55 idiomas, relatório técnico arXiv 2601.09012) **[C]**: o 4B reduz o erro
  MetricX em 23,6% sobre o Gemma 3 4B. Existe demo em WebGPU do `webml-community` **[C]**, que pede
  "VRAM suficiente". Não achei comparação direta com opus-mt, Bergamot ou o tradutor do Chrome em
  português.
- NLLB-200 destilado: licença CC-BY-NC, **não pode em produto pago** **[C]**. MADLAD-400: perde do
  NLLB em estudo de bielorrusso **[R]**.
- Bergamot (Mozilla): pt↔en está no nível de produção; a Mozilla publica COMET por par comparando com
  Google e opus-mt no repositório `firefox-translations-models` **[C]**; não consegui abrir a tabela.
  Um falante relata que a saída vem em português do Brasil **[R]** (bom para nós).
- **[I]** Ordem sensata no Grátis: tradutor do navegador (Chrome/Edge, computador) → Bergamot (31 MB
  no par pt→en, já integrado) → opus-mt. TranslateGemma 4B só como opção "Tradução avançada no
  aparelho" para computador com placa de 8 GB ou mais, depois de medir; download na casa de GB.

**Custo de download e bateria.** Não achei medição pública de consumo em celular para esses modelos.
É item de medição própria (seção "O que medir").

---

## 4. Nuvem de custo zero de verdade

| Serviço | Limite grátis vigente | Treina com os dados? | Menores / consumo | Veredito |
|---|---|---|---|---|
| **Groq** | Whisper v3 e turbo: 20 pedidos/min, 2.000/dia, 7.200 s de áudio/hora, 28.800 s/dia; gpt-oss-120b/20b: 30/min, 1.000/dia, 8 mil tokens/min, 200 mil/dia **[C]** (doc de limites, lida hoje; a página fala em "plano Developer" na base, conferir no console) | Não: contrato proíbe treinar com entradas e saídas; retenção só o necessário; há modo retenção zero **[C]** (Services Agreement, modificado em 22/06/2026) | Cliente tem que ter 18+; serviço "não é para uso de consumidor"; se o nosso app é acessado por menores, a responsabilidade é só nossa (6.3). Proíbe uso "com intenção de evitar tarifas" **[C]** | Serve como camada do NOSSO servidor em piloto. Não serve como amostra aberta |
| **Cloudflare Workers AI** | 10.000 neurônios/dia por conta, zera 00:00 UTC, **falha ao estourar** (não cobra) **[C]**. Whisper turbo 46,63 neurônios/min ≈ 214 min/dia; MeloTTS 18,63/min **[R]** (cópias da doc; página atualizada em 24/08/2026, conferir) | Não achei cláusula lida hoje | Não li termos de menores | Único candidato a "amostra" com teto duro. Já é fornecedor nosso |
| **Google AI Studio / Gemini** | Sem número fixo publicado; guias divergem (de ~20 a 1.500 pedidos/dia) **[R]** | **Sim** no grátis, com revisão humana **[C]** (termos arquivados; resumos de 2026 dizem que continua) | 18+ segundo resumo de terceiros **[R]** | **Não usar** com dado de usuário |
| **OpenRouter `:free`** | 20/min; 50/dia, ou 1.000/dia com US$ 10 já comprados **[C]** (blog do OpenRouter) | Depende do provedor por trás; vários treinam | n/a | Só para teste interno sem dado de usuário |
| **Mistral (plano Experiment)** | Grátis com telefone verificado; limites divergem **[R]** | **Pode treinar** **[C]** (central de ajuda) | n/a | Não usar com dado de usuário |
| **Cerebras** | Fontes de 08 e 09/2026: sem camada grátis permanente, US$ 5 de crédito por 30 dias com cartão. Fontes mais antigas: 1 M tokens/dia **[R]** (contradição) | Não achei | n/a | Não contar com ela |
| **Hugging Face Inference** | Não pesquisei a fundo | | | Não recomendo: cota pequena e variável **[I]** |

**Dá para oferecer amostra diária por usuário sem pagar?** A conta:
- Groq: o limite é da organização, não do usuário. Legenda ao vivo corta a fala em 10 a 15 trechos
  por minuto; 20 pedidos por minuto cobrem **uma** pessoa e meia ao mesmo tempo **[I]**. Há relato de
  cobrança mínima de 10 s por pedido **[R]**, o que faz trecho curto gastar a cota de segundos mais
  depressa. Para intérprete frente a frente (um trecho a cada 5 a 10 s) cabem 2 a 3 conversas
  simultâneas. Não é base para produto aberto.
- Cloudflare: ~214 minutos por dia para todos. Com 10 minutos por pessoa, ~21 pessoas por dia.
  Quando acaba, o pedido falha e o app cai para o local sem custo. É o desenho mais seguro.

**Riscos.**
1. Estabilidade: camada grátis muda sem aviso (a da Cerebras encolheu em 2026; a do Gemini mudou
   várias vezes) **[R]**.
2. Termos: usar camada grátis para atender usuário final em produção encosta na cláusula da Groq de
   "evitar tarifas". Leitura minha, não parecer jurídico **[I]**.
3. Menores: a Groq joga a responsabilidade para nós; o Gemini grátis é incompatível. Perfil infantil
   nunca vai a nuvem de terceiros sem contrato pago e retenção zero **[I]**.
4. Expectativa: o estudo anterior já mostrou que a amostra de nuvem come o ganho no cenário
   conservador.

**Recomendação.** Grátis 100% no aparelho como regra. Amostra de nuvem só como recompensa opcional,
sobre a Cloudflare, com teto diário global, contador visível ("amostras de hoje: esgotadas") e queda
automática para o local. Groq fica como camada do servidor para pagantes no piloto, e sai da camada
grátis antes de divulgar o app.

---

## 5. Voz (TTS) grátis de qualidade

| Motor | pt-BR | Tamanho | Velocidade | Licença | Observações |
|---|---|---|---|---|---|
| Vozes do sistema (`speechSynthesis`) | Sim, varia | 0 | imediata | n/a | "Natural" do Edge são boas; Android e Chrome comuns são fracas; no Quest os relatos dizem que não há voz (relatos antigos) |
| **Kokoro 82M** (`kokoro-js`) | Sim: 3 vozes (pf_dora, pm_alex, pm_santa) **[C]** | 86 MB (q8f16) a 326 MB (fp32) **[R]** | 1,5 a 2× tempo real em WebGPU num M4 **[R]**; README recomenda fp32 no WebGPU e q8 no WASM **[C]** | Apache-2.0 | Não funciona no Firefox segundo um projeto **[R]**. Não achei nota de qualidade das vozes pt |
| **Supertonic 3** | Sim (31 idiomas) **[R]** (espelhos do HF) | ~99 M de parâmetros; MB não achei | Muito rápido em CPU segundo o fabricante **[R]** | Pesos em **OpenRAIL-M** (restrições de uso: sem imitação de pessoa, sem esconder que é sintético); código MIT. Um blog diz "MIT": contradição | Conferir a licença no repositório oficial antes de usar em produto pago |
| **Piper** (pt_BR faber, medium) | Sim, 1 voz masculina | ~60 a 75 MB **[R]** | 3 a 5× tempo real em WASM/CPU **[R]** | MIT, mas o fonemizador espeak-ng é GPL | Qualidade "boa, robótica"; sem marcação de tempo por palavra |
| KittenTTS 0.8 | **Não** (só inglês) **[R]** | 24 a 78 MB | rápido em CPU | Apache-2.0 | Só para voz em inglês em aparelho fraco |

**Proposta [I].**
- Computador com Edge: voz do sistema ("Natural"). Computador com Chrome/Firefox e GPU: Kokoro como
  "voz melhorada no aparelho" (download opcional, avisado). Sem GPU: voz do sistema.
- Celular: voz do sistema. Kokoro em celular não tem medição pública; não ligar sem medir.
- Quest: primeiro repetir o diagnóstico (Chromium 146+ pode ter trazido vozes). Se continuar sem voz:
  Piper em WASM (menor e roda em CPU) como voz grátis; voz neural da nuvem para quem paga.
- Voz em inglês para estudo (o caso mais comum: ouvir a frase em inglês): Kokoro tem as melhores
  vozes justamente em inglês, e KittenTTS serve de reserva leve.

---

## 6. Roteamento

### 6.1 Como outros decidem

- Patentes de voz híbrida **[C]**: um cálculo de confiança local decide se o pedido fica no aparelho
  ou sobe; outra família roda os dois em paralelo e arbitra por confiança, latência tolerada, custo,
  segurança e rede.
- Gravador do Pixel **[C]**: transcreve no aparelho; a nuvem só entra quando o usuário aperta
  "Transcrever de novo". É "local primeiro, nuvem refina, por decisão do usuário".
- Bibliotecas (Cactus) e protótipos **[R]**: Whisper local, manda à nuvem o trecho de baixa confiança.
- Ressalva da seção 1.7: confiança do Whisper é sinal fraco para alucinação. Serve melhor como
  tendência da sessão (média móvel) do que como gatilho por frase.

### 6.2 Sinais, em ordem de confiabilidade [I]

1. **Fator de tempo real medido** do último trecho e a média móvel (tempo de decodificação ÷ duração
   do áudio). É o sinal mais honesto e já existe.
2. **Sonda do primeiro uso** (pontuação WASM × WebGPU, adaptador real). Já existe.
3. **Idioma × tabela de qualidade** própria (erro medido por modelo e idioma na nossa bancada). Hoje
   está espalhada em comentários do código; merece virar uma tabela única que o roteador lê.
4. **Memória e plataforma** (iOS com teto por aba; Quest dividindo a memória com o sistema).
5. **Rede** (`navigator.onLine`, `connection.saveData`, tempo da última ida à nuvem).
6. **Bateria/temperatura**: `getBattery()` só existe em Chromium e não há API de temperatura. O
   substituto é a queda do fator de tempo real ao longo da sessão (sinal 1).
7. **Confiança do modelo e razão de compressão**: só como média da sessão.
8. **Comportamento do usuário**: correções manuais, toques em "repetir", troca manual de motor.

### 6.3 Medir qualidade em produção sem gabarito [I]

Guardar só no aparelho, e enviar agregado apenas com consentimento:
- fator de tempo real por trecho; atraso entre o fim da fala e o texto final;
- parcela de trechos barrados pelo filtro de alucinação;
- log-prob médio e razão de compressão por sessão;
- correções manuais por 100 palavras; toques em "repetir"/"não entendi";
- concordância entre dois motores numa amostra: onde o usuário tem nuvem, rodar o local em paralelo
  em 1 de cada 20 trechos e medir a diferença de palavras. Dá um "erro relativo ao turbo" contínuo,
  por aparelho e idioma, sem gabarito e quase sem custo.

### 6.4 Árvore de decisão proposta

Ordem geral: **aparelho → navegador → nossa nuvem**. "Acompanha" significa fator de tempo real medido
≤ 0,5 na média móvel. "Preciso local" hoje é whisper-small (GPU) ou base; vira Parakeet se a medição
confirmar.

**Transcrever**

| Aparelho | Grátis | Essencial (5 h de nuvem) | Premium (20 h) | Ao Vivo (parcial pela nuvem) |
|---|---|---|---|---|
| Computador com GPU, inglês | Moonshine (v2 se disponível). Etiqueta "No aparelho" | Igual ao Grátis. **Não gastar nuvem**: a diferença é de 1 a 2 palavras em 100 | Igual; botão "Refinar na nuvem" por trecho | Igual; nuvem só se o usuário pedir |
| Computador com GPU, português e outros | Preciso local. Parcial: fala do navegador se `processLocally` existir para o idioma; senão concordância local | Local; nuvem quando a média de confiança da sessão cair ou o usuário pedir | Nuvem primeiro, local de reserva | Streaming da nuvem |
| Computador sem GPU, inglês | Moonshine em CPU | Igual | Igual; nuvem se não acompanhar | Streaming da nuvem se não acompanhar |
| Computador sem GPU, português | Whisper base (Parakeet int8 se medir bem). Se não acompanha: fala do navegador com etiqueta "Pelo navegador (sai do aparelho)" e escolha do usuário | Nuvem dentro da cota | Nuvem primeiro | Streaming da nuvem |
| Android forte | Inglês: Moonshine tiny/base. Outros: base q8. Se não acompanha: fala do navegador, etiquetada | Nuvem dentro da cota | Nuvem primeiro | Streaming da nuvem |
| Android fraco e iPhone | Inglês: Moonshine tiny. Outros: fala do navegador, etiquetada; sem ela, base q8 com aviso de atraso | Nuvem dentro da cota | Nuvem primeiro | Streaming da nuvem |
| Quest 3 | Inglês: Moonshine tiny (medido, acompanha). Outros: base q8 com fim de fala em 500 ms e aviso; amostra de nuvem diária | Nuvem dentro da cota | Nuvem primeiro | Streaming da nuvem |

Porquês:
- **Inglês não vai à nuvem por padrão, nem para quem paga**, quando o aparelho acompanha. A nuvem
  acrescenta pouco e gasta a cota que faz falta em português. Muda o achado atual ("todo pagante vai à
  nuvem primeiro").
- **Fala do navegador entra depois do modelo local** porque no modo padrão o áudio sai do aparelho
  para um terceiro com quem não temos contrato. Entra antes quando é `processLocally`.
- **Perfil infantil**: nunca "Pelo navegador (sai do aparelho)" nem nuvem de terceiros. Só local.
- **Essencial**: nuvem como reforço sob demanda (5 h acabam rápido se for padrão).

**Traduzir**

| Aparelho | Grátis | Essencial | Premium / Ao Vivo |
|---|---|---|---|
| Computador Chrome/Edge | Tradutor do navegador → Bergamot → opus-mt | Igual; LLM da nuvem em "explicar" e sob pedido | LLM da nuvem por padrão; local na queda de rede |
| Computador Firefox/Safari | Bergamot → opus-mt | Idem | Idem |
| Celular e Quest | Bergamot (31 MB) → opus-mt | Nuvem dentro da cota | Nuvem |

Porquê: tradução por LLM custa centavos por hora (estudo anterior), então para quem paga compensa
sempre. No Grátis, o tradutor do navegador é o melhor custo zero no computador; no celular não existe.

**Falar (voz)**

| Aparelho | Grátis | Essencial | Premium | Ao Vivo |
|---|---|---|---|---|
| Computador | Voz do sistema; Kokoro opcional com GPU | Igual | Voz neural básica da nuvem | Voz neural boa |
| Celular | Voz do sistema | Igual | Nuvem | Nuvem |
| Quest | Voz do sistema se existir; senão Piper local | Igual | Nuvem | Nuvem |

**Nuance** (explicação por LLM): não há via local aceitável em português (Gemini Nano não fala pt;
modelos de 0,5 a 2 B erram registro e gíria) **[I]**. Grátis: sem Nuance, ou poucas por dia como
recompensa, pela nuvem, com etiqueta. Essencial em diante: nuvem.

**O que o usuário vê.** Um selo na captura com o motor em palavras ("No aparelho · Moonshine",
"Pelo navegador · Google", "Nuvem do Babel"), que ao toque explica em duas linhas e oferece trocar.
Quando o roteador muda sozinho (queda de rede, aparelho não acompanha), um aviso curto e não bloqueante
diz o que mudou e por quê. Nunca trocar de "No aparelho" para algo que sai do aparelho sem o usuário
ter aceitado isso antes.

---

## 7. Transparência e confiança

**O que as fontes dizem.**
- Estudo CHI 2025 (KAIST, 30 participantes, app de detecção de golpe por voz no aparelho) **[C]**:
  mesmo com processamento local, parte dos participantes descreveu a sensação de "estar sendo
  grampeado". Dizer "é local" não gera, sozinho, sensação de segurança.
- Índice de confiança digital Thales 2024 **[R]**: a expectativa mais citada (55%) é ser informado
  sobre a coleta.
- Não achei experimento controlado comparando etiquetas "processado no aparelho" × sem etiqueta.
- Exemplos de produto: o Gravador do Pixel separa o que é local da ação "transcrever de novo na
  nuvem", que é escolha do usuário **[C]**. As APIs do Chrome obrigam a mostrar progresso de download
  do modelo e pedem permissão para baixar pacote de idioma fora do Wi-Fi **[C]**.

**ECA Digital e LGPD.**
- Lei 15.211/2025 em vigor desde 17/03/2026; Decreto 12.880/2026 regulamenta **[C]/[R]** (Agência
  Gov, Mattos Filho). O decreto exige o modelo **mais protetivo por padrão** e informação clara quando
  houver opção menos restritiva. A ANPD lista "configuração mais protetiva por padrão" entre os
  critérios de fiscalização **[C]** (nota da ANPD).
- Fiscalização efetiva prevista para 2027 **[R]** (Agência Brasil, 03/2026).
- A ANPD considera técnicas que analisam voz especialmente arriscadas na consulta de biometria e
  pretende concluir a regra em 2026 **[R]**. Nós não identificamos pessoas pela voz, mas temos no
  código um modelo de voz de falante (`wespeaker`): **conferir com jurídico se o uso dele (separar
  falantes) se enquadra como biometria** **[I]**.
- Autodeclaração de idade não é considerada confiável pela orientação preliminar da ANPD **[R]**.
- Não achei regra específica do ECA Digital sobre transferência internacional; vale a LGPD.

**Proposta prática [I].**
1. Três estados, com nome fixo e cor/ícone próprios, visíveis durante a captura, e a mesma linguagem
   na tela de planos e na política de privacidade.
2. Primeira vez que algo sai do aparelho: tela curta com o que sai (áudio da fala), para quem (nome
   da empresa), se é guardado e por quanto tempo, e como desligar. Consentimento separado para "pelo
   navegador" e para "nuvem do Babel", porque são responsáveis diferentes.
3. Prova, não só promessa: um item "Testar sem internet" que mostra a legenda funcionando em modo
   avião no caminho local.
4. Perfil infantil e Quest de menor: travado em "No aparelho"; a opção de nuvem nem aparece.
5. Honestidade sobre qualidade: dizer o erro esperado em palavras simples ("neste aparelho, em
   português, espere 1 erro a cada 8 palavras; na nuvem, 1 a cada 20"), usando a nossa tabela medida.
6. Registro local do que saiu do aparelho na sessão ("hoje: 12 min pela nuvem do Babel"), consultável.

---

## Lista de ações, por ganho ÷ esforço

| # | Ação | Ganho esperado | Esforço | Confiança | Aplica já ou mede antes |
|---|---|---|---|---|---|
| 1 | Medir Parakeet TDT v3 int8 (WASM) e fp16 (WebGPU) em pt/es/fr/de na nossa bancada; se confirmar, vira o "preciso local" fora do inglês | Erro em pt de ~14–18% (base) ou ~8% (small) para ~5%; passa a servir notebook sem GPU | Médio (motor novo, janela deslizante) | Média: número nativo é sólido, navegador não foi medido | **Mede antes** |
| 2 | Conferir a rota `hybrid-fp16` contra a issue #1590 (encoder fp16 no WebGPU da v4) | Evita perda silenciosa de qualidade em celular/Quest com GPU | Baixo (rodar a bancada em dois dtypes) | Alta de que o risco existe; desconhecido se nos atinge | **Mede antes**, hoje |
| 3 | Inglês de pagante não vai à nuvem quando o aparelho acompanha | Economiza a maior parte da cota de nuvem sem perda perceptível; Premium rende mais em português | Baixo (regra do roteador) | Alta | **Aplica já** (decisão do dono) |
| 4 | Verificar e adotar Moonshine v2 streaming (en; depois es, de) | Erro en de ~10% para ~7,8% (small) com texto durante a fala nativo | Baixo a médio, depende de haver ONNX compatível | Média | Verificar disponibilidade, depois medir |
| 5 | Sonda de `processLocally` para pt-BR/en/es no Chrome real + `phrases` com o vocabulário do usuário | Texto parcial no aparelho sem custo onde existir; nomes próprios melhores | Baixo | Baixa para pt-BR (lista de idiomas não publicada) | **Mede antes** (5 minutos por navegador) |
| 6 | Selo de três estados + consentimento separado + trava do perfil infantil | Confiança, ECA Digital | Médio (interface) | Alta | **Aplica já** |
| 7 | Correção determinística de vocabulário do usuário e nomes do conteúdo após o reconhecimento | Corrige o erro que o usuário mais nota, sem inventar | Baixo a médio | Média | Aplica com limiar conservador, mede taxa de troca errada |
| 8 | Tabela única de qualidade (modelo × idioma × aparelho) lida pelo roteador e mostrada ao usuário | Roteamento explicável; transparência de qualidade | Baixo | Alta | **Aplica já** com os números que temos |
| 9 | Amostragem de concordância local × nuvem (1 em 20 trechos de quem tem nuvem) | Mede qualidade em produção sem gabarito, por aparelho e idioma | Médio | Média | Aplica depois do item 8 |
| 10 | Amostra de nuvem do Grátis só como recompensa, sobre Cloudflare, com teto global diário | Gancho de conversão sem risco de conta | Médio | Média (limites em [R], conferir) | Conferir limites e termos, depois aplicar |
| 11 | Repetir a página de diagnóstico no Quest (navegador agora em Chromium 146+) | Pode destravar voz/fala nativas no Quest | Baixo | Baixa | **Mede antes** |
| 12 | Voz: Kokoro opcional no computador com GPU; Piper como reserva onde não há voz do sistema | Voz melhor no Grátis de quem usa Chrome/Firefox; voz no Quest | Médio | Média | Mede velocidade e qualidade pt |
| 13 | Redecodificar trecho suspeito de alucinação e ampliar a lista de frases típicas por idioma | Menos frases inventadas em silêncio/música | Baixo | Média | Aplica, mede taxa de barrados |
| 14 | Subir transformers.js para 4.3 (WebGPU no Safari 26) e medir iPhone | Possível GPU no iPhone | Baixo + medição | Baixa | **Mede antes** |
| 15 | Silero v6.2 (32 ms) no lugar do v5 | Pequeno, em casos de borda | Baixo, se o pacote permitir trocar o modelo | Baixa | Mede no nosso áudio |

**Não fazer:** pós-correção da legenda por LLM pequeno no aparelho; Gemini Nano para português;
Gemini grátis, Mistral Experiment e OpenRouter `:free` com dado de usuário; NLLB (licença não
comercial); WebNN; `initial_prompt` manual no Whisper (muito trabalho, ganho incerto).

---

## O que medir (testes mínimos, custo zero ou centavos)

1. **Parakeet × Whisper em português (item 1).** Áudio: as mesmas 100 falas FLEURS pt da bancada
   mais 30 trechos reais de 20 a 40 s (vídeo, podcast, conversa com ruído), em pt-BR, com gabarito
   feito à mão (2 horas de trabalho). Métrica: erro de palavras com a nossa normalização, intervalo
   de confiança por bootstrap (já temos `src/core/eval`), fator de tempo real, pico de memória,
   tempo de primeira carga. Motores: whisper base e small (hybrid), Parakeet int8 WASM, Parakeet fp16
   WebGPU. Máquinas: a do dono e um notebook sem GPU. Custo: zero.
2. **fp16 × fp32 no encoder (item 2).** Mesmas 100 falas, whisper base, `hybrid` × `hybrid-fp16`, no
   WebGPU do computador e de um celular. Critério: diferença dentro do intervalo de confiança. Zero.
3. **Fala do navegador (item 5).** Em Chrome estável, Edge estável e Edge Dev: chamar
   `SpeechRecognition.available()` para pt-BR, pt-PT, en-US, es-ES, fr-FR, de-DE com
   `processLocally: true`; anotar a resposta e a lista em `chrome://components` (SODA). Depois, as
   mesmas 130 falas tocadas por `start(track)` nos modos local e padrão. É a medição que não existe
   publicamente. Zero.
4. **Moonshine v2 (item 4).** 100 falas FLEURS en + 30 reais; base atual × small streaming; erro,
   atraso até a primeira palavra, fator de tempo real em computador sem GPU, Android e Quest. Zero.
5. **Tradução.** 150 frases curtas de conversa (50 formais, 50 informais com gíria, 50 com nome
   próprio), en→pt e pt→en; tradutor do Chrome, Bergamot, opus-mt, e um LLM da nuvem como
   referência. Métrica: chrF e nota cega 1 a 5 do dono em 60 frases. Custo: centavos (referência).
6. **Sessão longa.** 30 minutos de áudio contínuo por motor em Android, iPhone (Safari 26 com
   transformers.js 4.3) e Quest: fator de tempo real a cada 5 minutos, memória, se a aba cai, queda
   de bateria em %. Zero.
7. **Voz.** 20 frases em pt-BR e 20 em en: voz do sistema × Kokoro × Piper; tempo até o primeiro som,
   fator de tempo real, nota cega do dono. No Quest: `speechSynthesis.getVoices()` depois do evento
   `voiceschanged`. Zero.
8. **Cloudflare.** Uma chamada de 60 s de áudio no Workers AI para ler o consumo real de neurônios no
   painel; conferir a página de preços atual e os termos sobre dados. Zero (dentro da cota grátis; é
   decisão do dono rodar, não rodei).
9. **Correção de vocabulário (item 7).** Nas 130 falas, contar trocas certas e trocas erradas com o
   vocabulário de teste; só liga se trocas erradas < 1 em 20.

---

## Incertezas principais

1. **Parakeet no navegador em português**: toda a evidência de qualidade é nativa; os relatos de
   navegador têm ressalvas sérias (int8 errado no WebGPU). Pode não se confirmar.
2. **Idiomas da fala no aparelho do Chrome**: não achei lista. Pode ser só inglês.
3. **Datas das páginas do Chrome**: o resumidor leu datas inconsistentes; o estado "Prompt API na web"
   (teste de origem × estável) ficou ambíguo. Conferir em chromestatus.com antes de depender disso.
4. **Limites grátis** (Groq, Cloudflare): lidos hoje, mas mudam sem aviso; os da Cloudflare vieram de
   cópias da documentação.
5. **Quest**: os relatos de falta de fala e voz são de navegador antigo; o estado em Chromium 146+ é
   desconhecido.
6. **Opinião recente de fórum**: cobertura fraca (a `last30days` não foi usada).
7. **Enquadramento jurídico** do modelo de falante como biometria e do uso de camada grátis em
   produção: são leituras minhas, pedem advogado.

---

## Fontes

Modelos de fala
- Moonshine, tabela de modelos: https://moonshine-voice.readthedocs.io/en/latest/models/available-models/ (lida em 09/10/2026)
- Moonshine v2, artigo: https://arxiv.org/abs/2602.12241 (12/02/2026)
- Moonshine JS: https://dev.moonshine.ai/moonshine-js/
- Canary-1B-v2 e Parakeet-TDT-0.6B-v3, artigo: https://arxiv.org/pdf/2509.14128 (09/2025)
- Benchmark por idioma (pt), Handy: https://models.handy.computer/languages/pt (2026, sem data)
- Parakeet v3 ONNX para WebGPU: https://huggingface.co/striimit/parakeet-tdt-0.6b-v3-webgpu
- Parakeet v3 int8 ONNX: https://huggingface.co/CoderViking/parakeet-tdt-0.6b-v3-onnx
- parakeet_web: https://github.com/thiswillbeyourgithub/parakeet_web
- Nemotron 3.5 streaming ONNX int4: https://huggingface.co/onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4
- Voxtral Mini 4B Realtime: https://huggingface.co/mistralai/voxtral-mini-4b-realtime-2602
- Open ASR Leaderboard, trilhas multilíngue: https://huggingface.co/blog/open-asr-leaderboard

Quantização, streaming, alucinação
- Quantizing Whisper-small: https://arxiv.org/pdf/2511.08093 (11/2025)
- Quantization for Whisper, análise comparativa: https://arxiv.org/abs/2503.09905 (03/2025)
- transformers.js #1590 (fp16 no WebGPU): https://github.com/huggingface/transformers.js/issues/1590 (03/2026)
- transformers.js, versões: https://github.com/huggingface/transformers.js/releases
- Whisper em tempo real (LocalAgreement): https://arxiv.org/abs/2307.14743
- Detecção de alucinação do Whisper: https://arxiv.org/pdf/2606.23060 (06/2026)
- Silero v6.2, post do mantenedor: https://habr.com/en/articles/940750
- TEN VAD: https://github.com/TEN-framework/ten-vad

Navegadores
- Chrome, APIs embutidas: https://developer.chrome.com/docs/ai/built-in-apis
- Chrome, requisitos: https://developer.chrome.com/docs/ai/get-started
- Chrome, Translator: https://developer.chrome.com/docs/ai/translator-api
- Chrome, Prompt API: https://developer.chrome.com/docs/ai/prompt-api (atualizada em 26/08/2026)
- Chrome, Proofreader: https://developer.chrome.com/docs/ai/proofreader-api
- Chrome 139, fala no aparelho: https://developer.chrome.com/blog/new-in-chrome-139 (05/08/2025)
- Intent to Ship, fala no aparelho: https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM (01/2025)
- Equipe do Chrome sobre Android: https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/HKIndTczlPM (07/12/2025)
- TAG, qualidade do reconhecimento no aparelho: https://tag-github-bot.w3.org/gh/w3ctag/design-reviews/1189 (02 a 05/2026)
- MDN, `start()`: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start
- MDN, `phrases`: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/phrases
- MDN, `processLocally`: https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally
- Edge, IA no aparelho: https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/ (02/06/2026)
- Edge, SpeechRecognition local: https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api (01/06/2026, atualizada em 06/10/2026)
- WebGPU, estado das implementações: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status (28/05/2026)
- WebNN, teste de origem: https://www.phoronix.com/news/Chrome-146-Beta (11/02/2026)
- Firefox, SpeechRecognition: https://bugzilla.mozilla.org/show_bug.cgi?id=2069324
- WebKit, queda do WebGPU no iOS 26: https://bugs.webkit.org/show_bug.cgi?id=302711
- SpeechAnalyzer sem ponte web: https://blog.addpipe.com/apple-speechanalyzer-api/
- Quest, notas de versão: https://developers.meta.com/horizon/documentation/web/browser-release-notes/
- Quest, fala e voz (relato): https://communityforums.atmeta.com/discussions/dev-quest/meta-quest-browser-stt-and-tts-support-/1189761

Tradução e LLM local
- TranslateGemma, relatório: https://arxiv.org/abs/2601.09012 (01/2026)
- TranslateGemma WebGPU: https://huggingface.co/spaces/webml-community/TranslateGemma-WebGPU
- Modelos do Firefox Translations: https://github.com/mozilla/firefox-translations-models
- NLLB-200 destilado (licença): https://huggingface.co/facebook/nllb-200-distilled-600M
- Correção de ASR por LLM: https://arxiv.org/abs/2307.04172 ; https://arxiv.org/pdf/2506.16528 ; https://arxiv.org/html/2505.24347v3 ; https://www.alphaxiv.org/abs/2605.19711 ; https://publications.idiap.ch/attachments/papers/2024/Naderi_INTERSPEECH_2024.pdf

Nuvem grátis
- Groq, limites: https://console.groq.com/docs/rate-limits (lida em 09/10/2026)
- Groq, contrato: https://console.groq.com/docs/legal/services-agreement (modificado em 22/06/2026)
- Cloudflare Workers AI, preços: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Gemini API, termos e registro de dados: https://ai.google.dev/gemini-api/docs/logs-policy ; https://ai.google.dev/gemini-api/terms-archive/terms_05_02_24
- OpenRouter, limites grátis: https://openrouter.ai/blog/tutorials/free-llm-apis-compared/
- Mistral, plano Experiment: https://help.mistral.ai/en/articles/455206-how-can-i-try-the-api-for-free-with-the-experiment-plan
- Cerebras (terceiros, contraditórios): https://costbench.com/software/llm-api-providers/cerebras-inference/free-plan/

Voz
- kokoro-js: https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/README.md
- Kokoro: https://github.com/hexgrad/kokoro
- Supertonic 3 (espelho): https://huggingface.co/davidgortega/supertonic-3
- Piper no navegador: https://offlinetts.com/tts/piper/
- KittenTTS: https://huggingface.co/litert-community/kitten-tts-nano-0.8

Roteamento, experiência e lei
- Gravador do Pixel, "Transcrever de novo": https://www.androidheadlines.com/2023/12/pixel-recorder-cloud-transcribe-again.html
- Patente de comando de voz híbrido: https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11763814
- Estudo CHI 2025 (KAIST): https://nmsl.kaist.ac.kr/pdf/CHIEA25_VP.pdf
- ECA Digital, Agência Gov: https://agenciagov.ebc.com.br/noticias/202608/eca-digital-conheca-as-regras-de-protecao-de-criancas-e-adolescentes-no-ambiente-online (08/2026)
- ECA Digital, ANPD: https://www.gov.br/anpd/pt-br/assuntos/noticias/eca-digital-completa-um-ano-e-e-marco-na-protecao-de-criancas-e-adolescentes-na-internet
- Decreto 12.880/2026, resumo: https://www.mattosfilho.com.br/en/unico/online-protections-minors-regulated/
- Cronograma de fiscalização: https://agenciabrasil.ebc.com.br/direitos-humanos/noticia/2026-03/cronograma-preve-fiscalizacao-efetiva-do-eca-digital-pela-anpd-em-2027 (03/2026)
- ANPD, verificação de idade: https://convergenciadigital.com.br/governo/anpd-define-primeiras-orientacoes-sobre-verificacao-de-idade-em-plataformas-digitais/
