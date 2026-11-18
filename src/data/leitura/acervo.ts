/**
 * O ACERVO DA LEITURA ATIVA (design §2): 12 textos originais da equipe Frasy (CC BY 4.0) empacotados como JSON e
 * importados de forma lazy pela tela — abrem sem rede. As fichas estão conferidas por `tests/leitura-ativa-acervo`
 * (o validador de `core/leitura/fichaDeTexto`). Quando o acervo crescer, migra para o catálogo estático.
 */
import type { FichaDeTexto } from '../../core/leitura/fichaDeTexto';
import { t } from '../../lib/i18n';

let carga: Promise<FichaDeTexto[]> | null = null;

/** Os 12 textos, carregados uma vez (um pedaço separado do pacote). */
export function carregarAcervo(): Promise<FichaDeTexto[]> {
  carga ??= import('./textos.json').then((m) => m.default as FichaDeTexto[]);
  return carga;
}

/** O rodapé de crédito, gerado da ficha (nunca escrito à mão por tela). */
export function creditoDoTexto(f: Pick<FichaDeTexto, 'autoria' | 'licenca'>): string {
  const licenca = /CC BY 4\.0/.test(f.licenca) ? 'CC BY 4.0' : f.licenca;
  if (/Equipe Frasy/i.test(f.autoria)) {
    return t('Texto: equipe Frasy, criado com IA e revisado. Licença {licenca}.', { licenca });
  }
  return t('Texto: {autoria}. Licença {licenca}.', { autoria: f.autoria, licenca });
}
