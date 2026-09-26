/**
 * O TETO DO MODO SEM CONTA (mudança porta-de-entrada, decisão do dono em 01/09).
 *
 * A decisão de produto tem quatro limites para quem usa sem conta: nada fica na nuvem · teto de
 * acervo · sem loja/passe/economia · sem nuvem paga. O primeiro e o quarto já valiam por
 * consequência da arquitetura (o servidor efêmero é IndexedDB e nunca sai para a rede). Este
 * arquivo é o segundo.
 *
 * POR QUE UM TETO, e não "tudo livre para sempre": sem conta, o acervo mora num só navegador e
 * some com ele. Deixar alguém acumular duzentas sessões ali é deixar preparada uma perda grande —
 * o teto é o que transforma "você vai perder tudo um dia" em "isto aqui é uma amostra, e a conta é
 * onde as coisas ficam".
 *
 * OS NÚMEROS são generosos de propósito. O teto tem de caber uma experiência de verdade (gravar
 * algumas vezes, montar um caderninho, jogar) e ainda assim ser alcançável em dias, não em meses —
 * senão ele nunca conversa com ninguém.
 *
 * O AVISO VEM ANTES DE BATER (`PERTO_DO_TETO`): avisar no limite é dar a notícia junto com o
 * bloqueio, que é a pior hora. Antes, a pessoa ainda escolhe.
 */

export const TETO_ANONIMO = {
  /** Gravações guardadas neste navegador. */
  sessoes: 5,
  /** Palavras fichadas no caderno. */
  palavras: 80,
} as const;

/** A partir de quanto do teto o app começa a avisar (80% — sobra espaço para decidir). */
export const PERTO_DO_TETO = 0.8;

export type RecursoLimitado = keyof typeof TETO_ANONIMO;

export interface EstadoDoTeto {
  usado: number;
  teto: number;
  /** Já dá para guardar mais um? */
  cabe: boolean;
  /** Passou do ponto de aviso — a tela deve oferecer a conta. */
  perto: boolean;
}

export function estadoDoTeto(recurso: RecursoLimitado, usado: number): EstadoDoTeto {
  const teto = TETO_ANONIMO[recurso];
  return { usado, teto, cabe: usado < teto, perto: usado >= Math.floor(teto * PERTO_DO_TETO) };
}

/**
 * O texto que a recusa mostra — um só lugar, para tela e servidor efêmero dizerem o mesmo.
 *
 * Na EDIÇÃO ESTÁTICA (o site publicado sem servidor) o teto é o mesmo, mas não há conta a criar:
 * mandar a pessoa para um cadastro que não existe seria um link morto. O texto diz o que é — uma
 * demonstração — e onde o teto deixa de existir. O núcleo não lê ambiente; quem sabe da edição
 * (`lib/edicaoEstatica`) passa a opção.
 */
export function motivoDoTeto(recurso: RecursoLimitado, opcoes: { edicaoEstatica?: boolean } = {}): string {
  if (opcoes.edicaoEstatica) {
    return recurso === 'sessoes'
      ? `Esta é a edição de demonstração: ela guarda até ${TETO_ANONIMO.sessoes} gravações neste navegador. A versão completa do Babel Play não tem esse limite.`
      : `Esta é a edição de demonstração: o caderno vai até ${TETO_ANONIMO.palavras} palavras neste navegador. A versão completa do Babel Play não tem esse limite.`;
  }
  return recurso === 'sessoes'
    ? `Sem conta dá para guardar ${TETO_ANONIMO.sessoes} gravações neste navegador. Crie uma conta e elas ficam guardadas — e as que já estão aqui sobem junto.`
    : `Sem conta o caderno vai até ${TETO_ANONIMO.palavras} palavras. Crie uma conta e ele deixa de ter teto — o que você já fichou sobe junto.`;
}
