/**
 * ACESSO À GALERIA — o mapa de quem abre o quê (pedido do dono, 2026-08-28).
 *
 * O PROBLEMA: a galeria nasceu inteira livre, enquanto a Loja vende temas, packs, cursores e
 * rastros por nível/Seeds/conquista. Duas réguas para a mesma coisa é incoerência: por que pagar
 * o "Cursor Pato" se qualquer emoji vira cursor de graça? Aqui a galeria entra NA MESMA régua:
 * cada capacidade é um item da Loja (`tipo: 'galeria'`) e abre por nível OU Seeds OU conquista,
 * com `estadoDoItem` decidindo — uma verdade só.
 *
 * A PROGRESSÃO (gradativa, do básico ao raro):
 *   Nível 1  · paletas Claro e Papel · 5 categorias de emoji · packs prontos · perfis livres
 *   Nível 2  · paletas Pastel · editor de pack (escolher/excluir) · patos & aves, esportes
 *   Nível 3  · paletas Escuro · cursor de qualquer emoji · festa, música
 *   Nível 4  · espaço, transporte · rastro forma × paleta (por forma: exige o rastro da Loja)
 *   Nível 5  · paletas Néon · objetos, bebidas
 *   Nível 7  · paletas Meia-noite
 *   Conquista · corações (pack) · bolinhas do rastro (Colecionador) · tema Aurora (Constante)
 * Tudo o que tem nível também tem atalho em Seeds (a régua da Loja), e o que é de conquista não.
 *
 * EDIÇÃO COM O QUE SE TEM: o editor nunca some — mostra o cadeado com o motivo e o caminho
 * (nível, Seeds ou conquista). Presets listam o que falta; os livres aplicam na hora.
 */
import { CATALOGO_DA_LOJA, estadoDoItem, type ItemDaLoja } from '../loja';
import type { EstiloDePaleta } from './paletas';
import type { Perfil } from './perfis';
import { PACKS_DE_EMOJI } from '../particulas';

/** Item da Loja que abre um ESTILO de paleta (ausente = livre). */
export const ITEM_DO_ESTILO: Partial<Record<EstiloDePaleta, string>> = {
  pastel: 'gal-estilo-pastel',
  escuro: 'gal-estilo-escuro',
  neon: 'gal-estilo-neon',
  'meia-noite': 'gal-estilo-meia-noite',
};

/** Item da Loja que abre uma CATEGORIA de emoji (ausente = livre). */
export const ITEM_DA_CATEGORIA: Record<string, string | undefined> = {
  patos: 'gal-cat-patos',
  esportes: 'gal-cat-esportes',
  festa: 'gal-cat-festa',
  musica: 'gal-cat-musica',
  espaco: 'gal-cat-espaco',
  transporte: 'gal-cat-transporte',
  objetos: 'gal-cat-objetos',
  bebidas: 'gal-cat-bebidas',
  // Corações: o pack da Loja já é o item; a categoria abre junto com ele.
  coracoes: 'part-coracoes',
};

/** Item da Loja que abre cada FORMA do rastro personalizado. */
export const ITEM_DA_FORMA_DE_RASTRO: Record<string, string> = {
  faisca: 'ras-faisca',
  estrelas: 'ras-estrelas',
  coracoes: 'ras-coracoes',
  pixel: 'ras-pixel',
  arcoiris: 'ras-arcoiris',
};

export const ITEM_EDITOR_DE_PACK = 'gal-editor-pack';
export const ITEM_CURSOR_DE_EMOJI = 'gal-cursor-emoji';
export const ITEM_RASTRO_DE_EMOJIS = 'ras-emoji';

export interface Acesso {
  liberado: boolean;
  /** O caminho quando trancado ("Nível 3 ou 60 Seeds", "Conquista: Colecionador"). */
  motivo?: string;
  /** O item da Loja que abre (para o botão "Obter por N Seeds"). */
  item?: ItemDaLoja;
  compravel?: boolean;
}

const itemPorId = (id: string | undefined) => (id ? CATALOGO_DA_LOJA.find((i) => i.id === id) : undefined);

export function acessoAoItem(id: string | undefined, nivel: number, saldo: number): Acesso {
  const item = itemPorId(id);
  if (!item) return { liberado: true };
  const e = estadoDoItem(item, nivel, saldo);
  if (e.estado === 'equipavel') return { liberado: true, item };
  return { liberado: false, item, motivo: e.motivo ?? (item.precoSeeds ? `Nível ${item.nivel} ou ${item.precoSeeds} Seeds` : `Nível ${item.nivel}`), compravel: e.estado === 'compravel' };
}

/**
 * PALETAS × TEMA CUSTOM (decisão registrada na spec galeria-gating-fechado, 31/08): paleta é o
 * produto CURADO, em escada por estilo (claro/papel livres → meia-noite nv7) — aplicá-la seta
 * `theme='custom'` por mecânica, não por venda. Cores ARBITRÁRIAS são outro produto (o Estúdio /
 * `tema-custom`, nível 10), com porta própria. Por isso o gate de paleta é o do ESTILO, aqui,
 * e o de cores livres é o do Estúdio — os dois fail-closed nas próprias funções.
 */
export const acessoAoEstilo = (estilo: EstiloDePaleta, nivel: number, saldo: number) => acessoAoItem(ITEM_DO_ESTILO[estilo], nivel, saldo);
export const acessoACategoria = (categoria: string, nivel: number, saldo: number) => acessoAoItem(ITEM_DA_CATEGORIA[categoria], nivel, saldo);
export const acessoAFormaDeRastro = (forma: string, nivel: number, saldo: number) => acessoAoItem(ITEM_DA_FORMA_DE_RASTRO[forma], nivel, saldo);
export const acessoAoEditorDePack = (nivel: number, saldo: number) => acessoAoItem(ITEM_EDITOR_DE_PACK, nivel, saldo);
export const acessoAoCursorDeEmoji = (nivel: number, saldo: number) => acessoAoItem(ITEM_CURSOR_DE_EMOJI, nivel, saldo);
export const acessoAoRastroDeEmojis = (nivel: number, saldo: number) => acessoAoItem(ITEM_RASTRO_DE_EMOJIS, nivel, saldo);

/** Um emoji é usável se a categoria dele está liberada (busca pela primeira categoria que o contém). */
export function acessoAoEmoji(emoji: string, categorias: Array<{ id: string; emojis: string[] }>, nivel: number, saldo: number): Acesso {
  const cat = categorias.find((c) => c.emojis.includes(emoji));
  return cat ? acessoACategoria(cat.id, nivel, saldo) : { liberado: true };
}

/**
 * O que FALTA para um perfil inteiro: paleta (estilo), pack (categorias dos emojis ou o pack da
 * Loja), cursor (item da Loja ou cursor de emoji + categoria), rastro (item/forma/emojis), tema.
 * Lista vazia = aplicável agora.
 */
export function faltaParaOPerfil(
  p: Perfil,
  ctx: { nivel: number; saldo: number; estiloDaPaleta: (id: string) => EstiloDePaleta | undefined; categorias: Array<{ id: string; emojis: string[] }> },
): string[] {
  const falta = new Set<string>();
  const checa = (a: Acesso) => { if (!a.liberado && a.motivo) falta.add(`${a.item?.nome ?? 'item'}: ${a.motivo}`); };
  if (p.paleta) { const est = ctx.estiloDaPaleta(p.paleta); if (est) checa(acessoAoEstilo(est, ctx.nivel, ctx.saldo)); }
  if (p.tema) { const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && i.alvo === p.tema); if (item) checa(acessoAoItem(item.id, ctx.nivel, ctx.saldo)); }
  if (Array.isArray(p.pack)) {
    checa(acessoAoEditorDePack(ctx.nivel, ctx.saldo));
    for (const e of p.pack) checa(acessoAoEmoji(e, ctx.categorias, ctx.nivel, ctx.saldo));
  } else if (PACKS_DE_EMOJI.some((k) => k.id === p.pack)) {
    const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'pack' && i.alvo === p.pack); if (item) checa(acessoAoItem(item.id, ctx.nivel, ctx.saldo));
  }
  if (p.cursor.startsWith('emoji:')) { checa(acessoAoCursorDeEmoji(ctx.nivel, ctx.saldo)); checa(acessoAoEmoji(p.cursor.slice(6), ctx.categorias, ctx.nivel, ctx.saldo)); }
  else if (p.cursor !== 'padrao') { const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'cursor' && i.alvo === p.cursor); if (item) checa(acessoAoItem(item.id, ctx.nivel, ctx.saldo)); }
  if (p.rastro.startsWith('gen:')) { const forma = p.rastro.split(':')[1]; checa(acessoAFormaDeRastro(forma, ctx.nivel, ctx.saldo)); }
  else if (p.rastro.startsWith('emojis:')) { checa(acessoAoRastroDeEmojis(ctx.nivel, ctx.saldo)); for (const e of p.rastro.slice(7).split(',')) checa(acessoAoEmoji(e, ctx.categorias, ctx.nivel, ctx.saldo)); }
  else if (p.rastro !== 'off') { const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'rastro' && i.alvo === p.rastro); if (item) checa(acessoAoItem(item.id, ctx.nivel, ctx.saldo)); }
  const partItem = CATALOGO_DA_LOJA.find((i) => i.tipo === 'particulas' && i.alvo === p.particulas); if (partItem) checa(acessoAoItem(partItem.id, ctx.nivel, ctx.saldo));
  return [...falta];
}
