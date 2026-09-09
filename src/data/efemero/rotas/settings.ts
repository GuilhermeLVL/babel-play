/**
 * ESPELHO SEM CONTA — as configurações do app.
 *
 * Metade de `src/data/rotas/settings.ts`: a MESMA rota `/api/settings`, guardada no
 * `localStorage` em vez da tabela. Não vai para o IndexedDB de propósito — é um registro só, lido
 * na subida, e o `localStorage` é síncrono.
 *
 * Rotas: GET `/api/settings`, PUT `/api/settings`.
 */
import { json, lerJson, str } from '../servidor';

const CHAVE_SETTINGS = 'babel.efemero.settings';

interface SettingsLocal { id: string; activeProfileId: string | null; targetLanguage: string | null; ui: string | null }

function lerSettings(): SettingsLocal {
  try {
    const bruto = localStorage.getItem(CHAVE_SETTINGS);
    if (bruto) return JSON.parse(bruto) as SettingsLocal;
  } catch { /* sem localStorage → default */ }
  return { id: 'efemero', activeProfileId: null, targetLanguage: null, ui: null };
}

export async function obterSettings(): Promise<Response> { return json(lerSettings()); }

export async function gravarSettings(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const atual = lerSettings();
  const novo: SettingsLocal = {
    id: 'efemero',
    activeProfileId: 'activeProfileId' in p ? str(p.activeProfileId) : atual.activeProfileId,
    targetLanguage: 'targetLanguage' in p ? str(p.targetLanguage) : atual.targetLanguage,
    ui: 'ui' in p ? (p.ui == null ? null : JSON.stringify(p.ui)) : atual.ui,
  };
  try { localStorage.setItem(CHAVE_SETTINGS, JSON.stringify(novo)); } catch { /* best-effort */ }
  return json(novo);
}
