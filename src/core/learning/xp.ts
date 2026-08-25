/**
 * XP E NÍVEL — a fórmula, num lugar que os dois lados conseguem importar.
 *
 * POR QUE SAIU DE `src/lib/progress.ts`. Os pesos moravam no cliente, e enquanto o único leitor era
 * a tela isso bastava. Agora o SERVIDOR também precisa deles: reconstruir a curva de XP ao longo do
 * tempo exige somar os mesmos eventos com os mesmos pesos, e uma segunda cópia divergiria na
 * primeira mudança de fórmula — o gráfico contaria uma história e o distintivo contaria outra,
 * sobre a mesma pessoa. Aqui é `src/core`, isomórfico, e o servidor já importa daqui.
 *
 * NÃO HÁ ARMAZENAMENTO DE XP, e continua não havendo. XP é função pura dos fatos que o banco já
 * guarda (sessões, palavras, revisões, itens de jogo). Trocar a fórmula muda a apresentação, nunca
 * o dado — e é essa propriedade que permite reconstruir o passado sem uma tabela de eventos.
 *
 * O preço, dito na cara: mudar os pesos REESCREVE o histórico. É aceitável porque é exatamente a
 * mesma propriedade que o número de hoje sempre teve; o que não seria aceitável é fingir que existe
 * um livro-razão quando não existe.
 */

/** Peso de cada esforço real em XP. Explícito de propósito: a regra tem de ser auditável. */
export const PESOS_XP = {
  sessao: 25,
  palavraCapturada: 2,
  revisao: 3,
  /** Bônus, somado a `revisao` — uma revisão certa vale 3 + 2. */
  revisaoCerta: 2,
  /**
   * Itens de minigame que NÃO viraram revisão de SRS. Valem MENOS que uma revisão de propósito: a
   * revisão move a memória de verdade; o jogo é a porta de entrada.
   */
  itemDeJogo: 1,
  itemDeJogoCerto: 2,
} as const;

/**
 * Seeds = a moeda mole, mais generosa que o XP porque gastá-la não mexe na memória.
 *
 * O TERMO DA OFENSIVA SAIU DAQUI, e é o que torna a moeda gastável. A fórmula tinha `streakDays *
 * 10`: enquanto Seeds era só um número na tela, passava. No instante em que virou SALDO, quebrou —
 * a ofensiva ENCOLHE ao se perder um dia, e o ganho encolheria junto. Quem tivesse gasto 300 com 30
 * dias de ofensiva e a perdesse ficaria com saldo NEGATIVO: o app cobraria de volta uma compra
 * feita, por não ter estudado ontem. O ganho agora só depende do que foi FEITO, e nunca diminui.
 */
export const PESOS_SEEDS = {
  palavraCapturada: 1,
  revisaoCerta: 4,
} as const;

/** Os fatos que produzem XP. Todos contáveis, todos com carimbo de tempo no banco. */
export interface EventosDeXp {
  sessoes: number;
  palavrasCapturadas: number;
  revisoes: number;
  revisoesCertas: number;
  itensDeJogo?: number;
  itensDeJogoCertos?: number;
}

export function xpDeEventos(e: EventosDeXp): number {
  return (
    e.sessoes * PESOS_XP.sessao +
    e.palavrasCapturadas * PESOS_XP.palavraCapturada +
    e.revisoes * PESOS_XP.revisao +
    e.revisoesCertas * PESOS_XP.revisaoCerta +
    (e.itensDeJogo ?? 0) * PESOS_XP.itemDeJogo +
    (e.itensDeJogoCertos ?? 0) * PESOS_XP.itemDeJogoCerto
  );
}

/** Seeds GANHAS (só cresce). O saldo subtrai os gastos, que vivem numa tabela de eventos. */
export function seedsGanhasDeEventos(e: Pick<EventosDeXp, 'palavrasCapturadas' | 'revisoesCertas'>): number {
  return e.palavrasCapturadas * PESOS_SEEDS.palavraCapturada + e.revisoesCertas * PESOS_SEEDS.revisaoCerta;
}

/**
 * Curva de nível: o nível N começa em 50·N·(N−1) de XP. Custo de N→N+1 = 100·N.
 * Nível 2 aos 100 XP, 3 aos 300, 4 aos 600, 5 aos 1000 — a rampa clássica, sem teto artificial.
 */
export function levelFloor(level: number): number {
  return 50 * level * (level - 1);
}

/** Teto duro. Não é balanceamento: é uma trava contra laço infinito com XP absurdo. */
export const NIVEL_MAXIMO = 999;

export function nivelDoXp(xp: number): number {
  let level = 1;
  while (levelFloor(level + 1) <= xp && level < NIVEL_MAXIMO) level++;
  return level;
}

export interface PosicaoNoNivel {
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  levelPct: number;
}

/** Onde o XP cai dentro do nível — o que a barra de progresso desenha. */
export function posicaoNoNivel(xp: number): PosicaoNoNivel {
  const level = nivelDoXp(xp);
  const floor = levelFloor(level);
  const xpForLevel = levelFloor(level + 1) - floor;
  const xpIntoLevel = xp - floor;
  return {
    level,
    xpIntoLevel,
    xpForLevel,
    levelPct: xpForLevel > 0 ? Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100)) : 0,
  };
}
