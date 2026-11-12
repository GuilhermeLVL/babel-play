/**
 * AS ESCOLHAS DO ELENCO POR LIVRO (M5), no aparelho: se a narração com elenco está ligada neste livro e a voz que a
 * pessoa escolheu para cada personagem. Nada vai ao servidor. Padrão: DESLIGADO (voz única, como sempre).
 * Valor corrompido ou de outra forma vira o padrão; sem armazenamento, vale só nesta visita.
 */
export interface EscolhasDoElenco {
  ligado: boolean;
  /** Personagem → nome da voz. */
  gostos: Record<string, string>;
  /** Mostrar o avatar-narrador (com `avatar_3d`)? Padrão: sim. */
  avatar: boolean;
}

export const ELENCO_PADRAO: EscolhasDoElenco = { ligado: false, gostos: {}, avatar: true };

const chave = (livroId: string) => `leitor:elenco:${livroId}`;
const MAX_GOSTOS = 20;

export function lerEscolhasDoElenco(livroId: string): EscolhasDoElenco {
  try {
    const bruto = JSON.parse(localStorage.getItem(chave(livroId)) ?? 'null') as unknown;
    if (!bruto || typeof bruto !== 'object') return { ...ELENCO_PADRAO, gostos: {} };
    const o = bruto as { ligado?: unknown; gostos?: unknown; avatar?: unknown };
    const gostos: Record<string, string> = {};
    if (o.gostos && typeof o.gostos === 'object') {
      for (const [nome, voz] of Object.entries(o.gostos as Record<string, unknown>).slice(0, MAX_GOSTOS)) {
        if (typeof voz === 'string' && voz && voz.length <= 200 && nome.length <= 80) gostos[nome] = voz;
      }
    }
    return { ligado: o.ligado === true, gostos, avatar: o.avatar !== false };
  } catch {
    return { ...ELENCO_PADRAO, gostos: {} };
  }
}

export function gravarEscolhasDoElenco(livroId: string, e: EscolhasDoElenco): void {
  try {
    localStorage.setItem(chave(livroId), JSON.stringify(e));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}
