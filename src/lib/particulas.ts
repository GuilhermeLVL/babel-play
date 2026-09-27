/**
 * ESTILO DE PARTICULA — a "skin" das comemoracoes comuns.
 *
 * O usuario escolhe no painel de Aparencia; o ParticleCanvas le o atributo `data-particulas` no
 * <html> na hora de CRIAR cada particula: rajadas sem forma declarada (os acertos comuns) ganham
 * a forma da skin. Rajadas com forma propria (confete de rodada perfeita, patos, raios dos
 * eventos) NAO mudam — evento raro tem identidade propria.
 */
/* `cometa` é EXCLUSIVA de conquista ("Ouvinte"): círculo com cauda, nunca à venda.
   RECOMPENSAS v2 (27/09): a skin "Chuva de Emojis" e os PACKS DE EMOJI saíram. Quem tinha a skin
   equipada cai em "Do tema" (`readParticulas` só aceita o que está em PARTICULAS_OPTIONS). */
export type ParticulasType = 'tema' | 'pixel' | 'confete' | 'coracoes' | 'estrelas' | 'cometa';

export interface ParticulasOption { id: ParticulasType; name: string; desc: string }

export const PARTICULAS_OPTIONS: ParticulasOption[] = [
  { id: 'tema', name: 'Do tema', desc: 'Faiscas redondas na cor do tema (padrao).' },
  { id: 'pixel', name: 'Pixel', desc: 'Quadrados duros, estilo 8-bits.' },
  { id: 'confete', name: 'Confete', desc: 'Papel picado girando.' },
  { id: 'coracoes', name: 'Coracoes', desc: 'Coracoes subindo a cada acerto.' },
  { id: 'estrelas', name: 'Lampejo', desc: 'Lampejos de luz em ziguezague.' },
  { id: 'cometa', name: 'Cometa', desc: 'Exclusiva de conquista: bolas de luz com cauda.' },
];

const CHAVE = 'app_particulas';

export function readParticulas(): ParticulasType {
  try {
    const v = localStorage.getItem(CHAVE);
    return PARTICULAS_OPTIONS.some((o) => o.id === v) ? (v as ParticulasType) : 'tema';
  } catch { return 'tema'; }
}

export function applyParticulas(p: ParticulasType): void {
  document.documentElement.setAttribute('data-particulas', p);
}

export function setParticulas(p: ParticulasType): ParticulasType {
  try { localStorage.setItem(CHAVE, p); } catch { /* sem storage */ }
  applyParticulas(p);
  return p;
}
