/**
 * O TECLADO DO TERMO POR IDIOMA (change `tela-de-jogos-v2`, 5.2).
 *
 * A resposta do Termo já chega NORMALIZADA (`chaveDoTermo`: sem acento, só A–Z, maiúscula), então
 * ñ, ç, ä, ö, ü viram N, C, A, O, U na comparação e não precisam de tecla própria: o que muda de
 * idioma para idioma é a DISPOSIÇÃO das 26 letras (QWERTZ no alemão, AZERTY no francês). Tecla
 * acentuada sairia da chave e não casaria com nada. `ß` vira "SS" na chave (`comBaseLatina`) e se
 * digita com duas teclas S.
 */

export type LinhasDoTeclado = readonly [string, string, string];

const QWERTY: LinhasDoTeclado = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const QWERTZ: LinhasDoTeclado = ['QWERTZUIOP', 'ASDFGHJKL', 'YXCVBNM'];
const AZERTY: LinhasDoTeclado = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];

/** As três linhas de letras do teclado de tela para o idioma da PALAVRA (QWERTY quando não há regra). */
export function linhasDoTeclado(lang?: string): LinhasDoTeclado {
  const base = (lang ?? '').toLowerCase().split(/[-_]/)[0];
  if (base === 'de') return QWERTZ;
  if (base === 'fr') return AZERTY;
  return QWERTY;
}

/**
 * A tecla física (`KeyboardEvent.key`) vira a letra A–Z da chave, ou `null` se não for uma letra
 * digitável. Aceita `ñ`, `ç`, `ä`… (viram a letra-base); `ß` e ligaduras (2 letras) ficam de fora.
 */
export function letraDaTecla(key: string): string | null {
  if (!key || [...key].length !== 1) return null;
  const base = key.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /^[A-Z]$/.test(base) ? base : null;
}
