/**
 * POSES MARCADAS COMO INCORRETAS: uma lista LOCAL (sem servidor) que a pessoa exporta em JSON para levar a quem revisa
 * as poses (pessoas surdas). Não leva nenhum dado da pessoa: só qual pose (alfabeto e letra), se estava espelhada e quando.
 *
 * Soletração do alfabeto manual, não tradução. As poses são de DEMONSTRAÇÃO, NÃO revisadas por pessoas surdas.
 */
import type { Lingua } from './tipos';

export interface MarcacaoDePose {
  alfabeto: Lingua;
  /** Uma letra (A-Z, Ç) ou algarismo. */
  letra: string;
  espelhada: boolean;
  /** Quando foi marcada (ms desde 1970); 0 = desconhecido. */
  em: number;
}

export const MAX_DE_MARCACOES = 200;
export const ESQUEMA_DAS_MARCACOES = 'frasy-poses-marcadas/1';
export const AVISO_DAS_MARCACOES =
  'Lista de poses que a pessoa achou incorretas. É soletração do alfabeto manual, não é tradução. As poses são de DEMONSTRAÇÃO e ainda NÃO revisadas por pessoas surdas: esta lista serve para levar à revisão, não prova nada sobre Libras ou ASL.';

const mesma = (a: Pick<MarcacaoDePose, 'alfabeto' | 'letra'>, b: Pick<MarcacaoDePose, 'alfabeto' | 'letra'>) =>
  a.alfabeto === b.alfabeto && a.letra === b.letra;

/** Aceita qualquer coisa guardada (texto JSON, ausente, quebrado) e devolve só as marcações válidas, sem repetição. */
export function lerMarcacoes(bruto: string | null | undefined): MarcacaoDePose[] {
  if (!bruto) return [];
  let dado: unknown;
  try {
    dado = JSON.parse(bruto);
  } catch {
    return [];
  }
  if (!Array.isArray(dado)) return [];
  let lista: MarcacaoDePose[] = [];
  for (const x of dado) {
    if (x === null || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (o.alfabeto !== 'libras' && o.alfabeto !== 'asl') continue;
    if (typeof o.letra !== 'string' || !/^[A-ZÇ0-9]$/u.test(o.letra)) continue;
    const m: MarcacaoDePose = {
      alfabeto: o.alfabeto,
      letra: o.letra,
      espelhada: o.espelhada === true,
      em: typeof o.em === 'number' && Number.isFinite(o.em) && o.em >= 0 ? o.em : 0,
    };
    if (!lista.some((y) => mesma(y, m))) lista = [...lista, m];
    if (lista.length >= MAX_DE_MARCACOES) break;
  }
  return lista;
}

/** Marca uma pose. A mesma pose (alfabeto e letra) não repete; passando do teto, a mais antiga sai. */
export function adicionarMarcacao(lista: readonly MarcacaoDePose[], m: MarcacaoDePose): MarcacaoDePose[] {
  if (lista.some((y) => mesma(y, m))) return [...lista];
  return [...lista, m].slice(-MAX_DE_MARCACOES);
}

export function removerMarcacao(lista: readonly MarcacaoDePose[], alfabeto: Lingua, letra: string): MarcacaoDePose[] {
  return lista.filter((y) => !mesma(y, { alfabeto, letra }));
}

export function estaMarcada(lista: readonly MarcacaoDePose[], alfabeto: Lingua, letra: string): boolean {
  return lista.some((y) => mesma(y, { alfabeto, letra }));
}

/** O arquivo para levar à revisão (JSON legível). `quando`: ISO 8601 do momento da exportação. */
export function exportarMarcacoes(lista: readonly MarcacaoDePose[], quando: string): string {
  return JSON.stringify(
    {
      esquema: ESQUEMA_DAS_MARCACOES,
      aviso: AVISO_DAS_MARCACOES,
      exportadoEm: quando,
      itens: lista.map((m) => ({ alfabeto: m.alfabeto, letra: m.letra, espelhada: m.espelhada, em: m.em })),
    },
    null,
    2,
  );
}
