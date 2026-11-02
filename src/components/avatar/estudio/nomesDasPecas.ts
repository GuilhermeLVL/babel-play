/**
 * Os NOMES que a pessoa lê para cada peça do catálogo e para cada categoria (o core guarda só ids). Nomes diretos,
 * sem gênero e sem estereótipo; aparelho auditivo e implante coclear dizem o lado em palavras.
 */
import type { CategoriaDaPeca } from '../../../core/avatar/pecas';
import { t } from '../../../lib/i18n';

export const NOMES_DAS_PECAS: Record<string, () => string> = {
  'oculos-redondo': () => t('Óculos redondos'),
  'oculos-quadrado': () => t('Óculos quadrados'),
  'fone-de-ouvido': () => t('Fone de ouvido'),
  'aparelho-auditivo-esq': () => t('Aparelho auditivo (orelha esquerda)'),
  'aparelho-auditivo-dir': () => t('Aparelho auditivo (orelha direita)'),
  'implante-coclear-esq': () => t('Implante coclear (orelha esquerda)'),
  'implante-coclear-dir': () => t('Implante coclear (orelha direita)'),
  bone: () => t('Boné'),
  'chapeu-simples': () => t('Chapéu simples'),
  'faixa-de-cabelo': () => t('Faixa de cabelo'),
  'balao-de-fala': () => t('Balão de fala'),
  lenco: () => t('Lenço'),
  cartola: () => t('Cartola'),
  'chapeu-de-explorador': () => t('Chapéu de explorador'),
  capa: () => t('Capa'),
};

export const nomeDaPeca = (id: string): string => (NOMES_DAS_PECAS[id] ?? (() => id))();

export const NOMES_DAS_CATEGORIAS: Record<CategoriaDaPeca, () => string> = {
  acessorio: () => t('Rosto e orelhas'),
  cabeca: () => t('Cabeça'),
  adereco: () => t('Adereços'),
};
