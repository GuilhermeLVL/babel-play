import { DIAS_DO_TESTE_PREMIUM } from '../../core/planos';
import { getEntitlements } from '../../lib/entitlements';
import { t, tp } from '../../lib/i18n';
import { comNomeDoPlano, planoDeEntradaAgora, planoParaNome } from '../../lib/planoDeEntrada';

/**
 * A frase da entrada "Planos e Premium": as duas do protótipo, com os dias que de fato restam do teste. Mora aqui (e não no
 * trilho) porque o painel "Mais" e a navegação "O Início é o menu" (flag `navegacao_simples`) dizem a mesma coisa.
 */
export const fraseDoPlano = (): string => {
  const { plan, teste } = getEntitlements();
  /* Planos v4: o nome é o do plano de quem assina (Plus) ou o de entrada (o teste, a oferta). */
  const doPlano = planoParaNome(plan);
  if (plan === 'free' || plan === 'anonimo')
    return comNomeDoPlano(
      t('Você está no Grátis · teste o Premium por {dias} dias, sem cartão', { dias: DIAS_DO_TESTE_PREMIUM }),
      planoDeEntradaAgora(),
    );
  if (!teste) return comNomeDoPlano(t('Você está no Premium'), doPlano);
  const dias = Math.max(1, Math.ceil((teste.terminaEm - Date.now()) / 86_400_000));
  return comNomeDoPlano(tp(dias, 'Premium em teste · {n} dia', 'Premium em teste · {n} dias'), doPlano);
};

/** Quem vê o convite "Seja Premium": o Grátis, quem está sem conta e quem está no teste. */
export const veConviteDoPremium = (): boolean => {
  const { plan, teste } = getEntitlements();
  return plan === 'free' || plan === 'anonimo' || !!teste;
};
