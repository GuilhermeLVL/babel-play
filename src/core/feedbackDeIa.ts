/**
 * O CONTRATO DO FEEDBACK DE IA (`POST /api/ai/feedback`) — Fase B do plano de qualidade da IA paga, item 4.
 *
 * Tudo aqui é LISTA FECHADA de propósito: o app atende menores (ECA Digital, LGPD art. 14) e tem retenção zero. A
 * avaliação diz QUAL função, QUAL modelo e nível, a NOTA e, no 👎, um MOTIVO curto — nunca texto livre, nunca a
 * frase, a tradução ou a resposta. Assim o mesmo botão serve a qualquer perfil, sem consentimento a mais.
 *
 * Lógica pura (sem rede, sem DOM): o cliente e o servidor validam pela mesma lista.
 */

/** As funções que mostram 👍/👎. `nuance` é a tradução no nível nuance de uma frase tocada. */
export const FUNCOES_COM_FEEDBACK = ['explicacao', 'resumo', 'nuance', 'alternativas', 'polimento', 'tutor'] as const;
export type FuncaoComFeedback = (typeof FUNCOES_COM_FEEDBACK)[number];

export const NOTAS_DO_FEEDBACK = ['up', 'down'] as const;
export type NotaDoFeedback = (typeof NOTAS_DO_FEEDBACK)[number];

/** Por que não ajudou. Curto e fechado: o painel conta, ninguém lê texto. */
export const MOTIVOS_DO_FEEDBACK = ['nao_ajudou', 'errado', 'confuso', 'idioma_errado', 'inadequado'] as const;
export type MotivoDoFeedback = (typeof MOTIVOS_DO_FEEDBACK)[number];

/** O formato de um id de modelo (o mesmo alfabeto do registro de provedores). */
export const FORMATO_DO_MODELO = /^[A-Za-z0-9@._:/+-]{1,120}$/;

export interface FeedbackDeIa {
  funcao: FuncaoComFeedback;
  nota: NotaDoFeedback;
  motivo?: MotivoDoFeedback;
  /** O modelo que respondeu, quando a resposta o disse (cabeçalho `x-ia-modelo` ou `provenance`). */
  modelo?: string;
  nivel?: 'rapida' | 'nuance' | 'polimento';
}
