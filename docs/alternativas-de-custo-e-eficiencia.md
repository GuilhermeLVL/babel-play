# Alternativas para entregar o mesmo com menos custo e mais eficiência

Versão de 17/10/2026. Resultado de uma pesquisa em três frentes (transcrição, tradução, métodos e pipeline) mais medições nossas.
**Convenção:** _[medido]_ saiu de chamada real ou de teste nosso (o método está descrito); _[fonte]_ tem URL no fim; _[hipótese]_ é
inferência. Restrições do projeto que valem em tudo: retenção zero (o app atende menores), nunca Gemini, nada de modelo gratuito que
treina com dados (`.claude/skills/custo-de-ia`).

## 1. A conclusão honesta: o custo de nuvem já está perto do piso

Uma hora de legenda na nuvem custa hoje US$ 0,028 a 0,058 (transcrição ~US$ 0,012–0,04/h + tradução ~US$ 0,015/h), e com 8% de
pagantes a base de 1.000 usuários gasta US$ 63 a 99 por mês (`npm run ia:custo`). Trocar de fornecedor não muda esse número de forma
relevante: o Whisper turbo já está no menor preço confirmado (DeepInfra, US$ 0,012/h) e os LLMs já custam ~US$ 0,01–0,02 por hora de
legenda, uns 100× menos que as APIs de tradução dedicadas. **O ganho que sobra está em chamar IA menos vezes, em baixar menos e em
traduzir mais rápido no aparelho**, e não em achar um provedor mais barato.

## 2. O que a pesquisa achou, e o veredito de cada ideia

### Tradução no aparelho (o achado de maior impacto)

**Bergamot (Mozilla) no lugar do Opus-MT para traduzir PARA o inglês.** _[medido]_ A/B com 6 frases do dia a dia em 9 idiomas (54
frases; referência em inglês escrita por nós; chrF++ por `sacrebleu`; as duas engines no mesmo Node; Opus-MT q8 com as opções do
worker do app):

| Idioma → inglês | chrF++ Opus-MT | chrF++ Bergamot | Δ        | ms/frase Opus | ms/frase Bergamot |
| --------------- | -------------- | --------------- | -------- | ------------- | ----------------- |
| italiano        | 69,8           | 90,5            | +20,7    | 1.196         | 105               |
| alemão          | 66,3           | 84,5            | +18,2    | 660           | 167               |
| espanhol        | 79,6           | 88,3            | +8,7     | 634           | 114               |
| russo           | 67,7           | 74,7            | +7,0     | 972           | 156               |
| francês         | 72,6           | 78,8            | +6,2     | 832           | 91                |
| árabe           | 71,2           | 76,0            | +4,8     | 157           | 28                |
| coreano         | 60,5           | 64,7            | +4,2     | 136           | 28                |
| chinês          | 69,9           | 71,5            | +1,5     | 142           | 26                |
| japonês         | 66,4           | 66,6            | +0,1     | 131           | 28                |
| **média**       | **69,3**       | **77,3**        | **+7,9** |               |                   |

O Bergamot foi melhor em 28 das 54 frases, o Opus-MT em 10 e houve empate em 16 (margem de 2 pontos). Tamanho: ~32 MB por par (~60 MB
descomprimido em ja/ko/zh, ~25 MB baixados em gzip nos pares latinos) contra ~113 MB do Opus-MT, e 5 a 10× mais rápido. Os números do
registro da Mozilla (COMET e chrF++ em FLORES) vão na mesma direção _[fonte]_. É consistente com a bancada de 29/09 (`docs/auditoria/eval/bancada-2026-09-etapa5.md`:
pt→en, +0,028 COMET, ~10× mais rápido), que só adotou o pt→en porque no **en→pt** o Bergamot escreve português de Portugal.

- **Caveat:** é uma amostra pequena e de frases limpas; o COMET na bancada completa (FLEURS) e o gold de conversa devem repetir isto por par
  antes de trocar (a regra da bancada: troca só se o IC 95% pareado exclui 0 e o gold de conversa não piora).
- **O que muda para o usuário:** no pivô (X→en→pt) o primeiro passo passa a ser o Bergamot. Para os 14 idiomas do pivô o download vai de
  ~226 MB para ~140 MB (o en→pt segue Opus-MT, em português do Brasil) e o primeiro passo fica 5–10× mais rápido; nos pares diretos
  es/fr/de/it→en o download cai ~70%.
- **O que falta:** hospedar os modelos num CDN com CORS (o bucket da Mozilla só libera `localhost`; o R2 do dono ainda não está ativo), estender
  `modelosDoBergamot.json`, o worker e a rota além do pt→en, e rodar a bancada completa. **Recomendado, depende do R2.**
- O Bergamot NÃO tem par direto es→pt nem fr→pt (todos passam pelo inglês _[fonte]_).

Descartados: NLLB-200 600M (~0,9 GB, sem ganho claro), madlad400 e TranslateGemma (pesados, sem build de navegador confirmado), Chrome
Prompt API (suporte incompleto). O Chrome Translator segue como primeira opção quando existe. _[fonte]_

### Tradução na nuvem

Já está no piso: Gemma 4 26B custa ~US$ 0,013–0,02 por 1.000 frases _[medido: 8 frases a US$ 0,00007]_; DeepL, Azure, Amazon e Google
Cloud Translation custam US$ 1,3–3 por 1.000 frases, ~100× mais _[fonte]_. **Google Cloud Translation no modo LLM é Gemini: proibido.**
Ganhos que sobram: traduzir em lote só o que vem à frente (≈ −25–30% _[hipótese]_, a latência impede o uso ao vivo), cache agressivo (já existe
no servidor e no cliente: falta **medir o acerto**) e traduzir sob demanda. Contexto de 2–3 frases triplica os tokens de entrada: só vale
em idiomas com ambiguidade de pronome (ja, zh).

### Transcrição

| Ideia                                                     | Veredito                        | Evidência                                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trocar o Whisper turbo por outro provedor/modelo de nuvem | **Não compensa**                | DeepInfra US$ 0,012/h é o piso; Cloudflare US$ 0,03/h (com 10 mil neurons/dia grátis, ~3,5 h/dia); Groq US$ 0,04/h com mínimo de 10 s por pedido _[fonte; medido: um trecho de 5 s foi faturado 10 s]_ |
| Qwen3-ASR (0,012–0,027/h) para chinês, japonês e coreano  | **Não** como principal          | _[medido]_ acertou ja/ko/zh como o Whisper, mas a primeira chamada levou 30–60 s (5 s quando aquecido) e errou o espanhol (33–53% de erro mesmo com a dica, contra 9% do Whisper)                      |
| Voxtral Mini Transcribe                                   | **Fora**                        | _[medido]_ sem provedor com retenção zero no OpenRouter                                                                                                                                                |
| Voxtral Small/Qwen omni/GPT-audio via chat                | **Fora**                        | _[medido]_ alucinam em silêncio/ruído e/ou não têm retenção zero (ver `docs/estrategia-comercial-e-custos-br.md`)                                                                                      |
| Deepgram, AssemblyAI, Soniox, ElevenLabs                  | **Mais caros**                  | US$ 0,10–0,31/h e retenção zero não confirmada _[fonte]_; Gladia treina com dados por padrão: descartar                                                                                                |
| Whisper turbo local q4f16 (563 MB)                        | Pesado demais para o grátis     | _[fonte]_                                                                                                                                                                                              |
| SenseVoice-Small (~241 MB, zh/ja/ko/en) pelo sherpa-onnx  | **Testar** para o grátis em CJK | _[fonte]_ existe demo WASM; sem CER comparado ao Whisper small                                                                                                                                         |
| Moonshine multilíngue                                     | **Cuidado**                     | _[fonte]_ chinês com 25,8% de erro (fraco); a licença dos não ingleses pode ser não comercial: conferir antes                                                                                          |
| Parakeet v3 (pt, es…) no desktop                          | Já decidido na bancada de 29/09 | pt: 6,6% de erro contra 19% do Whisper base; ~650 MB, só desktop                                                                                                                                       |

A medição de CJK com fala sintética limpa não distingue os modelos (todos 0% de erro): uma comparação séria precisa de fala real (FLEURS, ruído).

**O ganho real na transcrição é chamar a nuvem menos vezes:** o aparelho resolve o que tem confiança e só o resto sobe (sinais do Whisper:
`avg_logprob` < −1,0, `compression_ratio` > 2,4, `no_speech_prob` > 0,6 _[fonte]_). O código já tem a "porta de qualidade" (`transcribePcmNaNuvem`)
e a política de rota (`rota_inteligente`), ambas em modo sombra. Ligá-las é o próximo passo de custo, com amostragem de 1 em N para medir sem pagar tudo.

### Métodos e atalhos de produto

| Ideia                                             | Veredito                     | Observação                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importar legendas (.srt/.vtt/.ass)**            | **Feito (17/10)**            | Texto pronto, no idioma certo, custo zero, lido no navegador (`openspec/changes/importar-legendas`). _[medido]_ um SRT em japonês criou a sessão com 3 falas e idioma detectado                                                                                                          |
| Legendas de plataformas (YouTube, Netflix, Prime) | **Não sem parecer jurídico** | Termos de uso e DRM; a API oficial do YouTube só serve a vídeos do próprio usuário _[fonte secundária]_                                                                                                                                                                                  |
| Dicionário local (CC-CEDICT, JMdict, kaikki)      | Parcial                      | Já há glosa por Wiktionary e dados na trilha; CC BY-SA 3.0/4.0 exige atribuição _[fonte]_                                                                                                                                                                                                |
| FSRS, cloze local, TTS do aparelho                | **Já existe**                | `src/core/minigames`, voz do aparelho                                                                                                                                                                                                                                                    |
| Cache de tradução compartilhado                   | Já existe                    | L1 24 h e L2 30 dias, sem `user_id`; falta medir o acerto (`ia_cache_traducao_total`)                                                                                                                                                                                                    |
| Chinês: normalizar tradicional → simplificado     | **Feito (17/10)**            | _[medido]_ a escrita depende do **provedor** (DeepInfra deu `氣`, Groq deu tudo simplificado; a dica de idioma não muda; um prompt em chinês fez o DeepInfra perder uma frase). Corrigido no app com `chinese-conv` (~0,6 MB, só para chinês, MIT; `openspec/changes/escrita-do-chines`) |

## 3. Prioridades

1. **Bergamot para X→inglês** (impacto: −70% de download, 5–10× mais rápido, +7,9 de chrF++ no teste; depende do R2 e da bancada completa).
2. **Ligar a porta de qualidade e a política de rota** (nuvem só quando o aparelho falha): é a única alavanca que corta de verdade as horas de nuvem.
3. **Medir** o acerto do cache de tradução e a taxa de escalonamento, antes de qualquer outra coisa.
4. SenseVoice-Small para CJK no grátis (testar com fala real); normalização do chinês (aprovar a dependência).
5. Dicionário local para toque em palavra, só se a medição mostrar custo ali.

## 4. O que não sei

Qualidade do Bergamot em frases de legenda reais e em conversa (o gold de conversa da bancada); latência no celular; retenção da DeepInfra e o mínimo
faturado dela (não confirmados); licença exata do Moonshine multilíngue; preço de Fireworks/Together; ranking atual de idiomas no Brasil (só Duolingo global
e um dado de 2021); termos oficiais de YouTube/Netflix/Prime.

## Fontes

Registro de modelos da Mozilla (storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json) e github.com/mozilla/translations;
deepinfra.com/models/automatic-speech-recognition; developers.cloudflare.com/workers-ai/platform/pricing; console.groq.com/docs/speech-to-text;
mistral.ai/news/voxtral-transcribe-2; artificialanalysis.ai/speech-to-text; huggingface.co/onnx-community/whisper-large-v3-turbo; sherpa-onnx (k2-fsa);
openrouter.ai/api/v1/models e /endpoints/zdr; docs.ankiweb.net (FSRS); edrdg.org (JMdict), cc-cedict.org; github.com/openai/whisper (limiares de confiança).
