/**
 * ESTILOS DE LEGENDA (recompensas v2, onda 4) — a legenda ao vivo como cosmético.
 *
 * Um estilo é quatro escolhas, todas de CSS (`src/styles/legendas.css`): a CAIXA atrás da fala, o
 * CONTORNO do texto, como a fala ENTRA e como a palavra que você já aprendeu se DESTACA. Nada
 * aqui espera nem recalcula: a legenda chega ao DOM no mesmo instante de sempre, e o estilo só a
 * veste — a latência não muda.
 *
 * ACESSIBILIDADE NÃO É RECOMPENSA. Tamanho, fonte e a cor de alto contraste continuam livres em
 * `TranscriptSettings` e GANHAM do estilo quando os dois brigam: o CSS dos estilos nunca declara
 * letra nem tamanho, e com alto contraste a caixa, o contorno e a cor do destaque saem. Com
 * movimento reduzido a fala não entra animada.
 *
 * A POSSE é a mesma régua da Loja (`estadoDoItem`): a clássica é livre; as outras são itens
 * `tipo: 'legenda'` de `src/core/catalogoV2.ts`, só com Seeds.
 */
import { movimentoReduzido } from './juice';
import { CATALOGO_DA_LOJA, estadoDoItem } from './loja';
import { DEFAULT_TRANSCRIPT_SETTINGS } from './transcriptUtils';

export interface EstiloDeLegenda {
  id: string;
  caixa: 'nenhuma' | 'solida' | 'vidro' | 'fita';
  contorno: 0 | 1 | 2;
  entrada: 'nenhuma' | 'surgir' | 'digitar';
  destaqueAprendida: 'sublinhado' | 'marca-texto' | 'cor';
}

export const ESTILO_PADRAO = 'classica';

/** Os 8 estilos de lançamento. Os nomes e preços moram no catálogo (`catalogoV2.ts`). */
export const ESTILOS_DE_LEGENDA: readonly EstiloDeLegenda[] = [
  { id: 'classica', caixa: 'nenhuma', contorno: 0, entrada: 'nenhuma', destaqueAprendida: 'sublinhado' },
  { id: 'cinema', caixa: 'solida', contorno: 0, entrada: 'surgir', destaqueAprendida: 'cor' },
  { id: 'fita', caixa: 'fita', contorno: 0, entrada: 'nenhuma', destaqueAprendida: 'marca-texto' },
  { id: 'contorno', caixa: 'nenhuma', contorno: 2, entrada: 'nenhuma', destaqueAprendida: 'cor' },
  { id: 'vidro', caixa: 'vidro', contorno: 0, entrada: 'surgir', destaqueAprendida: 'marca-texto' },
  { id: 'maquina', caixa: 'solida', contorno: 0, entrada: 'digitar', destaqueAprendida: 'sublinhado' },
  { id: 'karaoke', caixa: 'vidro', contorno: 1, entrada: 'digitar', destaqueAprendida: 'cor' },
  { id: 'letreiro', caixa: 'fita', contorno: 2, entrada: 'surgir', destaqueAprendida: 'marca-texto' },
];

const PADRAO = ESTILOS_DE_LEGENDA[0];

/** A pessoa pode usar este estilo? A régua da Loja, com o nível 1 de todo mundo (os estilos pagos
 *  são só de Seeds, então o nível não muda a resposta). Estilo fora do catálogo = livre. */
export function possuiEstiloDeLegenda(id: string): boolean {
  const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.alvo === id);
  return !item || estadoDoItem(item, 1, 0).estado === 'equipavel';
}

export interface ContextoDoEstilo {
  possui: (id: string) => boolean;
  movimentoReduzido: boolean;
  /** A cor de alto contraste da legenda está ligada (`textColor: 'highContrast'`). */
  altoContraste: boolean;
}

/**
 * O estilo que vale AGORA: o escolhido, se for seu e existir; senão a clássica. Depois, a
 * acessibilidade por cima: movimento reduzido tira a entrada; alto contraste tira caixa, contorno
 * e a cor do destaque (o sublinhado não mexe na cor que a pessoa pediu).
 */
export function resolverEstiloDeLegenda(id: string | undefined, ctx: Partial<ContextoDoEstilo> = {}): EstiloDeLegenda {
  const possui = ctx.possui ?? possuiEstiloDeLegenda;
  const escolhido = ESTILOS_DE_LEGENDA.find((e) => e.id === id);
  let e: EstiloDeLegenda = escolhido && possui(escolhido.id) ? escolhido : PADRAO;
  if (ctx.movimentoReduzido ?? movimentoReduzido()) e = { ...e, entrada: 'nenhuma' };
  if (ctx.altoContraste) {
    e = {
      ...e,
      caixa: 'nenhuma',
      contorno: 0,
      destaqueAprendida: e.destaqueAprendida === 'cor' ? 'sublinhado' : e.destaqueAprendida,
    };
  }
  return e;
}

/** As classes que `legendas.css` lê, no contêiner da legenda. */
export function classesDoEstilo(e: EstiloDeLegenda): string {
  return `leg-estilo leg-caixa-${e.caixa} leg-contorno-${e.contorno} leg-entrada-${e.entrada} leg-destaque-${e.destaqueAprendida}`;
}

/* ── o estilo equipado: mora nos ajustes da legenda (`transcriptSettings`) ── */

const CHAVE = 'transcriptSettings';
/** O evento que a captura aberta já escuta para reler os ajustes da legenda. */
export const EVENTO_AJUSTES_DA_LEGENDA = 'transcriptSettingsChanged';

export function lerEstiloDeLegenda(): string {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || '{}') as { estilo?: unknown };
    return typeof salvo.estilo === 'string' ? salvo.estilo : ESTILO_PADRAO;
  } catch {
    return ESTILO_PADRAO;
  }
}

/** Equipa: grava junto dos outros ajustes da legenda (sem apagar nenhum) e avisa quem está aberto. */
export function equiparEstiloDeLegenda(id: string): void {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || '{}') as Record<string, unknown>;
    // Os padrões por baixo: equipar antes de abrir a captura não pode gravar ajustes pela metade.
    localStorage.setItem(CHAVE, JSON.stringify({ ...DEFAULT_TRANSCRIPT_SETTINGS, ...salvo, estilo: id }));
  } catch {
    /* sem storage: fica a clássica */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_AJUSTES_DA_LEGENDA));
}

/* ── a palavra já aprendida ── */

/** Forma de comparar palavra da legenda com palavra do caderno: sem pontuação, minúscula. */
export function chaveDaPalavra(palavra: string): string {
  return palavra.replace(/[,.:;?!¿¡"“”'’()[\]]/g, '').toLowerCase();
}

/**
 * A fala em pedaços, marcando as palavras aprendidas. Os espaços continuam no texto, então a
 * legenda lê exatamente igual; sem nenhuma aprendida, volta um pedaço só (nada muda no DOM).
 */
export function pedacosDaLegenda(texto: string, aprendidas: ReadonlySet<string> | undefined): { texto: string; aprendida: boolean }[] {
  if (!aprendidas?.size) return [{ texto, aprendida: false }];
  const partes = texto.split(/(\s+)/);
  if (!partes.some((p) => aprendidas.has(chaveDaPalavra(p)))) return [{ texto, aprendida: false }];
  return partes.filter((p) => p !== '').map((p) => ({ texto: p, aprendida: !/^\s+$/.test(p) && aprendidas.has(chaveDaPalavra(p)) }));
}
