import type { Grade } from './scheduler';

/**
 * A NOTA DA REVISÃO NO MODELO HÍBRIDO (decisão do dono, D-006 em docs/redesign/DECISOES.md).
 *
 * O QUE HAVIA. Nos três formatos que a pessoa encontra ao revisar (múltipla escolha, digitação,
 * produção ativa) a nota FSRS era DERIVADA do acerto — `isCorrect ? 3 : 1` — e a grade de quatro
 * botões "Errei · Difícil · Bom · Fácil" só existia num ramo que nunca renderiza com cartão na tela
 * (`tests/gradeDeRevisaoAlcancavel.test.ts`). A pessoa nunca dizia ao agendador o quanto lembrou.
 *
 * O QUE FICA. A resposta objetiva continua decidindo acerto/erro. No ERRO a nota fica travada em
 * `Again` (1): ninguém escolhe "Difícil" para uma resposta errada. No ACERTO aparecem três opções,
 * `Difícil` (2), `Bom` (3) e `Fácil` (4), com a nota derivada de antes PRÉ-SELECIONADA — quem não
 * quiser decidir aperta "Avançar" e recebe exatamente o que recebia. Produção ativa é mais difícil,
 * então o acerto lá pré-seleciona `Fácil`, como o `handleFsrsFeedback` já fazia.
 *
 * Função pura: a tela pergunta o que oferecer; o agendamento continua sendo o servidor
 * (`POST /api/vocab/:id/review`), que aceita qualquer nota de 1 a 4.
 */
export type FormatoDeRevisao = 'mc' | 'typing' | 'active-production' | 'cloze';

export type NotasOferecidas = { travada: 1 } | { opcoes: readonly [2, 3, 4]; padrao: 3 | 4 };

/* Sobrecargas: com `true`/`false` literais o chamador recebe o ramo certo sem `'opcoes' in` a cada uso. */
export function notasOferecidas(
  correto: true,
  formato: FormatoDeRevisao,
): { opcoes: readonly [2, 3, 4]; padrao: 3 | 4 };
export function notasOferecidas(correto: false, formato: FormatoDeRevisao): { travada: 1 };
export function notasOferecidas(correto: boolean, formato: FormatoDeRevisao): NotasOferecidas;
export function notasOferecidas(correto: boolean, formato: FormatoDeRevisao): NotasOferecidas {
  if (!correto) return { travada: 1 };
  return { opcoes: [2, 3, 4], padrao: formato === 'active-production' ? 4 : 3 };
}

/** A nota que vai para o servidor: a escolhida, se houver e for permitida; senão a padrão. */
export function notaFinal(oferta: NotasOferecidas, escolhida: Grade | null): Grade {
  if ('travada' in oferta) return oferta.travada;
  if (escolhida !== null && (oferta.opcoes as readonly number[]).includes(escolhida)) return escolhida;
  return oferta.padrao;
}

export const ROTULO_DA_NOTA: Record<Grade, string> = { 1: 'Errei', 2: 'Difícil', 3: 'Bom', 4: 'Fácil' };
