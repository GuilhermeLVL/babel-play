/**
 * ELO POR PALAVRA E POR PESSOA, COM DESCONTO DE CHUTE (openspec `modelo-do-aluno-e-dados`, 3.5).
 *
 * A segunda das três estimativas por palavra: "consegue ESTE exercício" (as outras duas são o FSRS, "vai lembrar", e a
 * faixa de frequência, "provavelmente conhece"). Duas notas na mesma escala: a HABILIDADE da pessoa e a DIFICULDADE do
 * item; a chance de acertar sobe com a diferença. Cada resposta move as duas, uma para cima e a outra para baixo.
 *
 * O DESCONTO DE CHUTE. Em múltipla escolha com `k` alternativas, quem não sabe nada ainda acerta 1/k das vezes. A chance
 * prevista é `c + (1 - c) * logística(habilidade - dificuldade)`, com `c = 1/k` (recordação livre: `c = 0`). Como o
 * "esperado" já inclui o chute, um acerto em 4 alternativas rende a pessoa menos do que o mesmo acerto sem alternativas,
 * e um erro nela custa mais: o acerto que o chute explica sozinho (1/4 das vezes) quase não move a nota.
 *
 * DIFICULDADE PARA TODO CARTÃO, NÃO SÓ OS JOGADOS. `dificuldadeInicial` traduz a dificuldade do FSRS (1 a 10, que todo
 * cartão revisado tem) para a escala do Elo, de modo que um cartão nunca jogado já nasce com uma nota razoável.
 *
 * Puro: sem rede, sem DOM, sem relógio. Nada lê isto ainda (a seleção que o usaria é a 3.1/3.6 e depende de decisões do dono).
 */

/** A nota inicial da pessoa e do item sem informação: o centro da escala. */
export const ELO_INICIAL = 1500;
/** Quanto uma resposta move as notas (cai com o número de respostas: item novo aprende rápido, item velho se firma). */
export const K_MAXIMO = 48;
export const K_MINIMO = 12;
/** O fator da escala: 400 pontos de diferença = 10x de chance (a convenção do Elo). */
const ESCALA = 400;

/** A chance de chute de um exercício com `alternativas` opções (0 ou 1 = recordação livre, sem chute). */
export function chanceDeChute(alternativas: number): number {
  return Number.isFinite(alternativas) && alternativas >= 2 ? 1 / Math.floor(alternativas) : 0;
}

/** A chance prevista de acertar: o chute mais o que a diferença de notas explica do resto. */
export function chanceDeAcertar(habilidade: number, dificuldade: number, alternativas = 0): number {
  const c = chanceDeChute(alternativas);
  const saber = 1 / (1 + 10 ** ((dificuldade - habilidade) / ESCALA));
  return c + (1 - c) * saber;
}

/** O passo de uma nota com `respostas` já dadas: de K_MAXIMO até K_MINIMO, sem passar do piso. */
export function passoDoElo(respostas: number): number {
  const n = Math.max(0, respostas);
  return Math.max(K_MINIMO, K_MAXIMO / (1 + n / 10));
}

export interface NotaElo {
  nota: number;
  respostas: number;
}

export const notaNova = (nota = ELO_INICIAL): NotaElo => ({ nota, respostas: 0 });

export interface ResultadoDaResposta {
  pessoa: NotaElo;
  item: NotaElo;
  /** O que o modelo esperava antes da resposta (para calibrar e para testar). */
  esperado: number;
}

/**
 * Aplica uma resposta. `acertou` é o resultado; `alternativas` as opções do exercício (0 = recordação livre).
 * Acerto sobe a pessoa e desce o item; erro faz o contrário, na mesma medida (soma das notas constante).
 */
export function aplicarResposta(
  pessoa: NotaElo,
  item: NotaElo,
  acertou: boolean,
  alternativas = 0,
): ResultadoDaResposta {
  const esperado = chanceDeAcertar(pessoa.nota, item.nota, alternativas);
  const erro = (acertou ? 1 : 0) - esperado;
  return {
    pessoa: { nota: pessoa.nota + passoDoElo(pessoa.respostas) * erro, respostas: pessoa.respostas + 1 },
    item: { nota: item.nota - passoDoElo(item.respostas) * erro, respostas: item.respostas + 1 },
    esperado,
  };
}

/**
 * A nota inicial de um item a partir da dificuldade do FSRS (1 = fácil, 10 = difícil), para o cartão que nunca foi
 * jogado. Linear em torno do centro, limitada a ±400 (uma ordem de grandeza de chance). Sem FSRS, o centro.
 */
export function dificuldadeInicial(fsrsDifficulty: number | null | undefined): number {
  if (typeof fsrsDifficulty !== 'number' || !Number.isFinite(fsrsDifficulty)) return ELO_INICIAL;
  const d = Math.min(10, Math.max(1, fsrsDifficulty));
  return Math.round(ELO_INICIAL + ((d - 5.5) / 4.5) * ESCALA);
}
