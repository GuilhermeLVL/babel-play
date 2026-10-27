/**
 * AS FRASES DO CAPÍTULO NA TELA (a narração, L3): o texto do documento da seção carregada vira frases
 * (`frasesDoTexto`, o `Intl.Segmenter`) e cada frase volta a ser um `Range` no documento — é o `Range` que o
 * destaque desenha (o overlayer do foliate, no documento do APP: o iframe não tem script) e que vira CFI.
 *
 * O texto é montado nó a nó; entre dois nós de blocos diferentes (parágrafos, títulos, itens) entra um `\n`
 * virtual, para a frase nunca atravessar parágrafo.
 */
import { type FraseDoTexto, frasesDoTexto } from '../../core/leitura/narracao';

const BLOCOS =
  'p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, figcaption, pre, div, section, article, body';
const FORA = 'script, style, noscript, template, head, title, rt, rp';

export interface FraseNoCapitulo {
  texto: string;
  range: Range;
}

interface PedacoDoTexto {
  no: Text;
  /** Onde o nó começa no texto montado. */
  inicio: number;
}

/** O texto montado do documento e onde cada nó de texto mora nele. Exportada para o teste. */
export function textoDoDocumento(doc: Document): { texto: string; pedacos: PedacoDoTexto[] } {
  const raiz = doc.body ?? doc.documentElement;
  const pedacos: PedacoDoTexto[] = [];
  let texto = '';
  if (!raiz) return { texto, pedacos };
  let blocoAnterior: Element | null = null;
  const walker = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest(FORA) ?? null) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const conteudo = n.data;
    if (!conteudo) continue;
    const bloco = n.parentElement?.closest(BLOCOS) ?? null;
    if (blocoAnterior && bloco !== blocoAnterior && texto && !texto.endsWith('\n')) texto += '\n';
    blocoAnterior = bloco;
    pedacos.push({ no: n, inicio: texto.length });
    texto += conteudo;
  }
  return { texto, pedacos };
}

/** O (nó, offset) da posição `i` do texto montado. `fim` = a posição fecha um trecho (fica no nó anterior). */
function lugarDe(pedacos: PedacoDoTexto[], i: number, fim: boolean): { no: Text; offset: number } | null {
  let lo = 0;
  let hi = pedacos.length - 1;
  let achado = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (pedacos[m].inicio <= i) {
      achado = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  if (achado < 0) return pedacos[0] ? { no: pedacos[0].no, offset: 0 } : null;
  let p = pedacos[achado];
  /* O fim exatamente no começo de um nó fecha no fim do anterior (o destaque não pega um pedaço vazio). */
  if (fim && i === p.inicio && achado > 0) {
    p = pedacos[achado - 1];
    return { no: p.no, offset: p.no.data.length };
  }
  return { no: p.no, offset: Math.min(i - p.inicio, p.no.data.length) };
}

/** As frases do documento, cada uma com o seu `Range`. */
export function frasesDoDocumento(doc: Document, idioma?: string): FraseNoCapitulo[] {
  const { texto, pedacos } = textoDoDocumento(doc);
  if (!pedacos.length) return [];
  const out: FraseNoCapitulo[] = [];
  for (const f of frasesDoTexto(texto, idioma)) {
    const r = rangeDe(doc, pedacos, f);
    if (r) out.push({ texto: f.texto.replace(/\s+/g, ' '), range: r });
  }
  return out;
}

function rangeDe(doc: Document, pedacos: PedacoDoTexto[], f: FraseDoTexto): Range | null {
  const a = lugarDe(pedacos, f.inicio, false);
  const b = lugarDe(pedacos, f.fim, true);
  if (!a || !b) return null;
  const r = doc.createRange();
  try {
    r.setStart(a.no, a.offset);
    r.setEnd(b.no, b.offset);
  } catch {
    return null;
  }
  return r;
}

/**
 * DE ONDE A NARRAÇÃO COMEÇA, dado um ponto do capítulo (o começo da página visível, ou a frase guardada pelo
 * CFI): a primeira frase que começa nele ou depois (a frase que começou na página anterior não puxa a página de
 * volta); se nenhuma começa depois (uma frase só ocupa a página inteira), a última. Vazio = 0.
 */
export function indiceDaFraseEm(frases: FraseNoCapitulo[], no: Node, offset: number): number {
  if (!frases.length) return 0;
  const ponto = (no.ownerDocument ?? (no as Document)).createRange();
  try {
    ponto.setStart(no, offset);
  } catch {
    return 0;
  }
  ponto.collapse(true);
  /* `a.compareBoundaryPoints(START_TO_START, b)` ≥ 0: o começo de `a` está no começo de `b` ou depois. */
  const i = frases.findIndex((f) => f.range.compareBoundaryPoints(Range.START_TO_START, ponto) >= 0);
  return i < 0 ? frases.length - 1 : i;
}

/** O trecho está (pelo começo) dentro do intervalo visível? */
export function comecaDentro(trecho: Range, visivel: Range | null | undefined): boolean {
  if (!visivel) return false;
  try {
    return (
      /* começo do trecho ≥ começo do visível, e começo do trecho < fim do visível (END_TO_START: o começo do
         `this` contra o fim do argumento) */
      trecho.compareBoundaryPoints(Range.START_TO_START, visivel) >= 0 &&
      trecho.compareBoundaryPoints(Range.END_TO_START, visivel) < 0
    );
  } catch {
    return false; // documentos diferentes (o capítulo mudou)
  }
}
