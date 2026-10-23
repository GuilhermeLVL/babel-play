# Infra e UI de modelos locais (Frasy) - pesquisa de 23/10/2026

Legenda: [V] verificado em fonte nesta sessão; [C] conhecimento prévio, NÃO reconfirmado agora.

## 1. Detecção de capacidade e tiering

- hardwareConcurrency [C]: disponível em todos; valor pode ser limitado/arredondado (Safari fixa baixo). Serve só como sinal grosso.
- deviceMemory [C]: só Chromium, valores arredondados (máx. 8). Safari/Firefox não têm. Tratar ausência como "desconhecido", não "fraco".
- WebGPU [C]: requestAdapter(); checar adapter.features ('shader-f16'), limits (maxBufferSize, maxStorageBufferBindingSize), adapter.info (vendor/architecture; granularidade reduzida por privacidade). Sem WebGPU -> WASM (SIMD + threads exige cross-origin isolation: COOP/COEP).
- Battery API [C]: só Chromium, não padrão; usar como sinal opcional (não confiável em Safari/Firefox).
- navigator.connection [C]: Chromium apenas; saveData e effectiveType úteis para "baixar só no Wi-Fi" (fallback: perguntar ao usuário).
- Compute Pressure [V MDN]: experimental, NÃO Baseline, só contexto seguro, Permissions-Policy "compute-pressure" (default self), disponível em Window e Workers dedicados/shared (não Service Worker). Fontes "cpu" e "thermals"; PressureObserver.knownSources lista o suportado; estados nominal/fair/serious/critical; observe() lança NotSupportedError. Suporte: Chromium desktop (origin trial 115-123 depois liberado) [V parcial]; Firefox/Safari não confirmei -> tratar como progressive enhancement.
- Benchmark curto (recomendado) [opinião]: ao primeiro uso, rodar 3-5 s do modelo tiny/base com áudio sintético e medir fator de tempo real (RTF). Escolher o maior modelo com RTF < ~0,5 sustentado. Cachear resultado por aparelho+versão do navegador; refazer sob demanda ("testar velocidade"). Heurística sem benchmark: WebGPU+f16+buffer>=1GB -> tier alto; WebGPU sem f16 -> médio; só WASM e <=4 núcleos -> baixo (tiny/quantizado q8, ou nuvem).
- Como apps reais fazem [C, não reverificado]: WebLLM/MLC pedem ao usuário escolher o modelo e checam shader-f16 para escolher variante q4f16 vs q4f32; Whisper Web (xenova) deixa escolher modelo manual e avisa de WebGPU; Firefox Translations baixa pacotes Bergamot pequenos (~20-40 MB/par) sem tiering; Chrome Translator/Language Detector APIs gerenciam download no próprio navegador.

## 2. Térmico e energia

- Usar PressureObserver (cpu e, se houver, thermals) com sampleInterval ~1000-2000 ms: serious -> reduzir threads WASM pela metade, aumentar intervalo entre janelas de inferência, desligar tradução parcial/animações; critical -> pausar transcrição local, oferecer nuvem ou "retomar". Histerese de ~10-15 s para não oscilar (a spec já evita flip-flop) [V MDN].
- Sem Compute Pressure: proxy por RTF crescente (inferência ficando mais lenta com o tempo = throttling) e por Battery (charging=false e level<20% -> modo economia) [opinião].
- document.visibilityState === 'hidden' -> pausar ou rebaixar (timers já são limitados pelo navegador) [C].
- Duty-cycle: transcrever em blocos de 5-10 s com VAD (pular silêncio) reduz muito a carga; limitar numThreads do ORT (ort.env.wasm.numThreads = min(4, hardwareConcurrency/2)) [C].
- Modo economia (usuário): modelo menor, sem parciais, tradução só ao fim da frase.

## 3. Distribuição e cache de modelos

- Cache Storage vs OPFS [V Chrome docs via busca]: a equipe do Chrome recomenda Cache API para modelos de IA (docs "Cache models in the browser"); OPFS é mais performático e permite escrita parcial/ por faixa, útil para downloads retomáveis. IndexedDB é pior para blobs grandes. transformers.js usa Cache API por padrão (env.useBrowserCache) [C]; também permite cache customizado (env.customCache) [C].
- Recomendação: manter Cache API (compatível com transformers.js) para modelos prontos; usar OPFS só se implementar download por partes com Range (gravar chunks, reter offset, verificar hash ao final) e depois servir ao runtime via customCache/Blob.
- navigator.storage.persist() / estimate() [C]: persist reduz risco de despejo (Chromium concede por heurística; Firefox pergunta; Safari 17+ aceita em PWA instalada). estimate() dá quota/usage aproximados (impreciso por segurança). Safari: teto de 7 dias sem interação para storage de script (não vale para PWA instalada) [V web.dev, texto antigo; revalidar]. Logo: avisar "pode precisar baixar de novo" no Safari.
- Integridade: publicar manifesto versionado (nome, versão, bytes, SHA-256) no R2; verificar com crypto.subtle.digest em stream/por parte; chaves de cache incluem a versão; apagar versões antigas ao atualizar [opinião].
- Compartilhamento entre abas: Cache/OPFS são por origem, portanto compartilhados; usar Web Locks (navigator.locks) para evitar baixar o mesmo modelo em duas abas e BroadcastChannel para progresso [C].
- Egress: R2 tem egress zero [C, política Cloudflare conhecida], cobra operações (Classe B leituras, barato) e armazenamento. HF Hub: gratuito mas sem SLA, referer/CORS e rate limit; Safari já deu problema (memória do projeto). Manter modelos no R2 com Cache-Control immutable e nomes com versão. Habilitar Range e Content-Length para progresso e retomada.

## 4. UX do gerenciador de modelos

Referências [C, não abertas nesta sessão]: LM Studio (lista com tamanho/quantização, indicador "cabe na sua máquina"), Ollama app, Firefox about:preferences > Translations (lista de idiomas com baixar/remover e tamanho), Chrome (chrome://on-device-internals), MacWhisper/Aiko/Buzz (escolha tiny..large com notas de velocidade/precisão), Google Translate offline (pacotes por idioma, tamanho, "só Wi-Fi", atualizar/apagar).
Padrões a adotar [opinião]:

1. Topo: "Automático (recomendado)" com explicação em 1 frase ("escolhemos o melhor para este aparelho") + botão "Testar velocidade".
2. Avançado recolhido: lista de modelos com 3 selos em linguagem simples (Tamanho: 75 MB; Qualidade: ★★★☆; Velocidade/Esquenta: Rápido/Moderado/Pesado) e status (Baixado / Baixar / Atualizar / Em uso).
3. Barra de espaço: "Modelos usam 420 MB de 2,1 GB livres" via storage.estimate(), botão Apagar por modelo e "Apagar tudo" com confirmação.
4. Download: progresso, pausar/retomar, "Baixar só no Wi-Fi" (padrão ligado; usa connection.type/saveData quando existir, senão confirmar antes de >50 MB), aviso do tamanho antes.
5. Menor de idade/acessibilidade: textos curtos, sem jargão (evitar "quantização", "WebGPU"); alvos >=44 px; rótulos para leitores de tela; progresso com role=progressbar e aria-live educado; não depender só de cor/estrelas; nada de dark patterns para baixar modelo grande; dados do teste de velocidade ficam só no aparelho (retenção zero).

## 5. Híbrido nuvem

Preços [V]:

- Cloudflare Workers AI: 10.000 neurons/dia grátis; excedente US$0,011/1000 neurons (plano Workers Paid). whisper-large-v3-turbo: US$0,0005/min de áudio = 46,63 neurons/min; whisper: 41,14 neurons/min; m2m100-1.2b: US$0,342/M tokens de entrada e de saída (31.050 neurons/M tokens).
  -> cota grátis cobre ~214 min de áudio/dia no total (10.000/46,63), para TODOS os usuários, ou seja, só serve de teste/rede de segurança. Custo marginal: 10 min/dia x 30 dias = 300 min = US$0,15/usuário/mês. Tradução: 10 min de fala ~1.500 palavras ~2.500 tokens x2 ~ US$0,002/dia -> centavos/mês.
- Groq whisper-large-v3-turbo: US$0,04/hora (=US$0,00067/min), mínimo 10 s cobrados por requisição [V via busca; página oficial não confirmada diretamente]. Cuidado: pedidos curtos em streaming ficam caros; enviar blocos de 20-30 s. Termos/retenção para menores NÃO verificados (checar DPA/zero data retention antes).
- Outros (Deepgram, AssemblyAI, OpenAI): não pesquisados; não recomendo sem verificar termos para menores.
  Quando escalar [opinião]: aparelho tier baixo (sem WebGPU, <=4 núcleos, RTF>1 no benchmark), ou thermal critical sustentado, e só até um teto diário pequeno (ex.: 5-10 min/dia) no grátis, com consentimento claro e sem guardar áudio. Estimativa: 5 min/dia = 150 min/mês = ~US$0,075 (CF) ou ~US$0,10 (Groq, sem contar mínimos). Mesmo com 10k usuários ativos grátis só em tier fraco (digamos 30% = 3k) -> ~US$225-300/mês; viável como alavanca de conversão, mas precisa de teto por usuário em src/core/planos.ts.
  Atenção: Workers AI roda em Cloudflare, mesma plataforma do app (facilita DPA único); verificar localização/retenção nos termos.

## Incertezas

- Suporte atual de Compute Pressure em Firefox/Safari/Edge; política de eviction do Safari em 2026 e efeito de persist().
- Itens [C]: não reconfirmados nesta sessão (limites de WebGPU, deviceMemory, Battery, transformers.js cache).
- Termos de retenção/menores de Groq e Workers AI.

## Fontes

- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developer.mozilla.org/en-US/docs/Web/API/Compute_Pressure_API
- https://developer.chrome.com/blog/compute-pressure-origin-trial-2
- https://developer.chrome.com/docs/ai/cache-models
- https://web.dev/i18n/zh/storage-for-the-web/
- https://groq.com/pricing
- https://eesel.ai/blog/groq-pricing
