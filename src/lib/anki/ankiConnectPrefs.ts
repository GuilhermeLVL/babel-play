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

/**
 * A CHAVE do AnkiConnect (segredo da pessoa): `sessionStorage` por padrão (some ao fechar a aba); só vai ao
 * `localStorage` com o "lembrar neste aparelho" explícito. Fica FORA do JSON das preferências e nunca sai do
 * navegador (a não ser, pelo cliente, para o Anki em 127.0.0.1).
 */
export const CHAVE_DA_CHAVE_DO_ANKI = 'babel.anki_connect_key';

export function lerChaveDoAnki(): { chave: string; lembrar: boolean } {
  try {
    const guardada = localStorage.getItem(CHAVE_DA_CHAVE_DO_ANKI);
    if (guardada) return { chave: guardada.slice(0, 200), lembrar: true };
  } catch {
    /* sem storage */
  }
  try {
    return { chave: (sessionStorage.getItem(CHAVE_DA_CHAVE_DO_ANKI) ?? '').slice(0, 200), lembrar: false };
  } catch {
    return { chave: '', lembrar: false };
  }
}

export function gravarChaveDoAnki(chave: string, lembrar: boolean): void {
  const limpa = chave.trim().slice(0, 200);
  for (const [armazem, usar] of [
    ['local', lembrar],
    ['session', !lembrar],
  ] as const) {
    try {
      const s = armazem === 'local' ? localStorage : sessionStorage;
      if (usar && limpa) s.setItem(CHAVE_DA_CHAVE_DO_ANKI, limpa);
      else s.removeItem(CHAVE_DA_CHAVE_DO_ANKI);
    } catch {
      /* sem storage: a chave vale só nesta abertura */
    }
  }
}
