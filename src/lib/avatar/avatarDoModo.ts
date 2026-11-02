/**
 * AS PREFERÊNCIAS DO AVATAR POR MODO (Livro, Legendar), só neste aparelho (`localStorage`, chaves
 * `frasy.avatar.modo.<modo>.<campo>`), sempre em `try/catch`: sem armazenamento valem os padrões e a escolha dura até
 * recarregar. Tamanho, economia e "avisar por voz" NÃO moram aqui: são as preferências gerais dos avatares
 * (`preferenciasDoInterprete`), as mesmas em todos os modos.
 */
import { useSyncExternalStore } from 'react';

import {
  decidirContexto,
  type ModoDoAvatar,
  PREFERENCIAS_DO_MODO_PADRAO,
  type PreferenciasDoModo,
  validarPreferenciasDoModo,
} from '../../core/avatar/modos';

export const PREFIXO_DO_MODO = 'frasy.avatar.modo.';
const CAMPOS = ['ligado', 'dono', 'recolhido', 'noPip'] as const;
const BOOLEANOS: readonly string[] = ['ligado', 'recolhido', 'noPip'];

const ouvintes = new Set<() => void>();
const memoria = new Map<ModoDoAvatar, PreferenciasDoModo>();

function ler(modo: ModoDoAvatar): PreferenciasDoModo {
  const bruto: Record<string, unknown> = {};
  try {
    for (const c of CAMPOS) {
      const v = localStorage.getItem(`${PREFIXO_DO_MODO}${modo}.${c}`);
      if (v === null) continue;
      bruto[c] = BOOLEANOS.includes(c) ? v === '1' : v;
    }
  } catch {
    /* armazenamento bloqueado: valem os padrões */
  }
  return validarPreferenciasDoModo(bruto);
}

export function lerPreferenciasDoModo(modo: ModoDoAvatar): PreferenciasDoModo {
  let p = memoria.get(modo);
  if (!p) {
    p = ler(modo);
    memoria.set(modo, p);
  }
  return p;
}

export function guardarPreferenciasDoModo(
  modo: ModoDoAvatar,
  parcial: Partial<PreferenciasDoModo>,
): PreferenciasDoModo {
  const novas = validarPreferenciasDoModo({ ...lerPreferenciasDoModo(modo), ...parcial });
  memoria.set(modo, novas);
  try {
    for (const c of CAMPOS) {
      const v = novas[c];
      localStorage.setItem(`${PREFIXO_DO_MODO}${modo}.${c}`, typeof v === 'boolean' ? (v ? '1' : '0') : v);
    }
  } catch {
    /* sem armazenamento: vale até recarregar */
  }
  for (const cb of [...ouvintes]) cb();
  return novas;
}

/** Só para os testes: esquece o que está em memória e reavisa quem assina. */
export function esquecerPreferenciasDoModo(): void {
  memoria.clear();
  for (const cb of [...ouvintes]) cb();
}

function assinar(cb: () => void): () => void {
  ouvintes.add(cb);
  const aoMudarEmOutraAba = (e: StorageEvent) => {
    if (e.key && !e.key.startsWith(PREFIXO_DO_MODO)) return;
    memoria.clear();
    cb();
  };
  window.addEventListener('storage', aoMudarEmOutraAba);
  return () => {
    ouvintes.delete(cb);
    window.removeEventListener('storage', aoMudarEmOutraAba);
  };
}

export function usePreferenciasDoModo(
  modo: ModoDoAvatar,
): [PreferenciasDoModo, (parcial: Partial<PreferenciasDoModo>) => void] {
  const p = useSyncExternalStore(
    assinar,
    () => lerPreferenciasDoModo(modo),
    () => PREFERENCIAS_DO_MODO_PADRAO as PreferenciasDoModo,
  );
  return [p, (parcial) => void guardarPreferenciasDoModo(modo, parcial)];
}

/* ── o teto de contextos WebGL da PÁGINA: cada avatar 3D reserva o seu e devolve ao sair ── */

let emUso = 0;
const ouvintesDeContexto = new Set<() => void>();

/** Reserva um contexto; `false` = no teto (o avatar aparece em 2D). Devolve também como soltar. */
export function reservarContexto(): { ok: boolean; soltar: () => void } {
  if (!decidirContexto(emUso)) return { ok: false, soltar: () => {} };
  emUso++;
  let solto = false;
  return {
    ok: true,
    soltar: () => {
      if (solto) return;
      solto = true;
      emUso = Math.max(0, emUso - 1);
      for (const cb of [...ouvintesDeContexto]) cb();
    },
  };
}
export const contextosEmUso = (): number => emUso;
