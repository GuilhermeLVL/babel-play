/**
 * CATÁLOGO DE EMOJIS — a matéria-prima das partículas, do rastro, dos cursores e dos packs.
 *
 * Centenas de emojis custam quase nada: é uma lista de strings (≈ 4 KB). O que seria caro é
 * gerar CSS ou imagem por item — e aqui nada disso acontece: o canvas desenha via `fillText`, o
 * cursor vira SVG data-URI só para o emoji EQUIPADO (ver `lib/cursores`). Por isso a galeria pode
 * ser generosa sem pesar no arranque.
 *
 * Organizado por categoria para o editor de packs (buscar, escolher, excluir) e para os packs
 * temáticos gerados. Sem emojis de bandeira/gestos com tom de pele: renderizam mal no Windows.
 */
export interface CategoriaDeEmoji { id: string; nome: string; emojis: string[] }

export const CATEGORIAS_DE_EMOJI: CategoriaDeEmoji[] = [
  { id: 'patos', nome: 'Patos & aves', emojis: ['🦆', '🐤', '🐥', '🐣', '🐔', '🐓', '🦢', '🦩', '🦜', '🦚', '🦉', '🦅', '🦤', '🐧', '🕊️', '🦃', '🪿', '🐦'] },
  { id: 'animais', nome: 'Animais', emojis: ['🐱', '🐶', '🦊', '🐸', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐭', '🐹', '🐰', '🐻', '🐻‍❄️', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🐈', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🦔', '🐉', '🐲', '🦕', '🦖'] },
  { id: 'comidas', nome: 'Comidas', emojis: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇', '🥞', '🧈', '🍞', '🥐', '🥖', '🥨', '🥯', '🧀', '🥗', '🥙', '🌮', '🌯', '🫔', '🥪', '🍱', '🍜', '🍝', '🍛', '🍣', '🍤', '🍙', '🍚', '🍘', '🥟', '🥠', '🍢', '🍡', '🧆', '🥘', '🍲', '🫕', '🥣', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍓', '🍒', '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🫐', '🍈', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🌶️', '🥕', '🌽', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰'] },
  { id: 'bebidas', nome: 'Bebidas', emojis: ['☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹', '🧉', '🥛', '🍶', '🧊'] },
  { id: 'natureza', nome: 'Natureza', emojis: ['🌸', '🌺', '🌻', '🌼', '🌷', '🌹', '🥀', '💐', '🍀', '☘️', '🌿', '🍃', '🍂', '🍁', '🌱', '🌵', '🌴', '🌳', '🌲', '🎋', '🎍', '🪴', '🌾', '🪷', '🪻', '🌈', '☀️', '🌤️', '⛅', '🌧️', '⛈️', '🌩️', '❄️', '☃️', '⛄', '🌊', '💧', '🔥', '🌪️', '🌫️', '🌙', '⭐', '🌟', '✨', '💫', '☄️', '🌍', '🌎', '🌏', '🪨', '🏔️', '🌋', '🏝️', '🏜️'] },
  { id: 'espaco', nome: 'Espaço', emojis: ['🚀', '🛸', '🪐', '👽', '👾', '🛰️', '🔭', '🌌', '🌠', '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🧑‍🚀', '☄️', '🌟'] },
  { id: 'festa', nome: 'Festa', emojis: ['🎉', '🎊', '🎈', '🥳', '🪅', '🎁', '🎀', '🎂', '🎆', '🎇', '🧨', '🪩', '🎏', '🎐', '🎑', '🎃', '🎄', '🎋', '🪄', '🎭', '🎪'] },
  { id: 'musica', nome: 'Música', emojis: ['🎵', '🎶', '🎸', '🎤', '🥁', '🎹', '🎧', '🎷', '🎺', '🎻', '🪕', '🪗', '🪘', '📻', '🎼', '🔔'] },
  { id: 'esportes', nome: 'Esportes', emojis: ['⚽', '🏀', '🏐', '🏈', '⚾', '🥎', '🎾', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏁', '🎮', '🕹️', '🎲', '🧩', '♟️', '🎯', '🎳'] },
  { id: 'coracoes', nome: 'Corações', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗', '💓', '💞', '💕', '💘', '💝', '💟', '❣️', '💔', '❤️‍🔥', '💌'] },
  { id: 'rostos', nome: 'Rostinhos', emojis: ['😀', '😄', '😁', '😆', '🥹', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '🤩', '🥳', '😎', '🤓', '🧐', '🤔', '🤗', '🤭', '🫡', '😴', '🤤', '🥱', '🤯', '😱', '😭', '😤', '🥶', '🥵', '🤠', '🤡', '👻', '💀', '👽', '🤖', '🎃', '😺', '😸', '😹', '😻', '🙀', '😼'] },
  { id: 'objetos', nome: 'Objetos', emojis: ['💎', '👑', '🪙', '💰', '💸', '🔮', '🧿', '📿', '🔑', '🗝️', '🔒', '🧲', '🧪', '🧬', '🔬', '💡', '🔦', '🕯️', '🪔', '📚', '📖', '✏️', '🖍️', '🖌️', '📝', '📌', '📎', '✂️', '🧷', '🧵', '🧶', '🪡', '⏰', '⌛', '⏳', '🧭', '🗺️', '🎒', '👓', '🕶️', '🎩', '🧢', '👒', '🎓', '⚙️', '🔧', '🔨', '🛠️', '⚔️', '🛡️', '🏹', '🪃', '🧸', '🪆', '🎁', '🪞', '🛎️', '🧯', '🪜'] },
  { id: 'transporte', nome: 'Transporte', emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🚂', '🚆', '🚇', '🚊', '🚝', '✈️', '🛩️', '🚁', '⛵', '🚤', '🛳️', '⛴️', '🚢', '🛶', '🚀', '🛸', '🎈', '🪂'] },
  { id: 'simbolos', nome: 'Símbolos', emojis: ['✅', '❌', '⭕', '❗', '❓', '💯', '🔆', '🔅', '♻️', '⚡', '🔥', '💥', '💫', '🌀', '💤', '🎵', '➕', '➖', '✖️', '➗', '♾️', '🔱', '⚜️', '🔰', '🔷', '🔶', '🔵', '🟢', '🟡', '🟠', '🔴', '🟣', '⚫', '⚪', '🟤', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🔺', '🔻', '🔸', '🔹', '💠', '🔘'] },
];

/** Todos, sem repetição, na ordem das categorias. */
export function todosOsEmojis(): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const c of CATEGORIAS_DE_EMOJI) for (const e of c.emojis) if (!vistos.has(e)) { vistos.add(e); lista.push(e); }
  return lista;
}

/** Só emojis do catálogo (e sem repetição): o pack personalizado não aceita string qualquer. */
export function sanearListaDeEmojis(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const validos = new Set(todosOsEmojis());
  const saida: string[] = [];
  for (const e of lista) if (typeof e === 'string' && validos.has(e) && !saida.includes(e)) saida.push(e);
  return saida.slice(0, 120);
}
