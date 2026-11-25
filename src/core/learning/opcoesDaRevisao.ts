/**
 * AS OPÇÕES DA REVISÃO NA CONTA E O LIMITE DIÁRIO (openspec `cartoes`, tarefas 2.1 e 2.2). Lógica pura.
 *
 * As seis opções (e os botões de nota) moravam só no navegador. Aqui está a forma que vale na CONTA: o
 * servidor guarda, valida e devolve, e a pessoa vê o mesmo em todos os aparelhos. O limite diário é
 * PREFERÊNCIA DE ESTUDO da pessoa, não cota de plano (cotas e planos só em `core/planos.ts`).
 *
 * O CONTADOR DO DIA não é tabela nova: vem de `agregados_diarios` (novas e revisões do dia no fuso
 * GRAVADO da conta), que o servidor já mantém junto de cada nota. Duas rodadas no mesmo dia somam;
 * na virada do dia (no fuso da pessoa) zera; conta nova começa em zero.
 */

export type TipoDeCartaoDaConta = 'lembrar' | 'digitar' | 'escolha';
export type OrdemDaRodadaDaConta = 'vencidas' | 'misturar';

export interface OpcoesDaConta {
  /** Novas por dia (0 a 200). */
  novas: number;
  /** Revisões por dia (10 a 999). Aprendendo conta como revisão. */
  revisoes: number;
  ordem: OrdemDaRodadaDaConta;
  tipo: TipoDeCartaoDaConta;
  ouvir: boolean;
  /** Meta de retenção, em por cento (80 a 97). */
  retencao: number;
  botoes: 2 | 4;
}

export const OPCOES_DA_CONTA_PADRAO: OpcoesDaConta = {
  novas: 20,
  revisoes: 200,
  ordem: 'vencidas',
  tipo: 'lembrar',
  ouvir: true,
  retencao: 90,
  botoes: 4,
};

/** Os limites de cada número, os mesmos do diálogo "Opções da revisão". */
export const LIMITES_DAS_OPCOES = {
  novas: { min: 0, max: 200 },
  revisoes: { min: 10, max: 999 },
  retencao: { min: 80, max: 97 },
} as const;

const entre = (v: unknown, min: number, max: number, padrao: number): number => {
  const n = typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : padrao;
};

/**
 * Normaliza o que veio de fora (linha do banco, corpo de pedido, cache local): o que é inválido volta ao
 * valor de `base`, campo a campo. Nunca lança.
 */
export function normalizarOpcoes(entrada: unknown, base: OpcoesDaConta = OPCOES_DA_CONTA_PADRAO): OpcoesDaConta {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>;
  return {
    novas: entre(e.novas, LIMITES_DAS_OPCOES.novas.min, LIMITES_DAS_OPCOES.novas.max, base.novas),
    revisoes: entre(e.revisoes, LIMITES_DAS_OPCOES.revisoes.min, LIMITES_DAS_OPCOES.revisoes.max, base.revisoes),
    ordem: e.ordem === 'misturar' ? 'misturar' : e.ordem === 'vencidas' ? 'vencidas' : base.ordem,
    tipo: e.tipo === 'digitar' || e.tipo === 'escolha' || e.tipo === 'lembrar' ? e.tipo : base.tipo,
    ouvir: typeof e.ouvir === 'boolean' ? e.ouvir : base.ouvir,
    retencao: entre(e.retencao, LIMITES_DAS_OPCOES.retencao.min, LIMITES_DAS_OPCOES.retencao.max, base.retencao),
    botoes: e.botoes === 2 ? 2 : e.botoes === 4 ? 4 : base.botoes,
  };
}

/** O que já foi estudado hoje, no dia da pessoa. */
export interface FeitoHoje {
  novas: number;
  /** Notas que não foram a primeira do cartão (aprendendo e a revisar). */
  revisoes: number;
}

/** Quanto ainda cabe hoje: o limite menos o feito, nunca abaixo de zero. */
export interface RestamHoje {
  novas: number;
  revisoes: number;
}

export function restamHoje(opcoes: Pick<OpcoesDaConta, 'novas' | 'revisoes'>, feito: FeitoHoje): RestamHoje {
  return {
    novas: Math.max(0, opcoes.novas - Math.max(0, feito.novas)),
    revisoes: Math.max(0, opcoes.revisoes - Math.max(0, feito.revisoes)),
  };
}

/**
 * O feito do dia a partir das contas do agregado: `revisoesVivas` são todas as notas do dia e `novas` as
 * que foram a primeira do cartão. As revisões são o resto (nunca negativo).
 */
export function feitoDoDia(contas: { revisoesVivas: number; novas: number }): FeitoHoje {
  const novas = Math.max(0, contas.novas);
  return { novas, revisoes: Math.max(0, contas.revisoesVivas - novas) };
}

/** O que a rota devolve: as opções, o feito de hoje e quanto resta. Sem número inventado. */
export interface OpcoesComHoje {
  opcoes: OpcoesDaConta;
  /** `true` se a pessoa já gravou opções na conta; `false` = são o padrão (o cliente pode subir as locais). */
  naConta: boolean;
  hoje: FeitoHoje & { restamNovas: number; restamRevisoes: number };
}
