/**
 * ROTEADOR DE MODELO STT — a camada inteligente que escolhe o motor de transcrição
 * conforme o IDIOMA da sessão, o dispositivo e a política do usuário.
 *
 * Por que existe (bug de credibilidade): o whisper-tiny é treinado majoritariamente em
 * inglês — em PT-BR (e outros idiomas) ele erra feio ("fellowo americano"). O produto
 * não pode soar quebrado justamente no idioma nativo do usuário. A régua:
 *
 *   EN            → NUVEM primeiro quando disponível (4,9% de WER contra 13,5% do Moonshine na
 *                   bancada 2026-09), com o moonshine como reserva local; sem nuvem → moonshine-base
 *                   local (só inglês, MIT; na bancada FLEURS 2026-09-24: 10,9% de WER contra 19,7%
 *                   do whisper-tiny, ~0% de alucinação em silêncio contra 70,6%, e ~67 MB contra
 *                   117 MB — ver `adapters/moonshine.ts`).
 *   não-EN / auto → NUVEM primeiRO quando disponível (Groq whisper-large-v3-turbo —
 *                   a melhor qualidade multilíngue, ~1s/trecho), com modelo LOCAL de
 *                   reserva; sem nuvem → small (WebGPU PROVADA pela sonda — `smallComGpuProvada`)
 *                   ou base (WASM: small é lento demais para tempo real sem GPU).
 *
 * Honestidades: o perfil Privado/Local NUNCA roteia para a nuvem; o usuário pode
 * sobrepor tudo com a preferência "Qualidade da transcrição" (fast/accurate/cloud);
 * e o selo da UI sempre diz qual motor está de fato em uso.
 */

import type { TipoDeDispositivo } from '../lib/dispositivo/perfil';
import { edicaoEstatica } from '../lib/edicaoEstatica';
import { nuvemDoQuestAtiva } from '../lib/nuvemDoQuest';
import { mbDoDownload, parDoId } from './adapters/bergamotModelo';

export type SttQuality = 'auto' | 'fast' | 'accurate' | 'cloud';

export interface SttRouteInput {
  /** ISO-639-1 do idioma do CONTEÚDO (o que será transcrito). '' quando desconhecido. */
  contentLang: string;
  /** Modo multi-idioma ligado (detecção por fala) — tratado como não-EN. */
  autoDetect: boolean;
  /** Preferência do usuário (settings.ui.sttQuality). */
  quality: SttQuality;
  /**
   * Há um ADAPTADOR WebGPU (`temAdaptadorWebGpu`, não `!!navigator.gpu`) — sem ele, small local é
   * lento demais (18,6 s por legenda no WASM, auditoria de latência 2026-09-26).
   */
  hasWebGpu: boolean;
  /** O servidor tem STT de nuvem configurado (GET /api/ai/stt/available → 200). */
  cloudAvailable: boolean;
  /** Perfil de IA ativo — 'local-private' proíbe nuvem. */
  profileId: string;
  /**
   * Idioma que VOCÊ fala ao MICROFONE, quando o mic está ligado (cenários conversa/mic). Um só
   * modelo decodifica as duas fontes — se você fala PT enquanto ouve EN, o tiny "de inglês" é
   * quem transcreve o seu português, e erra feio. Vazio/undefined = mic desligado.
   */
  micLang?: string;
  /**
   * A captura é SÓ o microfone (cenário `mic`: Quest, celular, ou o desktop praticando a própria voz).
   * Aí `contentLang` — o idioma de destino — não é decodificado por ninguém, e quem decide se o modelo
   * pode ser o de inglês é `micLang` sozinho.
   */
  soMicrofone?: boolean;
  /**
   * O perfil do aparelho (`lib/dispositivo/perfil.ts`). Ausente = comportamento de desktop de antes
   * (quem ainda não mede o aparelho continua igual).
   */
  dispositivo?: DispositivoDaRota;
}

/** O pedaço do perfil do dispositivo que a rota usa. */
export interface DispositivoDaRota {
  tipo: TipoDeDispositivo;
  /** O Whisper small pode entrar (só desktop com GPU). */
  permiteSmall: boolean;
  /** `navigator.connection.saveData`: o menor modelo que serve. */
  economiaDeDados: boolean;
  /* Da SONDA (`dispositivoDaRota` em `lib/dispositivo/perfil.ts`); ausentes = sem sonda guardada. */
  /** O `requestAdapter()` entregou um adaptador e ele NÃO é o de reserva (software). */
  adaptadorReal?: boolean;
  /** `shader-f16`: o encoder vai em fp16 na GPU. */
  shaderF16?: boolean;
  /** A GPU já caiu com um modelo neste aparelho (`device-lost` gravado na sonda). */
  gpuCaiu?: boolean;
  /** Microbenchmark guardado (GFLOP/s relativos, `lib/dispositivo/benchmark.ts`). */
  pontuacaoWasm?: number | null;
  pontuacaoWebgpu?: number | null;
}

/** Preset de quantização pedido ao worker (ver `DTYPE_PRESETS` em `whisperWorker.ts`). */
export type DtypeDaRota = 'hybrid' | 'hybrid-fp16' | 'q8';

/**
 * Quanto a GPU precisa medir ACIMA da CPU no microbenchmark para o Whisper ir a ela fora do desktop.
 * Folga de propósito: o lado "wasm" do benchmark é um laço JS escalar, e o ONNX Runtime com SIMD e
 * threads faz mais que ele — empate no benchmark é derrota da GPU no modelo de verdade.
 */
export const MARGEM_DA_GPU = 1.5;

/**
 * O Whisper vai à GPU NESTE aparelho móvel/Quest? Só com as três provas: adaptador real (não o de
 * reserva), GPU que nunca caiu aqui, e benchmark com a GPU ≥ `MARGEM_DA_GPU`× a CPU. Economia de
 * dados fica no q8 (80 MB contra 168). Pura.
 */
export function usarGpuNoAparelho(d: DispositivoDaRota, hasWebGpu: boolean): boolean {
  if (!hasWebGpu || d.adaptadorReal !== true || d.gpuCaiu === true || d.economiaDeDados) return false;
  const cpu = d.pontuacaoWasm;
  const gpu = d.pontuacaoWebgpu;
  return typeof cpu === 'number' && typeof gpu === 'number' && cpu > 0 && gpu >= MARGEM_DA_GPU * cpu;
}

/**
 * O Whisper SMALL entra NESTE desktop? (plano "Grátis sem travar", A4.) O small (589 MB) só é tempo
 * real na GPU: no WASM a legenda chegava 18,6 s depois da fala, com a fila crescendo (auditoria de
 * latência 2026-09-26). Antes bastava `permiteSmall && hasWebGpu`; agora valem as provas que o Quest e
 * o celular já exigem (`usarGpuNoAparelho`):
 *   - a sonda viu um adaptador REAL (`adaptadorReal === true`). Sem sonda guardada, o base: ela roda
 *     no ocioso, e a próxima captura já pode subir ao small;
 *   - a GPU nunca caiu com um modelo aqui (`gpuCaiu`);
 *   - o microbenchmark, QUANDO EXISTE, não mediu a GPU abaixo de `MARGEM_DA_GPU`× a CPU (sem ele, as
 *     duas provas acima bastam — a sonda grava o benchmark depois, no ocioso);
 *   - sem economia de dados: ela manda o q8, e o q8 vai ao WASM (sem kernel no WebGPU) — o small em
 *     q8 seria o small no WASM. Pura.
 */
export function smallComGpuProvada(d: DispositivoDaRota, hasWebGpu: boolean): boolean {
  if (!d.permiteSmall || !hasWebGpu || d.adaptadorReal !== true || d.gpuCaiu === true || d.economiaDeDados)
    return false;
  const cpu = d.pontuacaoWasm;
  const gpu = d.pontuacaoWebgpu;
  const benchmarkPresente = typeof cpu === 'number' && typeof gpu === 'number' && cpu > 0;
  return !(benchmarkPresente && gpu < MARGEM_DA_GPU * cpu);
}

/**
 * O dtype da GPU: SEMPRE o encoder fp32 (`hybrid`), mesmo com `shader-f16`.
 *
 * MEDIDO em 09/10/2026 (`docs/auditoria/2026-10-09-medicoes-no-aparelho.md`, Chrome 154, 100 falas por
 * idioma): o encoder fp16 no WebGPU devolve uma palavra por fala — erro de 99,5% em português e 98,0%
 * em inglês, contra 18,2% e 21,5% do fp32. O arquivo fp16 está certo (no WASM dá o mesmo texto do
 * fp32); o defeito é da biblioteca no WebGPU (transformers.js #1590). Volta a valer quando ela corrigir
 * E a bancada repetir a medição.
 */
function dtypeNaGpu(_d: DispositivoDaRota | undefined): DtypeDaRota {
  return 'hybrid';
}

export interface SttRoute {
  /** Modelo local a carregar (sempre definido — é a reserva mesmo no modo nuvem). */
  localModel: string;
  /** true = tentar a nuvem (groq-whisper) PRIMEIRO, local como reserva. */
  preferCloud: boolean;
  /** Rótulo honesto para o selo da UI. */
  label: string;
  /** Quantização: `hybrid` (encoder fp32 + decoder q4, o padrão) ou `q8` (móvel/Quest, economia de dados). Ausente = `hybrid`. */
  dtype?: DtypeDaRota;
  /**
   * Backend forçado. `wasm` com q8: os pesos int8 não têm kernel nativo no WebGPU do ORT-web.
   * `webgpu` no Quest/celular com GPU provada (`usarGpuNoAparelho`). Ausente = `auto` (desktop).
   */
  device?: 'wasm' | 'webgpu';
}

export const WHISPER_MODELS = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
} as const;

/**
 * Moonshine — SÓ INGLÊS. Nunca entra numa rota em que alguma fonte (sistema ou microfone) possa
 * ser de outro idioma: decodificaria português como inglês inventado. O tiny só aparece no
 * "rápido" em inglês (é o menor de todos: ~32 MB e 15,5% de WER, ainda melhor que o whisper-tiny).
 */
export const MOONSHINE_MODELS = {
  tiny: 'onnx-community/moonshine-tiny-ONNX',
  base: 'onnx-community/moonshine-base-ONNX',
} as const;

/**
 * Tamanho do download, para informar o usuário ANTES de baixar.
 *
 * ATENÇÃO — o tamanho depende do DTYPE, não só do modelo. Os valores antigos (33/85/250) descreviam
 * um dtype quantizado; o padrão do app é `hybrid` (encoder fp32 + decoder q4), que baixa bem mais.
 *
 * MEDIDO pelo canário de payload real (`results/R1-canario-real.json`, 2026-08-08): o agregado que
 * a própria lib reporta para `whisper-tiny` no dtype padrão é **116,72 MB** — 3,5× o valor que
 * estava aqui. Como este número agora aparece no onboarding, subestimá-lo é mentir para o usuário
 * exatamente onde a F1 se propôs a ser honesta.
 *
 * `tiny` está medido. `base` e `small` eram ESTIMADOS pela proporção de parâmetros (300 e 880 MB), e
 * o do small errava para cima em 50%: a auditoria de latência (2026-09-26) mediu **588,7 MB** baixados
 * na primeira carga do small. Agora os dois são a soma dos bytes do Hub no dtype `hybrid` — os mesmos
 * arquivos que o navegador pede, e que batem com o download medido:
 *   small: encoder_model.onnx 352,83 MB + decoder_model_merged_q4.onnx 233,15 MB + tokenizer/configs 2,78 MB = 588,8 MB
 *   base:  encoder_model.onnx  82,47 MB + decoder_model_merged_q4.onnx 123,60 MB + tokenizer/configs 2,77 MB = 208,8 MB
 *
 * Moonshine: dtype `q8` (não o `hybrid` — ver `adapters/moonshine.ts`), então o tamanho é o dos
 * arquivos `_quantized` e NÃO se compara pela proporção do Whisper. Somado da listagem de bytes do
 * Hub no commit fixado (2026-09-24): pesos + tokenizer.json (3,76 MB) + configs. Contamos como
 * MEDIDO porque são os bytes exatos que o navegador pede, não uma proporção.
 *   base: encoder_model_quantized 20,51 MB + decoder_model_merged_quantized 42,50 MB + 3,90 MB = 66,9 MB
 *   tiny: encoder_model_quantized  7,94 MB + decoder_model_merged_quantized 20,24 MB + 3,90 MB = 32,1 MB
 */
export const MODEL_DOWNLOAD_MB: Record<string, number> = {
  [WHISPER_MODELS.tiny]: 117, // medido
  [WHISPER_MODELS.base]: 209, // medido (bytes do Hub, hybrid)
  [WHISPER_MODELS.small]: 589, // medido (bytes do Hub, hybrid; download real 588,7 MB)
  [MOONSHINE_MODELS.base]: 67, // medido (bytes do Hub, q8)
  [MOONSHINE_MODELS.tiny]: 32, // medido (bytes do Hub, q8)
};

/**
 * Tamanho em q8 — `encoder_model_quantized.onnx` + `decoder_model_merged_quantized.onnx` + tokenizer e
 * configs (~2,8 MB), somados da API de árvore do Hub em 2026-09-26:
 *   tiny  10,12 + 30,72 + 2,77 = 43,6 MB
 *   base  23,20 + 53,69 + 2,77 = 79,7 MB
 *   small 92,3 + 156,8 + 2,78 = 251,9 MB
 * Qualidade na bancada FLEURS pt (100 falas): base q8 18,9% contra 18,2% do híbrido (empate); tiny q8
 * 41,6% contra 29,2% (piora significativa) — por isso nenhuma rota escolhe o tiny em q8.
 */
export const MODEL_DOWNLOAD_MB_Q8: Record<string, number> = {
  [WHISPER_MODELS.tiny]: 44,
  [WHISPER_MODELS.base]: 80,
  [WHISPER_MODELS.small]: 252,
  [MOONSHINE_MODELS.base]: 67,
  [MOONSHINE_MODELS.tiny]: 32,
};

/**
 * Tamanho em `hybrid-fp16` (encoder fp16 + decoder q4 — a rota da GPU com `shader-f16`), somado da API
 * de árvore do Hub em 2026-09-28: `encoder_model_fp16.onnx` + `decoder_model_merged_q4.onnx` + tokenizer
 * e configs (~2,8 MB):
 *   base 41,34 + 123,60 + 2,77 = 167,7 MB
 *   tiny 16,51 +  86,72 + 2,77 = 106,0 MB
 */
export const MODEL_DOWNLOAD_MB_HYBRID_FP16: Record<string, number> = {
  [WHISPER_MODELS.tiny]: 106,
  [WHISPER_MODELS.base]: 168,
};

/**
 * Tradutor opus-mt em q8 (o primeiro dtype que o `mtWorker` tenta), por par: 52,90 + 60,21 MB no
 * `opus-mt-ROMANCE-en`/`en-es`/`es-en` (bytes do Hub, 2026-09-26); en-fr 107,5 e de-en 106,0. Usamos o
 * maior, para o aviso nunca prometer menos do que baixa.
 */
export const MT_DOWNLOAD_MB = 113;

/**
 * Quantos MB este modelo baixa NESTE dtype. `null` quando não sabemos — a tela não inventa número.
 * Os tradutores opus-mt (`Xenova/opus-mt-*`) valem `MT_DOWNLOAD_MB`; o Bergamot (`bergamot/pt-en`),
 * os três `.gz` do par mais o WASM do motor (`adapters/bergamotModelo.ts`: 31 MB no pt→en).
 */
export function tamanhoDoDownloadMb(modelId: string, dtype: DtypeDaRota = 'hybrid'): number | null {
  if (/opus-mt/i.test(modelId)) return MT_DOWNLOAD_MB;
  if (modelId.startsWith('bergamot/')) {
    const par = parDoId(modelId);
    return par ? mbDoDownload(par) : null;
  }
  const tabela =
    dtype === 'q8' ? MODEL_DOWNLOAD_MB_Q8 : dtype === 'hybrid-fp16' ? MODEL_DOWNLOAD_MB_HYBRID_FP16 : MODEL_DOWNLOAD_MB;
  return tabela[modelId] ?? null;
}

/** O valor de `MODEL_DOWNLOAD_MB` para este modelo foi medido ou estimado? */
export const MODEL_DOWNLOAD_MEDIDO: Record<string, boolean> = {
  [WHISPER_MODELS.tiny]: true,
  [WHISPER_MODELS.base]: true,
  [WHISPER_MODELS.small]: true,
  [MOONSHINE_MODELS.base]: true,
  [MOONSHINE_MODELS.tiny]: true,
};

/**
 * Nome legível do modelo para o selo/lista da captura: "Whisper small", "Moonshine base". O id do
 * Hub (`moonshine-base-ONNX`) carrega o sufixo do formato, que não diz nada a quem usa o app.
 */
export function nomeLegivelDoModelo(id: string): string {
  const nome = (id.split('/').pop() ?? id).replace(/-ONNX$/i, '');
  return nome
    .replace(/^whisper-/i, 'Whisper ')
    .replace(/^moonshine-/i, 'Moonshine ')
    .replace(/[-_]/g, ' ');
}

/**
 * Modelo local da transcrição OFFLINE de arquivo (importação sem legenda), quando o idioma pede um
 * específico: inglês → moonshine-base. `null` = não escolhe, fica o Whisper de sempre do adapter.
 * (A importação não passa pelo `routeStt` para o modelo local: ela já roda fora do tempo real.)
 */
export function modeloLocalDaImportacao(idioma?: string): string | null {
  return (idioma || '').toLowerCase().split('-')[0] === 'en' ? MOONSHINE_MODELS.base : null;
}

export function routeStt(input: SttRouteInput): SttRoute {
  const { autoDetect, quality, hasWebGpu, cloudAvailable, profileId, dispositivo } = input;
  const lang = (input.contentLang || '').toLowerCase().split('-')[0];
  const micLang = (input.micLang || '').toLowerCase().split('-')[0];
  // Edição estática (Pages, sem servidor): a nuvem não existe, diga o que disser a sondagem.
  // …a não ser a do Quest (`nuvemDoQuest.ts`), ligada pelo consentimento de nuvem.
  const cloudAllowed = cloudAvailable && profileId !== 'local-private' && (!edicaoEstatica() || nuvemDoQuestAtiva());
  // "Inglês" só quando TODAS as fontes ativas são inglês: o modelo é um só para sistema e mic.
  // Só o microfone, e ele vai ao modelo: o idioma da fala decide sozinho (ver `soMicrofone`).
  const isEnglish =
    !autoDetect && (input.soMicrofone && micLang ? micLang === 'en' : lang === 'en' && (!micLang || micLang === 'en'));

  /* O APARELHO. Fora do desktop (Quest e celular) o Whisper vai em q8 no WASM: na bancada FLEURS pt
     o base q8 empata com o híbrido (18,9% contra 18,2%) e baixa 80 MB em vez de 209 — e a memória da
     aba ali é o limite (iOS ~0,5–1,5 GB; Quest 4,4/5,75 GiB para o navegador inteiro). O small nunca
     entra fora do desktop com GPU. Economia de dados: o menor modelo que serve ao idioma. */
  const movel = !!dispositivo && !dispositivo.tipo.startsWith('desktop');
  const economia = !!dispositivo?.economiaDeDados;
  // O small só com GPU PROVADA pela sonda (`smallComGpuProvada`). Sem perfil: o comportamento de antes.
  const podeSmall = dispositivo ? smallComGpuProvada(dispositivo, hasWebGpu) : hasWebGpu;
  /* GPU DE VERDADE NO QUEST/CELULAR (2026-09-28): adaptador real, sem queda anterior e o benchmark
     guardado com a GPU ≥ 1,5× a CPU → o Whisper vai ao WebGPU no dtype que roda bem ali. O watchdog
     e a queda em runtime do `whisperLocal.ts` continuam: GPU que trava ou cai volta ao WASM q8. */
  const gpuMovel = movel && !!dispositivo && usarGpuNoAparelho(dispositivo, hasWebGpu);
  const q8 = (movel || economia) && !gpuMovel;
  const whisperLocal = (modelo: string): Pick<SttRoute, 'localModel' | 'dtype' | 'device'> =>
    gpuMovel
      ? { localModel: modelo, dtype: dtypeNaGpu(dispositivo), device: 'webgpu' }
      : q8
        ? { localModel: modelo, dtype: 'q8', device: 'wasm' }
        : { localModel: modelo, dtype: 'hybrid' };
  /** Melhor modelo LOCAL viável para conteúdo não-EN neste dispositivo. */
  const bestLocal = podeSmall ? WHISPER_MODELS.small : WHISPER_MODELS.base;
  const nomeCurto = (m: string) => m.split('-').pop();
  const sufixo = gpuMovel ? ' · GPU' : q8 ? ' q8' : '';
  /** Moonshine do "auto" em inglês: o tiny no celular fraco, no Quest (~3 núcleos em clock reduzido
      para o app) ou com economia de dados. */
  const moonshineAuto =
    dispositivo?.tipo === 'celular-fraco' || dispositivo?.tipo === 'quest' || economia
      ? MOONSHINE_MODELS.tiny
      : MOONSHINE_MODELS.base;
  const moonshine = (modelo: string, label: string): SttRoute => ({
    localModel: modelo,
    preferCloud: false,
    label,
    dtype: 'q8',
  });

  switch (quality) {
    case 'fast':
      // "Rápido" = o MENOR modelo que serve ao idioma. Em inglês, o moonshine-tiny (~32 MB, 15,5% de
      // WER) é menor E melhor que o whisper-tiny; fora do inglês, só o Whisper serve — e sempre no
      // híbrido: o tiny em q8 errou 41,6% contra 29,2% na bancada pt.
      if (isEnglish) return moonshine(MOONSHINE_MODELS.tiny, 'local · modelo rápido (moonshine tiny, inglês)');
      return {
        localModel: WHISPER_MODELS.tiny,
        dtype: 'hybrid',
        preferCloud: false,
        label: 'local · modelo rápido (tiny)',
      };
    case 'accurate':
      return {
        ...whisperLocal(bestLocal),
        preferCloud: false,
        label: `local · modelo preciso (${nomeCurto(bestLocal)}${sufixo})`,
      };
    case 'cloud':
      if (cloudAllowed) {
        // Reserva local moderada (base): não força um download de 250MB em quem escolheu nuvem.
        if (isEnglish)
          return {
            localModel: MOONSHINE_MODELS.base,
            dtype: 'q8',
            preferCloud: true,
            label: 'nuvem (large-v3-turbo) · reserva local',
          };
        return {
          ...whisperLocal(WHISPER_MODELS.base),
          preferCloud: true,
          label: 'nuvem (large-v3-turbo) · reserva local',
        };
      }
      // Nuvem pedida mas indisponível/proibida → degrada honesto para o melhor local.
      return {
        ...whisperLocal(bestLocal),
        preferCloud: false,
        label: `local (nuvem indisponível) · ${nomeCurto(bestLocal)}${sufixo}`,
      };
    case 'auto':
    default: {
      /* INGLÊS DE QUEM TEM NUVEM VAI À NUVEM (auditoria de eficiência 2026-09-28, achado 5). Antes o
         inglês saía aqui, no Moonshine local, ANTES de olhar a nuvem: quem paga recebia 13,5% de WER
         no lugar dos 4,9% do large-v3-turbo (bancada 2026-09). O Moonshine continua como RESERVA —
         menor e melhor em inglês que o Whisper base (67 MB, ou 32 no celular fraco) — e continua o
         motor de quem não tem nuvem. */
      /* …menos na nuvem do site estático (`nuvemDoQuest.ts`): a cota ali é de 15 min por dia, e o
         Moonshine acompanha a fala até no Quest (fator 0,2, medido). O inglês fica no aparelho. */
      if (isEnglish && cloudAllowed && !nuvemDoQuestAtiva())
        return {
          localModel: moonshineAuto,
          dtype: 'q8',
          preferCloud: true,
          label: 'nuvem (large-v3-turbo) · reserva local',
        };
      if (isEnglish) return moonshine(moonshineAuto, 'local · inglês (moonshine)');
      if (cloudAllowed) {
        // Reserva base: se a nuvem cair no meio da sessão, a qualidade local não desaba p/ tiny.
        return {
          ...whisperLocal(WHISPER_MODELS.base),
          preferCloud: true,
          label: 'nuvem (large-v3-turbo) · reserva local',
        };
      }
      return {
        ...whisperLocal(bestLocal),
        preferCloud: false,
        label: `local · modelo preciso (${nomeCurto(bestLocal)}${sufixo})`,
      };
    }
  }
}

/** O backend para onde o regulador pode trocar no meio da sessão (`trocar-backend`). */
export interface OutroBackend {
  device: 'wasm' | 'webgpu';
  dtype: DtypeDaRota;
}

/**
 * O OUTRO backend, quando o microbenchmark guardado o mediu mais rápido que o desta rota — o que o
 * regulador usa para emitir `trocar-backend` quando o atual não acompanha. Sem margem (a troca só
 * acontece com o aparelho já sofrendo); a GPU só entra com adaptador real e sem queda anterior.
 * Moonshine é sempre WASM (ver `whisperLocal.ts`). `null` = nenhum. Pura.
 */
export function outroBackend(
  route: SttRoute,
  d: DispositivoDaRota | undefined,
  hasWebGpu: boolean,
): OutroBackend | null {
  if (!d || /moonshine/i.test(route.localModel)) return null;
  const cpu = d.pontuacaoWasm;
  const gpu = d.pontuacaoWebgpu;
  if (typeof cpu !== 'number' || typeof gpu !== 'number' || cpu <= 0 || gpu <= 0) return null;
  const gpuUtil = hasWebGpu && d.adaptadorReal === true && d.gpuCaiu !== true;
  const atual = route.device ?? (hasWebGpu ? 'webgpu' : 'wasm');
  if (atual === 'wasm') return gpuUtil && gpu > cpu ? { device: 'webgpu', dtype: dtypeNaGpu(d) } : null;
  const movel = !d.tipo.startsWith('desktop');
  return cpu > gpu ? { device: 'wasm', dtype: movel ? 'q8' : 'hybrid' } : null;
}

const QUALITY_KEY = 'babel.sttQuality';

export function getSttQuality(): SttQuality {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === 'fast' || v === 'accurate' || v === 'cloud' || v === 'auto') return v;
  } catch {
    /* sem localStorage */
  }
  return 'auto';
}

export function setSttQualityMirror(q: SttQuality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* best-effort */
  }
}
