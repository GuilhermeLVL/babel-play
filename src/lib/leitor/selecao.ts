/**
 * A PALAVRA E A FRASE DENTRO DO DOCUMENTO DO LIVRO (o `iframe` de cada seção): o toque vira palavra pelo
 * `caretRangeFromPoint` + `Intl.Segmenter` (sem cortar "d'água" nem "co-operate"), e a palavra ou o trecho
 * selecionado viram FRASE (o contexto do cartão) e CITAÇÃO (o `TextQuoteSelector` da anotação).
 */
import { type CitacaoDoTexto, MAX_CITACAO, MAX_CONTEXTO } from '../../core/leitura/anotacao';
import { type ClasseDoGesto, criarReconhecedorDeToque, type RelogioDoGesto } from '../../core/leitura/gestoDoLeitor';

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
}

const RELOGIO_DO_NAVEGADOR: RelogioDoGesto = {
  agora: () => performance.now(),
  esperar: (ms, f) => {
    const id = window.setTimeout(f, ms);
    return () => window.clearTimeout(id);
  },
};

/** Depois de qualquer gesto que não seja o toque limpo: o trecho que ficou, se houver, vai para a barra. */
function depoisDoGesto(doc: Document, classe: ClasseDoGesto | null, g: GestosDoLivro) {
  if (classe === 'limpar') {
    g.aoLimpar?.();
    return;
  }
  if (classe === 'toque') return;
  const r = selecaoDoDocumento(doc);
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
      if (carga && !temTrecho(doc)) g.aoTocar(carga.palavra, carga.alvo);
    },
  });
  const ponto = (e: PointerEvent) => ({
    t: relogio.agora(),
    x: e.clientX,
    y: e.clientY,
  });
  const desce = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    rec.baixou(ponto(e), temTrecho(doc));
  };
  const move = (e: PointerEvent) => {
    if (rec.emCurso()) rec.moveu(ponto(e));
  };
  const sobe = (e: PointerEvent) => {
    if (!rec.emCurso()) return;
    const p = ponto(e);
    const alvo = e.target as Node | null;
    const achada = alvo ? palavraNoPonto(doc, e.clientX, e.clientY, idioma()) : null;
    const classe = rec.subiu(p, temTrecho(doc), achada && alvo ? { palavra: achada.range, alvo } : null);
    /* A seleção do arrasto termina de assentar depois do `pointerup`. */
    window.setTimeout(() => depoisDoGesto(doc, classe, g), 0);
  };
  const cancela = () => {
    rec.cancelou();
    window.setTimeout(() => depoisDoGesto(doc, null, g), 0);
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
        const r = !rec.emCurso() ? selecaoDoDocumento(doc) : null;
        if (r) g.aoSelecionar(r);
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
    if (comecou || rapido) rec.baixou(ponto(), trechoAntes);
    if (trecho !== trechoAntes) rec.selecaoMudou(trecho);
    if (rapido || (!ativo && ativoAntes)) {
      const classe = rec.subiu(ponto(), trecho, palavraDoCaret());
      /* O caret de um gesto que não foi toque (segurar, o toque que desfez a seleção) sai: o próximo toque no
         MESMO lugar tem de pôr um caret novo, senão a amostra não o vê. */
      if (classe !== 'toque' && !trecho && caret) {
        sel?.removeAllRanges();
        caretVisto = null;
      }
      depoisDoGesto(doc, classe, g);
      assinatura = trecho && r ? assinaturaDe(r) : '';
    } else if (trecho && r && !ativo) {
      /* Um trecho que mudou FORA de um gesto (programático, teclado): a barra do trecho. */
      const agora = assinaturaDe(r);
      if (agora !== assinatura) {
        assinatura = agora;
        const s = selecaoDoDocumento(doc);
        if (s) g.aoSelecionar(s);
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
