/**
 * AS DEFINIÇÕES DOS NÚMEROS DA MEMÓRIA (openspec `modelo-do-aluno-e-dados` 4.1; flag `estudo_palavras_v2`): cada número da tela
 * tem uma definição em uma frase, que o leitor de tela lê junto, e uma BASE MÍNIMA: abaixo dela a tela não mostra
 * porcentagem (poucos dados parecem medida e não são).
 *
 * O texto é a chave do catálogo de i18n (`t()` na tela); aqui só a regra e o texto-fonte. Nada de promessa nem de meta
 * imposta: a definição diz o que o número conta, e só isso.
 */

export type MetricaDaMemoria =
  | 'retencaoReal'
  | 'revisoes'
  | 'sequencia'
  | 'dificeis'
  | 'previsao'
  | 'diasComRevisao'
  | 'botoes'
  | 'fases'
  | 'retencaoPorFonte';

export interface DefinicaoDaMetrica {
  id: MetricaDaMemoria;
  nome: string;
  /** Uma frase: o que o número conta e em que janela. */
  definicao: string;
  /** Base mínima de ocorrências para mostrar PORCENTAGEM; `null` quando o número não é porcentagem. */
  baseMinima: number | null;
}

/** A base mínima da retenção medida (mesma régua de `MINIMO_DE_REVISOES` por baralho). */
export const BASE_MINIMA_DA_RETENCAO = 20;

export const DEFINICOES_DAS_METRICAS: readonly DefinicaoDaMetrica[] = [
  {
    id: 'retencaoReal',
    nome: 'Retenção real',
    definicao:
      'De cada 100 revisões dos últimos 30 dias, quantas você lembrou. “Errei” conta como esquecida; “Difícil”, “Bom” e “Fácil” contam como lembrada.',
    baseMinima: BASE_MINIMA_DA_RETENCAO,
  },
  {
    id: 'revisoes',
    nome: 'Revisões',
    definicao: 'Quantas vezes você respondeu a um cartão nos últimos 30 dias, em revisão ou em jogo.',
    baseMinima: null,
  },
  {
    id: 'sequencia',
    nome: 'Sequência',
    definicao: 'Dias de prática seguidos até hoje. Dia sem prática zera a contagem; o recorde fica guardado.',
    baseMinima: null,
  },
  {
    id: 'dificeis',
    nome: 'Difíceis',
    definicao: 'Palavras que você errou 8 vezes ou mais. Elas voltam com mais ajuda.',
    baseMinima: null,
  },
  {
    id: 'previsao',
    nome: 'Previsão de carga',
    definicao: 'Quantos cartões voltam a vencer em cada um dos próximos 30 dias, pelas datas que a agenda já marcou.',
    baseMinima: null,
  },
  {
    id: 'diasComRevisao',
    nome: 'Dias com revisão',
    definicao: 'Em quantos dos últimos 84 dias você fez pelo menos uma revisão.',
    baseMinima: null,
  },
  {
    id: 'botoes',
    nome: 'Botões usados',
    definicao: 'Quantas vezes você apertou cada nota nos últimos 30 dias: Errei, Difícil, Bom e Fácil.',
    baseMinima: null,
  },
  {
    id: 'fases',
    nome: 'Cartões por fase',
    definicao:
      'Novas: nunca vistas. Aprendendo: ainda nos primeiros passos. Jovens e maduras: em revisão, antes e depois de 21 dias de memória. Suspensas: fora da revisão.',
    baseMinima: null,
  },
  {
    id: 'retencaoPorFonte',
    nome: 'Retenção por fonte',
    definicao:
      'A mesma retenção, calculada só com as revisões das palavras de cada sessão, baralho do Anki ou da Trilha, nos últimos 90 dias.',
    baseMinima: BASE_MINIMA_DA_RETENCAO,
  },
];

export function definicaoDaMetrica(id: MetricaDaMemoria): DefinicaoDaMetrica {
  const d = DEFINICOES_DAS_METRICAS.find((x) => x.id === id);
  if (!d) throw new Error(`métrica sem definição: ${id}`);
  return d;
}

/**
 * A porcentagem de lembradas, ou `null` quando as revisões não chegam à base mínima da métrica: a tela mostra "—" e a
 * nota "poucas revisões ainda", nunca um número solto.
 */
export function porcentoComBase(
  l: { total: number; lembradas: number },
  base: number = BASE_MINIMA_DA_RETENCAO,
): number | null {
  if (!Number.isFinite(l.total) || l.total < base) return null;
  return Math.max(0, Math.min(100, Math.round((Math.min(l.lembradas, l.total) / l.total) * 100)));
}
