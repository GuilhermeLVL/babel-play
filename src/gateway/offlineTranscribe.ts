/**
 * Transcrição OFFLINE de um arquivo de áudio (não-streaming) — a "reserva de Whisper" da
 * importação: quando um vídeo do YouTube (ou um áudio/vídeo local) não tem legenda, geramos as
 * falas COM timestamps reais aqui, reusando as MESMAS peças da captura ao vivo:
 *   - `NonRealTimeVAD` (@ricky0123/vad-web) — segmenta o áudio inteiro em falas (modo batch),
 *     devolvendo `start`/`end` em ms; o pipeline ao vivo usa `MicVAD` sobre um MediaStream.
 *   - `WhisperLocalStt` — transcreve cada segmento no navegador (WASM/WebGPU), com o mesmo cache
 *     de modelo da captura (nada re-baixa).
 *   - NUVEM, quando quem chama entrega um motor (`nuvem`): o Whisper de nuvem (large-v3-turbo) no
 *     lugar do local. Antes a importação era SEMPRE local — 57% de WER em português — mesmo para
 *     quem assina a transcrição de nuvem (24%; docs/PROXIMOS-PASSOS.md, D4). A decisão de usar ou
 *     não é de quem chama, com a mesma régua da captura ao vivo (`lib/import/nuvemDaImportacao`).
 *     Recusa DEFINITIVA da nuvem (402 plano/cota, 429 limite, 501 sem conta ou não configurada,
 *     503 orçamento) desliga a nuvem pelo resto do arquivo e o local assume; falha passageira
 *     (rede, 500) manda só aquele trecho ao local. O arquivo é transcrito inteiro de qualquer jeito.
 *     EXCEÇÃO: 429 `nuvem_ocupada` (admissão do servidor, ADR 0007) é a nuvem CHEIA, não fechada —
 *     os trechos vão ao local só até o `Retry-After` (ou 60 s) e depois a nuvem volta.
 *     Na nuvem as falas seguidas vão em PACOTES de até 28 s (gruparParaNuvem): a Groq cobra no
 *     mínimo 10 s por pedido.
 *
 * Honesto: timestamps vêm do VAD (reais); segmentos que o Whisper devolve vazios são descartados,
 * não preenchidos com invenção.
 */
import { NonRealTimeVAD } from '@ricky0123/vad-web';

import { WhisperLocalStt } from './adapters/whisperLocal';
import type { SttFinal } from './capabilities';
import { cortarPrompt } from './promptDeStt';
import { modeloLocalDaImportacao } from './sttRouter';

export interface OfflineSegment {
  tStartMs: number;
  tEndMs: number;
  text: string;
  /** Motor que transcreveu ESTE trecho — o selo de procedência da fala. */
  engine: 'groq-whisper' | 'whisper-local';
}

/** O mínimo que a importação precisa de um STT de nuvem (hoje o `GroqWhisperStt`). */
export interface MotorDeNuvem {
  transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; prompt?: string },
  ): Promise<SttFinal>;
}

/** Respostas que dizem "não vai dar nesta importação": insistir só cobraria (ou recusaria) de novo. */
const RECUSA_DEFINITIVA = new Set([402, 429, 501, 503]);

/** Espera da nuvem cheia (`nuvem_ocupada`) quando o erro não diz o `Retry-After`. */
const ESPERA_DA_NUVEM_CHEIA_MS = 60_000;

export interface OfflineProgress {
  phase: 'decode' | 'model' | 'segment';
  progress: number; // 0..1
  label?: string;
}

export interface OfflineOptions {
  languageHint?: string;
  onProgress?: (p: OfflineProgress) => void;
  /** Teto de duração (ms). Além dele, paramos de coletar falas (aviso honesto fica com o chamador). */
  maxDurationMs?: number;
  /** STT de nuvem a preferir. Ausente = tudo local, como sempre foi. */
  nuvem?: MotorDeNuvem | null;
}

/** Uma fala do VAD: o áudio (mono, 16 kHz) e o horário no arquivo, em ms. */
export interface TrechoDeVad {
  audio: Float32Array;
  start: number;
  end: number;
}

/** Falas seguidas que vão à nuvem num pedido só. `start`/`end` = da primeira à última. */
export interface PacoteDeNuvem {
  segmentos: TrechoDeVad[];
  start: number;
  end: number;
}

/**
 * Teto de um pacote de nuvem, em ms — vale para o intervalo no arquivo E para o áudio enviado.
 *
 * POR QUE JUNTAR: a Groq cobra no mínimo 10 s por pedido, então uma fala de 2 s sai pelo preço de
 * 10 s. A bancada de 2026-09 (docs/auditoria/eval/bancada-2026-09.md) mediu 2,06× o tempo real
 * faturado com os pedaços do VAD fechando em 450 ms de silêncio. Na importação o arquivo inteiro
 * já está na mão, então as falas seguidas vão juntas até 28 s — com folga abaixo dos 30 s da janela
 * do Whisper. O caminho LOCAL não junta nada: lá não há cobrança por pedido.
 */
export const TETO_DO_PACOTE_MS = 28_000;
/** Silêncio entre duas falas no áudio do pacote: sem ele o fim de uma cola no começo da outra. */
const RESPIRO_ENTRE_FALAS = Math.round(0.2 * 16000);

/**
 * Junta falas CONSECUTIVAS em pacotes de até `tetoMs` — sempre na fronteira de uma fala (nunca a
 * corta). Uma fala maior que o teto vai sozinha, como antes. Ordem preservada; nada se perde.
 */
export function agruparParaNuvem(segs: TrechoDeVad[], tetoMs = TETO_DO_PACOTE_MS): PacoteDeNuvem[] {
  const tetoAmostras = (tetoMs / 1000) * 16000;
  const pacotes: PacoteDeNuvem[] = [];
  let atual: PacoteDeNuvem | null = null;
  let amostras = 0;
  for (const s of segs) {
    const comEla = amostras + RESPIRO_ENTRE_FALAS + s.audio.length;
    if (atual && s.end - atual.start <= tetoMs && comEla <= tetoAmostras) {
      atual.segmentos.push(s);
      atual.end = s.end;
      amostras = comEla;
      continue;
    }
    atual = { segmentos: [s], start: s.start, end: s.end };
    amostras = s.audio.length;
    pacotes.push(atual);
  }
  return pacotes;
}

/** O áudio do pacote: as falas em ordem, com um respiro de silêncio entre elas. */
export function juntarAudioDoPacote(p: PacoteDeNuvem): Float32Array {
  if (p.segmentos.length === 1) return p.segmentos[0].audio;
  const total = p.segmentos.reduce((n, s) => n + s.audio.length, 0) + RESPIRO_ENTRE_FALAS * (p.segmentos.length - 1);
  const out = new Float32Array(total);
  let pos = 0;
  p.segmentos.forEach((s, i) => {
    if (i > 0) pos += RESPIRO_ENTRE_FALAS;
    out.set(s.audio, pos);
    pos += s.audio.length;
  });
  return out;
}

/** Mixa para mono (média dos canais) — o VAD e o Whisper trabalham em mono. */
function toMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const n = buf.length;
  const out = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  const inv = 1 / buf.numberOfChannels;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

export async function offlineTranscribe(blob: Blob, opts: OfflineOptions = {}): Promise<OfflineSegment[]> {
  const { languageHint, onProgress, maxDurationMs, nuvem } = opts;

  // 1) Decodifica o áudio. O VAD reamostra internamente para 16 kHz, então passamos o PCM na taxa
  //    nativa + a sampleRate; não precisamos reamostrar à mão.
  onProgress?.({ phase: 'decode', progress: 0, label: 'Decodificando o áudio…' });
  const arrayBuf = await blob.arrayBuffer();
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    ctx.close().catch(() => {});
  }
  const sampleRate = decoded.sampleRate;
  const mono = toMono(decoded);
  onProgress?.({ phase: 'decode', progress: 1 });

  // 2) VAD em batch — assets locais (mesma origem servida em /public que a captura usa).
  const vad = await NonRealTimeVAD.new({
    modelURL: '/silero_vad_legacy.onnx',
    ortConfig: (ort: any) => {
      try {
        ort.env.wasm.wasmPaths = '/';
      } catch {
        /* usa default */
      }
    },
  });

  // 3) Whisper local — pré-carrega uma vez (reporta o download do modelo, se houver). Com nuvem, SÓ
  //    se ela recusar: quem transcreve na nuvem não paga ~200 MB de download à toa.
  let local: WhisperLocalStt | null = null;
  const garantirLocal = async (): Promise<WhisperLocalStt> => {
    if (!local) {
      local = new WhisperLocalStt();
      // Arquivo em inglês → moonshine-base (metade do erro do whisper-tiny, ~0% de invenção em
      // silêncio). ANTES do preload: trocar depois baixaria os dois modelos.
      const modelo = modeloLocalDaImportacao(languageHint);
      if (modelo) local.setModel(modelo);
      await local.preload((progress, label) => onProgress?.({ phase: 'model', progress, label }));
    }
    return local;
  };
  let nuvemAtiva = !!nuvem;
  /** Nuvem cheia (429 `nuvem_ocupada`): até este instante os trechos vão ao local. */
  let nuvemCheiaAte = 0;
  if (!nuvemAtiva) await garantirLocal();

  // Coleta os segmentos de fala primeiro (para saber o total e reportar progresso honesto).
  const segments: TrechoDeVad[] = [];
  for await (const s of vad.run(mono, sampleRate)) {
    segments.push(s);
    if (maxDurationMs && s.end >= maxDurationMs) break;
  }

  const out: OfflineSegment[] = [];
  // Contexto do trecho seguinte na nuvem: o texto do anterior (mesmo arquivo; e só com idioma fixo,
  // pelo mesmo motivo da captura ao vivo — prompt em outro idioma induz o Whisper a traduzir).
  let anterior = '';
  const transcreverNoLocal = async (s: TrechoDeVad) => {
    try {
      const r = await (await garantirLocal()).transcribePcm(s.audio, 16000, { languageHint });
      const text = (r.text || '').trim();
      if (text) {
        out.push({ tStartMs: Math.round(s.start), tEndMs: Math.round(s.end), text, engine: 'whisper-local' });
        anterior = text;
      }
    } catch {
      // segmento que falhou é pulado — não inventamos texto
    }
  };

  // Na NUVEM as falas vão em pacotes (ver `agruparParaNuvem`); no local, uma a uma, como sempre.
  const pacotes: PacoteDeNuvem[] = nuvem
    ? agruparParaNuvem(segments)
    : segments.map((s) => ({ segmentos: [s], start: s.start, end: s.end }));
  for (let i = 0; i < pacotes.length; i++) {
    const p = pacotes[i];
    onProgress?.({
      phase: 'segment',
      progress: i / Math.max(1, pacotes.length),
      label: `Transcrevendo trecho ${i + 1}/${pacotes.length}…`,
    });
    let r: SttFinal | null = null;
    if (nuvem && nuvemAtiva && Date.now() >= nuvemCheiaAte) {
      try {
        const prompt = languageHint && anterior ? cortarPrompt(anterior) : undefined;
        r = await nuvem.transcribePcm(juntarAudioDoPacote(p), 16000, { languageHint, prompt });
      } catch (e) {
        const { status, code, retryAfterMs } = (e ?? {}) as { status?: number; code?: string; retryAfterMs?: number };
        if (status === 429 && code === 'nuvem_ocupada') {
          nuvemCheiaAte = Date.now() + (retryAfterMs && retryAfterMs > 0 ? retryAfterMs : ESPERA_DA_NUVEM_CHEIA_MS);
        } else if (typeof status === 'number' && RECUSA_DEFINITIVA.has(status)) nuvemAtiva = false;
      }
    }
    if (r) {
      // O pacote vira UMA fala, do início da primeira ao fim da última: a nuvem devolve o texto do
      // pacote inteiro, sem dizer onde cada fala termina — repartir seria inventar horário.
      const text = (r.text || '').trim();
      if (text) {
        out.push({ tStartMs: Math.round(p.start), tEndMs: Math.round(p.end), text, engine: 'groq-whisper' });
        anterior = text;
      }
      continue;
    }
    // Nuvem recusou ou falhou (ou não há nuvem): cada fala do pacote vai ao local, com o próprio horário.
    for (const s of p.segmentos) await transcreverNoLocal(s);
  }
  onProgress?.({ phase: 'segment', progress: 1 });
  return out;
}
