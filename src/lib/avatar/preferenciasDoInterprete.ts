/**
 * AS PREFERÊNCIAS DOS AVATARES DA CONVERSA, guardadas SÓ neste aparelho (`localStorage`, chaves
 * `frasy.avatar.interprete.*`). Toda leitura e escrita é em `try/catch`: modo privado ou armazenamento cheio devolvem
 * os padrões e a tela funciona igual (a escolha só não sobrevive ao recarregar).
 */
import { useSyncExternalStore } from 'react';

import { PREFERENCIAS_PADRAO, type PreferenciasDosAvatares, validarPreferencias } from '../../core/avatar/interprete';

export const PREFIXO_DAS_PREFERENCIAS = 'frasy.avatar.interprete.';
const CAMPOS = [
  'quem',
  'tamanho',
  'foco',
  'economia',
  'anunciar',
  'soletrar',
  'alfabeto',
  'espelhar',
  'ritmo',
] as const;
const BOOLEANOS: readonly string[] = ['economia', 'anunciar', 'soletrar', 'espelhar'];

const ouvintes = new Set<() => void>();
let memoria: PreferenciasDosAvatares | null = null;

function lerDoArmazenamento(): PreferenciasDosAvatares {
  const bruto: Record<string, unknown> = {};
  try {
    for (const c of CAMPOS) {
      const v = localStorage.getItem(PREFIXO_DAS_PREFERENCIAS + c);
      if (v === null) continue;
      bruto[c] = BOOLEANOS.includes(c) ? v === '1' : v;
    }
  } catch {
    /* armazenamento bloqueado: valem os padrões */
  }
  return validarPreferencias(bruto);
}

/** As preferências agora (a mesma referência enquanto nada muda: serve ao `useSyncExternalStore`). */
export function lerPreferenciasDosAvatares(): PreferenciasDosAvatares {
  return (memoria ??= lerDoArmazenamento());
}

export function guardarPreferenciasDosAvatares(parcial: Partial<PreferenciasDosAvatares>): PreferenciasDosAvatares {
  const novas = validarPreferencias({ ...lerPreferenciasDosAvatares(), ...parcial });
  memoria = novas;
  try {
    for (const c of CAMPOS) {
      const v = novas[c];
      localStorage.setItem(PREFIXO_DAS_PREFERENCIAS + c, typeof v === 'boolean' ? (v ? '1' : '0') : v);
    }
  } catch {
    /* sem armazenamento: a escolha vale até recarregar */
  }
  for (const cb of [...ouvintes]) cb();
  return novas;
}

function assinar(cb: () => void): () => void {
  ouvintes.add(cb);
  const aoMudarEmOutraAba = (e: StorageEvent) => {
    if (e.key && !e.key.startsWith(PREFIXO_DAS_PREFERENCIAS)) return;
    memoria = null;
    cb();
  };
  window.addEventListener('storage', aoMudarEmOutraAba);
  return () => {
    ouvintes.delete(cb);
    window.removeEventListener('storage', aoMudarEmOutraAba);
  };
}

export function usePreferenciasDosAvatares(): [PreferenciasDosAvatares, typeof guardarPreferenciasDosAvatares] {
  const p = useSyncExternalStore(assinar, lerPreferenciasDosAvatares, () => PREFERENCIAS_PADRAO);
  return [p, guardarPreferenciasDosAvatares];
}
