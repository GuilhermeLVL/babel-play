/**
 * A GLOSA DAS PALAVRAS NOVAS, DESENHADA SOBRE O CAPÍTULO (spec `glosa-no-leitor`).
 *
 * POR QUE NO OVERLAYER E NÃO EM `<ruby>`. Injetar `<ruby>`/`<span>` no capítulo mudaria a árvore de elementos (o CFI
 * das anotações e da posição conta elementos), partiria palavras entre nós de texto, entraria no texto selecionado e
 * copiado e na leitura de tela, e mexeria na altura das linhas (repaginação). O overlayer do foliate já é o SVG por
 * cima do iframe — o mesmo dos grifos e da frase narrada —, é refeito pelo paginador a cada repaginação e não toca no
 * documento: o texto do livro fica selecionável e copiável sem a glosa, e o SVG sai da árvore de acessibilidade.
 *
 * SÓ DICIONÁRIO LOCAL (`glosaLocal`): sem rede, sem custo. Palavra sem glosa local não mostra nada.
 */
import {
  escolherGlosas,
  indicesDasPalavrasNovas,
  type PalavraDoCapitulo,
  palavrasDoCapitulo,
} from '../../core/leitura/glosaDoCapitulo';
import { glosaLocal } from '../dicionarioLocal';
import { glosaServe } from '../traducaoDePalavra';

const BLOCOS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption';
const NS = 'http://www.w3.org/2000/svg';
const PREFIXO = 'frasy-glosa:';
/** Acima disto a glosa não cabe sobre quatro palavras: melhor nenhuma que uma glosa que cobre o texto. */
const GLOSA_MAXIMA = 24;

export interface OverlayerDaGlosa {
  add(key: string, range: Range, draw: (rects: DOMRectList, o: never) => SVGElement, options: unknown): void;
  remove(key: string): void;
}

export interface AparenciaDaGlosa {
  /** Cor da glosa (a "suave" do tema: contraste de leitura em todos os temas). */
  cor: string;
  /** Cor do fundo do tema, para o contorno que separa a glosa da linha de cima. */
  fundo: string;
  /** Tamanho da letra do livro, em px; a glosa é uma fração dele. */
  tamanho: number;
}

interface Segmento {
  no: Text;
  inicio: number;
  fim: number;
}

/** O texto do capítulo (parágrafos separados por linha em branco) e onde cada pedaço mora no DOM. */
export function textoDoDocumento(doc: Document): { texto: string; segmentos: Segmento[] } {
  const raiz = doc.body ?? doc.documentElement;
  const segmentos: Segmento[] = [];
  let texto = '';
  if (!raiz) return { texto, segmentos };
  const blocos = [...raiz.querySelectorAll(BLOCOS)].filter((el) => !el.querySelector(BLOCOS));
  for (const bloco of blocos) {
    const andador = doc.createTreeWalker(bloco, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode: (n) => (n.parentElement?.closest('rt, rp, script, style') ? 2 : 1),
    });
    let no = andador.nextNode() as Text | null;
    const antes = texto.length;
    while (no) {
      const valor = no.data;
      segmentos.push({ no, inicio: texto.length, fim: texto.length + valor.length });
      texto += valor;
      no = andador.nextNode() as Text | null;
    }
    if (texto.length > antes) texto += '\n\n';
  }
  return { texto, segmentos };
}

function ponto(segmentos: readonly Segmento[], pos: number, fimDoTrecho: boolean): { no: Text; desloc: number } | null {
  let lo = 0;
  let hi = segmentos.length - 1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    const s = segmentos[meio];
    if (pos < s.inicio) hi = meio - 1;
    else if (pos > s.fim || (pos === s.fim && !fimDoTrecho)) lo = meio + 1;
    else return { no: s.no, desloc: pos - s.inicio };
  }
  return null;
}

function rangeDaPalavra(doc: Document, segmentos: readonly Segmento[], p: PalavraDoCapitulo): Range | null {
  const a = ponto(segmentos, p.inicio, false);
  const b = ponto(segmentos, p.fim, true);
  if (!a || !b) return null;
  try {
    const r = doc.createRange();
    r.setStart(a.no, a.desloc);
    r.setEnd(b.no, b.desloc);
    return r;
  } catch {
    return null;
  }
}

/** Só a primeira acepção, curta: "casa, lar" vira "casa". Longa demais, nada. */
export function glosaCurta(glosa: string): string | null {
  const g = glosa.split(/[,;/(]/)[0].trim();
  return g && g.length <= GLOSA_MAXIMA ? g : null;
}

/** O desenho de uma glosa: um `<text>` acima da primeira linha da palavra, fora da árvore de acessibilidade. */
export function desenharGlosa(rects: DOMRectList, o: { texto: string } & AparenciaDaGlosa): SVGElement {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('aria-hidden', 'true');
  g.setAttribute('data-frasy-glosa', '');
  const r = rects[0];
  if (!r) return g;
  const t = document.createElementNS(NS, 'text');
  const tamanho = Math.max(9, Math.round(o.tamanho * 0.56 * 10) / 10);
  t.setAttribute('x', String(r.left + r.width / 2));
  t.setAttribute('y', String(r.top + tamanho * 0.15));
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', String(tamanho));
  t.setAttribute('font-family', 'system-ui, sans-serif');
  t.setAttribute('fill', o.cor);
  t.setAttribute('stroke', o.fundo);
  t.setAttribute('stroke-width', '2.5');
  t.setAttribute('stroke-linejoin', 'round');
  t.setAttribute('paint-order', 'stroke');
  t.textContent = o.texto;
  g.append(t);
  return g;
}

export interface EstadoDaGlosa {
  conhecidas: ReadonlySet<string>;
  ignoradas?: ReadonlySet<string>;
  aparencia: AparenciaDaGlosa;
}

/** A glosa de UM capítulo (um documento e o overlayer dele). Reaplica a cada mudança do que a pessoa sabe. */
export class GlosaDoCapitulo {
  private preparado: { palavras: PalavraDoCapitulo[]; segmentos: Segmento[] } | null = null;
  private lidas = new Map<string, string | null>();
  private chaves: string[] = [];
  private geracao = 0;

  constructor(
    readonly doc: Document,
    private overlayer: OverlayerDaGlosa,
    private lang: string,
    private alvo: string,
  ) {}

  private preparar() {
    if (!this.preparado) {
      const { texto, segmentos } = textoDoDocumento(this.doc);
      this.preparado = { palavras: palavrasDoCapitulo(texto, this.lang), segmentos };
    }
    return this.preparado;
  }

  private async glosaDe(palavra: PalavraDoCapitulo): Promise<string | null> {
    if (this.lidas.has(palavra.chave)) return this.lidas.get(palavra.chave) ?? null;
    const achado = await glosaLocal(palavra.texto, this.lang, this.alvo, (g) => glosaServe(g, this.alvo));
    const g = achado ? glosaCurta(achado.glosa) : null;
    this.lidas.set(palavra.chave, g);
    return g;
  }

  /** Quantas glosas ficaram na tela. Chamadas seguidas: só a última desenha (as anteriores desistem). */
  async atualizar(estado: EstadoDaGlosa): Promise<number> {
    const minha = ++this.geracao;
    const { palavras, segmentos } = this.preparar();
    const entrada = { palavras, lang: this.lang, conhecidas: estado.conhecidas, ignoradas: estado.ignoradas };
    const novas = indicesDasPalavrasNovas(entrada);
    const primeiras = new Map<string, PalavraDoCapitulo>();
    for (const i of novas) if (!primeiras.has(palavras[i].chave)) primeiras.set(palavras[i].chave, palavras[i]);
    await Promise.all([...primeiras.values()].map((p) => this.glosaDe(p)));
    if (minha !== this.geracao) return 0;
    const comGlosa = new Set([...primeiras.keys()].filter((c) => this.lidas.get(c)));
    const escolhidas = escolherGlosas(entrada, comGlosa);
    this.removerTudo();
    let n = 0;
    for (const i of escolhidas) {
      const p = palavras[i];
      const range = rangeDaPalavra(this.doc, segmentos, p);
      const texto = this.lidas.get(p.chave);
      if (!range || !texto) continue;
      const chave = `${PREFIXO}${i}`;
      try {
        this.overlayer.add(chave, range, desenharGlosa as never, { texto, ...estado.aparencia });
        this.chaves.push(chave);
        n++;
      } catch {
        /* o range saiu do documento (o capítulo mudou): sem glosa */
      }
    }
    return n;
  }

  private removerTudo() {
    for (const c of this.chaves) {
      try {
        this.overlayer.remove(c);
      } catch {
        /* o overlayer já foi descartado com o capítulo */
      }
    }
    this.chaves = [];
  }

  /** Tira toda a glosa do capítulo e cancela o que estiver em andamento. */
  limpar() {
    this.geracao++;
    this.removerTudo();
  }
}
