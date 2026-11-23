import type { CapacidadeOffline, MotivoOffline, RecursoOffline } from '../../core/modoOffline';
import { t } from '../../lib/i18n';

/** O nome de cada recurso e o motivo, em palavras (o core só devolve códigos). */
export function nomeDoRecurso(r: RecursoOffline): string {
  switch (r) {
    case 'transcricao':
      return t('Transcrição no aparelho');
    case 'traducao':
      return t('Tradução no aparelho');
    case 'jogos':
      return t('Jogos');
    case 'leitor':
      return t('Leitor');
    case 'ia':
      return t('IA na nuvem');
  }
}

export function motivoEmPalavras(m: MotivoOffline): string {
  switch (m) {
    case 'sem-rede':
      return t('precisa de internet');
    case 'modelo-nao-baixado':
      return t('baixe o modelo uma vez, com internet');
    case 'sem-motor-local':
      return t('este aparelho não tem o motor local');
  }
}

/** Uma frase só: o que funciona e o que espera a internet. */
export function resumoSemRede(caps: readonly CapacidadeOffline[]): string {
  const ok = caps.filter((c) => c.funciona).map((c) => nomeDoRecurso(c.recurso));
  const nao = caps.filter((c) => !c.funciona).map((c) => nomeDoRecurso(c.recurso));
  const partes = [t('Sem internet.')];
  if (ok.length) partes.push(t('Funcionam: {lista}.', { lista: ok.join(', ') }));
  if (nao.length) partes.push(t('Esperam a internet: {lista}.', { lista: nao.join(', ') }));
  return partes.join(' ');
}
