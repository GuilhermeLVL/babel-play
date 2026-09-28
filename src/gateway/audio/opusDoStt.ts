/**
 * O CORPO DE CADA FALA ENVIADA AO STT DE NUVEM — Ogg Opus quando o navegador codifica, WAV quando não.
 *
 * POR QUE (auditoria de eficiência da IA, 28/09/2026, achado 3). O WAV de 16 bits a 16 kHz são
 * ~32 KB por segundo de fala; uma hora de captura na nuvem, ~115 MB no plano de dados do celular.
 * Opus a 24 kbps são ~3 KB/s — ~10× menos — e a bancada mediu WER 4,0% a 16, 24 e 32 kbps contra
 * 4,1% no original (docs/auditoria/eval/bancada-2026-09.md): não piora a transcrição. O PREÇO da
 * Groq não muda (ela cobra por segundo de áudio), e a duração cobrada continua medida no servidor,
 * que confere o granule do Ogg contra as amostras dos pacotes (`server/lib/duracaoDeAudio.ts`).
 *
 * A mesma taxa do gravador da sessão (`TAXA_DE_BITS_DA_GRAVACAO`) e o mesmo codificador da mistura
 * (`lib/codificadorOpus.ts`): uma régua só para "Opus de fala" no app.
 *
 * O RESERVA É O WAV DE SEMPRE: sem `AudioEncoder` (Safari antigo, Firefox antes do WebCodecs de
 * áudio, WebView sem a API), com o Opus recusado, ou com o codificador falhando no meio. Depois de
 * uma falha o Opus fica DESLIGADO até recarregar a página: tentar e falhar em toda fala só somaria
 * latência ao caminho da legenda.
 */
import { codificarOggOpus, opusDisponivel } from '../../lib/codificadorOpus';
import { TAXA_DE_BITS_DA_GRAVACAO } from '../capture/taxaDeBits';
import { encodeWav } from './wav';

export interface AudioDoStt {
  corpo: Blob;
  /** O `Content-Type` da requisição — o servidor mede pelos magic bytes, este é só o rótulo. */
  tipo: 'audio/ogg' | 'audio/wav';
}

/** Suporte por taxa de amostragem, memorizado: `isConfigSupported` é assíncrono e não muda na sessão. */
const suporte = new Map<number, Promise<boolean>>();
let opusDesligado = false;

const configDe = (taxa: number) =>
  ({ codec: 'opus', sampleRate: taxa, numberOfChannels: 1, bitrate: TAXA_DE_BITS_DA_GRAVACAO }) as const;

export async function audioParaStt(pcm: Float32Array, taxa: number): Promise<AudioDoStt> {
  if (!opusDesligado && pcm.length > 0) {
    let pode = suporte.get(taxa);
    if (!pode) {
      pode = opusDisponivel(configDe(taxa));
      suporte.set(taxa, pode);
    }
    if (await pode) {
      try {
        const ogg = await codificarOggOpus(pcm, configDe(taxa));
        return { corpo: new Blob([ogg.buffer as ArrayBuffer], { type: 'audio/ogg; codecs=opus' }), tipo: 'audio/ogg' };
      } catch {
        opusDesligado = true; // o WAV assume nesta fala e nas próximas
      }
    }
  }
  return { corpo: encodeWav(pcm, taxa), tipo: 'audio/wav' };
}
