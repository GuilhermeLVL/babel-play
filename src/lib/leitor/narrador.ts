/**
 * O NARRADOR DO LEITOR (L3) — liga a máquina de estados (`core/leitura/narracao.ts`) ao motor do leitor e à voz.
 *
 *  · FRASES do capítulo carregado (`frasesDoCapitulo.ts`), lidas uma a uma, com DESTAQUE (o overlayer do
 *    foliate, desenhado pelo app: o iframe não tem script) e a PÁGINA SEGUINDO a frase ("Seguir a leitura");
 *  · no fim do capítulo, o seguinte carrega e a leitura continua;
 *  · COMEÇA de onde a pessoa está: a frase guardada (o CFI da última frase lida), se estiver na página; senão a
 *    primeira frase da página visível;
 *  · a VOZ: a do aparelho para todos (`nativeTts`, sem o "blip" do `speak()` a cada frase); a natural da nuvem
 *    (`vozDaNuvem.ts`) só com o direito do plano, a flag e a escolha da pessoa — e qualquer recusa da nuvem
 *    (402 do plano, cota, 429) lê a MESMA frase com a voz do aparelho;
 *  · pausar e retomar: retomar fala a frase de novo do começo (a nuvem não pausa, e o Chrome perde a fala pausada
 *    por muito tempo); mudar a velocidade, a voz ou o modo recomeça a frase, sem perder o destaque;
 *  · Media Session: os controles do sistema (fone, tela de bloqueio) tocam, pausam e pulam frase.
 */
import {
  type EstadoDaNarracao,
  type EventoDaNarracao,
  type ModoDaNarracao,
  modoTraduz,
  NARRACAO_PARADA,
  narrar,
  type PassoDaFala,
  passosDaFrase,
  vozDaNarracao,
} from '../../core/leitura/narracao';
import { codigoDeFala, nativeTts, type TtsEngine } from '../tts';
import type { VozDaNuvem } from '../voz/vozDaNuvem';
import { type FraseNoCapitulo, frasesDoDocumento, indiceDaFraseEm } from './frasesDoCapitulo';
import type { MotorDoLeitor } from './motor';

export interface VistaDoNarrador {
  fase: EstadoDaNarracao['fase'];
  indice: number;
  total: number;
  /** A frase destacada (vazia sem destaque). */
  frase: string;
}

export interface DependenciasDoNarrador {
  motor: () => MotorDoLeitor | null;
  livroId: string;
  idiomaDoLivro: () => string;
  idiomaDaPessoa: () => string;
  traduzir: (texto: string) => Promise<string | null>;
  /** O idioma detectado da frase (leitura inteligente), ou `null` sem sinal. */
  detectar?: (texto: string) => Promise<string | null>;
  /** A pessoa escolheu a voz natural da nuvem para este idioma? */
  escolheuNuvem: (idioma: string) => boolean;
  /** O plano tem `vozNatural` e a flag `voz_natural` está ligada? */
  nuvemLiberada: () => { temDireito: boolean; flagLigada: boolean };
  aoMudar: (v: VistaDoNarrador) => void;
  /** A narração vai mexer na página (o leitor ignora "toques" que a navegação produz). */
  aoNavegar?: () => void;
  /** Uma frase não pôde ser lida, ou o livro acabou. */
  aoAviso?: (aviso: 'erro' | 'fim' | 'sem-texto') => void;
  /** A voz natural não serviu e a do aparelho leu (o plano, a cota): para avisar uma vez. */
  aoRecuoDaNuvem?: (motivo: string) => void;
  metadados?: () => { titulo: string; autor?: string };
  /** A voz da nuvem (para o teste); padrão: `criarVozDaNuvem` sob demanda. */
  criarNuvem?: () => Promise<VozDaNuvem>;
  /** A voz do aparelho (para o teste); padrão: `nativeTts`. */
  aparelho?: TtsEngine;
}

const CHAVE_DA_POSICAO = (livroId: string) => `leitor:narracao:${livroId}`;

export class Narrador {
  private estado: EstadoDaNarracao = NARRACAO_PARADA;
  private frases: FraseNoCapitulo[] = [];
  private doc: Document | null = null;
  private indiceDaSecao = -1;
  private virandoCapitulo = false;
  /** O capítulo mudou por fora (sumário, página): retomar recomeça da página visível. */
  private recalcular = false;
  private nuvem: VozDaNuvem | null = null;
  private traducoes = new Map<string, Promise<string | null>>();
  private destruido = false;
  modo: ModoDaNarracao = 'original';
  velocidade = 1;
  seguir = true;

  constructor(private readonly d: DependenciasDoNarrador) {}

  get vista(): VistaDoNarrador {
    const e = this.estado;
    const comDestaque = e.fase === 'tocando' || e.fase === 'pausada';
    return {
      fase: e.fase,
      indice: e.indice,
      total: e.total,
      frase: comDestaque ? (this.frases[e.indice]?.texto ?? '') : '',
    };
  }

  /* ── comandos ── */

  /** Toca (ou retoma) de onde a pessoa está. */
  tocar() {
    const e = this.estado;
    if (e.fase === 'tocando') return;
    if (e.fase === 'pausada' && !this.recalcular) return this.despachar({ tipo: 'retomar' });
    if (!this.carregarFrases()) {
      this.d.aoAviso?.('sem-texto');
      return;
    }
    this.recalcular = false;
    this.despachar({ tipo: 'capitulo', total: this.frases.length, indice: this.ondeComecar(), continuar: true });
  }
  pausar = () => this.despachar({ tipo: 'pausar' });
  alternar = () => (this.estado.fase === 'tocando' ? this.pausar() : this.tocar());
  proxima = () => this.despachar({ tipo: 'proxima' });
  anterior = () => this.despachar({ tipo: 'anterior' });
  parar = () => this.despachar({ tipo: 'parar' });

  /** Velocidade, voz ou modo mudaram: a frase recomeça (o destaque fica). */
  reiniciarFrase() {
    if (this.estado.fase === 'tocando') this.despachar({ tipo: 'tocar', indice: this.estado.indice });
  }
  definirVelocidade(v: number) {
    this.velocidade = v;
    this.reiniciarFrase();
  }
  definirModo(m: ModoDaNarracao) {
    this.modo = m;
    this.reiniciarFrase();
  }
  definirSeguir(s: boolean) {
    this.seguir = s;
    const f = this.frases[this.estado.indice];
    if (s && f && this.estado.fase !== 'parada') this.mostrar(f.range);
  }

  /** Uma seção carregou (o motor avisa). Se foi por fora da narração, ela pausa e recomeça da página nova. */
  secaoCarregada(doc: Document, indice: number) {
    if (this.virandoCapitulo || this.estado.fase === 'parada') return;
    if (doc === this.doc && indice === this.indiceDaSecao) return;
    this.recalcular = true;
    this.carregarFrases();
    this.despachar({ tipo: 'capitulo', total: this.frases.length, indice: 0, continuar: false });
  }

  destruir() {
    this.destruido = true;
    this.estado = narrar(this.estado, { tipo: 'parar' });
    this.calar();
    this.d.motor()?.destacarFrase(null);
    this.limparSessaoDeMidia();
  }

  /* ── o caminho de cada estado ── */

  private despachar(ev: EventoDaNarracao) {
    if (this.destruido) return;
    const antes = this.estado;
    const depois = narrar(antes, ev);
    this.estado = depois;
    if (depois.vez !== antes.vez) this.aplicar(depois);
    this.d.aoMudar(this.vista);
  }

  private aplicar(e: EstadoDaNarracao) {
    this.calar();
    const motor = this.d.motor();
    if (e.fase === 'parada') {
      motor?.destacarFrase(null);
      this.limparSessaoDeMidia();
      return;
    }
    if (e.fase === 'virando') {
      motor?.destacarFrase(null);
      void this.virarCapitulo(e.vez);
      return;
    }
    const f = this.frases[e.indice];
    if (!f) return;
    motor?.destacarFrase(f.range);
    if (this.seguir) this.mostrar(f.range);
    this.guardarPosicao(f.range);
    this.sessaoDeMidia(e.fase === 'tocando');
    if (e.fase === 'tocando') void this.falarFrase(e.indice, e.vez);
  }

  private mostrar(range: Range) {
    const motor = this.d.motor();
    if (!motor || motor.trechoVisivel(range)) return;
    this.d.aoNavegar?.();
    void motor.mostrarTrecho(range);
  }

  private async virarCapitulo(vez: number) {
    const motor = this.d.motor();
    if (!motor) return;
    this.virandoCapitulo = true;
    this.d.aoNavegar?.();
    const foi = await motor
      .proximoCapitulo()
      .catch(() => false)
      .finally(() => {
        this.virandoCapitulo = false;
      });
    if (this.destruido || this.estado.vez !== vez) return;
    if (!foi) {
      this.d.aoAviso?.('fim');
      this.despachar({ tipo: 'parar' });
      return;
    }
    this.carregarFrases();
    this.despachar({ tipo: 'capitulo', total: this.frases.length, indice: 0, continuar: true });
  }

  /* ── as frases e de onde começar ── */

  private carregarFrases(): boolean {
    const atual = this.d.motor()?.documentos()[0];
    if (!atual) return false;
    this.doc = atual.doc;
    this.indiceDaSecao = atual.index;
    this.frases = frasesDoDocumento(atual.doc, this.d.idiomaDoLivro() || undefined);
    return this.frases.length > 0;
  }

  /** A frase guardada (se estiver na página visível), senão a primeira da página. */
  private ondeComecar(): number {
    const motor = this.d.motor();
    if (!motor || !this.doc) return 0;
    try {
      const cfi = localStorage.getItem(CHAVE_DA_POSICAO(this.d.livroId));
      const alvo = cfi ? motor.view.resolveNavigation(cfi) : null;
      if (alvo && alvo.index === this.indiceDaSecao && alvo.anchor) {
        const r = alvo.anchor(this.doc);
        if (r instanceof Range && motor.trechoVisivel(r))
          return indiceDaFraseEm(this.frases, r.startContainer, r.startOffset);
      }
    } catch {
      /* sem armazenamento, ou CFI de outra edição: a página manda */
    }
    const visivel = motor.posicao?.range;
    if (visivel && visivel.startContainer.ownerDocument === this.doc)
      return indiceDaFraseEm(this.frases, visivel.startContainer, visivel.startOffset);
    return 0;
  }

  private guardarPosicao(range: Range) {
    const motor = this.d.motor();
    if (!motor || this.indiceDaSecao < 0) return;
    try {
      const inicio = range.cloneRange();
      inicio.collapse(true);
      localStorage.setItem(CHAVE_DA_POSICAO(this.d.livroId), motor.cfiDe(this.indiceDaSecao, inicio));
    } catch {
      /* sem armazenamento: a narração começa pela página */
    }
  }

  /* ── a voz ── */

  private traducao(texto: string): Promise<string | null> {
    let p = this.traducoes.get(texto);
    if (!p) {
      p = this.d.traduzir(texto).catch(() => null);
      this.traducoes.set(texto, p);
      if (this.traducoes.size > 200) this.traducoes.delete(this.traducoes.keys().next().value!);
    }
    return p;
  }

  private async passos(indice: number): Promise<PassoDaFala[]> {
    const frase = this.frases[indice]?.texto ?? '';
    const idiomaDoLivro = this.d.idiomaDoLivro();
    const idiomaDaPessoa = this.d.idiomaDaPessoa();
    const traduz = modoTraduz(this.modo) && idiomaDoLivro && idiomaDoLivro !== idiomaDaPessoa;
    const [traducao, detectado] = await Promise.all([
      traduz ? this.traducao(frase) : Promise.resolve(null),
      this.modo === 'auto' && this.d.detectar ? this.d.detectar(frase).catch(() => null) : Promise.resolve(null),
    ]);
    /* A tradução da frase seguinte já sai agora: a pausa entre as frases fica curta. */
    const seguinte = this.frases[indice + 1]?.texto;
    if (traduz && seguinte) void this.traducao(seguinte);
    return passosDaFrase(this.modo, frase, { idiomaDoLivro, idiomaDaPessoa, traducao, detectado });
  }

  private async falarFrase(indice: number, vez: number) {
    const passos = await this.passos(indice);
    if (this.estado.vez !== vez || this.destruido) return;
    const falarPasso = async (i: number): Promise<void> => {
      const passo = passos[i];
      if (!passo) return this.despachar({ tipo: 'fimDaFrase', vez });
      const motor = await this.motorDeVoz(passo.idioma);
      if (this.estado.vez !== vez) return;
      motor.speak(passo.texto, {
        lang: codigoDeFala(passo.idioma),
        rate: this.velocidade,
        onEnd: () => {
          if (this.estado.vez === vez) void falarPasso(i + 1);
        },
        onError: () => {
          if (this.estado.vez !== vez) return;
          this.d.aoAviso?.('erro');
          this.despachar({ tipo: 'erro', vez });
        },
      });
    };
    await falarPasso(0);
  }

  private async motorDeVoz(idioma: string): Promise<TtsEngine> {
    const aparelho = this.d.aparelho ?? nativeTts;
    const liberada = this.d.nuvemLiberada();
    if (vozDaNarracao({ escolheuNuvem: this.d.escolheuNuvem(idioma), ...liberada }) !== 'nuvem') return aparelho;
    if (this.nuvem) return this.nuvem;
    try {
      const nuvem = this.d.criarNuvem
        ? await this.d.criarNuvem()
        : await import('../voz/vozDaNuvem').then(({ criarVozDaNuvem }) =>
            criarVozDaNuvem({ reserva: aparelho, aoRecuar: (m) => this.d.aoRecuoDaNuvem?.(m) }),
          );
      this.nuvem = nuvem;
      return nuvem;
    } catch {
      return aparelho;
    }
  }

  private calar() {
    (this.d.aparelho ?? nativeTts).cancel();
    this.nuvem?.cancel();
  }

  /* ── Media Session (fone, tela de bloqueio) ── */

  private sessaoDeMidia(tocando: boolean) {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      const m = this.d.metadados?.();
      if (m && typeof MediaMetadata !== 'undefined' && ms.metadata?.title !== m.titulo)
        ms.metadata = new MediaMetadata({ title: m.titulo, artist: m.autor ?? '' });
      ms.playbackState = tocando ? 'playing' : 'paused';
      ms.setActionHandler('play', () => this.tocar());
      ms.setActionHandler('pause', () => this.pausar());
      ms.setActionHandler('stop', () => this.parar());
      ms.setActionHandler('previoustrack', () => this.anterior());
      ms.setActionHandler('nexttrack', () => this.proxima());
    } catch {
      /* ação não suportada neste navegador */
    }
  }

  private limparSessaoDeMidia() {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      ms.playbackState = 'none';
      for (const a of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack'] as const) ms.setActionHandler(a, null);
    } catch {
      /* nada a limpar */
    }
  }
}
