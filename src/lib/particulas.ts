/**
 * ESTILO DE PARTICULA — a "skin" das comemoracoes comuns.
 *
 * O usuario escolhe no painel de Aparencia; o ParticleCanvas le o atributo `data-particulas` no
 * <html> na hora de CRIAR cada particula: rajadas sem forma declarada (os acertos comuns) ganham
 * a forma da skin. Rajadas com forma propria (confete de rodada perfeita, patos, raios dos
 * eventos) NAO mudam — evento raro tem identidade propria.
 */
/* `cometa` é EXCLUSIVA de conquista ("Ouvinte"): círculo com cauda, nunca à venda. */
import { sanearListaDeEmojis } from './galeria/emojis';

export type ParticulasType = 'tema' | 'pixel' | 'confete' | 'coracoes' | 'estrelas' | 'emoji' | 'cometa';

export interface ParticulasOption { id: ParticulasType; name: string; desc: string }

export const PARTICULAS_OPTIONS: ParticulasOption[] = [
  { id: 'tema', name: 'Do tema', desc: 'Faiscas redondas na cor do tema (padrao).' },
  { id: 'pixel', name: 'Pixel', desc: 'Quadrados duros, estilo 8-bits.' },
  { id: 'confete', name: 'Confete', desc: 'Papel picado girando.' },
  { id: 'coracoes', name: 'Coracoes', desc: 'Coracoes subindo a cada acerto.' },
  { id: 'estrelas', name: 'Estrelas', desc: 'Estrelinhas brilhantes.' },
  { id: 'emoji', name: 'Chuva de Emojis', desc: 'Os emojis do PACK equipado em cada acerto.' },
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

/* ─────────────── PACKS DE EMOJI ───────────────
   O pack equipado alimenta a skin 'emoji', o rastro do mouse e os fallbacks do canvas. Chave
   PROPRIA de localStorage (a chave `app_particulas` valida contra PARTICULAS_OPTIONS e nao
   aceitaria um objeto). Catalogo generoso de proposito: agora que existe loja, variedade e ativo. */
export interface PackDeEmoji { id: string; nome: string; emojis: string[] }

export const PACKS_DE_EMOJI: PackDeEmoji[] = [
  { id: 'classico', nome: 'Clássico', emojis: ['⭐', '✨', '💫', '🌟'] },
  { id: 'animais', nome: 'Animais', emojis: ['🦆', '🐱', '🐶', '🦊', '🐸', '🐼', '🦜'] },
  { id: 'comidas', nome: 'Comidas', emojis: ['🍕', '🍔', '🍩', '🍦', '🌮', '🍓', '🍿'] },
  { id: 'espaco', nome: 'Espaço', emojis: ['🚀', '🪐', '👽', '☄️', '🌌', '🛸', '⭐'] },
  { id: 'natureza', nome: 'Natureza', emojis: ['🌸', '🍀', '🌈', '☀️', '🌊', '🍁', '🌵'] },
  { id: 'festa', nome: 'Festa', emojis: ['🎉', '🎊', '🎈', '🥳', '🪅', '🎁', '🎂'] },
  { id: 'arrepio', nome: 'Arrepio', emojis: ['🎃', '👻', '💀', '🦇', '🕷️', '🧟', '🌙'] },
  { id: 'coracoes', nome: 'Corações', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '💖'] },
  { id: 'musica', nome: 'Música', emojis: ['🎵', '🎶', '🎸', '🎤', '🥁', '🎹', '🎧'] },
  { id: 'esportes', nome: 'Esportes', emojis: ['⚽', '🏀', '🏐', '🏆', '🎮', '🥇', '🏁'] },
  { id: 'brasil', nome: 'Brasil', emojis: ['🇧🇷', '⚽', '🏖️', '🦜', '☕', '🌴', '🎭'] },
  { id: 'tesouros', nome: 'Tesouros', emojis: ['💎', '👑', '🪙', '💰', '🔮', '🏆', '✨'] },
];

const CHAVE_PACK = 'app_particulas_pack';
const CHAVE_PACK_CUSTOM = 'babel.pack_custom';
/** O pack PERSONALIZADO (galeria, 2026-08-28): a lista que a pessoa montou no editor. */
export const PACK_CUSTOM = 'custom';

export function readPack(): string {
  try {
    const v = localStorage.getItem(CHAVE_PACK) ?? 'classico';
    if (v === PACK_CUSTOM) return lerPackCustom().length ? PACK_CUSTOM : 'classico';
    return PACKS_DE_EMOJI.some((p) => p.id === v) ? v : 'classico';
  } catch { return 'classico'; }
}

export function setPack(id: string): string {
  const valido = id === PACK_CUSTOM ? PACK_CUSTOM : PACKS_DE_EMOJI.some((p) => p.id === id) ? id : 'classico';
  try { localStorage.setItem(CHAVE_PACK, valido); } catch { /* sem storage */ }
  return valido;
}

export function lerPackCustom(): string[] {
  try { return sanearListaDeEmojis(JSON.parse(localStorage.getItem(CHAVE_PACK_CUSTOM) || '[]')); } catch { return []; }
}

/** Grava a lista personalizada (só emojis do catálogo) e a equipa. Lista vazia volta ao clássico. */
export function setPackCustom(lista: string[]): string[] {
  const limpa = sanearListaDeEmojis(lista);
  try { localStorage.setItem(CHAVE_PACK_CUSTOM, JSON.stringify(limpa)); } catch { /* sem storage */ }
  setPack(limpa.length ? PACK_CUSTOM : 'classico');
  return limpa;
}

export function emojisDoPack(): string[] {
  const id = readPack();
  if (id === PACK_CUSTOM) { const c = lerPackCustom(); if (c.length) return c; }
  return PACKS_DE_EMOJI.find((p) => p.id === id)?.emojis ?? ['⭐', '✨'];
}
