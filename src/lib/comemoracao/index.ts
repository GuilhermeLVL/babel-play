import { reduzirEfeitos } from '../dispositivo/perfil';
import { type BurstKind, emitBurst, formaDoTemaEquipado,type FormaParticula } from '../effects';
import {
  eventoRaroDoAcerto,
  eventosDaRodadaPerfeita,
  movimentoReduzido,
  pontosDoElemento,
  tremor,
  tremorDeTela,
  vibrar,
} from '../juice';
import { play, somMudo, type SoundEvent } from '../soundFx';
import type { EventoDeComemoracao } from './intensidade';
import { ACERTOS, COMBOS, type EfeitosEquipados, efeitosEquipados, FINALIZACOES, pacote } from './pacotes';

/**
 * O MOTOR ÚNICO DE COMEMORAÇÃO (recompensas v2, onda 1).
 *
 * Antes havia três caminhos para a mesma festa: `gameFeel` (confete de biblioteca, vibração
 * própria), `juice.comemorar` (rajada + som) e o que cada jogo compunha à mão. O resultado era
 * retorno diferente para o mesmo acerto conforme o jogo, e acerto que vibrava duas vezes.
 *
 * Agora um acontecimento tem UM nome (`EventoDeComemoracao`) e UM caminho:
 *
 *   1. `planoDeComemoracao` (PURO) decide sons, rajadas, vibração, número que sobe e tremor, a
 *      partir do evento, do modo leve, do som e dos efeitos equipados. É o que os testes travam.
 *   2. `celebrar` lê o contexto do aparelho e executa o plano com as peças que já existiam
 *      (`play`, `emitBurst`, `vibrar`, `pontosDoElemento`, `tremor`).
 *
 * MODO LEVE (`reduzirEfeitos()` ou movimento reduzido): sem partícula, sem tremor, sem vibração —
 * fica o som curto e o número, que são o retorno discreto e barato.
 */

export type { EventoDeComemoracao, Intensidade } from './intensidade';
export { intensidadeDe } from './intensidade';
export { ACERTOS, COMBOS, EFEITOS_PADRAO, type EfeitosEquipados, FINALIZACOES } from './pacotes';

export interface PlanoDeComemoracao {
  sons: { evento: SoundEvent; transpose?: number }[];
  rajadas: { kind: BurstKind; forma?: FormaParticula; quantidade: number }[];
  vibracao: number[] | null;
  flutuante: string | null;
  tremor: 0 | 1 | 2 | 3;
}

/** O tom do acerto sobe um semitom por acerto seguido, até uma oitava. */
const TETO_DO_TOM = 12;

function planoCheio(ev: EventoDeComemoracao, efeitos: EfeitosEquipados): PlanoDeComemoracao {
  switch (ev.tipo) {
    case 'acerto': {
      const p = pacote(ACERTOS, efeitos.acerto);
      return {
        sons: [{ evento: 'success', transpose: Math.min(Math.max(0, ev.combo), TETO_DO_TOM) }],
        rajadas: [{ kind: p.kind, ...(p.forma ? { forma: p.forma } : {}), quantidade: 1 }],
        vibracao: ev.combo >= 3 ? [20, 30, 25] : [15],
        flutuante: typeof ev.pontos === 'number' && ev.pontos > 0 ? `+${ev.pontos}` : null,
        tremor: 0,
      };
    }
    case 'erro':
      return {
        sons: [{ evento: 'error' }],
        rajadas: [{ kind: 'erro', quantidade: 1 }],
        vibracao: [40, 30, 40],
        flutuante: null,
        tremor: 2,
      };
    case 'combo': {
      const p = pacote(COMBOS, efeitos.combo);
      return {
        sons: [{ evento: 'combo', transpose: Math.min(Math.max(0, ev.multiplicador - 1) * 2, TETO_DO_TOM) }],
        rajadas: [{ kind: p.kind, ...(p.forma ? { forma: p.forma } : {}), quantidade: 1 }],
        vibracao: [20, 30, 25, 30, 40],
        flutuante: `×${ev.multiplicador}`,
        tremor: 1,
      };
    }
    case 'recorde':
      return {
        sons: [{ evento: 'fanfarra', transpose: 5 }],
        rajadas: [{ kind: 'record', quantidade: 1 }],
        vibracao: [30, 40, 30],
        flutuante: null,
        tremor: 2,
      };
    case 'rodada': {
      if (ev.estrelas === 0) return { sons: [], rajadas: [], vibracao: null, flutuante: null, tremor: 0 };
      if (ev.estrelas === 1)
        return {
          sons: [{ evento: 'fanfarra', transpose: 0 }],
          rajadas: [],
          vibracao: null,
          flutuante: null,
          tremor: 0,
        };
      if (ev.estrelas === 2)
        return {
          sons: [{ evento: 'fanfarra', transpose: 2 }],
          rajadas: [{ kind: 'confete', forma: 'confete', quantidade: 1 }],
          vibracao: [15, 30, 20],
          flutuante: null,
          tremor: 1,
        };
      const fin = pacote(FINALIZACOES, efeitos.finalizacao);
      return {
        sons: [{ evento: 'fanfarra', transpose: 4 }],
        rajadas: [{ kind: fin.kind, ...(fin.forma ? { forma: fin.forma } : {}), quantidade: 1 }],
        vibracao: [20, 30, 25, 30, 40],
        flutuante: null,
        tremor: 3,
      };
    }
    case 'maestria':
      return {
        sons: [{ evento: 'levelUp' }],
        rajadas: [{ kind: 'levelUp', quantidade: ev.nivel === 5 ? 3 : 1 }],
        vibracao: [20, 30, 25, 30, 40],
        flutuante: null,
        tremor: 2,
      };
    case 'conquista':
      return {
        sons: [{ evento: 'levelUp' }],
        rajadas: [{ kind: 'levelUp', forma: 'cometa', quantidade: 2 }],
        vibracao: [20, 30, 25, 30, 40],
        flutuante: null,
        tremor: 2,
      };
    case 'bau':
      return ev.raridade === 'raro'
        ? {
            sons: [{ evento: 'levelUp' }],
            rajadas: [{ kind: 'confete', forma: 'confete', quantidade: 3 }],
            vibracao: [20, 30, 25, 30, 40],
            flutuante: null,
            tremor: 2,
          }
        : {
            sons: [{ evento: 'success' }],
            rajadas: [{ kind: 'confete', forma: 'confete', quantidade: 1 }],
            vibracao: [15, 30, 20],
            flutuante: null,
            tremor: 1,
          };
    case 'nivel':
      return {
        sons: [{ evento: 'levelUp' }],
        rajadas: [{ kind: 'levelUp', quantidade: 2 }],
        vibracao: [20, 30, 25, 30, 40],
        flutuante: null,
        tremor: 2,
      };
  }
}

/** O que o motor fará (puro, testável): sons, partículas, vibração, texto flutuante.
 *  `formaDoTema` (onda 4): a forma que o tema equipado traz, para as rajadas de acerto e combo que
 *  não declaram forma. O SOM do tema não passa por aqui: `play` já toca no timbre do tema. */
export function planoDeComemoracao(
  ev: EventoDeComemoracao,
  ctx: { leve: boolean; semSom: boolean; efeitos: EfeitosEquipados; formaDoTema?: FormaParticula },
): PlanoDeComemoracao {
  const cheio = planoCheio(ev, ctx.efeitos);
  const forma = ctx.formaDoTema;
  const plano =
    forma && (ev.tipo === 'acerto' || ev.tipo === 'combo')
      ? { ...cheio, rajadas: cheio.rajadas.map((r) => (r.forma ? r : { ...r, forma })) }
      : cheio;
  return {
    ...plano,
    sons: ctx.semSom ? [] : plano.sons,
    ...(ctx.leve ? { rajadas: [], vibracao: null, tremor: 0 as const } : {}),
  };
}

/* ─────────────────────────── execução ─────────────────────────── */

/** Amplitude em px de cada degrau de tremor (a régua de `lib/juice`: 3–6 px, nunca mais). */
const TREMOR_PX = [0, 3, 5, 6] as const;

/**
 * CONTADOR PARA O E2E. Só existe em desenvolvimento, ou quando o teste pede antes de a página
 * carregar (`window.__MEDIR_COMEMORACOES__ = true`, o mesmo padrão de `passadasDoPipeline`). A
 * edição estática é um build de produção: sem o pedido, nada é exposto.
 */
interface Contador {
  eventos: number;
  rajadas: number;
  porTipo: Record<string, number>;
}
function registrar(ev: EventoDeComemoracao, plano: PlanoDeComemoracao): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __MEDIR_COMEMORACOES__?: boolean; __comemoracoes?: Contador };
  if (!import.meta.env?.DEV && !w.__MEDIR_COMEMORACOES__) return;
  const c = (w.__comemoracoes ??= { eventos: 0, rajadas: 0, porTipo: {} });
  c.eventos++;
  c.rajadas += plano.rajadas.reduce((n, r) => n + r.quantidade, 0);
  c.porTipo[ev.tipo] = (c.porTipo[ev.tipo] ?? 0) + 1;
}

function alvoDe(ev: EventoDeComemoracao): Element | null {
  return 'el' in ev ? (ev.el ?? null) : null;
}

function centro(el: Element | null): { x: number; y: number } {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function executar(ev: EventoDeComemoracao, plano: PlanoDeComemoracao): void {
  const el = alvoDe(ev);
  for (const s of plano.sons) play(s.evento, s.transpose !== undefined ? { transpose: s.transpose } : {});
  for (const r of plano.rajadas) {
    const extra = r.forma ? { forma: r.forma } : undefined;
    if (r.quantidade <= 1) {
      const { x, y } = centro(el);
      emitBurst(x, y, r.kind, extra);
      continue;
    }
    // Várias rajadas: espalhadas pela tela e defasadas — a festa não nasce sempre no centro.
    for (let i = 0; i < r.quantidade; i++) {
      const x = window.innerWidth * (0.15 + Math.random() * 0.7);
      const y = window.innerHeight * (0.15 + Math.random() * 0.55);
      setTimeout(() => emitBurst(x, y, r.kind, extra), i * 130);
    }
  }
  if (plano.vibracao) vibrar(plano.vibracao);
  if (plano.flutuante) pontosDoElemento(plano.flutuante, el, 'bom');
  if (plano.tremor) {
    if (el) tremor(el, TREMOR_PX[plano.tremor]);
    else tremorDeTela(TREMOR_PX[plano.tremor]);
  }
  /* Os eventos raros (patos, vôlei…) e o 'perfeita' continuam saindo do acerto e da rodada
     perfeita — agora do motor, que é o único caminho que os jogos falam. */
  if (ev.tipo === 'acerto' || ev.tipo === 'combo') eventoRaroDoAcerto();
  if (ev.tipo === 'rodada' && ev.estrelas === 3) eventosDaRodadaPerfeita();
}

/**
 * Comemora um acontecimento. Nunca lança: uma festa que falha não pode derrubar a jogada.
 */
export function celebrar(ev: EventoDeComemoracao): void {
  if (typeof window === 'undefined') return;
  try {
    const plano = planoDeComemoracao(ev, {
      leve: reduzirEfeitos() || movimentoReduzido(),
      semSom: somMudo(),
      efeitos: efeitosEquipados(),
      formaDoTema: formaDoTemaEquipado(),
    });
    registrar(ev, plano);
    executar(ev, plano);
  } catch {
    /* sem áudio, sem DOM, sem canvas: o jogo segue */
  }
}
