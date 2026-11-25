/**
 * CODIFICA O CLIPE: Ogg Opus mono (WebCodecs) e, sem Opus no navegador (o Safari antigo), WAV 16 bits.
 * O bitrate é o da linha de base (24 kbps, ~3 KB/s); o vencedor da escuta cega (tarefa 1.2, [D]) troca só a constante.
 */
import { encodeWav } from '../../../gateway/audio/wav';
import { codificarOggOpus, type ConfigOpus, opusDisponivel } from '../../codificadorOpus';
import type { ClipeRecortado } from './recorte';

/** Decisão assumida (25/11): 24 kbps até a escuta cega do dono (tarefa 1.2) dizer outro. */
export const BITRATE_DO_CLIPE = 24_000;

export async function codificarClipe(
  c: ClipeRecortado,
  bitrate = BITRATE_DO_CLIPE,
): Promise<{ audio: Blob; durMs: number }> {
  const config: ConfigOpus = { codec: 'opus', sampleRate: c.sr, numberOfChannels: 1, bitrate };
  if (await opusDisponivel(config)) {
    try {
      const ogg = await codificarOggOpus(c.pcm, config);
      return { audio: new Blob([ogg as BlobPart], { type: 'audio/ogg; codecs=opus' }), durMs: c.durMs };
    } catch {
      /* o WAV sempre funciona */
    }
  }
  return { audio: encodeWav(c.pcm, c.sr), durMs: c.durMs };
}
