import { PLAN_MATRIX } from '../../../core/planos';
import { usePlanoSemAnuncios } from '../../../lib/planoAVenda';

/**
 * "Sem anúncios no …" da demonstração: o plano SEM ANÚNCIOS que se vende agora (`planoSemAnuncios`: o
 * Essencial com a v3, o Plus com a v4, o Premium sem nenhuma), nunca um nome escrito à mão. Sem plano à
 * venda que tire os anúncios: "Ver planos".
 */
export function useTextoSemAnuncios(): string {
  const plano = usePlanoSemAnuncios();
  return plano ? `Sem anúncios no ${PLAN_MATRIX[plano].rotulo}` : 'Ver planos';
}
