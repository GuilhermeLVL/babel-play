import type { DicionarioDeSinais } from './tipos';

/**
 * PONTO DE EXTENSÃO: palavras com SINAL GRAVADO (clipes de sinalizadores surdos pagos, com consentimento).
 * Hoje está VAZIO: todo o texto é soletrado. Chave = palavra em minúsculas, sem acento. Quando houver
 * entradas, a palavra sai da soletração (motivo `dicionario`) e quem toca o clipe é outro módulo.
 * Só entra aqui o que foi revisado por pessoas surdas (`revisadoPorSurdos: true`).
 */
export const dicionarioDeSinais: DicionarioDeSinais = {};

/** Chave de busca no dicionário: minúsculas e sem acento. */
export function chaveDoDicionario(palavra: string): string {
  return palavra
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
