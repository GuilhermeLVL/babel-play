/**
 * O CACHE DAS FEATURE FLAGS — memória + `localStorage['babel.flags']`, leitura síncrona.
 *
 * Saiu de `lib/flags.ts` na Fase 7 por causa do GRAFO, não da lógica: `lib/flags.ts` busca as flags
 * pelo `apiFetch` (`data/funil`), e o funil passou a precisar de LER flags (a nuvem do convidado só
 * sai para a rede com `modo_convidado` + `nuvem_convidado` ligadas — `lib/convidado`). Com a leitura
 * em `lib/flags.ts`, o ciclo `funil → convidado → flags → funil` derrubaria o portão
 * `npm run morto:ciclos`. Esta folha não importa nada do app; `lib/flags.ts` a reexporta, então
 * quem já lia `flagLigada`/`flagsAtuais` de lá continua igual.
 */
import type { FlagAvaliada, FlagsAvaliadas } from '../core/flags';

export const CHAVE_DO_CACHE = 'babel.flags';

/** Aceita só a forma do servidor; flag com forma estranha é descartada (e vira "desligada"). */
export function normalizar(v: unknown): FlagsAvaliadas | null {
  if (!v || typeof v !== 'object') return null;
  const flags = (v as { flags?: unknown }).flags;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return null;
  const out: FlagsAvaliadas = {};
  for (const [chave, f] of Object.entries(flags as Record<string, unknown>)) {
    if (!f || typeof f !== 'object') continue;
    const { ligada, payload } = f as { ligada?: unknown; payload?: unknown };
    if (typeof ligada !== 'boolean') continue;
    out[chave] = payload === undefined ? { ligada } : { ligada, payload };
  }
  return out;
}

let estado: FlagsAvaliadas | null = null;

function lerCacheDuravel(): FlagsAvaliadas {
  try {
    const bruto = localStorage.getItem(CHAVE_DO_CACHE);
    return (bruto && normalizar({ flags: JSON.parse(bruto) })) || {};
  } catch {
    return {};
  }
}

/** Síncrono: o último valor conhecido (memória → localStorage → vazio). */
export function flagsAtuais(): FlagsAvaliadas {
  estado ??= lerCacheDuravel();
  return estado;
}

/** Troca o estado em memória (`null` = esquecer; a próxima leitura volta ao `localStorage`). */
export function definirEstadoDasFlags(novas: FlagsAvaliadas | null): void {
  estado = novas;
}

export function flag(chave: string): FlagAvaliada | undefined {
  return flagsAtuais()[chave];
}

/** A flag está ligada? Ausente = desligada. Síncrono. */
export function flagLigada(chave: string): boolean {
  return flag(chave)?.ligada === true;
}
