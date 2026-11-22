/**
 * PREFERÊNCIAS DO "ANKI NO COMPUTADOR" — baralho, modelo e mapeamento de campos, só neste aparelho.
 * Nunca vão ao servidor. `localStorage` pode falhar (janela privada, dados bloqueados): tudo em try/catch.
 */
import { type MapeamentoDeCampos, PAPEIS_DO_CAMPO, type PapelDoCampo } from '../../core/anki/paraAnkiConnect';

export const CHAVE_DAS_PREFS_DO_ANKI = 'babel.anki_connect_prefs';

export interface PrefsDoAnki {
  baralho: string;
  modelo: string;
  /** Mapeamento por modelo: trocar de modelo e voltar não perde a escolha. */
  mapeamentos: Record<string, MapeamentoDeCampos>;
}

export const PREFS_VAZIAS: PrefsDoAnki = { baralho: '', modelo: '', mapeamentos: {} };

const texto = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 200) : '');

/** Lê e VALIDA: o que está no storage é entrada não confiável (outra aba, versão antiga, edição à mão). */
export function lerPrefsDoAnki(): PrefsDoAnki {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_DAS_PREFS_DO_ANKI) ?? 'null') as unknown;
    if (!bruto || typeof bruto !== 'object') return { ...PREFS_VAZIAS };
    const o = bruto as Record<string, unknown>;
    const mapeamentos: Record<string, MapeamentoDeCampos> = {};
    if (o.mapeamentos && typeof o.mapeamentos === 'object') {
      for (const [modelo, mapa] of Object.entries(o.mapeamentos as Record<string, unknown>).slice(0, 50)) {
        if (!mapa || typeof mapa !== 'object') continue;
        const limpo: MapeamentoDeCampos = {};
        for (const [campo, papel] of Object.entries(mapa as Record<string, unknown>).slice(0, 50)) {
          if (PAPEIS_DO_CAMPO.includes(papel as PapelDoCampo)) limpo[campo] = papel as PapelDoCampo;
        }
        mapeamentos[modelo.slice(0, 200)] = limpo;
      }
    }
    return { baralho: texto(o.baralho), modelo: texto(o.modelo), mapeamentos };
  } catch {
    return { ...PREFS_VAZIAS };
  }
}

export function gravarPrefsDoAnki(prefs: PrefsDoAnki): void {
  try {
    localStorage.setItem(CHAVE_DAS_PREFS_DO_ANKI, JSON.stringify(prefs));
  } catch {
    /* sem storage: a escolha vale só nesta abertura */
  }
}
