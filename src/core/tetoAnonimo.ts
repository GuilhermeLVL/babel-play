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

/**
 * A EDIÇÃO ESTÁTICA GUARDA MAIS (decisão do dono, 2026-09-28): 20 gravações em vez de 5.
 *
 * Lá não existe conta — o teto não é o empurrão para o cadastro, é só o limite do que um
 * navegador segura sem perder. Com 5, quem experimentava a demonstração batia no teto no primeiro
 * dia e a sexta captura não tinha para onde ir. O caderno não acompanha: os dois tetos são
 * independentes (nada aqui deriva um do outro), e o de palavras segue o mesmo.
 */
export const TETO_DA_EDICAO_ESTATICA = {
  sessoes: 20,
  palavras: TETO_ANONIMO.palavras,
} as const;

/** A PERGUNTA sobre a edição vem de fora: o núcleo não lê ambiente (`lib/edicaoEstatica` sabe). */
export interface OpcoesDoTeto {
  edicaoEstatica?: boolean;
}

/** O teto sem conta DESTA edição — o espelho sem conta, a tela e os avisos perguntam aqui. */
export function tetoAnonimoDa(opcoes: OpcoesDoTeto = {}): { sessoes: number; palavras: number } {
  return opcoes.edicaoEstatica ? { ...TETO_DA_EDICAO_ESTATICA } : { ...TETO_ANONIMO };
}

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

export function estadoDoTeto(recurso: RecursoLimitado, usado: number, opcoes: OpcoesDoTeto = {}): EstadoDoTeto {
  const teto = tetoAnonimoDa(opcoes)[recurso];
  return { usado, teto, cabe: usado < teto, perto: usado >= Math.floor(teto * PERTO_DO_TETO) };
}

/**
 * O texto que a recusa mostra — um só lugar, para tela e servidor efêmero dizerem o mesmo.
 *
 * Na EDIÇÃO ESTÁTICA (o site publicado sem servidor) não há conta a criar: mandar a pessoa para um
 * cadastro que não existe seria um link morto. O texto diz o que é — uma demonstração — e onde o
 * teto deixa de existir. O núcleo não lê ambiente; quem sabe da edição (`lib/edicaoEstatica`) passa
 * a opção.
 */
export function motivoDoTeto(recurso: RecursoLimitado, opcoes: OpcoesDoTeto = {}): string {
  const teto = tetoAnonimoDa(opcoes);
  if (opcoes.edicaoEstatica) {
    return recurso === 'sessoes'
      ? `Esta é a edição de demonstração: ela guarda até ${teto.sessoes} gravações neste navegador. A versão completa do Babel Play não tem esse limite.`
      : `Esta é a edição de demonstração: o caderno vai até ${teto.palavras} palavras neste navegador. A versão completa do Babel Play não tem esse limite.`;
  }
  return recurso === 'sessoes'
    ? `Sem conta dá para guardar ${teto.sessoes} gravações neste navegador. Crie uma conta e elas ficam guardadas — e as que já estão aqui sobem junto.`
    : `Sem conta o caderno vai até ${teto.palavras} palavras. Crie uma conta e ele deixa de ter teto — o que você já fichou sobe junto.`;
}
