/**
 * VALIDAÇÃO da marcação vinda de fora (a IA do servidor, o cache): JSON alinhado por `indice`, estrito.
 * Nunca lança. O que não passa é descartado frase a frase (a heurística cobre) e CONTADO, para o juiz e a telemetria.
 */
import { ehEmocaoDoAvatar } from '../estados';
import { type FraseMarcada } from './tipos';

export interface ItemDaIa {
  indice: number;
  falante: 'narrador' | 'personagem' | 'desconhecido';
  /** Nome da ficha quando `falante` é `personagem`. */
  nome?: string | null;
  emocao: string;
  confianca?: number;
}

export interface ResultadoDaValidacao {
  /** Uma entrada por frase pedida; `null` = a IA não respondeu (ou respondeu fora do formato) para ela. */
  marcadas: (FraseMarcada | null)[];
  /** Personagens que a IA citou fora da lista (viraram `desconhecido`). */
  inventadas: number;
  invalidas: number;
  faltantes: number;
}

const clamp01 = (n: unknown, padrao: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : padrao;

export function validarMarcacaoDaIa(
  bruto: unknown,
  textos: readonly string[],
  personagens: readonly string[],
): ResultadoDaValidacao {
  const lista = Array.isArray((bruto as { frases?: unknown })?.frases)
    ? ((bruto as { frases: unknown[] }).frases as unknown[])
    : Array.isArray(bruto)
      ? (bruto as unknown[])
      : [];
  const marcadas: (FraseMarcada | null)[] = textos.map(() => null);
  let inventadas = 0;
  let invalidas = 0;
  for (const it of lista) {
    const o = it as Partial<ItemDaIa> | null;
    if (!o || typeof o !== 'object' || !Number.isInteger(o.indice) || o.indice! < 0 || o.indice! >= textos.length) {
      invalidas += 1;
      continue;
    }
    if (marcadas[o.indice!]) {
      invalidas += 1; /* índice repetido: fica o primeiro */
      continue;
    }
    const tipo = o.falante;
    if (tipo !== 'narrador' && tipo !== 'personagem' && tipo !== 'desconhecido') {
      invalidas += 1;
      continue;
    }
    let falante: FraseMarcada['falante'] = { tipo };
    let confianca = clamp01(o.confianca, 0.7);
    if (tipo === 'personagem') {
      if (typeof o.nome === 'string' && personagens.includes(o.nome)) falante = { tipo, nome: o.nome };
      else {
        inventadas += 1;
        falante = { tipo: 'desconhecido' };
        confianca = Math.min(confianca, 0.3);
      }
    }
    marcadas[o.indice!] = {
      indice: o.indice!,
      texto: textos[o.indice!],
      falante,
      emocao: ehEmocaoDoAvatar(o.emocao) ? o.emocao : 'neutro',
      confianca,
    };
  }
  return { marcadas, inventadas, invalidas, faltantes: marcadas.filter((m) => m === null).length };
}
