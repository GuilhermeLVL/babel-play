import type { Grade } from '../learning/scheduler';
import { PESOS_SEEDS, PESOS_XP } from '../learning/xp';
import { type ItemOutcome, type MinigameId, MINIGAMES, type RoundReport } from './types';

/**
 * DE JOGO PARA MEMÓRIA — como o resultado de uma rodada vira nota no agendador.
 *
 * Esta é a peça mais delicada do sistema: cada nota mexe de verdade na estabilidade e na data de
 * volta do cartão. Um jogo mal traduzido em notas **estraga o agendamento** — e o estrago é
 * invisível por semanas, até a pessoa notar que revisa palavras que já sabia.
 *
 * Três princípios:
 *
 *  1. **Erro de MIRA não é erro de memória.** Numa mecânica espacial (caça-palavras), marcar a
 *     célula errada é falta de pontaria, não esquecimento. Só desistir/revelar vira nota 1.
 *  2. **Só velocidade prova fluência.** A nota 4 ("fácil") exige responder rápido — e por isso
 *     só o Duelo, que é cronometrado, pode dar 4. Reconhecer uma carta virada com calma é bom,
 *     não é fluente.
 *  3. **Dica rebaixa.** Quem precisou de ajuda lembrou parcialmente: 2, nunca 3.
 */

/** Acima disto, a resposta foi "pensada" e não recuperada de imediato (ms). */
export const LIMITE_RESPOSTA_RAPIDA_MS = 3000;

/** A nota do FSRS para um item, conforme o jogo em que ele foi respondido. */
export function gradeFor(gameId: MinigameId, outcome: ItemOutcome): Grade {
  // Desistir ou mandar revelar é a única forma de dizer "não lembrei" nas mecânicas espaciais.
  if (outcome.revealed) return 1;
  if (!outcome.correct) {
    // No caça-palavras, errar a célula é mira — a rodada continua e o item não vira 1 por isso.
    return gameId === 'wordsearch' ? 2 : 1;
  }
  if (outcome.hinted) return 2;

  switch (gameId) {
    case 'blitz':
      // O único cronometrado: velocidade É o sinal de fluência.
      return outcome.ms <= LIMITE_RESPOSTA_RAPIDA_MS ? 4 : 3;
    case 'memory':
      // O par errado volta para a mesa — a repetição é a própria mecânica. Quantas vezes a
      // pessoa precisou tentar diz o quanto lembrava.
      if (outcome.attempts <= 1) return 3;
      return outcome.attempts <= 3 ? 2 : 1;
    case 'wordsearch':
      // Achou a palavra a partir da tradução, sem dica: bom. Nunca "fácil" — varredura visual
      // dá tempo para lembrar, então não distingue quem sabe de quem quase sabe.
      return outcome.attempts <= 1 ? 3 : 2;
    case 'termo':
      /**
       * A SEGUNDA exceção que dá 4 — e por um motivo diferente do duelo. Escrever a palavra
       * inteira de primeira, sem nenhuma letra de retorno, é PRODUÇÃO: a evidência mais forte
       * de domínio que o app consegue coletar por escrito (a pesquisa é consistente em que
       * produção supera reconhecimento). As tentativas seguintes já contam com as pistas de
       * cor, então valem menos.
       */
      if (outcome.attempts <= 1) return 4;
      if (outcome.attempts <= 3) return 3;
      return 2;
    case 'scramble':
    case 'karaoke':
    case 'escuta':
    case 'ditado':
    case 'conectores':
    case 'cadavre':
      // Vivem de FALAS ou de produção livre: não há cartão para agendar.
      return outcome.correct ? 3 : 1;
    case 'tenis':
      // Cronometrado como o duelo: velocidade é o sinal.
      return outcome.ms <= LIMITE_RESPOSTA_RAPIDA_MS ? 4 : 3;
    case 'choseong':
    case 'koffer':
      // Produção escrita completa, sem alternativa para reconhecer.
      return outcome.attempts <= 1 ? 4 : 3;
    case 'karuta':
    case 'bao':
    case 'vitendawili':
    case 'shiritori':
    case 'taboo':
      // Escolha entre alternativas reais: acertar de primeira é bom, nunca fácil.
      return outcome.attempts <= 1 ? 3 : 2;
  }
}

/**
 * MULTIPLICADOR por sequência de acertos. Regra única do app, para os jogos não inventarem cada
 * um a sua: 3 acertos seguidos = 2×, 6 = 3×, 10 = 4×, 15 = 5× (teto).
 *
 * Morava em `lib/juice.ts` (que importa DOM e Web Audio) e por isso não podia ser usada aqui.
 * `lib/juice` re-exporta daqui, então nada que importava de lá precisou mudar.
 */
export function multiplicador(sequencia: number): number {
  if (sequencia >= 15) return 5;
  if (sequencia >= 10) return 4;
  if (sequencia >= 6) return 3;
  if (sequencia >= 3) return 2;
  return 1;
}

/* ───────────────────────────── PONTUAÇÃO DA RODADA ───────────────────────────── */

/** Um acerto vale isto antes de qualquer multiplicador ou bônus. */
export const PONTOS_BASE = 10;
/** Respondeu dentro de `LIMITE_RESPOSTA_RAPIDA_MS`. */
export const BONUS_RAPIDO = 5;
/** Acertou de primeira e sem pedir ajuda. */
export const BONUS_SEM_DICA = 3;

export interface PontosDaRodada {
  total: number;
  /** As parcelas, separadas — é o que a tela mostra para o número não ser mágico. */
  base: number;
  bonusVelocidade: number;
  bonusSemDica: number;
  bonusCombo: number;
  /** A maior sequência alcançada DENTRO desta rodada. */
  melhorSequencia: number;
  /** A sequência com que a rodada TERMINOU — é ela que entra na próxima, numa corrente. */
  sequenciaFinal: number;
}

/**
 * A PONTUAÇÃO DE UMA RODADA — e agora ela vale para os nove jogos.
 *
 * O que mudou e por quê:
 *
 *  1. **O combo deixou de ser privilégio do Duelo.** `multiplicador` existia desde sempre, mas só
 *     `blitz` o convertia em pontos; nos outros oito, dez acertos seguidos valiam o mesmo que dez
 *     acertos alternados. A tensão de "não quebrar a sequência" simplesmente não existia neles.
 *  2. **`ms` e `hinted` viram pontos.** Os dois já eram medidos por item e gravados no banco a cada
 *     rodada, e não alimentavam nada além da nota do FSRS. Agora aparecem: responder rápido e
 *     resolver sem ajuda são as duas coisas que o jogo pede, e passam a ser pagas.
 *  3. **O multiplicador multiplica só a BASE.** Se compusesse com os bônus, o número cresceria
 *     rápido demais para significar alguma coisa — é a mesma razão do teto de 5×.
 *  4. **"Rápido" é `LIMITE_RESPOSTA_RAPIDA_MS`, o mesmo limiar do `gradeFor`.** Dois limiares
 *     divergentes seriam a próxima inconsistência a caçar: a pontuação diria "relâmpago" enquanto
 *     o agendador anotaria "pensou".
 *
 * `sequenciaInicial` é o que faz o combo ATRAVESSAR rodadas numa sequência encadeada — sem ele,
 * cada rodada recomeçaria do 1× e emendar não valeria nada.
 */
export function pontuarRodada(
  gameId: MinigameId,
  outcomes: ItemOutcome[],
  opts: { sequenciaInicial?: number } = {},
): PontosDaRodada {
  let sequencia = Math.max(0, opts.sequenciaInicial ?? 0);
  let melhorSequencia = sequencia;
  let base = 0,
    bonusVelocidade = 0,
    bonusSemDica = 0,
    bonusCombo = 0;

  for (const o of outcomes) {
    /* `revealed` é desistência declarada — nunca pontua, em nenhum jogo. E, como acerto que não
       conta, também não deve sustentar a sequência: quem revela quebrou o combo. */
    if (!o.correct || o.revealed) {
      sequencia = 0;
      continue;
    }
    sequencia++;
    melhorSequencia = Math.max(melhorSequencia, sequencia);

    const mult = multiplicador(sequencia);
    base += PONTOS_BASE;
    bonusCombo += PONTOS_BASE * (mult - 1);
    if (typeof o.ms === 'number' && o.ms <= LIMITE_RESPOSTA_RAPIDA_MS) bonusVelocidade += BONUS_RAPIDO;
    if (!o.hinted && (o.attempts ?? 1) <= 1) bonusSemDica += BONUS_SEM_DICA;
  }

  return {
    total: base + bonusCombo + bonusVelocidade + bonusSemDica,
    base,
    bonusVelocidade,
    bonusSemDica,
    bonusCombo,
    melhorSequencia,
    sequenciaFinal: sequencia,
  };
}

/**
 * @deprecated Use `pontuarRodada`, que devolve as parcelas. Mantido porque é o nome que os nove
 * jogos usam para preencher `RoundReport.score`, e trocar isso são nove edições noutra entrega.
 */
export function scoreRound(gameId: MinigameId, outcomes: ItemOutcome[]): number {
  return pontuarRodada(gameId, outcomes).total;
}

/**
 * A RODADA É PERFEITA? — todos os itens certos E o mínimo de itens do jogo.
 *
 * A régua que os DOIS servidores usam para contar `rodadasPerfeitas` (o Express em
 * `server/db/repositories/metrics.ts`, o efêmero em `data/efemero/rotas/metricas.ts`) e a que a
 * tela usa para prometer o bônus. Sem o piso, uma rodada de um item viraria fábrica de perfeitas.
 *
 * `exerciseKind` vem do banco e pode ser nulo, vazio ou de um jogo que não existe mais: nulo e
 * desconhecido caem no mínimo 3; vazio vira 0 — a coerção que os servidores sempre fizeram.
 */
export function ehRodadaPerfeita(exerciseKind: string | null | undefined, total: number, certos: number): boolean {
  const minimo = Number(
    (exerciseKind && (MINIGAMES as Record<string, { minItems?: number } | undefined>)[exerciseKind]?.minItems) ?? 3,
  );
  return total >= minimo && certos === total;
}

/**
 * O QUE UMA REVISÃO RENDE, pela nota (1–4). É a régua de `correctReviews` dos dois servidores:
 * toda revisão dá `revisao` de XP; nota >= 3 soma `revisaoCerta` nas duas moedas.
 */
export function ganhoDaNota(nota: number): { xp: number; seeds: number } {
  const certa = nota >= 3;
  return {
    xp: PESOS_XP.revisao + (certa ? PESOS_XP.revisaoCerta : 0),
    seeds: certa ? PESOS_SEEDS.revisaoCerta : 0,
  };
}

/**
 * O GANHO DE UMA RODADA DE REVISÃO (recompensas v2, spec 10.2): o "+N XP · +N Seeds" do fim do
 * Estudar, com a MESMA conta que o perfil refaz a partir das revisões gravadas. Só entram as notas
 * que o servidor aceitou — a tela passa só essas.
 */
export function ganhoDaRevisao(notas: readonly number[]): { xp: number; seeds: number } {
  return notas.reduce(
    (soma, n) => {
      const g = ganhoDaNota(n);
      return { xp: soma.xp + g.xp, seeds: soma.seeds + g.seeds };
    },
    { xp: 0, seeds: 0 },
  );
}

/** O que UMA rodada move na economia — o "+N XP · +N Seeds" da raspadinha. */
export interface GanhoDaRodada {
  xp: number;
  seeds: number;
  perfeita: boolean;
}

/**
 * O GANHO DA RODADA, com a régua do crédito.
 *
 * O XP e as Seeds não são gravados: os servidores recontam o perfil a partir das linhas da rodada
 * (`economiaDeMetricas`, com `PESOS_XP`/`PESOS_SEEDS`). Esta função faz a MESMA conta para uma
 * rodada, parcela por parcela, e o teste de contrato (`tests/contratos/ganho-da-rodada`) confere
 * que a diferença no perfil dos dois servidores é exatamente este número:
 *
 *   - item que vira REVISÃO (tem `cardId` e o jogo escreve no agendador) → `revisao`, e com nota
 *     ≥ 3 também `revisaoCerta` (XP) e `revisaoCerta` (Seeds) — o corte de `correctReviews`;
 *   - item de JOGO (linha `kind: 'drill'`) → `itemDeJogo`, e certo também `itemDeJogoCerto` (XP)
 *     e `jogoCerto` (Seeds);
 *   - rodada PERFEITA (`ehRodadaPerfeita`) → `rodadaPerfeita`, nas duas moedas.
 *
 * O baú (`SEEDS_DO_DROP`) fica de fora: quem sorteia é o servidor, e ele tem o próprio aviso.
 */
export function ganhoDaRodada(report: RoundReport): GanhoDaRodada {
  const def = MINIGAMES[report.gameId];
  let xp = 0;
  let seeds = 0;
  for (const o of report.items) {
    const revisao = !!o.cardId && !!def?.writesSrs;
    if (revisao) {
      const g = ganhoDaNota(gradeFor(report.gameId, o));
      xp += g.xp;
      seeds += g.seeds;
    } else {
      xp += PESOS_XP.itemDeJogo;
      if (o.correct) {
        xp += PESOS_XP.itemDeJogoCerto;
        seeds += PESOS_SEEDS.jogoCerto;
      }
    }
  }
  const certos = report.items.filter((o) => o.correct).length;
  const perfeita = ehRodadaPerfeita(report.gameId, report.items.length, certos);
  if (perfeita) {
    xp += PESOS_XP.rodadaPerfeita;
    seeds += PESOS_SEEDS.rodadaPerfeita;
  }
  return { xp, seeds, perfeita };
}

/**
 * XP da rodada — o número que anima na tela. É o `xp` de `ganhoDaRodada`: a tela e o crédito
 * saem da mesma conta (antes era `acertos × 2 + itens` para todo jogo, e a revisão e o bônus de
 * rodada perfeita apareciam de um jeito na raspadinha e de outro no perfil).
 */
export function xpFromRound(report: RoundReport): number {
  return ganhoDaRodada(report).xp;
}

/** Resumo honesto para a tela de fim de rodada. */
export function summarize(report: RoundReport): { acertos: number; total: number; precisao: number; xp: number } {
  const total = report.items.length;
  const acertos = report.items.filter((o) => o.correct && !o.revealed).length;
  return {
    acertos,
    total,
    precisao: total ? Math.round((acertos / total) * 100) : 0,
    xp: xpFromRound(report),
  };
}
