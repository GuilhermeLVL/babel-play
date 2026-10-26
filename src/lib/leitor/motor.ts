/**
 * O MOTOR DO LEITOR — o adaptador fino sobre o foliate-js vendorizado (`./foliate/`). A tela fala só com
 * esta classe; trocar de motor (a spec deixa a porta aberta) é reescrever este arquivo.
 *
 * O que ele faz além de repassar:
 *  · SEGURANÇA: recusa todo script do manifesto do EPUB e limpa o HTML de cada seção (`limparHtml`);
 *  · PERFIL: aplica o perfil de leitura (CSS dentro do livro, fluxo paginado/rolagem, margem e coluna);
 *  · ANOTAÇÕES: desenha grifos/notas/palavras com a cor do tipo e avisa o toque num grifo;
 *  · TEXTO: devolve o texto que um CFI aponta e o texto de cada seção (para reancorar pela citação).
 */
import type { CorDeAnotacao, TipoDeAnotacao } from '../../core/leitura/anotacao';
import { cssDoLivro, type PerfilDeLeitura } from '../../core/leitura/perfilDeLeitura';
import type { ItemDoSumario, LivroDoFoliate, Localizacao, View } from './foliate/view.js';
import { facesDaFonte } from './fontes';
import { limparHtml } from './limparHtml';

/** A cor de cada token no livro (translúcida: o texto continua legível em qualquer tema). */
export const COR_DO_GRIFO: Record<CorDeAnotacao, string> = {
  amarelo: 'rgba(250, 204, 21, 0.42)',
  verde: 'rgba(52, 199, 89, 0.38)',
  azul: 'rgba(56, 132, 255, 0.36)',
  rosa: 'rgba(255, 99, 166, 0.36)',
  laranja: 'rgba(255, 149, 0, 0.40)',
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
    const alvo = this.view.book.transformTarget;
    if (!alvo) return;
    alvo.addEventListener('load', (e) => {
      const d = (e as CustomEvent<{ isScript: boolean; allow: boolean | Promise<boolean> }>).detail;
      if (d.isScript) d.allow = false;
    });
    alvo.addEventListener('data', (e) => {
      const d = (e as CustomEvent<{ data: unknown; type: string }>).detail;
      if (!/html|svg/i.test(d.type)) return;
      d.data = Promise.resolve(d.data).then((x) => (typeof x === 'string' ? limparHtml(x, d.type) : x));
    });
  }

  /** Vai para a posição salva (ou o começo do texto). Se o CFI não resolver, cai na seção. */
  async comecar(posicao?: { cfi?: string; secao?: number } | null) {
    const alvo = posicao?.cfi && this.view.resolveNavigation(posicao.cfi) ? posicao.cfi : null;
    if (alvo) await this.view.init({ lastLocation: alvo });
    else if (posicao?.secao) await this.view.goTo(posicao.secao);
    else await this.view.init({ showTextStart: true });
  }

  aplicarPerfil(perfil: PerfilDeLeitura) {
    this.perfil = perfil;
    const r = this.view.renderer;
    r.setStyles?.(cssDoLivro(perfil, facesDaFonte(perfil.fonte)));
    if (!this.view.isFixedLayout) {
      r.setAttribute('flow', perfil.modo === 'rolagem' ? 'scrolled' : 'paginated');
      r.setAttribute('gap', `${perfil.margem}%`);
      r.setAttribute('max-inline-size', `${perfil.largura}px`);
      r.setAttribute('max-column-count', '2');
      r.setAttribute('margin', '48px');
    }
  }

  proxima = () => this.view.next();
  anterior = () => this.view.prev();
  esquerda = () => this.view.goLeft();
  direita = () => this.view.goRight();
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
      if (a.tipo === 'palavra')
        draw(Overlayer.underline, { color: COR_DO_GRIFO[a.cor].replace(/[\d.]+\)$/, '0.9)'), width: 2 });
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
