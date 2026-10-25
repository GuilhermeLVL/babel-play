import { data } from './i18n';

/**
 * O primeiro dia do mês que vem, que é quando a cota do mês volta (a janela do servidor é o mês UTC), já escrito no
 * idioma da interface ("1 de novembro"). Uma fonte só para a explicação, o resumo, a Nuance e o polimento.
 */
export function diaQueACotaVolta(agora: Date = new Date()): string {
  const primeiro = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  return data(primeiro, { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
