/**
 * OS NOMES DAS ETIQUETAS na tela e no leitor de tela. A regra mora no núcleo (`core/vocabulario/etiquetas`); aqui só
 * o texto, traduzido.
 */
import type { Etiqueta, ResumoDasEtiquetas } from '../../core/vocabulario/etiquetas';
import { t } from '../i18n';

/** O nome curto de uma etiqueta (filtros, `aria-description` de uma palavra). */
export function rotuloDaEtiqueta(e: Etiqueta): string {
  if (e === 'salva') return t('salva');
  if (e === 'aprendendo') return t('aprendendo');
  if (e === 'dominada') return t('dominada');
  return t('nova para você');
}

/**
 * A `aria-description` de uma linha da legenda: as palavras guardadas, as que estão aprendendo e as novas para você.
 * Atributo, não texto: a região `aria-live` da legenda não o anuncia; quem navega até a linha o ouve. Sem nenhuma,
 * `undefined` (nada de "nenhuma palavra" em toda linha).
 */
export function descricaoDaLinha(r: ResumoDasEtiquetas): string | undefined {
  const partes: string[] = [];
  if (r.salvas.length) partes.push(t('Salvas: {palavras}', { palavras: r.salvas.join(', ') }));
  if (r.aprendendo.length) partes.push(t('Aprendendo: {palavras}', { palavras: r.aprendendo.join(', ') }));
  if (r.novas.length) partes.push(t('Novas para você: {palavras}', { palavras: r.novas.join(', ') }));
  return partes.length ? `${partes.join('. ')}.` : undefined;
}
