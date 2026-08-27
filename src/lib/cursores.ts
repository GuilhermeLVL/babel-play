/**
 * CURSORES TEMÁTICOS — o mouse como cosmético (referência: custom-cursor.com e afins).
 *
 * Cada cursor é um emoji desenhado num SVG data-URI de 28px; o CSS entra num <style> injetado
 * (uma regra por cursor, sempre com `auto` de reserva — se o data-URI falhar, o sistema volta ao
 * cursor normal, nunca a lugar nenhum). Aplicação via atributo `data-cursor` no <html>, o mesmo
 * padrão de data-theme/data-fonte/data-particulas.
 */

export interface CursorTematico { id: string; nome: string; emoji: string }

export const CURSORES: CursorTematico[] = [
  { id: 'padrao', nome: 'Padrão do sistema', emoji: '🖱️' },
  { id: 'pato', nome: 'Pato de borracha', emoji: '🦆' },
  { id: 'fogo', nome: 'Fogo', emoji: '🔥' },
  { id: 'varinha', nome: 'Varinha mágica', emoji: '🪄' },
  { id: 'mira', nome: 'Mira', emoji: '🎯' },
  { id: 'espada', nome: 'Espada', emoji: '⚔️' },
  { id: 'pizza', nome: 'Pizza', emoji: '🍕' },
  { id: 'invader', nome: 'Invader', emoji: '👾' },
  { id: 'foguete', nome: 'Foguete', emoji: '🚀' },
];

const CHAVE = 'babel.cursor';
const ID_STYLE = 'babel-cursores-css';

function cssDoCursor(c: CursorTematico): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><text x='0' y='22' font-size='22'>${c.emoji}</text></svg>`;
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 4 4`;
  return `html[data-cursor="${c.id}"], html[data-cursor="${c.id}"] * { cursor: ${uri}, auto !important; }`;
}

/** Injeta as regras uma vez (id fixo: reexecutar não duplica). */
export function instalarCursores(): void {
  if (typeof document === 'undefined' || document.getElementById(ID_STYLE)) return;
  const style = document.createElement('style');
  style.id = ID_STYLE;
  style.textContent = CURSORES.filter((c) => c.id !== 'padrao').map(cssDoCursor).join('\n');
  document.head.appendChild(style);
}

export function readCursor(): string {
  try {
    const v = localStorage.getItem(CHAVE) ?? 'padrao';
    return CURSORES.some((c) => c.id === v) ? v : 'padrao';
  } catch { return 'padrao'; }
}

export function applyCursor(id: string): void {
  if (typeof document === 'undefined') return;
  instalarCursores();
  if (id === 'padrao') document.documentElement.removeAttribute('data-cursor');
  else document.documentElement.setAttribute('data-cursor', id);
}

export function setCursor(id: string): string {
  const valido = CURSORES.some((c) => c.id === id) ? id : 'padrao';
  try { localStorage.setItem(CHAVE, valido); } catch { /* sem storage */ }
  applyCursor(valido);
  return valido;
}
