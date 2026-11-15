import { data } from './i18n';

/**
 * QUANDO A COTA RENOVA, como o servidor disse por último (`renovaEm` de `GET /api/me/uso`, em ms). Quem paga tem a
 * cota pela janela do período pago (change `cota-pelo-periodo-pago`): ela renova no próximo vencimento ou no fim da
 * fatia do anual, e não no dia 1º. `carregarUso` grava aqui a cada resposta; `null` = ainda não se sabe.
 */
let renovacaoLembrada: number | null = null;

export function lembrarRenovacaoDaCota(renovaEm: number | null | undefined): void {
  renovacaoLembrada = typeof renovaEm === 'number' && Number.isFinite(renovaEm) ? renovaEm : null;
}

/**
 * O dia em que a cota volta, já escrito no idioma da interface ("3 de dezembro"). Com o `renovaEm` do servidor (o
 * argumento ou o lembrado) ainda no futuro, é essa data, no fuso de quem lê. Sem ele, o primeiro dia do mês que vem,
 * que é quando vira a janela do calendário (UTC) do Grátis, do convidado e do teste. Uma fonte só para a explicação,
 * o resumo, a Nuance, o polimento, o tutor e a tela Planos.
 */
export function diaQueACotaVolta(agora: Date = new Date(), renovaEm: number | null = renovacaoLembrada): string {
  if (renovaEm !== null && renovaEm > agora.getTime()) return data(renovaEm, { day: 'numeric', month: 'long' });
  const primeiro = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  return data(primeiro, { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
