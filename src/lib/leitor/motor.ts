/**
 * O MOTOR DO LEITOR — o adaptador fino sobre o foliate-js vendorizado (`./foliate/`). A tela fala só com
 * esta classe; trocar de motor (a spec deixa a porta aberta) é reescrever este arquivo.
 *
 * O que ele faz além de repassar:
 *  · SEGURANÇA: só carrega os tipos da lista (`politicaDeRecursos`), limpa toda marcação (`limparCapitulo`, DOMPurify) e
 *    abre só link http(s) sem opener; os iframes do livro não têm `allow-scripts` (`foliate/PATCHES.md`);
 *  · PERFIL: aplica o perfil de leitura (CSS dentro do livro, fluxo paginado/rolagem, margem e coluna);
 *  · ANOTAÇÕES: desenha grifos/notas/palavras com a cor do tipo e avisa o toque num grifo;
 *  · TEXTO: devolve o texto que um CFI aponta e o texto de cada seção (para reancorar pela citação).
 */
import type { CorDeAnotacao, TipoDeAnotacao } from '../../core/leitura/anotacao';
import { CORES_DOS_TEMAS, cssDoLivro, type PerfilDeLeitura } from '../../core/leitura/perfilDeLeitura';
import type { ItemDoSumario, LivroDoFoliate, Localizacao, View } from './foliate/view.js';
import { facesDaFonte } from './fontes';
import { limparCapitulo, limparCss, limparSvgDeImagem, tipoDeMarcacao } from './limparHtml';
import { linkExternoSeguro, normalizarTipo, tipoPermitido } from './politicaDeRecursos';

/**
 * A cor de cada token no livro. Sólida: a transparência é do overlayer (`--overlayer-highlight-opacity`,
 * ajustada por tema em `aplicarPerfil`), e no tema claro ela MULTIPLICA (o texto continua nítido por baixo).
 */
export const COR_DO_GRIFO: Record<CorDeAnotacao, string> = {
  amarelo: '#f5c400',
  verde: '#3cc46b',
  azul: '#4a8dff',
  rosa: '#ff5fa8',
  laranja: '#ff9500',
};

export interface AnotacaoDesenhada {
  cfi: string;
  tipo: TipoDeAnotacao;
  cor: CorDeAnotacao;
}

export interface EventosDoMotor {
  /** A posição mudou (virada de página, rolagem, salto). */
  aoMudarDePosicao?: (l: Localizacao) => void;
  /** Uma seção carregou: o documento dela, para ligar o toque na palavra e a seleção. */
  aoCarregarSecao?: (doc: Document, indice: number) => void;
  /** Toque num grifo desenhado. */
  aoTocarAnotacao?: (cfi: string) => void;
}

export interface InfoDoLivro {
  titulo: string;
  autor: string;
  idioma: string;
  sumario: ItemDoSumario[];
  ehPdf: boolean;
  secoes: number;
}

const texto = (x: unknown): string => {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(texto).filter(Boolean).join(', ');
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if ('name' in o) return texto(o.name);
    const v = Object.values(o)[0];
    return texto(v);
  }
  return String(x);
};

let definido: Promise<unknown> | null = null;
/** O elemento `<foliate-view>` é registrado uma vez, sob demanda (o motor inteiro fica fora do bundle inicial). */
const carregarView = () => (definido ??= import('./foliate/view.js'));

export class MotorDoLeitor {
  readonly view: View;
  private anotacoes = new Map<string, AnotacaoDesenhada>();
  private perfil: PerfilDeLeitura | null = null;

  private constructor(view: View) {
    this.view = view;
  }

  /** Cria o motor dentro de `hospedeiro` e abre o livro (arquivo EPUB/PDF ou livro de texto). */
  static async abrir(
    hospedeiro: HTMLElement,
    livro: File | LivroDoFoliate,
    eventos: EventosDoMotor = {},
  ): Promise<{ motor: MotorDoLeitor; info: InfoDoLivro }> {
    await carregarView();
    const view = document.createElement('foliate-view') as View;
    view.setAttribute('aria-hidden', 'false');
    view.style.display = 'block';
    view.style.width = '100%';
    view.style.height = '100%';
    hospedeiro.replaceChildren(view);
    const motor = new MotorDoLeitor(view);
    view.addEventListener('relocate', (e) => eventos.aoMudarDePosicao?.((e as CustomEvent<Localizacao>).detail));
    view.addEventListener('load', (e) => {
      const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
      eventos.aoCarregarSecao?.(doc, index);
    });
    view.addEventListener('draw-annotation', (e) => motor.desenhar(e as CustomEvent));
    /* LINK EXTERNO: o motor decide, não o foliate — só http(s), aba nova sem opener nem referrer. (Os links do
       livro chegam sem `href` — `limparHtml.ts` —, então este caminho só vale para o que o foliate gerar.) */
    view.addEventListener('external-link', (e) => {
      e.preventDefault();
      const url = linkExternoSeguro((e as CustomEvent<{ href_: string }>).detail?.href_ ?? '');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    view.addEventListener('show-annotation', (e) =>
      eventos.aoTocarAnotacao?.((e as CustomEvent<{ value: string }>).detail.value),
    );
    view.addEventListener('create-overlay', (e) => {
      const { index } = (e as CustomEvent<{ index: number }>).detail;
      for (const a of motor.anotacoes.values()) {
        const r = motor.view.resolveNavigation(a.cfi);
        if (r?.index === index) void motor.view.addAnnotation({ value: a.cfi });
      }
    });
    await view.open(livro);
    motor.blindar();
    const b = view.book;
    const info: InfoDoLivro = {
      titulo: texto(b.metadata?.title),
      autor: texto(b.metadata?.author),
      idioma: texto(b.metadata?.language),
      sumario: b.toc ?? [],
      ehPdf: view.isFixedLayout && typeof b.amostraDeTexto === 'function',
      secoes: b.sections.length,
    };
    return { motor, info };
  }

  /** Nenhum script do livro roda: recurso de script recusado, HTML limpo antes de virar `blob:`. */
  private blindar() {
    const livro = this.view.book;
    const alvo = livro.transformTarget;
    if (!alvo) return;
    /* NEGAÇÃO POR PADRÃO: só entra o tipo da lista (`tipoPermitido`); script, XML/XSLT e o resto, não. */
    alvo.addEventListener('load', (e) => {
      const d = (e as CustomEvent<{ type: string; isScript: boolean; allow: boolean | Promise<boolean> }>).detail;
      if (d.isScript || !tipoPermitido(d.type)) d.allow = false;
    });
    /*
     * O CONTEÚDO. Um predicado só (`tipoDeMarcacao`, sobre o tipo declarado e o começo do conteúdo) decide se é
     * marcação; e o TIPO do `blob:` só vira `text/html` depois que a limpeza RODOU e deu certo. Marcação que não
     * passou na limpeza vira texto vazio (`text/plain`) — falha fechada. CSS passa por `limparCss`.
     */
    alvo.addEventListener('data', (e) => {
      const d = (e as CustomEvent<{ data: unknown; type: unknown; name?: string }>).detail;
      const declarado = String(d.type ?? '');
      const ehCapitulo = livro.sections.some((s) => s.id === d.name);
      let fixarTipo: (t: string) => void = () => {};
      d.type = new Promise<string>((ok) => (fixarTipo = ok));
      d.data = Promise.resolve(d.data)
        .then(async (x) => {
          if (normalizarTipo(declarado) === 'text/css') {
            const css = typeof x === 'string' ? x : x instanceof Blob ? await x.text() : '';
            fixarTipo('text/css');
            return limparCss(css);
          }
          const inicio =
            typeof x === 'string' ? x.slice(0, 512) : x instanceof Blob ? await x.slice(0, 512).text() : '';
          const marcacao = tipoDeMarcacao(declarado, inicio);
          if (!marcacao) {
            fixarTipo(declarado);
            return x;
          }
          const texto = typeof x === 'string' ? x : x instanceof Blob ? await x.text() : '';
          if (marcacao === 'svg' && !ehCapitulo) {
            const svg = limparSvgDeImagem(texto);
            fixarTipo(svg == null ? 'text/plain' : 'image/svg+xml');
            return svg ?? '';
          }
          const html = limparCapitulo(texto, marcacao);
          fixarTipo(html == null ? 'text/plain' : 'text/html');
          return html ?? '';
        })
        .catch(() => {
          fixarTipo('text/plain');
          return '';
        });
    });
    /* O DOCUMENTO DE BUSCA E DE CFI (`createDocument`) é o mesmo capítulo LIMPO, lido como HTML: assim a árvore da
       busca, das anotações e a da tela coincidem (a limpeza tira elementos, e o CFI conta elementos). */
    for (const secao of livro.sections) {
      const original = secao.createDocument?.bind(secao);
      if (!original) continue;
      secao.createDocument = async () => {
        const doc = await original();
        const fonte = new XMLSerializer().serializeToString(doc);
        const tipo = doc.documentElement?.localName.toLowerCase() === 'svg' ? 'svg' : 'xhtml';
        const html = limparCapitulo(fonte, tipo);
        return new DOMParser().parseFromString(html ?? '<!DOCTYPE html><html><body></body></html>', 'text/html');
      };
    }
  }

  /** Vai para a posição salva (ou o começo do texto). Se o CFI não resolver, cai na seção. */
  async comecar(posicao?: { cfi?: string; secao?: number } | null) {
    const alvo = posicao?.cfi && this.view.resolveNavigation(posicao.cfi) ? posicao.cfi : null;
    if (alvo) await this.view.init({ lastLocation: alvo });
    else if (posicao?.secao) await this.view.goTo(posicao.secao);
    else await this.view.init({ showTextStart: true });
  }

  private geracaoDoPerfil = 0;
  async aplicarPerfil(perfil: PerfilDeLeitura): Promise<void> {
    /* O mesmo perfil de novo não reaplica: cada `setStyles` repagina o capítulo (e o texto salta na tela). */
    if (this.perfil && JSON.stringify(this.perfil) === JSON.stringify(perfil)) return;
    this.perfil = perfil;
    const r = this.view.renderer;
    const minha = ++this.geracaoDoPerfil;
    const faces = await facesDaFonte(perfil.fonte);
    if (minha !== this.geracaoDoPerfil) return; // outro perfil chegou no meio
    r.setStyles?.(cssDoLivro(perfil, faces));
    const escuro = CORES_DOS_TEMAS[perfil.tema].esquema === 'dark';
    this.view.style.setProperty('--overlayer-highlight-opacity', escuro ? '0.42' : '0.45');
    this.view.style.setProperty('--overlayer-highlight-blend-mode', escuro ? 'normal' : 'multiply');
    if (!this.view.isFixedLayout) {
      r.setAttribute('flow', perfil.modo === 'rolagem' ? 'scrolled' : 'paginated');
      r.setAttribute('gap', `${perfil.margem}%`);
      r.setAttribute('max-inline-size', `${perfil.largura}px`);
      r.setAttribute('max-column-count', '2');
      /* A margem de cima e de baixo (cabeçalho e rodapé do paginador): menor no celular, onde a altura é curta. */
      r.setAttribute('margin', window.matchMedia?.('(max-width: 640px)').matches ? '20px' : '44px');
    }
  }

  /* AS VIRADAS ENTRAM EM FILA: o paginador IGNORA a virada pedida durante a animação da anterior (`#locked`),
     e o toque rápido duas vezes virava uma página só — ou, voltando logo depois de avançar, nenhuma. */
  private fila: Promise<unknown> = Promise.resolve();
  private virar(f: () => Promise<unknown>) {
    this.fila = this.fila.then(f).catch(() => {});
    return this.fila;
  }
  proxima = () => this.virar(() => this.view.next());
  anterior = () => this.virar(() => this.view.prev());
  esquerda = () => this.virar(() => this.view.goLeft());
  direita = () => this.virar(() => this.view.goRight());
  ir = (alvo: string | number) => this.view.goTo(alvo);
  irParaFracao = (f: number) => this.view.goToFraction(f);
  get posicao(): Localizacao | null {
    return this.view.lastLocation;
  }
  get livro(): LivroDoFoliate {
    return this.view.book;
  }

  /** Os documentos das seções carregadas agora (para ligar eventos e achar a seleção). */
  documentos(): Array<{ doc: Document; index: number }> {
    return this.view.renderer?.getContents?.() ?? [];
  }

  /**
   * O LINK sob um nó do capítulo (`a[data-href]`, ver `limparHtml.ts`): `externo` = http(s), para a folha da
   * palavra oferecer "Abrir link"; `interno` = um lugar do próprio livro, aonde `irParaLink` vai. `null` = não é link.
   */
  linkDoNo(no: Node | null): { externo: string } | { interno: string; indice: number } | null {
    const el = (no?.nodeType === 1 ? (no as Element) : no?.parentElement)?.closest?.('a[data-href]');
    const href = el?.getAttribute('data-href');
    if (!el || !href) return null;
    const externo = linkExternoSeguro(href);
    if (externo) return { externo };
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
    const doc = el.ownerDocument;
    const achado = this.documentos().find((d) => d.doc === doc);
    return achado ? { interno: href, indice: achado.index } : null;
  }

  /** Vai ao destino de um link INTERNO do livro (o iframe nunca navega: quem vai é o motor). */
  async irParaLink(indice: number, href: string): Promise<boolean> {
    const secao = this.view.book.sections[indice];
    const alvo = secao?.resolveHref?.(href) ?? href;
    if (this.view.book.isExternal?.(alvo)) return false;
    try {
      return !!(await this.view.goTo(alvo));
    } catch {
      return false;
    }
  }

  cfiDe(indice: number, range: Range): string {
    return this.view.getCFI(indice, range);
  }

  /** O texto que um CFI aponta hoje, ou `null` se não resolve. */
  async textoDoCfi(cfi: string): Promise<string | null> {
    try {
      const r = this.view.resolveNavigation(cfi);
      if (!r || r.index < 0 || !r.anchor) return null;
      const carregado = this.documentos().find((d) => d.index === r.index)?.doc;
      const doc = carregado ?? (await this.view.book.sections[r.index]?.createDocument?.());
      if (!doc) return null;
      const alvo = r.anchor(doc);
      return alvo ? (alvo instanceof Range ? alvo.toString() : (alvo.textContent ?? '')) : null;
    } catch {
      return null;
    }
  }

  /** O texto de cada seção (vazio onde não há documento), para a reancoragem pela citação. */
  async textosDasSecoes(): Promise<string[]> {
    const out: string[] = [];
    for (const s of this.view.book.sections) {
      try {
        const doc = await s.createDocument?.();
        out.push(doc?.body?.textContent ?? doc?.documentElement?.textContent ?? '');
      } catch {
        out.push('');
      }
    }
    return out;
  }

  /** O CFI de um trecho de texto puro dentro de uma seção (a reancoragem acha o trecho; isto o transforma em CFI). */
  async cfiDoTrecho(secao: number, inicio: number, fim: number): Promise<string | null> {
    const doc = await this.view.book.sections[secao]?.createDocument?.();
    const raiz = doc?.body ?? doc?.documentElement;
    if (!doc || !raiz) return null;
    const range = doc.createRange();
    let pos = 0;
    let achouInicio = false;
    const walker = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const len = n.textContent?.length ?? 0;
      if (!achouInicio && inicio <= pos + len) {
        range.setStart(n, inicio - pos);
        achouInicio = true;
      }
      if (achouInicio && fim <= pos + len) {
        range.setEnd(n, fim - pos);
        return this.cfiDe(secao, range);
      }
      pos += len;
    }
    return null;
  }

  /** Troca o conjunto de anotações desenhadas. */
  async desenharAnotacoes(lista: AnotacaoDesenhada[]) {
    const novas = new Map(lista.filter((a) => a.cfi).map((a) => [a.cfi, a]));
    for (const cfi of this.anotacoes.keys()) {
      if (!novas.has(cfi)) await this.view.deleteAnnotation({ value: cfi }).catch(() => {});
    }
    const antigas = this.anotacoes;
    this.anotacoes = novas;
    for (const a of novas.values()) {
      const antes = antigas.get(a.cfi);
      if (!antes || antes.cor !== a.cor || antes.tipo !== a.tipo) {
        await this.view.addAnnotation({ value: a.cfi }).catch(() => {});
      }
    }
  }

  private desenhar(e: CustomEvent) {
    const { draw, annotation } = e.detail as {
      draw: (f: unknown, o: Record<string, unknown>) => void;
      annotation: { value: string };
    };
    const a = this.anotacoes.get(annotation.value);
    void import('./foliate/overlayer.js').then(({ Overlayer }) => {
      if (!a) return;
      if (a.tipo === 'palavra') draw(Overlayer.underline, { color: COR_DO_GRIFO[a.cor], width: 2 });
      else draw(Overlayer.highlight, { color: COR_DO_GRIFO[a.cor] });
    });
  }

  async *buscar(consulta: string) {
    for await (const r of this.view.search({ query: consulta })) {
      if (r === 'done') return;
      if ('subitems' in r) yield r;
    }
  }

  limparBusca() {
    this.view.clearSearch();
  }

  desmarcar() {
    this.view.deselect();
  }

  fechar() {
    try {
      this.view.close();
      this.view.book?.destroy?.();
    } finally {
      this.view.remove();
    }
  }

  get perfilAplicado() {
    return this.perfil;
  }
}
