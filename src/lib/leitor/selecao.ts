/**
 * A PALAVRA E A FRASE DENTRO DO DOCUMENTO DO LIVRO (o `iframe` de cada seção): o toque vira palavra pelo
 * `caretRangeFromPoint` + `Intl.Segmenter` (sem cortar "d'água" nem "co-operate"), e a palavra ou o trecho
 * selecionado viram FRASE (o contexto do cartão) e CITAÇÃO (o `TextQuoteSelector` da anotação).
 */
import {
  ajustarAPalavras,
  type Faixa,
  faixaDoArrasto,
  fraseEmOffsets,
  limitarAoBloco,
  paragrafoEmOffsets,
  vizinhaDaAlca,
} from '../../core/leitura/ajusteDeSelecao';
import { type CitacaoDoTexto, MAX_CITACAO, MAX_CONTEXTO } from '../../core/leitura/anotacao';
import { type ClasseDoGesto, criarReconhecedorDeToque, type RelogioDoGesto } from '../../core/leitura/gestoDoLeitor';
import type { OrigemDaSelecao } from '../../core/leitura/leituraAssistida';

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

/* ── A SELEÇÃO FIRME (flag `leitor_selecao_firme`, openspec `leitura-assistida`): bordas de palavra e dentro de um bloco ── */

/** O nó de texto e o deslocamento que correspondem ao deslocamento `off` do texto do bloco. */
function pontoDoDeslocamento(bloco: Element, off: number, comoFim: boolean): { no: Node; offset: number } | null {
  const andador = bloco.ownerDocument.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
  let acumulado = 0;
  let ultimo: Text | null = null;
  for (let n = andador.nextNode() as Text | null; n; n = andador.nextNode() as Text | null) {
    const len = n.data.length;
    if (off < acumulado + len || (comoFim && off === acumulado + len)) return { no: n, offset: off - acumulado };
    acumulado += len;
    ultimo = n;
  }
  return ultimo ? { no: ultimo, offset: ultimo.data.length } : null;
}

/** O `Range` do documento para a faixa de deslocamentos do texto do bloco. */
export function rangeDeFaixa(bloco: Element, f: Faixa): Range | null {
  const a = pontoDoDeslocamento(bloco, f.ini, false);
  const b = pontoDoDeslocamento(bloco, f.fim, true);
  if (!a || !b) return null;
  const r = bloco.ownerDocument.createRange();
  r.setStart(a.no, a.offset);
  r.setEnd(b.no, b.offset);
  return r;
}

/** A faixa (deslocamentos no texto do bloco) do `Range`; o fim que cai fora do bloco vira o fim do bloco. */
function faixaDoRangeNoBloco(bloco: Element, r: Range): Faixa {
  const texto = bloco.textContent ?? '';
  const ini = bloco.contains(r.startContainer) ? deslocamentoNoBloco(bloco, r.startContainer, r.startOffset) : 0;
  const fim = bloco.contains(r.endContainer) ? deslocamentoNoBloco(bloco, r.endContainer, r.endOffset) : texto.length;
  return { ini, fim };
}

/**
 * Firma o trecho: início e fim em bordas de palavra, tudo dentro do bloco onde o trecho COMEÇA (o arrasto que deriva para
 * outro parágrafo ou coluna é recortado; só as alças passam do bloco, de propósito). `null` = nenhuma palavra (descarta).
 */
export function firmarRange(r: Range, idioma?: string): Range | null {
  const bloco = blocoDe(r.startContainer);
  if (!bloco) return null;
  const texto = bloco.textContent ?? '';
  const noBloco = limitarAoBloco(faixaDoRangeNoBloco(bloco, r), { ini: 0, fim: texto.length });
  const f = noBloco && ajustarAPalavras(texto, noBloco.ini, noBloco.fim, idioma);
  return f ? rangeDeFaixa(bloco, f) : null;
}

/** A frase ou o parágrafo (no bloco) que contém o trecho, como `Range`. */
export function ampliarRange(r: Range, para: 'frase' | 'paragrafo', idioma?: string): Range | null {
  const bloco = blocoDe(r.startContainer);
  if (!bloco) return null;
  const texto = bloco.textContent ?? '';
  const { ini, fim } = faixaDoRangeNoBloco(bloco, r);
  const f = para === 'frase' ? fraseEmOffsets(texto, ini, fim, idioma) : paragrafoEmOffsets(texto);
  return f.fim > f.ini ? rangeDeFaixa(bloco, f) : null;
}

/** Troca a seleção do documento por `r`. */
function selecionar(doc: Document, r: Range) {
  const sel = doc.defaultView?.getSelection?.();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * ALÇA, pelo TECLADO ou por passo: move o início (`ini`) ou o fim (`fim`) UMA palavra (`dir` = 1 adiante, -1 atrás) dentro do
 * bloco da ponta. `null` = sem palavra vizinha no bloco, ou a seleção ficaria vazia ou invertida.
 */
export function moverAlca(r: Range, ponta: 'ini' | 'fim', dir: 1 | -1, idioma?: string): Range | null {
  const no = ponta === 'ini' ? r.startContainer : r.endContainer;
  const off = ponta === 'ini' ? r.startOffset : r.endOffset;
  const bloco = blocoDe(no);
  if (!bloco) return null;
  const pos = deslocamentoNoBloco(bloco, no, off);
  const novo = vizinhaDaAlca(bloco.textContent ?? '', pos, dir, ponta, idioma);
  if (novo === pos) return null;
  const p = pontoDoDeslocamento(bloco, novo, ponta === 'fim');
  if (!p) return null;
  const c = r.cloneRange();
  if (ponta === 'ini') c.setStart(p.no, p.offset);
  else c.setEnd(p.no, p.offset);
  return c.collapsed || c.toString().trim().length === 0 ? null : c;
}

/**
 * ALÇA, pelo DEDO: leva a ponta à palavra que está sob o ponto (x, y no documento do livro). Só as alças passam do bloco.
 * `null` = o ponto não acertou palavra, ou cruzaria a outra ponta.
 */
export function alcaNoPonto(
  doc: Document,
  r: Range,
  ponta: 'ini' | 'fim',
  x: number,
  y: number,
  idioma?: string,
): Range | null {
  const h = palavraNoPonto(doc, x, y, idioma);
  if (!h) return null;
  const c = r.cloneRange();
  if (ponta === 'fim') {
    c.setEnd(h.range.endContainer, h.range.endOffset);
  } else {
    c.setStart(h.range.startContainer, h.range.startOffset);
  }
  return c.collapsed || c.toString().trim().length === 0 ? null : c;
}

/** A palavra (faixa no bloco) de um `Range` de palavra, com o bloco. */
function palavraNoBloco(w: Range): { bloco: Element; faixa: Faixa } | null {
  const bloco = blocoDe(w.startContainer);
  return bloco ? { bloco, faixa: faixaDoRangeNoBloco(bloco, w) } : null;
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

/** Há trecho selecionado (não recolhido, com texto que não é só espaço)? */
function temTrecho(doc: Document): boolean {
  const sel = doc.defaultView?.getSelection?.();
  return !!sel && !sel.isCollapsed && sel.rangeCount > 0 && sel.toString().trim().length > 0;
}

/** A palavra (`Range`) em torno de um caret (nó de texto + offset), ou `null`. */
function palavraNoCaretDe(doc: Document, no: Node, offset: number, idioma?: string): Range | null {
  if (no.nodeType !== Node.TEXT_NODE) return null;
  const texto = no.textContent ?? '';
  const p = palavraEm(texto, offset, idioma) ?? (offset > 0 ? palavraEm(texto, offset - 1, idioma) : null);
  if (!p) return null;
  const r = doc.createRange();
  r.setStart(no, p.inicio);
  r.setEnd(no, p.fim);
  return r;
}

/**
 * A PALAVRA NO CURSOR (o caminho do TECLADO para o cartão da palavra): o caret (seleção recolhida) dentro de uma
 * palavra, ou um trecho selecionado que é uma palavra só. `null` = nada a abrir.
 */
export function palavraNoCursor(doc: Document, idioma?: string): Range | null {
  const sel = doc.defaultView?.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (sel.isCollapsed) return palavraNoCaretDe(doc, r.startContainer, r.startOffset, idioma);
  const texto = r.toString().trim();
  return texto && ehUmaPalavra(texto, idioma) ? r : null;
}

/** O texto é UMA palavra (para o "Ver a palavra" da barra do trecho)? */
export function ehUmaPalavra(texto: string, idioma?: string): boolean {
  const t = texto.trim();
  if (!t || t.length > 60) return false;
  const seg = new Intl.Segmenter(idioma || undefined, { granularity: 'word' });
  return [...seg.segment(t)].filter((s) => s.isWordLike).length === 1 && !/\s/.test(t);
}

/** O que o leitor faz com cada gesto no texto do livro. */
export interface GestosDoLivro {
  /** Um trecho selecionado, com o gesto já terminado (a barra do trecho). */
  aoSelecionar: (r: Range) => void;
  /** Um toque LIMPO numa palavra (já passada a janela do toque duplo). `alvo` é o nó tocado (para os links). */
  aoTocar: (palavra: Range, alvo: Node) => void;
  /** O toque desfez a seleção (a barra do trecho sai). */
  aoLimpar?: () => void;
  /** SELEÇÃO FIRME ligada (flag `leitor_selecao_firme`): bordas de palavra, dentro do bloco, toque duplo = frase, triplo = parágrafo. */
  firme?: boolean;
  /** Só com `firme`: o trecho firmado (ou a palavra do toque), para o barramento da seleção (`TrechoDoLeitor`). */
  aoPublicar?: (r: Range, origem: OrigemDaSelecao) => void;
}

const RELOGIO_DO_NAVEGADOR: RelogioDoGesto = {
  agora: () => performance.now(),
  esperar: (ms, f) => {
    const id = window.setTimeout(f, ms);
    return () => window.clearTimeout(id);
  },
};

/** O último trecho firmado publicado em cada documento (para não publicar o mesmo duas vezes). */
const publicados = new WeakMap<Document, string>();

/** Depois de qualquer gesto que não seja o toque limpo: o trecho que ficou, se houver, vai para a barra. */
function depoisDoGesto(
  doc: Document,
  classe: ClasseDoGesto | null,
  g: GestosDoLivro,
  idioma?: string,
  /** Só com `firme`: o gesto pede a frase ou o parágrafo, e/ou o arrasto já medido pelas palavras tocadas. */
  extra: { para?: 'frase' | 'paragrafo'; arrasto?: Range | null } = {},
) {
  if (classe === 'limpar') {
    publicados.delete(doc);
    g.aoLimpar?.();
    return;
  }
  if (classe === 'toque') return;
  let r = selecaoDoDocumento(doc);
  if (g.firme) {
    const base = extra.arrasto ?? (r ? firmarRange(r, idioma) : null);
    const para = extra.para ?? (classe === 'duplo' || classe === 'longo' ? 'frase' : undefined);
    const alvo = base && para ? (ampliarRange(base, para, idioma) ?? base) : base;
    if (!alvo) {
      /* Só margem ou espaço: descarta, em vez de deixar uma seleção sem palavra. */
      if (r) {
        doc.defaultView?.getSelection?.()?.removeAllRanges();
        publicados.delete(doc);
        g.aoLimpar?.();
      }
      return;
    }
    if (!r || alvo.toString() !== r.toString()) selecionar(doc, alvo);
    r = alvo;
    /* A seleção que NÓS pusemos dispara `selectionchange` e volta aqui: o mesmo trecho não é publicado duas vezes. */
    const marca = assinaturaDe(r);
    if (publicados.get(doc) === marca) return;
    publicados.set(doc, marca);
    g.aoSelecionar(r);
    g.aoPublicar?.(
      r,
      extra.para === 'paragrafo' || para === 'frase' ? (classe === 'longo' ? 'longo' : 'duplo') : 'arrasto',
    );
    return;
  }
  if (r) g.aoSelecionar(r);
}

/**
 * COM OUVINTES (Chromium): o gesto pelos eventos de ponteiro do documento do capítulo, classificado pelo
 * `criarReconhecedorDeToque`. O cartão da palavra só abre no toque limpo; o resto é seleção. Devolve o desligar.
 */
export function ouvirGestos(
  doc: Document,
  g: GestosDoLivro,
  idioma: () => string | undefined = () => undefined,
  relogio: RelogioDoGesto = RELOGIO_DO_NAVEGADOR,
): () => void {
  const rec = criarReconhecedorDeToque<{ palavra: Range; alvo: Node } | null>({
    relogio,
    aoToque: (_p, carga) => {
      /* A seleção pode ter aparecido sem `selectionchange` a tempo (o toque duplo do Safari, a barra): confere. */
      if (carga && !temTrecho(doc)) {
        if (g.firme) g.aoPublicar?.(carga.palavra, 'toque');
        g.aoTocar(carga.palavra, carga.alvo);
      }
    },
  });
  const ponto = (e: PointerEvent) => ({
    t: relogio.agora(),
    x: e.clientX,
    y: e.clientY,
  });
  /* SELEÇÃO FIRME: a palavra onde o dedo desceu, a última palavra do mesmo bloco que o dedo realmente tocou (a deriva para a
     margem ou outra coluna não conta) e a contagem de toques curtos seguidos (2 = frase, 3 = parágrafo). */
  let inicioPal: { bloco: Element; faixa: Faixa } | null = null;
  let ultimaPal: Faixa | null = null;
  let desceuEm = 0;
  let desceuNoPonto = { x: 0, y: 0 };
  let andou = 0;
  let toques = { n: 0, t: -1e9, x: 0, y: 0 };
  const desce = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (g.firme) {
      const h = palavraNoPonto(doc, e.clientX, e.clientY, idioma());
      inicioPal = h ? palavraNoBloco(h.range) : null;
      ultimaPal = null;
      andou = 0;
      desceuEm = relogio.agora();
      desceuNoPonto = { x: e.clientX, y: e.clientY };
    }
    rec.baixou(ponto(e), temTrecho(doc));
  };
  const move = (e: PointerEvent) => {
    if (!rec.emCurso()) return;
    rec.moveu(ponto(e));
    if (!g.firme) return;
    andou = Math.max(andou, Math.hypot(e.clientX - desceuNoPonto.x, e.clientY - desceuNoPonto.y));
    if (!inicioPal) return;
    const h = palavraNoPonto(doc, e.clientX, e.clientY, idioma());
    const pb = h ? palavraNoBloco(h.range) : null;
    if (pb && pb.bloco === inicioPal.bloco) ultimaPal = pb.faixa;
  };
  const sobe = (e: PointerEvent) => {
    if (!rec.emCurso()) return;
    const p = ponto(e);
    const alvo = e.target as Node | null;
    const achada = alvo ? palavraNoPonto(doc, e.clientX, e.clientY, idioma()) : null;
    let classe = rec.subiu(p, temTrecho(doc), achada && alvo ? { palavra: achada.range, alvo } : null);
    let extra: Parameters<typeof depoisDoGesto>[4] = {};
    if (g.firme) {
      const curto = andou < 6 && p.t - desceuEm <= 400;
      if (curto) {
        const seguido = p.t - toques.t < 450 && Math.hypot(e.clientX - toques.x, e.clientY - toques.y) < 24;
        toques = { n: seguido ? Math.min(3, toques.n + 1) : 1, t: p.t, x: e.clientX, y: e.clientY };
      } else toques = { n: 0, t: -1e9, x: 0, y: 0 };
      if (toques.n >= 2) {
        classe = 'duplo';
        extra = { para: toques.n >= 3 ? 'paragrafo' : 'frase' };
      } else if (andou >= 6 && inicioPal) {
        const r = rangeDeFaixa(inicioPal.bloco, faixaDoArrasto(inicioPal.faixa, ultimaPal));
        if (r) extra = { arrasto: r };
      }
    }
    /* A seleção do arrasto termina de assentar depois do `pointerup`. */
    window.setTimeout(() => depoisDoGesto(doc, classe, g, idioma(), extra), 0);
  };
  const cancela = () => {
    const longo = g.firme && andou < 6 && relogio.agora() - desceuEm >= 400;
    rec.cancelou();
    window.setTimeout(() => depoisDoGesto(doc, longo ? 'longo' : null, g, idioma()), 0);
  };
  /* A seleção que não veio de um gesto do ponteiro (teclado, o toque longo do Android, que termina em
     `pointercancel`) chega pela `selectionchange`, assentada. */
  let assentar = 0;
  const mudouSelecao = () => {
    const tem = temTrecho(doc);
    rec.selecaoMudou(tem);
    window.clearTimeout(assentar);
    if (tem && !rec.emCurso())
      assentar = window.setTimeout(() => {
        if (rec.emCurso()) return;
        if (g.firme) depoisDoGesto(doc, null, g, idioma());
        else {
          const r = selecaoDoDocumento(doc);
          if (r) g.aoSelecionar(r);
        }
      }, 200);
  };
  doc.addEventListener('pointerdown', desce);
  doc.addEventListener('pointermove', move);
  doc.addEventListener('pointerup', sobe);
  doc.addEventListener('pointercancel', cancela);
  doc.addEventListener('contextmenu', () => rec.cancelou());
  doc.addEventListener('selectionchange', mudouSelecao);
  return () => {
    rec.descartar();
    window.clearTimeout(assentar);
    doc.removeEventListener('pointerdown', desce);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', sobe);
    doc.removeEventListener('pointercancel', cancela);
    doc.removeEventListener('selectionchange', mudouSelecao);
  };
}

/**
 * SEM OUVINTES (WebKit): o gesto é AMOSTRADO de fora, a cada `intervalo`. O ponteiro descido aparece no
 * `:active` do documento (o estado de estilo que o motor de eventos põe, com ou sem script no iframe); o toque
 * numa palavra vira um CARET (seleção recolhida no ponto tocado — o WebKit o põe mesmo em texto não editável) e
 * o arrastar vira uma seleção com texto. O mesmo reconhecedor do Chromium decide: o caret só vira cartão no
 * toque limpo (soltar rápido, sem seleção durante o gesto), depois da janela do toque duplo; o toque longo e o
 * arrasto são seleção, e a barra do trecho só aparece quando o dedo sobe.
 *
 * O toque mais rápido que a amostra (descer e subir entre duas leituras) aparece só como caret novo: conta como
 * toque de duração zero. Devolve a função que para a vigia (que também para sozinha quando o documento sai).
 */
export function vigiarSelecao(
  doc: Document,
  g: GestosDoLivro,
  /* O caret só é TOQUE se o foco estiver no livro (a pessoa tocou nele): o WebKit também põe caret ao rolar ou
     ao restaurar a página, e isso não pode abrir a folha da palavra. */
  focoNoLivro: () => boolean = () => true,
  intervalo = 100,
  relogio: RelogioDoGesto = RELOGIO_DO_NAVEGADOR,
  idioma: () => string | undefined = () => undefined,
): () => void {
  const rec = criarReconhecedorDeToque<Range | null>({
    relogio,
    aoToque: (_p, palavra) => {
      const sel = doc.defaultView?.getSelection();
      if (!palavra || temTrecho(doc)) return;
      /* O caret tratado sai: tocar de novo no mesmo lugar é um toque novo. */
      sel?.removeAllRanges();
      caretVisto = null;
      g.aoTocar(palavra, palavra.startContainer);
    },
  });
  let ativoAntes = false;
  let trechoAntes = false;
  let assinatura = '';
  let caretVisto: { no: Node; offset: number } | null = null;
  let gestoEm = 0;
  const ponto = () => ({ t: relogio.agora(), x: 0, y: 0 });

  const id = window.setInterval(() => {
    const janela = doc.defaultView;
    if (!janela) {
      window.clearInterval(id);
      return;
    }
    const sel = janela.getSelection();
    const r = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const trecho = temTrecho(doc);
    let ativo = false;
    try {
      ativo = !!doc.querySelector(':active');
    } catch {
      /* sem `:active` (motor antigo): só o caret decide */
    }
    const caret = r && sel?.isCollapsed && r.startContainer.nodeType === Node.TEXT_NODE ? r : null;
    const caretNovo =
      !!caret && (!caretVisto || caretVisto.no !== caret.startContainer || caretVisto.offset !== caret.startOffset);
    if (caret) caretVisto = { no: caret.startContainer, offset: caret.startOffset };
    else if (!r) caretVisto = null;

    const palavraDoCaret = () =>
      caret && focoNoLivro() ? palavraNoCaretDe(doc, caret.startContainer, caret.startOffset, idioma()) : null;

    /* A ordem importa: o gesto começa ANTES de a seleção que ele desfaz sumir. */
    const comecou = ativo && !ativoAntes;
    const rapido = !ativo && !ativoAntes && caretNovo && focoNoLivro();
    if (comecou || rapido) {
      gestoEm = relogio.agora();
      rec.baixou(ponto(), trechoAntes);
    }
    if (trecho !== trechoAntes) rec.selecaoMudou(trecho);
    if (rapido || (!ativo && ativoAntes)) {
      const classe = rec.subiu(ponto(), trecho, palavraDoCaret());
      /* O caret de um gesto que não foi toque (segurar, o toque que desfez a seleção) sai: o próximo toque no
         MESMO lugar tem de pôr um caret novo, senão a amostra não o vê. */
      if (classe !== 'toque' && !trecho && caret) {
        sel?.removeAllRanges();
        caretVisto = null;
      }
      /* Sem eventos do ponteiro não há como contar os toques: o toque duplo nativo (uma palavra selecionada por um gesto
         curto) vale como "frase", e o triplo nativo (o parágrafo) o `firmarRange` recorta ao bloco. */
      const curto = g.firme && classe === 'selecao' && trecho && !!r && relogio.agora() - gestoEm <= 700;
      const extra = curto && ehUmaPalavra(r!.toString(), idioma()) ? { para: 'frase' as const } : {};
      depoisDoGesto(doc, curto && extra.para ? 'duplo' : classe, g, idioma(), extra);
      assinatura = trecho && r ? assinaturaDe(r) : '';
    } else if (trecho && r && !ativo) {
      /* Um trecho que mudou FORA de um gesto (programático, teclado): a barra do trecho. */
      const agora = assinaturaDe(r);
      if (agora !== assinatura) {
        assinatura = agora;
        if (g.firme) {
          /* A palavra que o toque duplo nativo selecionou logo depois de um gesto curto: vale como "frase". */
          const dupla = relogio.agora() - gestoEm <= 900 && ehUmaPalavra(r.toString(), idioma());
          depoisDoGesto(doc, dupla ? 'duplo' : null, g, idioma(), dupla ? { para: 'frase' } : {});
        } else {
          const s = selecaoDoDocumento(doc);
          if (s) g.aoSelecionar(s);
        }
      }
    } else if (!trecho) {
      assinatura = '';
    }
    ativoAntes = ativo;
    trechoAntes = trecho;
  }, intervalo);
  return () => {
    rec.descartar();
    window.clearInterval(id);
  };
}

const assinaturaDe = (r: Range) =>
  `${r.startOffset}|${r.endOffset}|${r.toString().length}|${(r.startContainer.textContent ?? '').slice(0, 40)}`;
