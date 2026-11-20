## Context

Infra que já existia (openspec `voz-no-aparelho`, Supertonic 3): worker com OPFS + `Range` + sha256, sessões do
`onnxruntime-web` (WebGPU com queda para WASM), motor `TtsEngine` com fila, pré-busca e reserva
(`lib/voz/motorNoAparelho.ts`), a porta de voz com a vaga `neural-local` (`core/voz/portaDeVoz.ts`,
`gateway/registroDeMotoresDeVoz.ts`) e o motor global da fala (`lib/voz/motorGlobal.ts`).

O Kitten TTS 2 nano/pico/mini (`kittenml` 0.9.8, `kittentts2_tiny/model.py`) é um modelo de UMA passada:
`input_ids [1,T]` (fonemas IPA por caractere do `vocab.json`, `[0] + … + [10, 0]`), `style [1,256]` (a linha T−1 do pacote
da voz, `voices_<idioma>.npz`, float32 [510,256]) e `speed [1]` → `waveform`, `durations`. Saída a 24 kHz; corta-se o
quadro do token final (e o inicial a partir do 2º trecho), rampas de 5 ms, 0,15 s entre trechos.

## Decisões

### 1. Texto → fonemas sem GPL

O `kittenml` fonetiza pt/es com espeak-ng (GPL-3, via `phonemizer`) e o inglês com misaki + CMUdict + um BART pequeno
(sem espeak). Opções pesadas:

| Caminho                                                    | Licença                                                 | Veredito                       |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| espeak-ng em WASM no app                                   | GPL-3 (obriga o app, ou isolamento jurídico discutível) | descartado sem decisão do dono |
| léxico gerado rodando o espeak                             | dado derivado de regras GPL (zona cinzenta)             | descartado                     |
| misaki para pt/es                                          | o próprio misaki chama o espeak para esses idiomas      | não serve                      |
| **regras próprias (pt, es) + CMUdict-misaki do repo (en)** | código nosso; CMUdict BSD; repo Apache                  | **escolhido**                  |

As regras miram as convenções do espeak que o modelo aprendeu (acento antes da vogal, `æ`/`ʊ`/`y` átonos finais do pt,
`ʧ`/`ʤ` antes de [i], `x` no R forte, `ɾə` antes de consoante, ditongos `A`/`I`/`W`, til combinante; no es, `θ`,
β/ð/ɣ por contexto entre palavras). A medida usa o espeak SÓ como oráculo local (`scripts/voz/kitten/oraculo_espeak.py`,
saída fora do git), nunca como fonte de código ou dado. Resultado: CER 1,0% pt / 0,4% es / 2,0% en; ASR equivalente.

### 2. Variante e backend

Spike (Chromium e WebKit do Playwright, Mac Apple Silicon), RTF = síntese ÷ áudio:

|      | WASM 4 threads | WASM 1 thread | WebGPU (GPU real)  | WebGPU por software |
| ---- | -------------- | ------------- | ------------------ | ------------------- |
| mini | 0,40           | 1,15          | 0,05–0,09          | ~17                 |
| pico | 0,05           | 0,10          | 0,02 (WebKit 0,28) | ~2,5–5,7            |

Carga da sessão ~0,6–1,3 s; fonetizador < 1 ms por frase; memória do navegador inteiro +0,7 a +1,5 GB (RSS, ruidoso;
bem abaixo dos 2–3 GB da Supertonic). Daí: mini só com `crossOriginIsolated` (4 threads); pico no resto. O WebGPU é
tentado só no mini e só fica se o aquecimento sair com RTF < 0,5 (o adaptador por software, inclusive o `isFallbackAdapter`,
cai para o WASM). Saída idêntica à do Python com os mesmos fonemas (correlação 0,79–0,999, mesma duração).

### 3. Downloads sob demanda, por idioma

Arquivos por variante com tamanho e sha256 fixados (`ARQUIVOS_DO_KITTEN`), URL `<VITE_VOZ_KITTEN_URL>/<variante>/<caminho>`.
Por idioma: `vocab.json` + `voices_<idioma>.npz` + o `.onnx` (no pico, o do idioma) + o léxico (só en). Mini ≈ 90 MB no
1º idioma e ≈ 7 MB nos seguintes; pico ≈ 10 MB por idioma (≈ 14 MB o en, com o léxico). Acima do teto do perfil
(`confirmarDownloadAcimaDeMb`: 0 em economia de dados/rede lenta, 100 no celular, 300 no computador) pede confirmação.
A marca de pronto fica em `localStorage` por variante+idioma, com a revisão do HF.

### 4. Quem lê

`quemLeEmVozAlta` (puro): Supertonic escolhida → ela; voz do sistema ou nuvem escolhida → o motor de antes; Kitten pronto
e escolha automática/`@kitten` → Kitten; Supertonic pronta na automática → ela; senão a voz do sistema se houver uma
ACEITA (`haVozAceita`: nem efeito nem robótica), senão nenhuma (`onError`, o texto fica na tela). Sem a flag, a
decisão é a de antes. O motor global (`speak()`) e o leitor (`garantirVozLocal` registra quem vai ler na vaga
`neural-local`) usam a mesma função.

### 5. Reuso sem quebrar a Supertonic

O download/OPFS/runtime saem do worker da Supertonic para `pesosNoAparelho.ts` (os testes da Supertonic passam sem
mudança); `criarMotorNoAparelho` ganha `resolver` opcional (padrão = o da Supertonic); `carregarMotor()` da Supertonic
passa a registrar o adaptador a cada chamada, para dividir a vaga `neural-local` com o Kitten.

## Riscos

- Fonetizador por regras erra palavras irregulares (vogal aberta/fechada sem acento gráfico, estrangeirismos, nomes):
  listas de exceção e o oráculo para medir regressão. O ASR mostrou impacto pequeno.
- Inglês fora do léxico usa regras simples (o BART do repo pode ser exportado para ONNX depois).
- "Nenhuma voz" muda o comportamento de quem tem só vozes robóticas: por isso atrás da flag.
- Memória medida pelo RSS do navegador inteiro (ruidoso); medir no aparelho real antes de ligar para todos.

## Plano de ligar

1. Publicar os pesos (`publicar-kitten-no-r2.ts --via=wrangler`), configurar `VITE_VOZ_KITTEN_URL` no staging.
2. Ligar `voz_kitten` no staging; ouvir pt/en/es no computador (mini) e no celular (pico); Safari.
3. Produção por percentual (`regras.percentual`) e acompanhar `voz-no-aparelho:frase` (RTF, backend).
