/**
 * A ECONOMIA, DITA EM UMA TABELA.
 *
 * O DEFEITO QUE ISTO CONSERTA (medido em 2026-08-28): Seeds eram `palavrasCapturadas × 1 +
 * revisõesCertas × 4`, e "palavra capturada" é só a soma de palavras dos transcritos. Uma
 * importação de 325 palavras rendia 325 Seeds sem nenhuma ação; jogar não rendia Seed nenhuma;
 * presença, sequência e tempo de sessão não existiam. Com a Loja custando 30-400, quem só
 * capturava comprava metade do catálogo sem jogar.
 *
 * A REGRA AGORA É DADO. `REGRAS` é lida pelo cálculo (`xp.ts`) E pela tela "Como ganhar"
 * (`Conquistas.tsx`), então o que o app promete é, por construção, o que ele credita. Mudar um
 * número aqui muda os dois lados.
 *
 * Ritmo-alvo (decisão do dono): com uso diário normal (~20 min de captura, revisões e 2-3
 * rodadas), um item LENDÁRIO em ≈ 1 semana. Dia ativo típico ≈ 5 + 6 + 40 + 30 + 5 = ~86 Seeds.
 */
import { PESOS_SEEDS, PESOS_XP } from './xp';

export interface RegraDeGanho {
  id: string;
  /** O que a pessoa faz. Redigido para a tela, sem jargão. */
  como: string;
  xp: number;
  seeds: number;
  /** Limite, quando existe. Também vai para a tela. */
  teto?: string;
  /** Unidade do ganho ("por revisão certa"). */
  unidade: string;
}

export const REGRAS: RegraDeGanho[] = [
  { id: 'presenca', como: 'Abrir o app no dia', xp: PESOS_XP.presenca, seeds: PESOS_SEEDS.presenca, teto: '1× por dia', unidade: 'por dia' },
  { id: 'sequencia7', como: 'Manter 7 dias seguidos de presença', xp: PESOS_XP.sequencia7, seeds: PESOS_SEEDS.sequencia7, teto: 'a cada 7 dias', unidade: 'por marco' },
  { id: 'captura', como: 'Gravar ou importar uma sessão', xp: PESOS_XP.capturaPor5Min, seeds: PESOS_SEEDS.capturaPor5Min, teto: `até ${TETO_CAPTURA_MIN_POR_DIA()} min por dia`, unidade: 'a cada 5 min' },
  { id: 'sessao', como: 'Salvar a sessão', xp: PESOS_XP.sessao, seeds: 0, unidade: 'por sessão' },
  { id: 'cartao', como: 'Fichar uma palavra no caderno', xp: PESOS_XP.cartao, seeds: PESOS_SEEDS.cartao, unidade: 'por palavra' },
  { id: 'revisaoCerta', como: 'Acertar uma revisão', xp: PESOS_XP.revisao + PESOS_XP.revisaoCerta, seeds: PESOS_SEEDS.revisaoCerta, unidade: 'por revisão certa' },
  { id: 'jogoCerto', como: 'Acertar um item de jogo', xp: PESOS_XP.itemDeJogo + PESOS_XP.itemDeJogoCerto, seeds: PESOS_SEEDS.jogoCerto, unidade: 'por acerto' },
  { id: 'rodadaPerfeita', como: 'Fechar uma rodada sem errar (3 estrelas)', xp: PESOS_XP.rodadaPerfeita, seeds: PESOS_SEEDS.rodadaPerfeita, unidade: 'por rodada' },
  { id: 'conquista', como: 'Desbloquear uma conquista', xp: 0, seeds: 0, unidade: 'varia por conquista' },
];

/** Minutos de captura premiados por dia. Acima disso a gravação continua contando para o resto
 *  (palavras, sessão), mas não rende mais Seeds: é o que impede "deixar gravando" virar renda. */
export function TETO_CAPTURA_MIN_POR_DIA(): number { return 30; }
export const MINUTOS_POR_SEED_DE_CAPTURA = 5;

/**
 * Minutos PREMIADOS de um conjunto de sessões: por dia, min(teto, minutos do dia).
 * Recebe pares (dia, minutos) já agrupados por quem tem as sessões.
 */
export function minutosPremiados(minutosPorDia: Iterable<number>): number {
  let total = 0;
  for (const m of minutosPorDia) total += Math.min(TETO_CAPTURA_MIN_POR_DIA(), Math.max(0, m));
  return total;
}

/** Dia local (número inteiro) de um carimbo: a unidade da presença e do teto de captura. */
export function diaLocal(ts: number): number {
  const d = new Date(ts);
  return Math.floor((ts - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

/**
 * Quantos MARCOS de 7 dias uma lista de dias de presença contém, somando todas as sequências.
 * Uma sequência de 15 dias vale 2 marcos; três sequências de 7 valem 3. O marco nunca é perdido
 * depois de ganho (é contado do histórico, não do estado atual): perder a sequência não cobra
 * de volta o que foi creditado.
 */
export function marcosDeSequencia(dias: Iterable<number>, tamanho = 7): number {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b);
  let marcos = 0;
  let corrida = 0;
  let anterior: number | null = null;
  for (const d of ordenados) {
    corrida = anterior !== null && d === anterior + 1 ? corrida + 1 : 1;
    if (corrida % tamanho === 0) marcos += 1;
    anterior = d;
  }
  return marcos;
}

/** Sequência ATUAL de dias (terminando hoje) e a MAIOR já feita. */
export function sequencias(dias: Iterable<number>, hoje: number): { atual: number; maior: number } {
  const set = new Set(dias);
  let atual = 0;
  for (let d = hoje; set.has(d); d -= 1) atual += 1;
  let maior = 0;
  let corrida = 0;
  let anterior: number | null = null;
  for (const d of [...set].sort((a, b) => a - b)) {
    corrida = anterior !== null && d === anterior + 1 ? corrida + 1 : 1;
    if (corrida > maior) maior = corrida;
    anterior = d;
  }
  return { atual, maior };
}
