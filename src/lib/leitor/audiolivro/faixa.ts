/**
 * QUAL FAIXA ESTE NAVEGADOR TOCA (F2, spec §6.2): Opus em WebM/Ogg é a faixa do lote; AAC (`.m4a`) é a 2ª faixa, só
 * para o Safari sem Opus. O contrato do manifesto tem UM `formato`: um manifesto com `codec: 'aac'` é o da faixa AAC.
 * Nenhuma faixa tocável = `null` e o narrador local lê.
 */
import type { ManifestoDeAudio } from '../../../core/leitura/audiolivro';

export interface Faixa {
  ext: 'opus' | 'm4a';
  mime: string;
}

const OPUS = ['audio/webm; codecs="opus"', 'audio/ogg; codecs="opus"'];
const AAC = 'audio/mp4; codecs="mp4a.40.2"';

export function escolherFaixa(m: ManifestoDeAudio, canPlayType: (tipo: string) => string): Faixa | null {
  if (m.formato.codec === 'opus') {
    /* O lote grava Opus em WebM (`gerar-livro.mjs`); o MIME declarado é o do contêiner do arquivo. */
    return OPUS.some((t) => canPlayType(t) !== '') ? { ext: 'opus', mime: OPUS[0] } : null;
  }
  return canPlayType(AAC) !== '' ? { ext: 'm4a', mime: AAC } : null;
}
