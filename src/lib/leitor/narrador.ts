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
 *    por muito tempo); mudar a velocidade, o tom, o volume, a voz ou o modo recomeça a frase, sem perder o destaque;
 *  · os AJUSTES (`OpcoesDaNarracao`: velocidade, tom, volume, pausas, repetições), guardados no aparelho, a pausa
 *    entre frases/parágrafos, "voltar 10 s", capítulo anterior/próximo e o temporizador de sono;
 *  · Media Session: os controles do sistema (fone, tela de bloqueio) tocam, pausam e pulam frase.
 */
import {
  type ConfigDoElenco,
  falaDaFrase,
  montarDistribuicao,
  planejarElenco,
  type PlanoDaFrase,
} from '../../core/avatar/elenco';
import type { EmocaoDoAvatar } from '../../core/avatar/estados';
import {
  dormirEm,
  frasesParaVoltar,
  normalizarOpcoes,
  type OpcoesDaNarracao,
  pausaAposAFrase,
  type Sono,
} from '../../core/leitura/estilosDeLeitura';
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
import type { MotorDeVozId } from '../../core/voz/portaDeVoz';
import { motorDeVozRegistrado, neuralLocalPronto } from '../../gateway/registroDeMotoresDeVoz';
import { aguardarVozes, codigoDeFala, nativeTts, type TtsEngine } from '../tts';
import type { VozDaNuvem } from '../voz/vozDaNuvem';
import { type FraseNoCapitulo, frasesDoDocumento, indiceDaFraseEm } from './frasesDoCapitulo';
import type { MotorDoLeitor } from './motor';
import { gravarOpcoesDaNarracao, lerOpcoesDaNarracao } from './preferenciasDaNarracao';

export interface VistaDoNarrador {
  fase: EstadoDaNarracao['fase'];
  indice: number;
  total: number;
  /** A frase destacada (vazia sem destaque). */
  frase: string;
  /** Os ajustes em vigor (a barra e o painel desenham deles). */
  opcoes: OpcoesDaNarracao;
  /** O temporizador de sono armado (`null` = sem sono). */
  sono: Sono;
  /**
   * Quem fala a frase destacada e com que emoção, SÓ com o elenco ligado (`null` = voz única, como sempre).
   * `nome` é a personagem, ou `null` quando é o narrador.
   */
  fala?: { nome: string | null; emocao: EmocaoDoAvatar } | null;
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
  aoAviso?: (aviso: 'erro' | 'fim' | 'sem-texto' | 'sono') => void;
  /** A voz natural não serviu e a do aparelho leu (o plano, a cota): para avisar uma vez. */
  aoRecuoDaNuvem?: (motivo: string) => void;
  metadados?: () => { titulo: string; autor?: string };
  /** A voz da nuvem (para o teste); padrão: `criarVozDaNuvem` sob demanda. */
  criarNuvem?: () => Promise<VozDaNuvem>;
  /** A voz do aparelho (para o teste); padrão: `nativeTts`. */
  aparelho?: TtsEngine;
  /** Os ajustes de partida (padrão: os guardados no aparelho). */
  opcoesIniciais?: OpcoesDaNarracao;
  /** O relógio do sono (para o teste); padrão: `Date.now`. */
  agora?: () => number;
  /**
   * O ELENCO (M5, flag `avatar_elenco`): a configuração em vigor, ou `null`/ausente = voz única (a fala de sempre).
   * Lida a cada capítulo e em `definirElenco()`; nunca é obrigatória nem usa rede.
   */
  elenco?: () => ConfigDoElenco | null;
}

/** Quanto esperar sem novas mudanças antes de recomeçar a frase (a pessoa arrasta um controle). */
const ATRASO_DO_REINICIO_MS = 300;

const CHAVE_DA_POSICAO = (livroId: string) => `leitor:narracao:${livroId}`;

export class Narrador {
  private estado: EstadoDaNarracao = NARRACAO_PARADA;
  private frases: FraseNoCapitulo[] = [];
  /** O plano do elenco por frase do capítulo (`null` = elenco desligado). */
  private planos: PlanoDaFrase[] | null = null;
  private doc: Document | null = null;
  private indiceDaSecao = -1;
  private virandoCapitulo = false;
  /** O capítulo mudou por fora (sumário, página): retomar recomeça da página visível. */
  private recalcular = false;
  private nuvem: VozDaNuvem | null = null;
  private traducoes = new Map<string, Promise<string | null>>();
  private destruido = false;
  modo: ModoDaNarracao = 'original';
  seguir = true;
  opcoes: OpcoesDaNarracao;
  private sono: Sono = null;
  private timerDoSono: ReturnType<typeof setTimeout> | null = null;
  private timerDaPausa: ReturnType<typeof setTimeout> | null = null;
  private timerDoReinicio: ReturnType<typeof setTimeout> | null = null;
  /** O capítulo que está virando deve voltar (-1) ou avançar (1)? */
  private direcao: 1 | -1 = 1;
  /** Ao acabar de virar, seguir falando? (virar à mão numa narração pausada não toca sozinho) */
  private falarAoVirar = true;
  private viraAMao = false;

  constructor(private readonly d: DependenciasDoNarrador) {
    this.opcoes = d.opcoesIniciais ?? lerOpcoesDaNarracao();
  }

  get velocidade(): number {
    return this.opcoes.velocidade;
  }
  set velocidade(v: number) {
    this.opcoes = normalizarOpcoes({ velocidade: v }, this.opcoes);
  }

  get vista(): VistaDoNarrador {
    const e = this.estado;
    const comDestaque = e.fase === 'tocando' || e.fase === 'pausada';
    return {
      fase: e.fase,
      indice: e.indice,
      total: e.total,
      frase: comDestaque ? (this.frases[e.indice]?.texto ?? '') : '',
      opcoes: this.opcoes,
      sono: this.sono,
      fala: this.falaDa(comDestaque ? e.indice : -1),
    };
  }

  /** O falante e a emoção da frase `indice` (só com o elenco ligado). */
  private falaDa(indice: number): VistaDoNarrador['fala'] {
    const p = this.planos?.[indice];
    if (!p) return null;
    return { nome: p.falante.tipo === 'personagem' ? (p.falante.nome ?? null) : null, emocao: p.emocao };
  }

  /** O elenco mudou (ligou, desligou, outra voz): refaz o plano e a frase em curso recomeça com a voz nova. */
  definirElenco() {
    this.planejar();
    this.reiniciarFrase();
    if (!this.destruido) this.d.aoMudar(this.vista);
  }

  private planejar() {
    let cfg: ConfigDoElenco | null;
    try {
      cfg = this.d.elenco?.() ?? null;
    } catch {
      cfg = null; // falhou ao montar o elenco: voz única, nunca silêncio
    }
    this.planos =
      cfg && this.frases.length
        ? planejarElenco(
            this.frases.map((f) => f.texto),
            cfg,
            montarDistribuicao(cfg),
          )
        : null;
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
    this.definirOpcoes({ velocidade: v }, { adiar: false });
  }
  /**
   * Muda os ajustes e guarda no aparelho. Velocidade, tom e volume valem na fala NOVA: a frase recomeça (com
   * um respiro quando a pessoa arrasta o controle, `adiar`); as pausas e as repetições valem na próxima frase.
   */
  definirOpcoes(parcial: Partial<OpcoesDaNarracao>, o: { adiar?: boolean } = {}) {
    const antes = this.opcoes;
    this.opcoes = normalizarOpcoes(parcial, antes);
    gravarOpcoesDaNarracao(this.opcoes);
    const mudouAFala =
      this.opcoes.velocidade !== antes.velocidade ||
      this.opcoes.tom !== antes.tom ||
      this.opcoes.volume !== antes.volume;
    if (mudouAFala) {
      if (o.adiar === false) this.reiniciarFrase();
      else this.reiniciarDepois();
    }
    if (!this.destruido) this.d.aoMudar(this.vista);
  }
  private reiniciarDepois() {
    if (this.timerDoReinicio) clearTimeout(this.timerDoReinicio);
    this.timerDoReinicio = setTimeout(() => {
      this.timerDoReinicio = null;
      this.reiniciarFrase();
    }, ATRASO_DO_REINICIO_MS);
  }
  definirModo(m: ModoDaNarracao) {
    this.modo = m;
    this.reiniciarFrase();
  }
  /** Volta cerca de `segundos` de fala (estimativa pelo tamanho das frases e pela velocidade). */
  voltar(segundos = 10) {
    const e = this.estado;
    if (e.fase !== 'tocando' && e.fase !== 'pausada') return;
    const n = frasesParaVoltar(
      this.frases.map((f) => f.texto.length),
      e.indice,
      segundos,
      this.opcoes.velocidade,
    );
    this.despachar({ tipo: 'ir', indice: e.indice - n });
  }
  /** Pula para o capítulo seguinte (`1`) ou anterior (`-1`). */
  irParaCapitulo(direcao: 1 | -1) {
    const e = this.estado;
    if (e.fase === 'parada' || e.fase === 'virando') return;
    this.direcao = direcao;
    this.falarAoVirar = e.fase === 'tocando';
    this.viraAMao = true;
    this.despachar({ tipo: 'capitulo', total: 0, indice: 0, continuar: true });
  }

  /** Arma (ou desarma, com `null`) o temporizador de sono: minutos, ou `'capitulo'` para o fim do capítulo. */
  definirSono(quando: number | 'capitulo' | null) {
    if (this.timerDoSono) clearTimeout(this.timerDoSono);
    this.timerDoSono = null;
    const agora = this.d.agora ?? Date.now;
    this.sono = quando === null ? null : quando === 'capitulo' ? { tipo: 'capitulo' } : dormirEm(quando, agora());
    if (typeof quando === 'number') {
      this.timerDoSono = setTimeout(() => this.dormir(), quando * 60_000);
    }
    if (!this.destruido) this.d.aoMudar(this.vista);
  }
  private dormir() {
    this.timerDoSono = null;
    this.sono = null;
    if (this.estado.fase === 'tocando' || this.estado.fase === 'virando') {
      this.d.aoAviso?.('sono');
      this.despachar({ tipo: 'pausar' });
    } else this.d.aoMudar(this.vista);
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
    if (this.timerDoSono) clearTimeout(this.timerDoSono);
    if (this.timerDoReinicio) clearTimeout(this.timerDoReinicio);
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
      void this.virarCapitulo(e.vez, this.direcao);
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

  private async virarCapitulo(vez: number, direcao: 1 | -1) {
    const motor = this.d.motor();
    if (!motor) return;
    const continuar = this.falarAoVirar;
    this.direcao = 1;
    this.falarAoVirar = true;
    const aMao = this.viraAMao;
    this.viraAMao = false;
    /* O sono "no fim do capítulo": o capítulo acabou, a narração pausa em vez de abrir o seguinte. */
    if (
      !aMao &&
      direcao === 1 &&
      continuar &&
      this.sono?.tipo === 'capitulo' &&
      this.estado.indice >= this.estado.total - 1
    ) {
      this.sono = null;
      this.d.aoAviso?.('sono');
      this.despachar({ tipo: 'capitulo', total: this.estado.total, indice: this.estado.total - 1, continuar: false });
      return;
    }
    this.virandoCapitulo = true;
    this.d.aoNavegar?.();
    const virar = direcao === 1 ? motor.proximoCapitulo() : motor.capituloAnterior();
    const foi = await virar
      .catch(() => false)
      .finally(() => {
        this.virandoCapitulo = false;
      });
    if (this.destruido || this.estado.vez !== vez) return;
    if (!foi) {
      if (direcao === -1) {
        /* Já é o primeiro capítulo: recomeça do começo dele. */
        this.carregarFrases();
        this.despachar({ tipo: 'capitulo', total: this.frases.length, indice: 0, continuar });
        return;
      }
      this.d.aoAviso?.('fim');
      this.despachar({ tipo: 'parar' });
      return;
    }
    this.carregarFrases();
    this.despachar({ tipo: 'capitulo', total: this.frases.length, indice: 0, continuar });
  }

  /* ── as frases e de onde começar ── */

  private carregarFrases(): boolean {
    const atual = this.d.motor()?.documentos()[0];
    if (!atual) return false;
    this.doc = atual.doc;
    this.indiceDaSecao = atual.index;
    this.frases = frasesDoDocumento(atual.doc, this.d.idiomaDoLivro() || undefined);
    this.planejar();
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

  /** O silêncio depois da frase (pausa entre frases + a de parágrafo), e então a próxima. */
  private fimDaFrase(indice: number, vez: number) {
    const ms = pausaAposAFrase(this.opcoes, !!this.frases[indice]?.fimDeParagrafo);
    if (ms <= 0) return this.despachar({ tipo: 'fimDaFrase', vez });
    this.timerDaPausa = setTimeout(() => {
      this.timerDaPausa = null;
      if (this.estado.vez === vez) this.despachar({ tipo: 'fimDaFrase', vez });
    }, ms);
  }

  private async falarFrase(indice: number, vez: number) {
    const original = await this.passos(indice);
    /* `repeticoes` (modo Estudo): a frase inteira, com todos os seus passos, lida N vezes seguidas. */
    const passos = Array.from({ length: this.opcoes.repeticoes }, () => original).flat();
    /* A lista de vozes do Chrome chega depois do primeiro acesso: sem ela a 1ª frase sairia com a voz errada. */
    if (!this.d.aparelho) await aguardarVozes();
    if (this.estado.vez !== vez || this.destruido) return;
    const falarPasso = async (i: number): Promise<void> => {
      const passo = passos[i];
      if (!passo) return this.fimDaFrase(indice, vez);
      const { motor, id } = await this.motorDeVoz(passo.idioma);
      if (this.estado.vez !== vez) return;
      /* Só o passo do LIVRO leva elenco; a tradução fala sempre na voz da pessoa. */
      const doLivro = passo.texto === this.frases[indice]?.texto;
      const fala = falaDaFrase(
        doLivro ? this.planos?.[indice] : undefined,
        { rate: this.opcoes.velocidade, pitch: this.opcoes.tom },
        { temTom: id !== 'nuvem', temVoz: id === 'aparelho' },
      );
      motor.speak(passo.texto, {
        lang: codigoDeFala(passo.idioma),
        /* A voz natural da nuvem só vai de 0,5 a 2× (a rota recusa mais); tom e volume são do aparelho. */
        rate: id === 'nuvem' ? Math.min(fala.rate, 2) : fala.rate,
        pitch: fala.pitch,
        ...(fala.voiceName ? { voiceName: fala.voiceName } : {}),
        volume: this.opcoes.volume,
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

  private async motorDeVoz(idioma: string): Promise<{ motor: TtsEngine; id: MotorDeVozId }> {
    const aparelho = this.d.aparelho ?? nativeTts;
    const liberada = this.d.nuvemLiberada();
    const quem = vozDaNarracao({
      escolheuNuvem: this.d.escolheuNuvem(idioma),
      ...liberada,
      /* Hoje ninguém registra o motor neural local: o campo vale `false` e nada muda. */
      neuralLocalPronto: this.d.aparelho ? false : neuralLocalPronto(idioma),
    });
    if (quem === 'neural-local') {
      try {
        const neural = await motorDeVozRegistrado('neural-local')?.criar({ reserva: aparelho });
        if (neural) return { motor: neural, id: quem };
      } catch {
        /* o neural falhou ao abrir: o aparelho lê */
      }
      return { motor: aparelho, id: 'aparelho' };
    }
    if (quem !== 'nuvem') return { motor: aparelho, id: 'aparelho' };
    if (this.nuvem) return { motor: this.nuvem, id: 'nuvem' };
    try {
      const nuvem = this.d.criarNuvem
        ? await this.d.criarNuvem()
        : await import('../voz/vozDaNuvem').then(({ criarVozDaNuvem }) =>
            criarVozDaNuvem({ reserva: aparelho, aoRecuar: (m) => this.d.aoRecuoDaNuvem?.(m) }),
          );
      this.nuvem = nuvem;
      return { motor: nuvem, id: 'nuvem' };
    } catch {
      return { motor: aparelho, id: 'aparelho' };
    }
  }

  private calar() {
    if (this.timerDaPausa) clearTimeout(this.timerDaPausa);
    this.timerDaPausa = null;
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
      ms.setActionHandler('seekbackward', () => this.voltar(10));
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
      for (const a of ['play', 'pause', 'stop', 'seekbackward', 'previoustrack', 'nexttrack'] as const)
        ms.setActionHandler(a, null);
    } catch {
      /* nada a limpar */
    }
  }
}
