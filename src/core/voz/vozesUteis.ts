/**
 * QUAIS VOZES VALE OFERECER — o macOS lista, junto com as vozes de verdade, vozes de EFEITO (Wobble, Bells, Zarvox…)
 * e vozes antigas e robóticas (Fred, Junior, Kathy, Ralph). Para ler um livro, elas só atrapalham. Aqui, a lista
 * fechada delas e o filtro. Sem DOM; a ordem de qualidade vem de `melhorVoz.ts`.
 */
import { ordenarPorQualidade, type VozDescrita } from './melhorVoz';

/** O nome base de uma voz: sem o que vem entre parênteses, sem acento e em minúsculas ("Wobble (en-US)" → "wobble"). */
const nomeBase = (nome: string): string =>
  nome
    .replace(/\s*\(.*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const EFEITOS = new Set(
  [
    'Albert',
    'Bad News',
    'Bahh',
    'Bells',
    'Boing',
    'Bubbles',
    'Cellos',
    'Good News',
    'Jester',
    'Organ',
    'Superstar',
    'Trinoids',
    'Whisper',
    'Wobble',
    'Zarvox',
  ].map(nomeBase),
);

const ROBOTICAS = new Set(['Fred', 'Junior', 'Kathy', 'Ralph'].map(nomeBase));

/** É uma voz de efeito ou de novidade do macOS (não serve para ler um livro)? */
export const ehVozDeEfeito = (nome: string): boolean => EFEITOS.has(nomeBase(nome));

/** É uma das vozes antigas e robóticas do macOS? */
export const ehVozRobotica = (nome: string): boolean => ROBOTICAS.has(nomeBase(nome));

/**
 * As vozes do idioma que valem a pena, da melhor para a pior. Se o filtro esvaziasse a lista (um aparelho só com
 * efeito e voz robótica), devolve as do idioma sem filtrar: voz ruim ainda é melhor que nenhuma.
 */
export function vozesUteis<T extends VozDescrita>(vozes: readonly T[], idioma: string): T[] {
  const doIdioma = ordenarPorQualidade(vozes, idioma);
  const uteis = doIdioma.filter((v) => !ehVozDeEfeito(v.name) && !ehVozRobotica(v.name));
  return uteis.length > 0 ? uteis : doIdioma;
}
