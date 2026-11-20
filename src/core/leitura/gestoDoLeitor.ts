/**
 * O GESTO NO TEXTO DO LIVRO — toque, arrasto, toque longo e toque duplo, separados de um jeito só para o Chromium
 * (ouvintes de ponteiro no documento do capítulo) e para o WebKit (que não entrega eventos de um iframe sem
 * `allow-scripts`: lá o gesto é AMOSTRADO de fora, pelo `:active` e pela seleção — `lib/leitor/selecao.ts`).
 *
 * A queixa do dono (26/10/2026): "às vezes quero selecionar um trecho e pega uma palavra, já abre tudo em tela".
 * A regra que resolve: SÓ O TOQUE LIMPO abre o cartão da palavra — soltar em até 250 ms, a menos de 6 px de onde
 * desceu, sem seleção no fim nem durante o gesto. Toque longo (≥ 400 ms) e qualquer arrasto são SELEÇÃO. O
 * toque duplo seleciona a palavra (o navegador faz) e não abre o cartão: por isso o toque limpo só vira cartão
 * depois da janela do toque duplo. E o toque que só desfaz uma seleção (ou que vem logo depois de ela sumir)
 * também não abre nada.
 *
 * Puro: sem DOM, sem relógio próprio (o relógio e o temporizador são injetados, para o teste).
 */

export const LIMITES_DO_GESTO = {
  /** Até quanto tempo entre descer e soltar um toque ainda é limpo. */
  toqueMs: 250,
  /** Até quanto o dedo/ponteiro pode andar num toque limpo. */
  toquePx: 6,
  /** A partir daqui o gesto parado é um toque LONGO (seleção). */
  longoMs: 400,
  /** A janela do toque duplo: o toque limpo só abre o cartão depois dela. */
  duploMs: 300,
  /** O toque que chega logo depois de uma seleção sumir só a desfez: não abre nada. */
  depoisDaSelecaoMs: 350,
} as const;

export type LimitesDoGesto = { [K in keyof typeof LIMITES_DO_GESTO]: number };

export interface PontoDoGesto {
  /** Instante (ms). */
  t: number;
  x: number;
  y: number;
}

export interface DadosDoGesto {
  inicio: PontoDoGesto;
  fim: PontoDoGesto;
  /** A maior distância do início durante o gesto (o ponteiro pode ir e voltar). */
  maiorDistancia?: number;
  /** Havia seleção não recolhida quando o gesto começou (este toque a desfaz). */
  selecaoAoComecar: boolean;
  /** A seleção virou um trecho em algum momento do gesto. */
  selecaoDuranteGesto: boolean;
  /** Há seleção não recolhida quando o gesto termina. */
  selecaoNoFim: boolean;
  /** Quando a última seleção sumiu (ms), ou `null`. */
  selecaoSumiuEm?: number | null;
  /** O gesto é o segundo toque de um toque duplo. */
  segundoToque?: boolean;
}

/**
 * O que o gesto foi. Só `toque` abre o cartão da palavra; `selecao`, `arrasto` e `longo` são seleção (a barra
 * do trecho, quando houver trecho); `limpar` desfez uma seleção; `duplo` seleciona a palavra; `demorado` é o
 * toque parado que passou do toque limpo sem chegar a longo — na dúvida, não abre nada.
 */
export type ClasseDoGesto = 'toque' | 'selecao' | 'arrasto' | 'longo' | 'demorado' | 'limpar' | 'duplo';

const distancia = (a: PontoDoGesto, b: PontoDoGesto) => Math.hypot(a.x - b.x, a.y - b.y);

export function classificarGesto(g: DadosDoGesto, lim: LimitesDoGesto = LIMITES_DO_GESTO): ClasseDoGesto {
  if (g.selecaoAoComecar) return 'limpar';
  if (
    g.selecaoSumiuEm != null &&
    g.inicio.t - g.selecaoSumiuEm >= 0 &&
    g.inicio.t - g.selecaoSumiuEm < lim.depoisDaSelecaoMs
  )
    return 'limpar';
  if (g.segundoToque) return 'duplo';
  if (g.selecaoNoFim || g.selecaoDuranteGesto) return 'selecao';
  const duracao = g.fim.t - g.inicio.t;
  if (Math.max(g.maiorDistancia ?? 0, distancia(g.inicio, g.fim)) >= lim.toquePx) return 'arrasto';
  if (duracao >= lim.longoMs) return 'longo';
  if (duracao > lim.toqueMs) return 'demorado';
  return 'toque';
}

/** O temporizador injetado: agenda `f` em `ms` e devolve o cancelamento. */
export interface RelogioDoGesto {
  agora(): number;
  esperar(ms: number, f: () => void): () => void;
}

export interface ReconhecedorDeToque<C> {
  /** O ponteiro desceu. `temSelecao` = há seleção não recolhida AGORA (antes de o navegador desfazê-la). */
  baixou(p: PontoDoGesto, temSelecao: boolean): void;
  moveu(p: PontoDoGesto): void;
  /** A seleção do documento mudou: `temTrecho` = não recolhida, com texto. */
  selecaoMudou(temTrecho: boolean): void;
  /** O ponteiro subiu. `carga` volta no `aoToque` (o lugar tocado, que o anfitrião sabe ler). */
  subiu(p: PontoDoGesto, temSelecao: boolean, carga: C): ClasseDoGesto | null;
  /** O gesto foi cancelado pelo navegador (rolagem, menu do toque longo). */
  cancelou(): void;
  /** Há um gesto em curso (o ponteiro está descido)? */
  emCurso(): boolean;
  /** Esquece o toque que esperava a janela do toque duplo. */
  descartar(): void;
}

/**
 * O RECONHECEDOR: junta os eventos de um gesto, classifica no fim e, no toque limpo, espera a janela do toque
 * duplo antes de chamar `aoToque`. Um novo gesto, ou uma seleção que aparece nessa janela, cancela o toque.
 */
export function criarReconhecedorDeToque<C>(o: {
  relogio: RelogioDoGesto;
  aoToque: (p: PontoDoGesto, carga: C) => void;
  aoClassificar?: (c: ClasseDoGesto) => void;
  limites?: LimitesDoGesto;
}): ReconhecedorDeToque<C> {
  const lim = o.limites ?? LIMITES_DO_GESTO;
  let inicio: PontoDoGesto | null = null;
  let maior = 0;
  let selecaoAoComecar = false;
  let selecaoDurante = false;
  let segundo = false;
  let tinhaTrecho = false;
  let sumiuEm: number | null = null;
  /** O último toque limpo, enquanto espera a janela do toque duplo. */
  let pendente: { cancelar: () => void; p: PontoDoGesto } | null = null;

  const descartar = () => {
    pendente?.cancelar();
    pendente = null;
  };

  return {
    baixou(p, temSelecao) {
      /* Um toque logo depois de outro é o segundo de um toque duplo: o primeiro não abre o cartão. */
      segundo = !!pendente && p.t - pendente.p.t < lim.duploMs;
      descartar();
      inicio = p;
      maior = 0;
      selecaoAoComecar = temSelecao;
      selecaoDurante = false;
    },
    moveu(p) {
      if (inicio) maior = Math.max(maior, distancia(inicio, p));
    },
    selecaoMudou(temTrecho) {
      if (temTrecho) {
        if (inicio) selecaoDurante = true;
        /* O toque duplo selecionou a palavra na janela: o toque que esperava não vira cartão. */
        descartar();
      } else if (tinhaTrecho) {
        sumiuEm = o.relogio.agora();
      }
      tinhaTrecho = temTrecho;
    },
    subiu(p, temSelecao, carga) {
      if (!inicio) return null;
      const classe = classificarGesto(
        {
          inicio,
          fim: p,
          maiorDistancia: maior,
          selecaoAoComecar,
          selecaoDuranteGesto: selecaoDurante,
          selecaoNoFim: temSelecao,
          /* A seleção que sumiu POR ESTE gesto já conta em `selecaoAoComecar`; aqui vale a que sumiu antes. */
          selecaoSumiuEm: sumiuEm != null && sumiuEm <= inicio.t ? sumiuEm : null,
          segundoToque: segundo,
        },
        lim,
      );
      inicio = null;
      segundo = false;
      o.aoClassificar?.(classe);
      if (classe === 'toque') {
        const cancelar = o.relogio.esperar(lim.duploMs, () => {
          pendente = null;
          o.aoToque(p, carga);
        });
        pendente = { cancelar, p };
      }
      return classe;
    },
    cancelou() {
      inicio = null;
      segundo = false;
      descartar();
    },
    emCurso: () => inicio !== null,
    descartar,
  };
}
