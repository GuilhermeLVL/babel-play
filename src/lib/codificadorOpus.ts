/**
 * PCM MONO → OGG OPUS pelo WebCodecs (`AudioEncoder`, codec 'opus'). Um lugar só para os dois que
 * codificam áudio no navegador: a mistura da sessão (`misturarAudios.ts`, uma hora de uma vez) e o
 * envio de cada fala ao STT de nuvem (`gateway/audio/opusDoStt.ts`, 1–28 s por vez).
 *
 * Os pacotes crus do codificador saem embrulhados no Ogg mínimo de `oggOpus.ts`. O granule final
 * é a duração REAL (amostras de entrada × 48 kHz / taxa), o que apara o enchimento do último quadro
 * — e é essa a duração que o servidor mede e cobra (`server/lib/duracaoDeAudio.ts`).
 *
 * Sem `AudioEncoder`, ou com o Opus recusado pelo navegador, `opusDisponivel` diz "não" e quem chama
 * decide o reserva (os dois usam WAV). Qualquer dúvida é "não": o WAV sempre funciona.
 */
import { montarOggOpus, type PacoteOpus, preSkipDoOpusHead } from './oggOpus';

/** Atraso padrão do libopus a 48 kHz (2,5 ms de lookahead + 4 ms de compensação = 312 amostras). */
const PRE_SKIP_PADRAO = 312;
/** Quantos pedidos de codificação deixamos na fila antes de esperar o codificador drenar. */
const FILA_MAXIMA = 8;

export interface ConfigOpus {
  codec: 'opus';
  sampleRate: number;
  numberOfChannels: 1;
  bitrate: number;
}

interface ChunkOpus {
  byteLength: number;
  duration: number | null;
  copyTo(dst: Uint8Array): void;
}
interface MetaOpus {
  decoderConfig?: { description?: ArrayBuffer | ArrayBufferView };
}

/** O WebCodecs existe E aceita Opus mono nesta taxa? Qualquer dúvida é "não" — o WAV assume. */
export async function opusDisponivel(config: ConfigOpus): Promise<boolean> {
  const g = globalThis as unknown as {
    AudioEncoder?: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> };
    AudioData?: unknown;
  };
  if (!g.AudioEncoder || !g.AudioData) return false;
  try {
    return (await g.AudioEncoder.isConfigSupported(config)).supported === true;
  } catch {
    return false;
  }
}

/**
 * Codifica o PCM mono em Opus pelo `AudioEncoder` e embrulha em Ogg. Lança se o codificador falhar
 * (quem chama cai no WAV). `config.sampleRate` é a taxa do `canal`.
 */
export async function codificarOggOpus(canal: Float32Array, config: ConfigOpus): Promise<Uint8Array> {
  const g = globalThis as unknown as {
    AudioEncoder: new (init: { output: (c: ChunkOpus, m?: MetaOpus) => void; error: (e: unknown) => void }) => {
      configure(c: unknown): void;
      encode(d: unknown): void;
      flush(): Promise<void>;
      close(): void;
      encodeQueueSize: number;
    };
    AudioData: new (init: Record<string, unknown>) => { close(): void };
  };
  const taxa = config.sampleRate;
  const pacotes: PacoteOpus[] = [];
  let preSkip: number | null = null;
  let erro: unknown = null;
  const enc = new g.AudioEncoder({
    output: (chunk, meta) => {
      const dados = new Uint8Array(chunk.byteLength);
      chunk.copyTo(dados);
      // `duration` vem em µs; o granule do Opus conta amostras a 48 kHz, qualquer que seja a entrada.
      pacotes.push({ dados, amostras48k: Math.round(((chunk.duration ?? 20_000) * 48_000) / 1e6) });
      if (preSkip === null) preSkip = preSkipDoOpusHead(meta?.decoderConfig?.description);
    },
    error: (e) => {
      erro = e;
    },
  });
  try {
    enc.configure(config);
    const bloco = taxa; // 1 s por AudioData
    for (let i = 0; i < canal.length; i += bloco) {
      if (erro) throw erro;
      const parte = canal.subarray(i, Math.min(canal.length, i + bloco));
      const quadro = new g.AudioData({
        format: 'f32',
        sampleRate: taxa,
        numberOfFrames: parte.length,
        numberOfChannels: 1,
        timestamp: Math.round((i * 1e6) / taxa),
        data: parte,
      });
      enc.encode(quadro);
      quadro.close();
      /* Contrapressão: sem esperar, uma sessão de uma hora enfileiraria 3600 pedidos de uma vez,
         com cópia do PCM em cada um. Cedendo a vez, o codificador drena enquanto a fila anda. */
      while (enc.encodeQueueSize > FILA_MAXIMA) await new Promise((r) => setTimeout(r, 0));
    }
    await enc.flush();
    if (erro) throw erro;
    if (!pacotes.length) throw new Error('o codificador Opus não devolveu nenhum pacote');
    return montarOggOpus({
      pacotes,
      canais: 1,
      preSkip: preSkip ?? PRE_SKIP_PADRAO,
      taxaDeEntrada: taxa,
      totalAmostras48k: Math.round((canal.length * 48_000) / taxa),
    });
  } finally {
    try {
      enc.close();
    } catch {
      /* já fechado pelo erro */
    }
  }
}
