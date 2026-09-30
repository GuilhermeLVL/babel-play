/**
 * O MOTOR DE OFERTAS (Fase 8) — decide SE uma oferta aparece, QUAL gatilho e com QUE componente.
 *
 * PURO: sem DOM, sem storage, sem relógio. Tudo o que ele sabe entra pelos argumentos — o momento,
 * a config remota (payload de `oferta_planos`), o plano, o histórico do aparelho, a sessão de uso e
 * o estado da tela. É isso que deixa cada regra testável sozinha (`tests/ofertas-motor.test.ts`).
 * Quem lê storage, escuta eventos e desenha é o `HostDeOfertas`.
 *
 * AS REGRAS, na ordem em que são aplicadas:
 *
 *  1. FLAG. Desligada = só os avisos FUNCIONAIS (fim de cota, cota próxima), com os textos
 *     embutidos (`GATILHOS_FUNCIONAIS`). Ofertas promocionais só existem com a flag ligada.
 *  1b. PERFIL PROTEGIDO (C8 — o furo achado no plano): a conta de menor, ou sem idade declarada, só
 *     recebe o FUNCIONAL, e só com o texto EMBUTIDO — o gatilho da flag para um momento funcional pode
 *     trazer texto de venda ("com o Premium você continua…"). Sem plano sugerido: a ação leva ao
 *     consumo do mês, nunca à venda (ECA Digital, art. 18; LGPD, art. 14).
 *  2. PLANOS-ALVO. Assinante Premium e self-host nunca veem oferta promocional (não há o que vender);
 *     o convidado vê primeiro a CONTA, nunca um plano (`convidado → conta antes de plano`); e o
 *     gatilho só vale para os planos que ele lista.
 *  3. "NÃO MOSTRAR NOVAMENTE" é permanente, por gatilho.
 *  4. TELA OCUPADA. Nada aparece durante a captura ao vivo, uma rodada de jogo ou com um diálogo
 *     aberto (a celebração de uma conquista, por exemplo). A decisão volta com `adiar: true`: o host
 *     guarda o pedido e pergunta de novo quando a tela liberar.
 *  5. TETO GLOBAL (só promocionais): nenhuma nos primeiros 3 minutos da sessão de uso, no máximo 1
 *     por sessão, e 30 minutos desde a última oferta de qualquer tipo.
 *  6. FREQUÊNCIA DO GATILHO: `maxPorDia` (24 h corridas), `maxPorSemana` (7 dias corridos) e
 *     `intervaloMinHoras` desde a última exibição DAQUELE gatilho. Vale também para os funcionais.
 */
import type { PlanoDaFlag } from '../../core/flags';
import {
  type ComponenteDeOferta,
  type ConfigDeOfertas,
  type GatilhoDeOferta,
  GATILHOS_FUNCIONAIS,
  type MomentoDeOferta,
  momentoFuncional,
  type PlanoSugerido,
} from '../../core/ofertas';

/** Nenhuma oferta promocional antes disto, contado do início da sessão de uso. */
export const INICIO_SEM_OFERTA_MS = 3 * 60_000;
/** Ofertas promocionais por sessão de uso. */
export const MAX_PROMOCIONAIS_POR_SESSAO = 1;
/** Distância mínima entre uma oferta promocional e a última oferta de qualquer tipo. */
export const INTERVALO_GLOBAL_MS = 30 * 60_000;

const DIA_MS = 24 * 60 * 60_000;
const SEMANA_MS = 7 * DIA_MS;

/** O que o aparelho lembra (localStorage). Instantes em ms. */
export interface HistoricoDeOfertas {
  /** Instantes das exibições, por id de gatilho (podados a 8 dias). */
  exibicoes: Record<string, number[]>;
  /** Instantes das dispensas ("Agora não", X, Esc, clique fora), por id de gatilho. */
  dispensas: Record<string, number[]>;
  /** Ids de gatilho com "não mostrar novamente" — permanente. */
  naoMostrar: string[];
  /** A última oferta exibida, de qualquer gatilho. */
  ultimaExibicao: number | null;
}

export const HISTORICO_VAZIO: HistoricoDeOfertas = Object.freeze({
  exibicoes: {},
  dispensas: {},
  naoMostrar: [],
  ultimaExibicao: null,
}) as HistoricoDeOfertas;

/** A sessão de uso (sessionStorage): quando começou e quantas promocionais já apareceram. */
export interface SessaoDeUso {
  inicio: number;
  promocionais: number;
}

export interface EstadoDaTela {
  capturaAtiva: boolean;
  jogoAtivo: boolean;
  dialogoAberto: boolean;
}

export interface EntradaDoMotor {
  momento: MomentoDeOferta;
  /** A CONTA de perfil protegido (menor, ou idade não declarada). O convidado não entra aqui. */
  protegido?: boolean;
  /** O servidor deixa esta conta começar o teste de 14 dias (`lib/ofertas/teste.ts`). */
  podeTestar?: boolean;
  /** A etapa do momento (o fim do teste: `d3` ou `d0`). Gatilho com `fase` só vale na dele. */
  fase?: string;
  flagLigada: boolean;
  /** O payload de `oferta_planos` (ignorado com a flag desligada). */
  config: ConfigDeOfertas;
  plano: PlanoDaFlag;
  historico: HistoricoDeOfertas;
  sessao: SessaoDeUso;
  tela: EstadoDaTela;
  agora: number;
}

export type MotivoDeRecusa =
  | 'flag_desligada'
  | 'perfil_protegido'
  | 'sem_gatilho'
  | 'plano_alvo'
  | 'convidado_primeiro_conta'
  | 'nao_mostrar'
  | 'ocupado'
  | 'inicio_da_sessao'
  | 'teto_da_sessao'
  | 'intervalo_global'
  | 'frequencia_dia'
  | 'frequencia_semana'
  | 'intervalo';

export type DecisaoDeOferta =
  | {
      mostrar: true;
      gatilho: GatilhoDeOferta;
      componente: ComponenteDeOferta;
      planoSugerido: PlanoSugerido;
      variante: string;
      funcional: boolean;
    }
  | { mostrar: false; motivo: MotivoDeRecusa; adiar: boolean };

const recusa = (motivo: MotivoDeRecusa, adiar = false): DecisaoDeOferta => ({ mostrar: false, motivo, adiar });

/**
 * O plano que faz sentido sugerir. `nenhum` = não há o que vender (Premium, self-host) ou a quem
 * vender (o perfil protegido). O convidado ouve "crie a conta" antes de qualquer plano; o Grátis ouve
 * o TESTE de 14 dias sem cartão quando o servidor deixa testar, e o Premium quando não (ou quando não
 * se sabe: prometer um teste já usado seria mentir).
 */
export function planoSugerido(
  plano: PlanoDaFlag,
  pessoa: { protegido?: boolean; podeTestar?: boolean } = {},
): PlanoSugerido {
  if (plano === 'convidado') return 'conta';
  if (plano !== 'free' || pessoa.protegido) return 'nenhum';
  return pessoa.podeTestar ? 'teste' : 'premium';
}

const dentro = (lista: number[] | undefined, desde: number) => (lista ?? []).filter((t) => t > desde).length;

/** Por que ESTE gatilho não pode aparecer agora (frequência), ou `null` se pode. */
export function bloqueioDeFrequencia(
  g: GatilhoDeOferta,
  h: HistoricoDeOfertas,
  agora: number,
): 'frequencia_dia' | 'frequencia_semana' | 'intervalo' | null {
  const vistas = h.exibicoes[g.id] ?? [];
  if (dentro(vistas, agora - DIA_MS) >= g.maxPorDia) return 'frequencia_dia';
  if (dentro(vistas, agora - SEMANA_MS) >= g.maxPorSemana) return 'frequencia_semana';
  const ultima = vistas.length ? Math.max(...vistas) : null;
  if (ultima !== null && agora - ultima < g.intervaloMinHoras * 60 * 60_000) return 'intervalo';
  return null;
}

/** Os gatilhos candidatos do momento: os da flag (ligada) ou, para os funcionais, os embutidos. */
function candidatos(e: EntradaDoMotor, funcional: boolean): GatilhoDeOferta[] {
  const doMomento = (g: GatilhoDeOferta) => g.momento === e.momento && (!g.fase || g.fase === e.fase);
  /* O perfil protegido nunca lê o gatilho da flag: ele pode vender até num momento funcional. */
  const daFlag = e.flagLigada && !e.protegido ? e.config.gatilhos.filter(doMomento) : [];
  if (daFlag.length || !funcional) return daFlag;
  return GATILHOS_FUNCIONAIS.filter(doMomento);
}

export function decidirOferta(e: EntradaDoMotor): DecisaoDeOferta {
  const funcional = momentoFuncional(e.momento);

  // 1. Flag desligada: só os funcionais.
  if (!funcional && !e.flagLigada) return recusa('flag_desligada');
  // 1b. Perfil protegido: só os funcionais, com o texto embutido (`candidatos`).
  if (!funcional && e.protegido) return recusa('perfil_protegido');
  const todos = candidatos(e, funcional);
  if (!todos.length) return recusa('sem_gatilho');

  // 2. Planos-alvo.
  const sugerido = planoSugerido(e.plano, e);
  if (e.plano === 'selfhost') return recusa('plano_alvo');
  if (!funcional) {
    if (sugerido === 'nenhum') return recusa('plano_alvo');
    if (e.momento === 'convidado_para_conta' && e.plano !== 'convidado') return recusa('plano_alvo');
    if (e.plano === 'convidado' && e.momento !== 'convidado_para_conta') return recusa('convidado_primeiro_conta');
  }
  const doPlano = todos.filter((g) => g.planos.includes(e.plano));
  if (!doPlano.length) return recusa('plano_alvo');

  // 3. "Não mostrar novamente".
  const naoVetados = doPlano.filter((g) => !e.historico.naoMostrar.includes(g.id));
  if (!naoVetados.length) return recusa('nao_mostrar');

  // 4. Tela ocupada: o pedido espera a tela liberar.
  if (e.tela.capturaAtiva || e.tela.jogoAtivo || e.tela.dialogoAberto) return recusa('ocupado', true);

  // 5. Teto global das promocionais.
  if (!funcional) {
    if (e.agora - e.sessao.inicio < INICIO_SEM_OFERTA_MS) return recusa('inicio_da_sessao');
    if (e.sessao.promocionais >= MAX_PROMOCIONAIS_POR_SESSAO) return recusa('teto_da_sessao');
    const ultima = e.historico.ultimaExibicao;
    if (ultima !== null && e.agora - ultima < INTERVALO_GLOBAL_MS) return recusa('intervalo_global');
  }

  // 6. Frequência do gatilho: o primeiro (na ordem da config) que pode aparecer.
  let primeiroBloqueio: MotivoDeRecusa | null = null;
  for (const g of naoVetados) {
    const b = bloqueioDeFrequencia(g, e.historico, e.agora);
    if (!b) {
      const embutido = GATILHOS_FUNCIONAIS.includes(g);
      return {
        mostrar: true,
        gatilho: g,
        componente: g.componente,
        planoSugerido: sugerido,
        variante: g.variante ?? (embutido ? 'embutida' : 'padrao'),
        funcional,
      };
    }
    primeiroBloqueio ??= b;
  }
  return recusa(primeiroBloqueio ?? 'frequencia_dia');
}

// ───────────────────────────── registro (puro) ─────────────────────────────

const JANELA_DO_HISTORICO_MS = 8 * DIA_MS;

function acrescentar(mapa: Record<string, number[]>, id: string, agora: number): Record<string, number[]> {
  return { ...mapa, [id]: [...(mapa[id] ?? []).filter((t) => t > agora - JANELA_DO_HISTORICO_MS), agora] };
}

export function comExibicao(h: HistoricoDeOfertas, id: string, agora: number): HistoricoDeOfertas {
  return { ...h, exibicoes: acrescentar(h.exibicoes, id, agora), ultimaExibicao: agora };
}

export function comDispensa(h: HistoricoDeOfertas, id: string, agora: number): HistoricoDeOfertas {
  return { ...h, dispensas: acrescentar(h.dispensas, id, agora) };
}

export function comNaoMostrar(h: HistoricoDeOfertas, id: string): HistoricoDeOfertas {
  return h.naoMostrar.includes(id) ? h : { ...h, naoMostrar: [...h.naoMostrar, id] };
}

/** Aceita só a forma certa (storage antigo ou editado à mão vira histórico vazio, não exceção). */
export function normalizarHistorico(v: unknown): HistoricoDeOfertas {
  if (!v || typeof v !== 'object') return { ...HISTORICO_VAZIO };
  const o = v as Record<string, unknown>;
  const mapa = (x: unknown): Record<string, number[]> => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
    const out: Record<string, number[]> = {};
    for (const [k, lista] of Object.entries(x as Record<string, unknown>)) {
      if (Array.isArray(lista)) out[k] = lista.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    }
    return out;
  };
  return {
    exibicoes: mapa(o.exibicoes),
    dispensas: mapa(o.dispensas),
    naoMostrar: Array.isArray(o.naoMostrar) ? o.naoMostrar.filter((x): x is string => typeof x === 'string') : [],
    ultimaExibicao: typeof o.ultimaExibicao === 'number' ? o.ultimaExibicao : null,
  };
}
