/**
 * Os NOMES que a pessoa lê para cada token da paleta (o core guarda só ids). Descritivos e neutros: nenhum nome de
 * comida, de gênero ou de estereótipo; o tom é dito por palavras, e não só pela cor do botão.
 */
import type { CampoDaPaleta } from '../../../core/avatar/paleta';
import { t } from '../../../lib/i18n';

export const NOMES_DE_COR: Record<CampoDaPaleta, Record<string, () => string>> = {
  pele: {
    padrao: () => t('Cor do modelo'),
    'muito-claro': () => t('Muito claro'),
    claro: () => t('Claro'),
    'claro-quente': () => t('Claro quente'),
    medio: () => t('Médio'),
    'medio-quente': () => t('Médio quente'),
    oliva: () => t('Oliva'),
    moreno: () => t('Moreno'),
    escuro: () => t('Escuro'),
    'escuro-profundo': () => t('Escuro profundo'),
    'muito-escuro': () => t('Muito escuro'),
  },
  cabelo: {
    padrao: () => t('Cor do modelo'),
    preto: () => t('Preto'),
    'castanho-escuro': () => t('Castanho escuro'),
    castanho: () => t('Castanho'),
    'castanho-claro': () => t('Castanho claro'),
    loiro: () => t('Loiro'),
    ruivo: () => t('Ruivo'),
    grisalho: () => t('Grisalho'),
    branco: () => t('Branco'),
    azul: () => t('Azul'),
    verde: () => t('Verde'),
    rosa: () => t('Rosa'),
    roxo: () => t('Roxo'),
  },
  olhos: {
    padrao: () => t('Cor do modelo'),
    'castanho-escuro': () => t('Castanho escuro'),
    castanho: () => t('Castanho'),
    mel: () => t('Mel'),
    verde: () => t('Verde'),
    azul: () => t('Azul'),
    cinza: () => t('Cinza'),
    preto: () => t('Preto'),
    violeta: () => t('Violeta'),
  },
};

export const ROTULO_DO_CAMPO: Record<CampoDaPaleta, () => string> = {
  pele: () => t('Tom de pele'),
  cabelo: () => t('Cabelo'),
  olhos: () => t('Olhos'),
};

export const nomeDaCor = (campo: CampoDaPaleta, id: string): string => (NOMES_DE_COR[campo][id] ?? (() => id))();
