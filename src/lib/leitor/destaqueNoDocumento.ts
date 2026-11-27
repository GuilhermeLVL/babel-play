/**
 * O DESTAQUE POR VOCABULÁRIO, DESENHADO NO CAPÍTULO (openspec `leitura-assistida`, Fatia C).
 *
 * COMO: a CSS Custom Highlight API (`CSS.highlights` + `::highlight(nome)`) do documento de cada seção. O grifo é uma
 * decoração de ranges: NÃO muda o DOM do livro (o CFI, o texto selecionável, o copiado e a leitura de tela ficam como
 * estão) e nem cria nó novo (a folha de estilo entra por `adoptedStyleSheets`; sem isso, um `<style>` no `<head>`, fora
 * do corpo que o CFI conta). Sem a API (navegador antigo), o capítulo abre normalmente, sem grifo e sem erro.
 *
 * QUANDO: uma passada por seção. Os ranges das palavras são montados UMA vez por capítulo, em fatias de `ORCAMENTO_MS`
 * (cede o fio entre uma e outra); depois, cada mudança do que a pessoa sabe só reclassifica por chave e remonta os grifos
 * (sem tocar no DOM), o que cabe em bem menos que os 100 ms da spec.
 */
import { funcionais } from '../../core/leitura/coberturaDoTexto';
import {
  alfaDaClasse,
  classeDoDestaque,
  CLASSES_DO_DESTAQUE,
  type FonteDeVocabulario,
  frequenciaRelativa,
  type InfoDaPalavra,
  infoDaPalavra,
  type ResumoDoCapitulo,
  resumoDoCapitulo,
} from '../../core/leitura/destaqueDeVocabulario';
import { type PalavraDoCapitulo, palavrasDoCapitulo } from '../../core/leitura/glosaDoCapitulo';
import { chavesDeLema } from '../../core/leitura/textoDaLeitura';
import { rangeDaPalavra, type Segmento, textoDoDocumento } from './glosaNoCapitulo';

/** Quanto tempo uma fatia de trabalho pode ocupar o fio antes de ceder (a spec: 50 ms por seção). */
export const ORCAMENTO_MS = 50;
const PREFIXO_DO_GRIFO = 'frasy-v-';

/** As cores do tema do leitor (qualquer cor CSS), lidas do app. */
export interface AparenciaDoDestaque {
  nova: string;
  aprendendo: string;
}

interface JanelaComGrifos extends Window {
  CSS?: { highlights?: Map<string, unknown> };
  Highlight?: new (...ranges: Range[]) => unknown;
  CSSStyleSheet: typeof CSSStyleSheet;
}

/** A janela do documento tem a API de grifos? (Sem ela, nada é desenhado.) */
export function suportaGrifos(doc: Document): boolean {
  const w = doc.defaultView as JanelaComGrifos | null;
  return !!w?.CSS?.highlights && typeof w.Highlight === 'function';
}

/** O CSS dos grifos: o fundo é uma fração do alfa (a leitura não perde contraste); o fio carrega o alfa inteiro. */
export function cssDosGrifos(a: AparenciaDoDestaque): string {
  const FUNDO = 0.4;
  return CLASSES_DO_DESTAQUE.map((c) => {
    const alfa = alfaDaClasse(c);
    const cor = c.startsWith('nova') ? a.nova : a.aprendendo;
    const estilo = c.startsWith('nova') ? 'dashed' : 'dotted';
    return (
      `::highlight(${PREFIXO_DO_GRIFO}${c}){` +
      `background-color:color-mix(in srgb,${cor} ${Math.round(alfa * FUNDO * 100)}%,transparent);` +
      `text-decoration:underline ${estilo} color-mix(in srgb,${cor} ${Math.round(alfa * 100)}%,transparent);` +
      `text-decoration-thickness:1.5px;text-underline-offset:0.18em}`
    );
  }).join('\n');
}

/** Cede o fio ao navegador (entre as fatias do trabalho). */
const ceder = () => new Promise<void>((r) => setTimeout(r, 0));

export interface PalavraClassificada {
  chave: string;
  status: InfoDaPalavra['status'];
  frequencia: number;
}

export interface ResultadoDoDestaque {
  resumo: ResumoDoCapitulo;
  /** As chaves novas e as aprendendo, as mais frequentes primeiro (para a prática do fim do capítulo). */
  candidatas: string[];
  /** Quantas palavras ganharam grifo (0 quando o navegador não tem a API). */
  grifadas: number;
}

/** O destaque de UM capítulo (um documento). Reaplica a cada mudança do que a pessoa sabe. */
export class DestaqueDoCapitulo {
  private preparado: {
    palavras: PalavraDoCapitulo[];
    segmentos: Segmento[];
    contagem: Map<string, number>;
    maximo: number;
  } | null = null;
  private ranges: Array<Range | null | undefined> = [];
  private classes: Array<string | null> = [];
  private status: Array<InfoDaPalavra['status']> = [];
  private geracao = 0;
  private folha: CSSStyleSheet | HTMLStyleElement | null = null;
  private nomesNoRegistro = new Set<string>();
  private cssAplicado = '';

  constructor(
    readonly doc: Document,
    private lang: string,
  ) {}

  private preparar() {
    if (!this.preparado) {
      const { texto, segmentos } = textoDoDocumento(this.doc);
      const palavras = palavrasDoCapitulo(texto, this.lang);
      const contagem = new Map<string, number>();
      let maximo = 0;
      for (const p of palavras) {
        const n = (contagem.get(p.chave) ?? 0) + 1;
        contagem.set(p.chave, n);
        if (n > maximo) maximo = n;
      }
      this.preparado = { palavras, segmentos, contagem, maximo };
      this.ranges = new Array(palavras.length);
    }
    return this.preparado;
  }

  /** Classifica as palavras (uma conta por chave, memorizada) e devolve as classes na ordem do texto. */
  private classificar(fonte: FonteDeVocabulario) {
    const { palavras, contagem, maximo } = this.preparar();
    const sabidas = funcionais(this.lang);
    const memo = new Map<string, InfoDaPalavra>();
    const lemas = new Map<string, string[]>();
    this.classes = new Array(palavras.length);
    this.status = new Array(palavras.length);
    palavras.forEach((p, i) => {
      const semDestaque = p.nomeProprio || sabidas.has(p.chave);
      const k = semDestaque ? '*' : p.chave;
      let info = memo.get(k);
      if (!info) {
        let chaves = lemas.get(p.chave);
        if (!chaves) lemas.set(p.chave, (chaves = chavesDeLema(p.texto, this.lang)));
        info = infoDaPalavra(
          fonte,
          chaves,
          this.lang,
          frequenciaRelativa(contagem.get(p.chave) ?? 0, maximo),
          semDestaque,
        );
        memo.set(k, info);
      }
      this.classes[i] = classeDoDestaque(info);
      this.status[i] = info.status;
    });
    const frequentes = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
    const aprendendoOuNova = new Set(
      palavras.map((p, i) => (this.status[i] === 'nova' || this.status[i] === 'aprendendo' ? p.chave : '')),
    );
    aprendendoOuNova.delete('');
    return {
      resumo: resumoDoCapitulo(this.status.map((status) => ({ status }))),
      candidatas: frequentes.map(([c]) => c).filter((c) => aprendendoOuNova.has(c)),
    };
  }

  /** Monta (em fatias) os ranges que faltam. `false` = uma chamada mais nova assumiu o lugar desta. */
  private async montarRanges(minha: number): Promise<boolean> {
    const { palavras, segmentos } = this.preparar();
    let inicioDaFatia = performance.now();
    for (let i = 0; i < palavras.length; i++) {
      if (this.ranges[i] !== undefined) continue;
      this.ranges[i] = rangeDaPalavra(this.doc, segmentos, palavras[i]);
      if (performance.now() - inicioDaFatia > ORCAMENTO_MS) {
        await ceder();
        if (minha !== this.geracao) return false;
        inicioDaFatia = performance.now();
      }
    }
    return true;
  }

  private aplicarFolha(css: string) {
    if (css === this.cssAplicado) return;
    this.cssAplicado = css;
    const w = this.doc.defaultView as JanelaComGrifos | null;
    try {
      if (this.folha && 'replaceSync' in this.folha) {
        this.folha.replaceSync(css);
        return;
      }
      if (this.folha) {
        (this.folha as HTMLStyleElement).textContent = css;
        return;
      }
      const adotaveis = this.doc as Document & { adoptedStyleSheets?: CSSStyleSheet[] };
      if (w && Array.isArray(adotaveis.adoptedStyleSheets) && typeof w.CSSStyleSheet === 'function') {
        const f = new w.CSSStyleSheet();
        f.replaceSync(css);
        adotaveis.adoptedStyleSheets = [...adotaveis.adoptedStyleSheets, f];
        this.folha = f;
        return;
      }
    } catch {
      this.folha = null;
    }
    const el = this.doc.createElement('style');
    el.setAttribute('data-frasy-destaque', '');
    el.textContent = css;
    (this.doc.head ?? this.doc.documentElement).append(el);
    this.folha = el;
  }

  /**
   * Classifica o capítulo e desenha os grifos. Chamadas seguidas: só a última desenha. Devolve o resumo (a densidade,
   * a % de conhecidas) mesmo sem a API de grifos; `null` quando outra chamada assumiu.
   */
  async atualizar(fonte: FonteDeVocabulario, aparencia: AparenciaDoDestaque): Promise<ResultadoDoDestaque | null> {
    const minha = ++this.geracao;
    const { resumo, candidatas } = this.classificar(fonte);
    if (!suportaGrifos(this.doc)) return { resumo, candidatas, grifadas: 0 };
    if (!(await this.montarRanges(minha)) || minha !== this.geracao) return null;
    const w = this.doc.defaultView as JanelaComGrifos;
    const registro = w.CSS!.highlights!;
    const porClasse = new Map<string, Range[]>();
    this.classes.forEach((c, i) => {
      const r = this.ranges[i];
      if (!c || !r) return;
      const lista = porClasse.get(c);
      if (lista) lista.push(r);
      else porClasse.set(c, [r]);
    });
    try {
      this.aplicarFolha(cssDosGrifos(aparencia));
      for (const nome of this.nomesNoRegistro) registro.delete(nome);
      this.nomesNoRegistro.clear();
      let grifadas = 0;
      for (const [classe, lista] of porClasse) {
        const nome = `${PREFIXO_DO_GRIFO}${classe}`;
        registro.set(nome, new w.Highlight!(...lista));
        this.nomesNoRegistro.add(nome);
        grifadas += lista.length;
      }
      return { resumo, candidatas, grifadas };
    } catch (erro) {
      console.warn('[destaque] não foi possível grifar', erro);
      return { resumo, candidatas, grifadas: 0 };
    }
  }

  /** As palavras (classificadas na última passada) que caem dentro do range visível, na ordem do texto. */
  palavrasNoRange(visivel: Range): PalavraClassificada[] {
    if (!this.preparado || visivel.startContainer.ownerDocument !== this.doc) return [];
    const { palavras, contagem, maximo } = this.preparado;
    const saida: PalavraClassificada[] = [];
    palavras.forEach((p, i) => {
      const r = this.ranges[i];
      const status = this.status[i];
      if (!r || !status) return;
      try {
        if (r.compareBoundaryPoints(Range.START_TO_START, visivel) < 0) return;
        if (r.compareBoundaryPoints(Range.END_TO_END, visivel) > 0) return;
      } catch {
        return;
      }
      saida.push({ chave: p.chave, status, frequencia: frequenciaRelativa(contagem.get(p.chave) ?? 0, maximo) });
    });
    return saida;
  }

  /** Tira todo o grifo do capítulo e cancela o que estiver em andamento. */
  limpar() {
    this.geracao++;
    const registro = (this.doc.defaultView as JanelaComGrifos | null)?.CSS?.highlights;
    for (const nome of this.nomesNoRegistro) {
      try {
        registro?.delete(nome);
      } catch {
        /* o documento já foi descartado com o capítulo */
      }
    }
    this.nomesNoRegistro.clear();
    try {
      if (this.folha && 'replaceSync' in this.folha) this.folha.replaceSync('');
      else (this.folha as HTMLStyleElement | null)?.remove();
    } catch {
      /* idem */
    }
    this.folha = null;
    this.cssAplicado = '';
  }
}
