/**
 * O PLANO DE ENTRADA NA TELA (planos v4): o plano que as ofertas, o teste e os "Conhecer o plano"
 * apontam. Com `venda_planos_v4` ligada é o Plus; sem ela, o Premium — o texto de hoje, palavra por palavra.
 *
 * Folha: só importa a matriz e o cache das flags, para qualquer tela poder usá-la sem puxar a assinatura.
 */
import { FLAG_VENDA_PLANOS_V4, PLAN_MATRIX, planoDeEntrada, type PlanoPago } from '../core/planos';
import { flagLigada } from './flagsCache';
import { t } from './i18n';

/** O plano de entrada AGORA (leitura síncrona do cache de flags). */
export const planoDeEntradaAgora = (): PlanoPago => planoDeEntrada(flagLigada);

/** A v4 está ligada para esta pessoa. */
export const v4Ligada = (): boolean => flagLigada(FLAG_VENDA_PLANOS_V4);

/**
 * Troca o nome "Premium" de uma frase já traduzida pelo do plano pedido. Os nomes dos planos são marcas
 * (ficam em letras latinas nos catálogos en/es/ar), então a troca vale em qualquer idioma. Para o próprio
 * Premium devolve a frase como veio.
 */
export function comNomeDoPlano(texto: string, plano: PlanoPago): string {
  const nome = PLAN_MATRIX[plano].rotulo;
  return nome === PLAN_MATRIX.premium.rotulo ? texto : texto.replaceAll(PLAN_MATRIX.premium.rotulo, nome);
}

/**
 * O plano que traz o intérprete automático: o Premium até a v4, o Pro depois (e o Pro ainda não se
 * vende: a frase diz "em breve" em vez de mandar a pessoa a um plano que não existe na loja).
 */
export const planoDoInterprete = (): PlanoPago => (v4Ligada() ? 'pro4' : 'premium');

/** O aviso do cadeado do modo automático do intérprete, pelo plano que o tem. */
export function textoDoAutomaticoNoPlano(): string {
  return v4Ligada()
    ? t('O modo automático vai fazer parte do Pro, em breve: o app reconhece sozinho quem fala qual idioma.')
    : t('O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.');
}

/**
 * O plano cujo NOME o selo da conta mostra: os planos da v4 (Plus, Família, Pro) aparecem com o nome
 * deles; qualquer outro pago continua como hoje (Premium). Evita dizer "Premium" a quem assina o Plus.
 */
export function planoParaNome(plano: string | undefined): PlanoPago {
  return plano === 'plus' || plano === 'familia' || plano === 'pro4' ? plano : 'premium';
}
