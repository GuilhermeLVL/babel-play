/**
 * O modelo de transcrição FIXADO pela pessoa (tela de modelos). `'auto'` = o roteador decide.
 * Guardado só neste navegador (`localStorage`); sem armazenamento, vale o automático.
 */
import { IDIOMAS_DO_PARAKEET } from './adapters/parakeetModelo';

export type ModeloFixo =
  | 'auto'
  | 'parakeet'
  | 'whisper-small'
  | 'whisper-base'
  | 'whisper-tiny'
  | 'moonshine-base'
  | 'moonshine-tiny';

export const CHAVE_DO_MODELO_FIXO = 'babel.stt.modeloFixo';

const VALORES: readonly ModeloFixo[] = [
  'auto',
  'parakeet',
  'whisper-small',
  'whisper-base',
  'whisper-tiny',
  'moonshine-base',
  'moonshine-tiny',
];

/** O modelo fixado; qualquer valor desconhecido ou a falta de `localStorage` = `'auto'`. */
export function lerModeloFixo(): ModeloFixo {
  try {
    const v = localStorage.getItem(CHAVE_DO_MODELO_FIXO);
    return VALORES.includes(v as ModeloFixo) ? (v as ModeloFixo) : 'auto';
  } catch {
    return 'auto';
  }
}

export function gravarModeloFixo(m: ModeloFixo): void {
  try {
    if (m === 'auto') localStorage.removeItem(CHAVE_DO_MODELO_FIXO);
    else localStorage.setItem(CHAVE_DO_MODELO_FIXO, m);
  } catch {
    /* sem armazenamento: vale só nesta página */
  }
}

/** O modelo fixado serve a TODOS estes idiomas? Parakeet só pt/es; Moonshine só inglês; Whisper qualquer. */
export function modeloFixoServe(m: ModeloFixo, idiomas: string[]): boolean {
  const langs = idiomas.map((l) => (l || '').toLowerCase().split('-')[0]);
  if (m === 'parakeet') return langs.every((l) => IDIOMAS_DO_PARAKEET.includes(l));
  if (m === 'moonshine-base' || m === 'moonshine-tiny') return langs.every((l) => l === 'en');
  return true;
}

/**
 * O Parakeet VETADO neste aparelho (a aba caiu com ele, ou a sonda o proibiu) sai da conta do roteador:
 * nem o automático (`parakeetNoAparelho`) nem o fixado pela pessoa. Uma regra só, para a captura e para
 * as estimativas da tela (`LiveCapture`), que precisam bater com a rota real.
 */
export function entradaDoParakeet(
  vetado: boolean,
  temCopia: boolean,
  fixo: ModeloFixo,
): { parakeetNoAparelho: boolean; modeloFixo: ModeloFixo } {
  return {
    parakeetNoAparelho: !vetado && temCopia,
    modeloFixo: vetado && fixo === 'parakeet' ? 'auto' : fixo,
  };
}
