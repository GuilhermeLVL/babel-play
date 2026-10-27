/**
 * A PALAVRA E A FRASE DENTRO DO DOCUMENTO DO LIVRO (o `iframe` de cada seção): o toque vira palavra pelo
 * `caretRangeFromPoint` + `Intl.Segmenter` (sem cortar "d'água" nem "co-operate"), e a palavra ou o trecho
 * selecionado viram FRASE (o contexto do cartão) e CITAÇÃO (o `TextQuoteSelector` da anotação).
 */
import { type CitacaoDoTexto, MAX_CITACAO, MAX_CONTEXTO } from '../../core/leitura/anotacao';

const BLOCOS = 'p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, figcaption, div, section, body';

type DocComCaret = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function caretNoPonto(doc: DocComCaret, x: number, y: number): { no: Node; offset: number } | null {
  const p = doc.caretPositionFromPoint?.(x, y);
  if (p) return { no: p.offsetNode, offset: p.offset };
  const r = doc.caretRangeFromPoint?.(x, y);
  return r ? { no: r.startContainer, offset: r.startOffset } : null;
}

/** O pedaço de palavra (`isWordLike`) do texto que contém `offset`. Exportada para o teste. */
export function palavraEm(texto: string, offset: number, idioma?: string): { inicio: number; fim: number } | null {
  const seg = new Intl.Segmenter(idioma || undefined, { granularity: 'word' });
  for (const s of seg.segment(texto)) {
    if (offset >= s.index && offset < s.index + s.segment.length) {
      return s.isWordLike ? { inicio: s.index, fim: s.index + s.segment.length } : null;
    }
  }
  return null;
}

/** A palavra sob o toque (x, y no documento do livro). */
export function palavraNoPonto(
  doc: Document,
  x: number,
  y: number,
  idioma?: string,
): { range: Range; palavra: string } | null {
  const c = caretNoPonto(doc as DocComCaret, x, y);
  if (!c || c.no.nodeType !== Node.TEXT_NODE) return null;
  const texto = c.no.textContent ?? '';
  // O caret cai ENTRE letras: tenta a letra à direita e, no fim da palavra, a da esquerda.
  const p = palavraEm(texto, c.offset, idioma) ?? (c.offset > 0 ? palavraEm(texto, c.offset - 1, idioma) : null);
  if (!p) return null;
  const range = doc.createRange();
  range.setStart(c.no, p.inicio);
  range.setEnd(c.no, p.fim);
  /* O caret pode cair no texto mais perto mesmo com o toque fora dele (margem): confere a caixa. */
  const caixa = range.getBoundingClientRect?.();
  if (
    caixa &&
    caixa.width > 0 &&
    (x < caixa.left - 4 || x > caixa.right + 4 || y < caixa.top - 4 || y > caixa.bottom + 4)
  ) {
    return null;
  }
  return { range, palavra: texto.slice(p.inicio, p.fim) };
}

/** O bloco de texto (parágrafo, item…) que contém o nó. */
function blocoDe(no: Node): Element | null {
  const el = no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement;
  return el?.closest(BLOCOS) ?? null;
}

/** O deslocamento de (no, offset) dentro do texto do bloco. */
function deslocamentoNoBloco(bloco: Element, no: Node, offset: number): number {
  const r = bloco.ownerDocument.createRange();
  r.selectNodeContents(bloco);
  r.setEnd(no, offset);
  return r.toString().length;
}

/** A frase (ou as frases) do bloco que contêm o trecho. Exportada para o teste. */
export function fraseDoRange(range: Range, idioma?: string): string {
  const bloco = blocoDe(range.startContainer);
  if (!bloco) return range.toString().trim();
  const texto = bloco.textContent ?? '';
  const ini = deslocamentoNoBloco(bloco, range.startContainer, range.startOffset);
  const fim = bloco.contains(range.endContainer)
    ? deslocamentoNoBloco(bloco, range.endContainer, range.endOffset)
    : texto.length;
  const seg = new Intl.Segmenter(idioma || undefined, { granularity: 'sentence' });
  let a = -1;
  let b = -1;
  for (const s of seg.segment(texto)) {
    const sFim = s.index + s.segment.length;
    if (a < 0 && ini < sFim) a = s.index;
    if (fim <= sFim) {
      b = sFim;
      break;
    }
  }
  const frase = texto
    .slice(a < 0 ? 0 : a, b < 0 ? texto.length : b)
    .replace(/\s+/g, ' ')
    .trim();
  return frase.length > 1_000 ? range.toString().trim() : frase;
}

/** A citação do trecho no texto da seção (`exact` + 32 de cada lado), cortada no teto. */
export function citacaoDoRange(range: Range, teto = MAX_CITACAO): CitacaoDoTexto {
  const doc = range.startContainer.ownerDocument!;
  const raiz = doc.body ?? doc.documentElement;
  const antes = doc.createRange();
  antes.setStart(raiz, 0);
  antes.setEnd(range.startContainer, range.startOffset);
  const depois = doc.createRange();
  depois.setStart(range.endContainer, range.endOffset);
  depois.setEnd(raiz, raiz.childNodes.length);
  const exact = Array.from(range.toString()).slice(0, teto).join('');
  return {
    exact,
    prefix: Array.from(antes.toString().slice(-MAX_CONTEXTO * 2))
      .slice(-MAX_CONTEXTO)
      .join(''),
    suffix: Array.from(depois.toString().slice(0, MAX_CONTEXTO * 2))
      .slice(0, MAX_CONTEXTO)
      .join(''),
  };
}

/** A seleção de texto do documento, se houver (e não for só espaço). */
export function selecaoDoDocumento(doc: Document): Range | null {
  const sel = doc.defaultView?.getSelection?.();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  return r.toString().trim().length >= 2 ? r : null;
}

/**
 * O WEBKIT NÃO ENTREGA EVENTOS de um iframe com `sandbox` sem `allow-scripts` (bug 218086) — nem aos
 * ouvintes que o PRÓPRIO app registrou no documento do capítulo. E o livro não pode ganhar `allow-scripts`
 * (`foliate/PATCHES.md`). Esta sonda descobre se os ouvintes funcionam (um evento sintético de ida e volta).
 */
export function ouvintesDoDocumentoFuncionam(doc: Document): boolean {
  let chegou = false;
  const ouvir = () => {
    chegou = true;
  };
  try {
    doc.addEventListener('frasy-sonda', ouvir);
    doc.dispatchEvent(new Event('frasy-sonda'));
  } catch {
    return false;
  } finally {
    doc.removeEventListener('frasy-sonda', ouvir);
  }
  return chegou;
}

/**
 * SEM OUVINTES (WebKit): a seleção do documento é lida de fora, a cada `intervalo`. O toque numa palavra vira
 * um CARET (seleção recolhida no ponto tocado — o WebKit o põe mesmo em texto não editável) e o arrastar vira
 * uma seleção com texto. O DOM do capítulo continua acessível ao app; só os eventos não chegam. Devolve a
 * função que para a vigia (que também para sozinha quando o documento sai de cena).
 */
export function vigiarSelecao(
  doc: Document,
  aoMudar: { aoSelecionar: (r: Range) => void; aoTocar: (r: Range) => void },
  /* O caret só é TOQUE se o foco estiver no livro (a pessoa tocou nele): o WebKit também põe caret ao rolar ou
     ao restaurar a página, e isso não pode abrir a folha da palavra. */
  focoNoLivro: () => boolean = () => true,
  intervalo = 180,
): () => void {
  let assinatura = '';
  const id = window.setInterval(() => {
    const janela = doc.defaultView;
    if (!janela) {
      window.clearInterval(id);
      return;
    }
    const sel = janela.getSelection();
    if (!sel || sel.rangeCount === 0) {
      assinatura = '';
      return;
    }
    const r = sel.getRangeAt(0);
    const agora = `${sel.isCollapsed}|${r.startOffset}|${r.endOffset}|${r.toString().length}|${(r.startContainer.textContent ?? '').slice(0, 40)}`;
    if (agora === assinatura) return;
    assinatura = agora;
    if (!sel.isCollapsed) {
      if (r.toString().trim().length >= 2) aoMudar.aoSelecionar(r);
      return;
    }
    const no = r.startContainer;
    if (no.nodeType !== Node.TEXT_NODE || !focoNoLivro()) return;
    const texto = no.textContent ?? '';
    const p = palavraEm(texto, r.startOffset) ?? (r.startOffset > 0 ? palavraEm(texto, r.startOffset - 1) : null);
    if (!p) return;
    const palavra = doc.createRange();
    palavra.setStart(no, p.inicio);
    palavra.setEnd(no, p.fim);
    /* O caret tratado sai: tocar de novo no mesmo lugar é um toque novo. */
    sel.removeAllRanges();
    assinatura = '';
    aoMudar.aoTocar(palavra);
  }, intervalo);
  return () => window.clearInterval(id);
}
