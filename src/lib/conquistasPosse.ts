/**
 * POSSE DAS CONQUISTAS — só o registro local, num módulo minúsculo.
 *
 * Separado de `lib/conquistas` (que fala com a API e com o toast) porque `desbloqueios` e `loja`
 * precisam perguntar "esta conquista já foi feita?" sem arrastar rede nem UI, e sem ciclo de
 * importação. Mesmo padrão de `eventosVistos`/`possuidos`: JSON array em localStorage.
 */
const CHAVE = 'babel.conquistas';

export function conquistasDesbloqueadas(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]') as string[]); } catch { return new Set(); }
}

export function marcarConquista(id: string): void {
  try {
    const s = conquistasDesbloqueadas();
    s.add(id);
    localStorage.setItem(CHAVE, JSON.stringify([...s]));
  } catch { /* sem storage */ }
}

/** Quando cada conquista foi feita (para a tela). Chave separada para o array acima ficar simples. */
const CHAVE_DATAS = 'babel.conquistas_datas';

export function dataDaConquista(id: string): number | null {
  try { return (JSON.parse(localStorage.getItem(CHAVE_DATAS) || '{}') as Record<string, number>)[id] ?? null; } catch { return null; }
}

export function registrarDataDaConquista(id: string, quando = Date.now()): void {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE_DATAS) || '{}') as Record<string, number>;
    if (!d[id]) { d[id] = quando; localStorage.setItem(CHAVE_DATAS, JSON.stringify(d)); }
  } catch { /* sem storage */ }
}
