/**
 * O QUE A TELA DIZ ENQUANTO O RECONHECIMENTO BAIXA (carga-rapida-no-celular, 4.1).
 *
 * Na auditoria de 17/11/2026, em 3G, a tela dizia "Pronto para legendar" com o botão desligado aos 30 s depois do
 * aceite e "Ouvindo… a legenda aparece aqui" aos 3:41, com o modelo ainda em 53%: a pessoa falava e nada
 * aparecia por 9 minutos. Enquanto a transcrição não está pronta, a tela diz o que está acontecendo, quantas falas
 * já ficaram guardadas e quando a legenda começa. Puro: a tela só desenha.
 */
import type { ModelPrepState } from '../../components/ModelPrepPanel';
import { estimarTempo, faixaEmTexto } from '../dispositivo/vazao';
import { t, tp } from '../i18n';

/** A transcrição ainda está baixando (ou carregando) depois do aceite? */
export function reconhecimentoBaixando(prep: ModelPrepState | null | undefined): boolean {
  return !!prep && !prep.error && prep.whisper !== null && prep.whisper < 1;
}

/** Quando a legenda começa, em palavras ("cerca de 3 a 5 min"), ou `null` sem medida. */
export function quandoALegendaComeca(prep: ModelPrepState): string | null {
  const b = prep.whisperBytes;
  if (!b || !(b.total > 0)) return null;
  const faixa = estimarTempo(Math.max(0, b.total - b.loaded), prep.vazaoMbps ?? null);
  return faixa ? faixaEmTexto(faixa, t) : null;
}

/** O miolo da tela parada depois do aceite (no lugar de "Pronto para legendar"), ou `null`. */
export function mioloDoPreparo(prep: ModelPrepState | null | undefined): { titulo: string; texto: string } | null {
  if (!reconhecimentoBaixando(prep)) return null;
  /* Do cache não há download: só o instante de abrir o modelo. */
  if (prep!.fromCache)
    return {
      titulo: t('Preparando para legendar'),
      texto: t('O modelo já está neste aparelho. A legenda começa em instantes.'),
    };
  const quando = quandoALegendaComeca(prep!);
  return {
    titulo: t('Baixando para legendar'),
    texto: quando
      ? t('Uma vez só, e fica guardado neste aparelho. A legenda começa em {quando}.', { quando })
      : t('Uma vez só, e fica guardado neste aparelho. A legenda começa quando o download terminar.'),
  };
}

/** A linha da legenda vazia enquanto grava (no lugar de "Ouvindo… a legenda aparece aqui."), ou `null`. */
export function esperaDaLegenda(prep: ModelPrepState | null | undefined): string | null {
  if (!reconhecimentoBaixando(prep)) return null;
  if (prep!.fromCache) return null;
  const n = prep!.trechosGuardados ?? 0;
  const guardadas =
    n > 0
      ? tp(n, 'Baixando: sua fala fica guardada ({n} trecho).', 'Baixando: suas falas ficam guardadas ({n} trechos).')
      : t('Baixando: pode falar, suas falas ficam guardadas.');
  const quando = quandoALegendaComeca(prep!);
  return quando ? `${guardadas} ${t('A legenda começa em {quando}.', { quando })}` : guardadas;
}
