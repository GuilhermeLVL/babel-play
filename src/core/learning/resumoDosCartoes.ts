/**
 * O RESUMO DOS CARTÕES — o contrato de `GET /api/vocab/resumo`, a única leitura da tela Cartões.
 *
 * A tela precisa de contagens (quantas vencem agora, quantas por baralho, a previsão, a retenção
 * medida) e a rota que existia, `GET /api/vocab`, devolve o baralho inteiro: 2 MB numa conta
 * grande, só para contar. Aqui o servidor conta e devolve poucos KB.
 *
 * AS TRÊS FASES são as do cliente (`fsrsStateOf`, `src/data/rotas/vocabulario.ts`), para o número
 * da tela ser o mesmo que a Revisão abre:
 *   nova        `stability` nula;
 *   aprendendo  com estabilidade e menos de 2 repetições;
 *   revisão     o resto.
 * "Vence agora" é `in_deck` e `due_at <= agora` (`isDueNow`). Cartão novo com `due_at` nulo (o que
 * o Anki e a Trilha ativam) é "nunca visto": não vence, fica em `guardadas`.
 */

/** Novas, aprendendo e a revisar: as três contagens de cada linha. */
export interface ContagemDeFila {
  novas: number;
  aprendendo: number;
  revisar: number;
}

/** Um baralho automático (idioma, sessão, baralho do Anki, Trilha) com o que vence agora. */
export interface BaralhoNoResumo extends ContagemDeFila {
  /** Código do idioma (`en`), id da sessão ou id do baralho do Anki. */
  id: string;
  /** Cartões no baralho (`in_deck`). */
  total: number;
}

/** Revisões e quantas foram lembradas (nota 2, 3 ou 4; "Errei" é a esquecida). */
export interface Lembradas {
  total: number;
  lembradas: number;
}

export interface ResumoDosCartoes {
  /** O instante (ms) em que "vence agora" foi contado: o fim do minuto do pedido. */
  agora: number;
  /** O começo do dia de quem pediu (ms), como chegou: os dias abaixo contam a partir dele. */
  inicioDoDia: number;
  /** Cartões no baralho (`in_deck`). */
  total: number;
  /** Fora da revisão (`in_deck` = 0). */
  suspensas: number;
  /** Idiomas distintos entre os cartões do baralho. */
  idiomas: number;
  /** Erradas 8 vezes ou mais (`lapses`), no baralho. */
  dificeis: number;
  /** Revisões já feitas na conta, de sempre: zero é quem ainda não começou. */
  revisoesDeSempre: number;
  /** Revisões desde `inicioDoDia`. */
  revisadasHoje: number;
  /** O que vence agora, por fase. */
  hoje: ContagemDeFila;
  /** Novas nunca vistas (`due_at` nulo): não vencem, entram quando a pessoa pede mais. */
  guardadas: number;
  /** O baralho por fase. `jovens` e `maduras` dividem a revisão pela estabilidade (21 dias). */
  fases: { novas: number; aprendendo: number; jovens: number; maduras: number };
  /** 31 dias: o índice 0 é hoje (com as vencidas), 1 é amanhã. Só cartões com data. */
  previsao: number[];
  /** 84 dias de revisões por dia; o último é hoje. */
  calendario: number[];
  retencao: {
    /** Os últimos 7 dias, hoje incluído. */
    d7: Lembradas;
    d30: Lembradas;
    /** Oito janelas de 7 dias; a última é a de `d7`. */
    semanas: Lembradas[];
  };
  /** Notas dos últimos 30 dias: Errei, Difícil, Bom, Fácil. */
  botoes: [number, number, number, number];
  baralhos: {
    idiomas: BaralhoNoResumo[];
    /** As sessões com cartão, da mais recente para a mais antiga (no máximo 60). */
    sessoes: BaralhoNoResumo[];
    anki: BaralhoNoResumo[];
    trilha: (ContagemDeFila & { total: number }) | null;
  };
}

/** Quantos dias a previsão cobre além de hoje, e quantos o calendário mostra. */
export const DIAS_DA_PREVISAO = 30;
export const DIAS_DO_CALENDARIO = 84;
/** A partir de quantos dias de estabilidade um cartão em revisão é "maduro" (a régua do Anki). */
export const ESTABILIDADE_MADURA = 21;
/** A partir de quantos erros a palavra é "difícil" (o limiar de sanguessuga do Anki). */
export const ERROS_DE_DIFICIL = 8;
/** Quantas sessões o resumo lista. */
export const MAXIMO_DE_SESSOES = 60;
