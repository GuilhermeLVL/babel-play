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
  PREFIXO_DA_GLOSA,
} from '../../core/leitura/glosaDoCapitulo';
import { glosaLocal } from '../dicionarioLocal';
import { glosaServe } from '../traducaoDePalavra';

const BLOCOS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption';
const NS = 'http://www.w3.org/2000/svg';
const PREFIXO = PREFIXO_DA_GLOSA;
/** Quantas buscas ao dicionário correm juntas e quantas palavras únicas se consultam por capítulo. */
const CONCORRENCIA = 8;
const TETO_DE_PALAVRAS_UNICAS = 400;
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

/** O desenho de uma glosa: um `<text>` com a linha de base no topo da palavra (acima dela, sobre a entrelinha), fora da árvore de acessibilidade. */
export function desenharGlosa(rects: DOMRectList, o: { texto: string; alvo?: Range } & AparenciaDaGlosa): SVGElement {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('aria-hidden', 'true');
  g.setAttribute('data-frasy-glosa', '');
  /* O range guardado no overlayer é vazio (ver `atualizar`); a posição vem da palavra, lida a cada redesenho. */
  const r = (o.alvo?.getClientRects?.() ?? rects)[0];
  if (!r) return g;
  const t = document.createElementNS(NS, 'text');
  const tamanho = Math.max(9, Math.round(o.tamanho * 0.56 * 10) / 10);
  t.setAttribute('x', String(r.left + r.width / 2));
  t.setAttribute('y', String(r.top - 1));
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
  private assinatura = '';

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
    const freq = new Map<string, number>();
    for (const i of novas) {
      const c = palavras[i].chave;
      freq.set(c, (freq.get(c) ?? 0) + 1);
      if (!primeiras.has(c)) primeiras.set(c, palavras[i]);
    }
    /* Teto de consultas por capítulo (as mais frequentes primeiro) e no máximo CONCORRENCIA em voo. */
    const fila = [...primeiras.values()]
      .sort((a, b) => (freq.get(b.chave) ?? 0) - (freq.get(a.chave) ?? 0))
      .slice(0, TETO_DE_PALAVRAS_UNICAS);
    for (const c of [...primeiras.keys()]) if (!fila.some((p) => p.chave === c)) primeiras.delete(c);
    let proxima = 0;
    const trabalhador = async () => {
      while (proxima < fila.length) {
        if (minha !== this.geracao) return;
        await this.glosaDe(fila[proxima++]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, trabalhador));
    if (minha !== this.geracao) return 0;
    const comGlosa = new Set([...primeiras.keys()].filter((c) => this.lidas.get(c)));
    const escolhidas = escolherGlosas(entrada, comGlosa);
    /* Nada mudou no que se vê (mesmas palavras, mesma aparência): não redesenha. */
    const assinatura = JSON.stringify([
      escolhidas.map((i) => [i, this.lidas.get(palavras[i].chave)]),
      estado.aparencia,
    ]);
    if (assinatura === this.assinatura && this.chaves.length === escolhidas.length) return this.chaves.length;
    this.removerTudo();
    this.assinatura = assinatura;
    let n = 0;
    for (const i of escolhidas) {
      const p = palavras[i];
      const range = rangeDaPalavra(this.doc, segmentos, p);
      const texto = this.lidas.get(p.chave);
      if (!range || !texto) continue;
      const chave = `${PREFIXO}${i}`;
      /* HIT-TEST: o overlayer do foliate testa o toque contra os rects do range guardado, do último para o primeiro. A
         glosa guarda um range VAZIO (sem rects) e desenha pela palavra: o toque cai no grifo ou na palavra, nunca nela. */
      const vazio = range.cloneRange();
      vazio.collapse(true);
      try {
        this.overlayer.add(chave, vazio, desenharGlosa as never, { texto, alvo: range, ...estado.aparencia });
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
    this.assinatura = '';
  }

  /** Tira toda a glosa do capítulo e cancela o que estiver em andamento. */
  limpar() {
    this.geracao++;
    this.removerTudo();
  }
}
