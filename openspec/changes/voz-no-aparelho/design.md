## Context

- A porta de motores de voz (`core/voz/portaDeVoz.ts`) e o registro (`gateway/registroDeMotoresDeVoz.ts`) já reservam o
  motor `neural-local`; o Narrador (`lib/leitor/narrador.ts`) já pergunta `neuralLocalPronto(idioma)` e cria o motor pelo
  registro. Ninguém registrava: este é o primeiro adaptador.
- O spike (`spike-supertonic-web/RELATORIO.md`) tem o pipeline de 4 ONNX (duration_predictor, text_encoder,
  vector_estimator com 8 passos, vocoder), tokenização por caractere (NFKD + `unicode_indexer.json`) e as medições.
- O app serve COOP `same-origin` + COEP `credentialless` (`server/http/isolamento.ts`, `scripts/vite/cabecalhos.ts`):
  Chrome/Edge/Firefox ficam isolados (WASM com threads). O Safari não aceita `credentialless`: sem isolamento, o WASM roda
  em 1 thread (RTF ~0,64 medido) e o WebGPU é o caminho rápido dele.
- O `onnxruntime-web` do app é o 1.26 (`package.json`); o pacote padrão usa o runtime JSEP (`ort-wasm-simd-threaded.jsep.*`,
  já copiado para a raiz pelo `copiar-assets-runtime.mjs`), que tem WebGPU e WASM. Nenhuma dependência nova.

## Decisions

1. **Pela porta, não em paralelo.** O adaptador implementa `AdaptadorDeVoz` e é registrado com `registrarMotorDeVoz` depois
   do `import()`. O motor é um `TtsEngine`; o Narrador ganha só: o motor neural guardado (como a nuvem), o `cancel()` dele no
   `calar()`, a pré-busca (`preparar`, opcional na interface) e o `liberar()` (opcional) ao parar.
2. **Worker dedicado.** Download, verificação, sessões e síntese no worker; a thread principal só toca o PCM devolvido
   (transferido) num `AudioBufferSourceNode`. `liberar()` = `terminate()` do worker (é o que devolve o heap do WASM, como em
   `memoriaDosModelos.ts`): na hora em aparelho de pouca memória, 20 s depois no resto; voltar a tocar cancela.
3. **OPFS com `createSyncAccessHandle`** (Chrome 102+, Safari 15.2+, Firefox 111+, só em worker): o arquivo parcial fica no
   OPFS; retomar pede `Range: bytes=<tamanho>-` (206 continua, 200 recomeça). No fim confere o tamanho e o sha256 fixados
   em `core/voz/supertonic.ts` (pesos do commit `724fb5ab` do `Supertone/supertonic-3`, arquivado: não muda) e grava uma
   marca `.ok`. Sem OPFS, o motor não é oferecido.
4. **Fila com prioridade**: a frase pedida por `speak` vai à frente; a pré-busca (2 à frente) atrás; pendentes que ninguém
   pediu mais saem da fila. O worker processa uma por vez.
5. **Texto**: `prepararTextoParaVoz` (pt/en/es) → `frasesDoTexto(texto, idioma, 120)` (o mesmo corte do leitor, com teto
   menor para o primeiro áudio sair cedo) → NFKD e as trocas do `helper.js` oficial → `<pt>…</pt>`. Trechos emendados com
   0,15 s de silêncio.
6. **Velocidade** = 1,05 × a da narração (o padrão do pacote é 1,05), limitada a 0,5–2. Tom não existe no modelo.
7. **Portão puro** (`ofertaDaVozNoAparelho`): `nao` com flag desligada, perfil protegido, iOS, celular/Quest, memória
   informada < 4 GB, sem WebGPU nem WASM, ou sem OPFS; `por-escolha` (com aviso de 2 a 3 GB) no desktop de pouca memória
   (sem isolamento, Safari) ou com < 8 GB; `padrao` no resto. Ambos só baixam com o toque da pessoa.
8. **Escolha** = a preferência de voz do idioma (`@no-aparelho`, como `@nuvem`): sem o modelo neste aparelho ou com a
   oferta `nao`, `vozEmUso` responde "automática" (outro aparelho da mesma conta não quebra).
9. **Rótulo**: o `ChipVozSintetizada` aparece enquanto a frase sai do motor local (OpenRAIL-M e AI Act art. 50).

## Produção (ato do dono)

- Publicar os 16 arquivos (4 ONNX, `tts.json`, `unicode_indexer.json`, 10 `voice_styles/*.json`) num bucket R2 público
  com CORS de GET/HEAD e `Range`, CORP `cross-origin` e cache imutável, no layout `<raiz>/onnx/…` e `<raiz>/voice_styles/…`;
  definir `VITE_VOZ_MODELO_URL=<raiz>` no build. Revisão jurídica da OpenRAIL-M (cláusulas de menores e de rótulo) antes de
  ligar a flag.

## Risks / Trade-offs

- **Memória** (1,9 a 3,2 GB no spike): o Safari pode matar a aba num Mac de 6 GB com outras abas. Mitigação: oferta por
  escolha com aviso, `liberar()` ao parar, flag desligada.
- **JSEP × asyncify**: o spike usou o `ort.webgpu` (asyncify); o app usa o pacote padrão (JSEP). Se o WebGPU falhar na
  carga ou no aquecimento, cai para WASM sozinho.
- **Projeto arquivado**: nós mantemos o pipeline e o normalizador.
- **Primeiro áudio em WASM 1 thread** ~2 a 5 s: a tela diz isso no Safari.
