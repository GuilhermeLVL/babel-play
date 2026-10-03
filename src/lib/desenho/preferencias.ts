/**
 * AS PREFERÊNCIAS DO DESENHO (tipo, cor, grossura, opacidade, últimas cores) lembradas entre sessões.
 * `localStorage` com try/catch: sem armazenamento, valem só nesta abertura.
 */
import { normalizarHex } from './cor';
import { type Ferramenta, FERRAMENTAS, LARGURA_PADRAO, limitarLargura, OPACIDADE_PADRAO } from './tracos';

export const CHAVE_PREFERENCIAS = 'babel.desenho.preferencias';
export const MAX_RECENTES = 6;

export interface PreferenciasDeDesenho {
  ferramenta: Ferramenta;
  cor: string;
  larguras: Record<Ferramenta, number>;
  opacidadePincel: number;
  opacidadeMarcaTexto: number;
  recentes: string[];
}

/** A cor de antes (o laranja do app) continua sendo a de partida. */
export const COR_PADRAO = '#e8542b';

export function preferenciasPadrao(): PreferenciasDeDesenho {
  return {
    ferramenta: 'caneta',
    cor: COR_PADRAO,
    larguras: { ...LARGURA_PADRAO },
    opacidadePincel: OPACIDADE_PADRAO.pincel,
    opacidadeMarcaTexto: OPACIDADE_PADRAO['marca-texto'],
    recentes: [],
  };
}

const opac = (v: unknown, padrao: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0.1, v)) : padrao;

/** Lê o que veio do armazenamento sem confiar em nada: o que não serve volta ao padrão. */
export function lerPreferencias(texto: string | null | undefined): PreferenciasDeDesenho {
  const p = preferenciasPadrao();
  if (!texto) return p;
  try {
    const o = JSON.parse(texto) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return p;
    if (FERRAMENTAS.includes(o.ferramenta as Ferramenta)) p.ferramenta = o.ferramenta as Ferramenta;
    if (typeof o.cor === 'string') p.cor = normalizarHex(o.cor) ?? p.cor;
    if (o.larguras && typeof o.larguras === 'object') {
      for (const f of FERRAMENTAS) {
        const v = (o.larguras as Record<string, unknown>)[f];
        if (typeof v === 'number') p.larguras[f] = limitarLargura(v);
      }
    }
    p.opacidadePincel = opac(o.opacidadePincel, p.opacidadePincel);
    p.opacidadeMarcaTexto = opac(o.opacidadeMarcaTexto, p.opacidadeMarcaTexto);
    if (Array.isArray(o.recentes)) {
      p.recentes = o.recentes
        .map((c) => (typeof c === 'string' ? normalizarHex(c) : null))
        .filter((c): c is string => !!c)
        .slice(0, MAX_RECENTES);
    }
  } catch {
    /* texto estragado: padrão */
  }
  return p;
}

export function carregarPreferencias(): PreferenciasDeDesenho {
  try {
    return lerPreferencias(localStorage.getItem(CHAVE_PREFERENCIAS));
  } catch {
    return preferenciasPadrao();
  }
}

export function guardarPreferencias(p: PreferenciasDeDesenho): void {
  try {
    localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p));
  } catch {
    /* sem armazenamento (ou cheio): vale só nesta abertura */
  }
}

/** A cor usada entra na frente das últimas cores, sem repetir, até o teto de 6. */
export function pushRecente(recentes: readonly string[], cor: string): string[] {
  const c = normalizarHex(cor);
  if (!c) return [...recentes];
  return [c, ...recentes.filter((x) => x !== c)].slice(0, MAX_RECENTES);
}

export const opacidadeDe = (p: PreferenciasDeDesenho, f: Ferramenta): number =>
  f === 'pincel' ? p.opacidadePincel : f === 'marca-texto' ? p.opacidadeMarcaTexto : 1;
