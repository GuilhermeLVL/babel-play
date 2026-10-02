import { type ProvaDeVibracao, provarVibracao } from '../../../../lib/dispositivo/respostaAoApontar';
import type { VibracaoDoQuest } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { t, tp } from '../../../../lib/i18n';
import { play } from '../../../../lib/soundFx';

/**
 * A PROVA DA VIBRAÇÃO, DITA EM UMA LINHA. Usada pela prévia de Ajustes → Aparência e pelo teste de
 * `/diagnostico`: as duas chamam `provarVibracao` (`lib/dispositivo/respostaAoApontar.ts`) e contam o
 * que voltou com as mesmas palavras.
 */

export type NivelDaProva = Exclude<VibracaoDoQuest, 'desligada'>;

export const rotuloDaVibracao = (nivel: VibracaoDoQuest): string =>
  nivel === 'desligada' ? t('Desligada') : nivel === 'suave' ? t('Suave') : t('Forte');

/** O tique que o app toca no lugar do pulso quando não há motor à vista (respeita o som desligado). */
export function tocarSomDoApontar(): void {
  play('apontar');
}

/**
 * Um pulso de prova. Sem pedido aceito por nenhum controle, toca o som que o app usa no lugar: quem
 * testa ouve exatamente o que vai acontecer ao apontar.
 */
export function provarComSom(nivel: NivelDaProva): ProvaDeVibracao {
  const prova = provarVibracao(nivel);
  if (!prova.pediu) tocarSomDoApontar();
  return prova;
}

/** O resultado em uma linha. O navegador não diz se o controle tremeu: só se aceitou o pedido. */
export function textoDaProva(prova: ProvaDeVibracao): string {
  if (prova.controles === 0) return t('Nenhum controle à vista: o app usa um som bem baixo no lugar da vibração.');
  if (prova.comMotor === 0)
    return tp(
      prova.controles,
      '{n} controle à vista, sem motor de vibração: o app usa um som bem baixo no lugar.',
      '{n} controles à vista, sem motor de vibração: o app usa um som bem baixo no lugar.',
    );
  if (!prova.pediu) return t('O controle recusou o pulso: o app usa um som bem baixo no lugar.');
  return tp(
    prova.comMotor,
    'Pulso enviado a {n} controle. Se você não sentiu, o navegador aceitou o pedido sem o controle se mexer.',
    'Pulso enviado a {n} controles. Se você não sentiu, o navegador aceitou o pedido sem o controle se mexer.',
  );
}
