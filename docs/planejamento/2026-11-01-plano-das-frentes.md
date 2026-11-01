# Plano das frentes (01/11/2026)

Status: rascunho para o dono · Fonte das pesquisas: relatórios de subagentes (licenças e versões NÃO reconferidas pelo controlador, salvo onde marcado) · Produção segue FECHADA, nada vai a remoto sem OK.

## Método (rápido, com resultado visível)

- No máximo **duas frentes ativas**. Cada fatia termina em algo que o dono abre e testa no mesmo dia (demo local ou protótipo).
- Ordem por fatia: protótipo/tela → teste do dono (3–6 perguntas) → só então app atrás de flag.
- Uma revisão independente por fatia (não por tarefa), mais a checagem do controlador (typecheck, lint, testes, captura aberta).
- Reaproveitar código aberto ANTES de escrever; licença conferida no repositório; AGPL/GPL/NC só com parecer jurídico.
- Skills/ferramentas por tipo de trabalho: `superpowers:test-driven-development` (lógica pura), `opsx:propose` (mudança de comportamento), `ui-ux-pro-max` e `design:accessibility-review` (telas), `webapp-testing`/`chrome-devtools-mcp` (captura e desempenho), `custo-de-ia` (qualquer gasto), `copy-br-etica` (texto de plano/preço), `code-review` (fim da fatia).

## O que já existe (descoberta de hoje)

O leitor de livros já tem o narrador completo: tocar/pausar, frase anterior/seguinte, capítulo, velocidade 0,5×–2,5×, temporizador de sono, modos original/tradução/bilíngue/auto, seletor de voz, atalhos (`src/lib/leitor/narrador.ts`, `src/components/views/leitor/BarraDoNarrador.tsx`, `src/core/leitura/narracao.ts`). O "player" do protótipo NÃO deve ser reescrito: a lacuna é a **voz de alta qualidade pré-gerada** e a **biblioteca de áudio**.

## Frentes, escolhas de código aberto e próximos passos

### 1. Audiolivros (frente ativa A)

- **Motor de voz:** candidatos sem espeak-ng (GPL): **Supertonic 3** (código MIT, pesos OpenRAIL-M, ONNX ~398 MB; repo arquivado em 09/09/2026; qualidade pt-BR não ouvida) e **Pocket TTS** (código MIT, pesos CC-BY-4.0; licença das vozes pt/es não confirmada). Kokoro pt/es e Piper dependem de espeak-ng: fora do cliente, só com parecer.
- **Runtime:** sherpa-onnx (Apache-2.0) ou onnxruntime-web/transformers.js. Pendente verificar se o WASM do sherpa linka libespeak-ng.
- **Leitor/sincronia:** foliate-js (MIT, já vendorizado) + sidecar JSON `{i,t0,t1}` por frase (pt/es: destaque por frase). Player: `<audio>` + Media Session + Workbox (cache offline com Range no R2).
- **Lote:** pipeline próprio em Node reaproveitando `scripts/eval-voz` (audiblez/abogen só como referência).
- **Próximo passo:** escuta cega Supertonic × Pocket TTS pt-BR na bancada (Tarefa 11–12 do plano); o dono ouve. Depois, Tarefa 13 (travar limiares).
- **Dono:** consulta jurídica do espeak-ng, 10 livros + ortografia, revisar gabarito.

### 2. Transcrição e tradução ao vivo (frente ativa B)

- **Adotar:** transformers.js (Apache-2.0) como camada única; **Silero VAD** (MIT) para cortar silêncio (ataca "CPU do silêncio"); **LocalAgreement** como função pura em `src/core` para estabilizar parciais (porta da ideia, não do código); Chrome Translator só como atalho opcional (Bergamot continua o caminho garantido); medição WER/latência com jiwer.
- **Evitar:** NLLB (CC-BY-NC), Vosk, MADLAD/Voxtral no aparelho, diarização (biometria, LGPD/menores). Moonshine só inglês, após ler a licença dos modelos.
- **Riscos:** runtime do Bergamot parado desde 2022 (fixar versão); Safari sem áudio de aba e sem Document PiP (fonte secundária: CONFERIR no caniuse/WebKit); licença do parakeet.js e dos pesos Whisper ONNX não verificada.
- **Primeira fatia:** estabilização de parciais (função pura + testes), depois VAD no fluxo.
- **Dono:** medir no Safari com Web Inspector; decidir se "nunca Gemini" cobre o Chrome Translator (modelo do Google).

### 3. Avatares e Libras (frente ativa C, só validação e decisão)

- **Adotar:** `@pixiv/three-vrm-animation` (MIT) para gestos .vrma; `@mediapipe/tasks-vision` (Apache-2.0) para validar poses localmente; MINDS-Libras (CC-BY-4.0, 20 sinais) só para testes, com atribuição.
- **Só referência:** VLibras (repositórios LGPL-3.0): estudar integração e glosa, sem copiar até parecer jurídico.
- **Evitar:** sign.mt (CC BY-NC-SA), Ready Player Me (encerrado), Mixamo empacotado, Hand Talk, datasets sem licença confirmada.
- **Bloqueios do dono:** contato com LAViD/UFPB (avatares, dicionário, menores); ler termos do widget no gov.br; parecer sobre LGPL; revisão por pessoas surdas. A interface deve dizer "demonstração, pode errar".
- **Decisão de design:** escolher a direção do UX lab (A/B/C), hoje provisória em C "Palco" e NÃO verificada pelo controlador.

### 4. Livros e leitura

- PR de Livros (um ou fatiado), classificação etária, fontes de catálogo. Dependem do dono.

### 5. Planos, anúncios e jurídico; 6. Produção e infraestrutura

- Tudo fechado de propósito (`SIGNUP_ENABLED=0`, `CHECKOUT_ENABLED=0`). Cutover de produção, domínio, pareceres: atos do dono.

### 7. Dívidas técnicas

- 2 testes de teto mensal em `tests/integration/anuncios-premiado.test.ts` falham sem relação com estas mudanças (suspeita de dependência de data); CI vermelha conhecida em `bancada`, jogo Bao e teste de cotas instável; `avatar-a11y:168` sem causa; limpeza de ~1.300 pastas temporárias (precisa do OK).

## Sequência proposta

1. Hoje: plano aprovado pelo dono + 2 frentes ativas confirmadas (sugestão: Audiolivros e Transcrição; Avatares só decisão).
2. Fatia B1: estabilização de parciais (TDD, pura) → fatia B2: VAD no fluxo, medindo CPU antes/depois.
3. Fatia A1: bancada rodando Supertonic e Pocket TTS em pt-BR; formulário de escuta cega para o dono.
4. Fatia A2: "Biblioteca de áudio" ligando o narrador existente a capítulos pré-gerados (só após motor aprovado).
5. Decisão de design do UX lab depois de verificado.

## Não verificado (conferir antes de decidir)

Licença das vozes do Pocket TTS; qualidade pt-BR dos dois motores; sherpa-onnx × espeak; Safari (Translator API, áudio de aba, Document PiP); termos do gov.br; leis 10.436/5.626/13.146 citadas de memória; licença do parakeet.js. Nada disto é parecer jurídico.
