/**
 * CURSORES TEMÁTICOS — o mouse como cosmético (referência: custom-cursor.com e afins).
 *
 * Cada cursor é um emoji desenhado num SVG data-URI de 28px; o CSS entra num <style> injetado
 * (sempre com `auto` de reserva — se o data-URI falhar, o sistema volta ao cursor normal, nunca a
 * lugar nenhum). Aplicação via atributo `data-cursor` no <html>, o mesmo padrão de
 * data-theme/data-fonte/data-particulas.
 *
 * GALERIA (2026-08-28): QUALQUER emoji do catálogo (`lib/galeria/emojis`, centenas) vira cursor,
 * com id `emoji:<caractere>`. A regra CSS é injetada SÓ para o cursor equipado (uma regra por
 * vez, trocada ao aplicar) — centenas de cursores possíveis, um data-URI vivo.
 */
import { todosOsEmojis } from './galeria/emojis';

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
  /* TEMPORADA 1 (economia-legivel-e-moedas): cursores das décadas 6-10, onde o passe tinha
     casa vazia. Entram como itens PRÓPRIOS da lista — o catálogo aponta para o id daqui, e não
     para `emoji:<char>`, senão o item fica fora da régua que `cursorValido` aplica. */
  { id: 'golfinho', nome: 'Golfinho', emoji: '🐬' },
  { id: 'coruja', nome: 'Coruja', emoji: '🦉' },
  { id: 'borboleta', nome: 'Borboleta', emoji: '🦋' },
  { id: 'dragao', nome: 'Dragão', emoji: '🐉' },
  { id: 'unicornio', nome: 'Unicórnio', emoji: '🦄' },
  { id: 'tridente', nome: 'Tridente', emoji: '🔱' },
  { id: 'raio', nome: 'Raio', emoji: '⚡' },
  /* Exclusivo de conquista ("Perfeccionista"): não está à venda. */
  { id: 'coroa', nome: 'Coroa', emoji: '👑' },
  /* CURSORES VINDOS DO CATÁLOGO MESTRE (gamificacao-sob-autoridade). Mesma razão do bloco da
     Temporada 1 logo acima: entram como itens PRÓPRIOS desta lista, e não como `emoji:<char>`.
     Um `emoji:<char>` depende de a pessoa ter comprado a capacidade `gal-cursor-emoji` E de o
     caractere estar no catálogo da galeria — dois cadeados que nada têm a ver com o preço do
     item. Curado aqui, `cursorValido` aprova pelo id e o CSS já sai injetado por
     `instalarCursores`, que percorre exatamente esta lista. */
  { id: 'pata', nome: 'Patinha Ninja', emoji: '🐾' },
  { id: 'tinteiro', nome: 'Tinteiro de Pena', emoji: '🖋️' },
  /* LANTERNA, e não o laser do mestre. Lá este item é `cur-laser` com 🔫 — a pistola. Este app
     tem perfil infantil e a régua da casa não põe arma no ponteiro de quem está estudando; a
     função visual pretendida (apontar um facho, achar o alvo no escuro) sobrevive inteira na
     lanterna, então a troca não custa nada ao item e evita o que não queremos entregar. */
  { id: 'lanterna', nome: 'Lanterna', emoji: '🔦' },
  { id: 'trevo', nome: 'Trevo da Sorte', emoji: '🍀' },
  { id: 'cristal', nome: 'Cristal Rúnico', emoji: '💎' },
  { id: 'cafe', nome: 'Café Espresso', emoji: '☕' },
  { id: 'robot', nome: 'Autômato Retro', emoji: '🤖' },
  /* Exclusivo de conquista ("Sem erro"): não está à venda. */
  { id: 'katana', nome: 'Katana Samurai', emoji: '🗡️' },
];

const CHAVE = 'babel.cursor';
const ID_STYLE = 'babel-cursores-css';
const ID_STYLE_VIVO = 'babel-cursor-vivo-css';

function cssDoCursor(id: string, emoji: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><text x='0' y='22' font-size='22'>${emoji}</text></svg>`;
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 4 4`;
  const seletor = `html[data-cursor="${id.replace(/"/g, '')}"]`;
  return `${seletor}, ${seletor} * { cursor: ${uri}, auto !important; }`;
}

/** Injeta as regras dos curados uma vez (id fixo: reexecutar não duplica). */
export function instalarCursores(): void {
  if (typeof document === 'undefined' || document.getElementById(ID_STYLE)) return;
  const style = document.createElement('style');
  style.id = ID_STYLE;
  style.textContent = CURSORES.filter((c) => c.id !== 'padrao').map((c) => cssDoCursor(c.id, c.emoji)).join('\n');
  document.head.appendChild(style);
}

export function idDeCursorDeEmoji(emoji: string): string { return `emoji:${emoji}`; }

/** O emoji de um id (curado ou `emoji:<char>`), ou null se inválido. */
export function emojiDoCursor(id: string): string | null {
  const curado = CURSORES.find((c) => c.id === id);
  if (curado) return curado.emoji;
  if (id.startsWith('emoji:')) {
    const e = id.slice('emoji:'.length);
    return todosOsEmojis().includes(e) ? e : null;
  }
  return null;
}

export function cursorValido(id: string): boolean { return id === 'padrao' || emojiDoCursor(id) !== null; }

export function readCursor(): string {
  try {
    const v = localStorage.getItem(CHAVE) ?? 'padrao';
    return cursorValido(v) ? v : 'padrao';
  } catch { return 'padrao'; }
}

export function applyCursor(id: string): void {
  if (typeof document === 'undefined') return;
  instalarCursores();
  const raiz = document.documentElement;
  if (id === 'padrao' || !cursorValido(id)) { raiz.removeAttribute('data-cursor'); return; }
  // Cursor da galeria: uma regra viva, trocada a cada aplicação (os curados já têm as suas).
  if (id.startsWith('emoji:')) {
    let vivo = document.getElementById(ID_STYLE_VIVO);
    if (!vivo) { vivo = document.createElement('style'); vivo.id = ID_STYLE_VIVO; document.head.appendChild(vivo); }
    vivo.textContent = cssDoCursor(id, emojiDoCursor(id)!);
  }
  raiz.setAttribute('data-cursor', id);
}

export function setCursor(id: string): string {
  const valido = cursorValido(id) ? id : 'padrao';
  try { localStorage.setItem(CHAVE, valido); } catch { /* sem storage */ }
  applyCursor(valido);
  return valido;
}
