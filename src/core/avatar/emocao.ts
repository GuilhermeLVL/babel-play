/**
 * EMOÇÃO DO AVATAR: da emoção do Frasy (`feliz`, `triste`...) para (a) a expressão do VRM e quanto dela mostrar,
 * e (b) os parâmetros de voz (`rate`, `pitch`). Puro e defensivo: valor desconhecido vira `neutro`; nada passa
 * dos limites do app (`rate` 0,5–2,5, `pitch` 0,5–1,5); a emoção NUNCA exagera (intensidade máxima 0,75).
 */
import { ehEmocaoDoAvatar, type EmocaoDoAvatar } from './estados';

export const RATE_MIN = 0.5;
export const RATE_MAX = 2.5;
export const PITCH_MIN = 0.5;
export const PITCH_MAX = 1.5;

/** Quanto de cada emoção a voz acompanha: multiplicadores sobre o que a pessoa configurou. Sempre modestos. */
const VOZ: Record<EmocaoDoAvatar, { rate: number; pitch: number }> = {
  neutro: { rate: 1, pitch: 1 },
  feliz: { rate: 1.05, pitch: 1.08 },
  triste: { rate: 0.9, pitch: 0.92 },
  bravo: { rate: 1.05, pitch: 0.95 },
  surpreso: { rate: 1.03, pitch: 1.1 },
  relaxado: { rate: 0.95, pitch: 0.98 },
};

const preso = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const numero = (v: unknown, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : padrao;

export interface VozBase {
  rate?: number;
  pitch?: number;
}

export interface VozDaEmocao {
  rate: number;
  /** Ausente quando o motor de voz não tem tom (a voz da nuvem): aí a emoção mexe só no ritmo. */
  pitch?: number;
}

/**
 * Os parâmetros de voz para uma emoção, a partir dos da pessoa. `temTom: false` (nuvem) devolve só `rate`.
 * Sempre dentro dos limites do app, mesmo que a base já esteja no limite.
 */
export function vozDaEmocao(emocao: unknown, base: VozBase = {}, temTom = true): VozDaEmocao {
  const e = ehEmocaoDoAvatar(emocao) ? emocao : 'neutro';
  const m = VOZ[e];
  const rate = preso(numero(base.rate, 1) * m.rate, RATE_MIN, RATE_MAX);
  if (!temTom) return { rate };
  return { rate, pitch: preso(numero(base.pitch, 1) * m.pitch, PITCH_MIN, PITCH_MAX) };
}

/* ─────────────────────────── a expressão do VRM ─────────────────────────── */

export type ExpressaoDeEmocao = 'happy' | 'sad' | 'angry' | 'surprised' | 'relaxed';

/** Preferência de expressão por emoção: a primeira que o modelo tiver. Nada serve: neutro (sem expressão). */
const CADEIA: Record<EmocaoDoAvatar, readonly ExpressaoDeEmocao[]> = {
  neutro: [],
  feliz: ['happy', 'relaxed'],
  triste: ['sad', 'relaxed'],
  bravo: ['angry', 'sad'],
  surpreso: ['surprised', 'happy'],
  relaxado: ['relaxed', 'happy'],
};

/** Intensidade máxima da expressão: um rosto 100% "happy" deforma a boca e parece caricatura. */
export const INTENSIDADE_MAXIMA = 0.75;

export interface ExpressaoEscolhida {
  /** Nome da expressão a usar, ou `null` = neutro (nenhuma). */
  nome: ExpressaoDeEmocao | null;
  /** 0..`INTENSIDADE_MAXIMA`. */
  intensidade: number;
  /** `true` quando a expressão pedida não existe no modelo e uma vizinha foi usada (ou o neutro). */
  substituta: boolean;
}

/** Todas as expressões de emoção conhecidas, para quem precisa zerar as que não estão em uso. */
export const EXPRESSOES_DE_EMOCAO: readonly ExpressaoDeEmocao[] = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];

/**
 * A expressão para uma emoção, dado o que o modelo tem. `intensidade` (0..1, padrão 1) é limitada a
 * `INTENSIDADE_MAXIMA`. Sem a expressão pedida usa a mais próxima da cadeia; sem nenhuma, neutro.
 */
export function expressaoDaEmocao(
  emocao: unknown,
  disponiveis: ReadonlySet<string> | readonly string[],
  intensidade = 1,
): ExpressaoEscolhida {
  const e = ehEmocaoDoAvatar(emocao) ? emocao : 'neutro';
  const tem = (n: string) =>
    disponiveis instanceof Set ? disponiveis.has(n) : (disponiveis as readonly string[]).includes(n);
  const forca = preso(typeof intensidade === 'number' && Number.isFinite(intensidade) ? intensidade : 1, 0, 1);
  const cadeia = CADEIA[e];
  for (let i = 0; i < cadeia.length; i += 1) {
    if (tem(cadeia[i])) return { nome: cadeia[i], intensidade: forca * INTENSIDADE_MAXIMA, substituta: i > 0 };
  }
  return { nome: null, intensidade: 0, substituta: cadeia.length > 0 };
}

/**
 * Quanto a emoção cede à boca enquanto ela fala: a vogal vence a emoção (as expressões de emoção deformam a
 * boca). `abertura` 0..1 → multiplicador 1..0,45.
 */
export function cederABoca(abertura: number): number {
  const a = preso(typeof abertura === 'number' && Number.isFinite(abertura) ? abertura : 0, 0, 1);
  return 1 - 0.55 * a;
}
