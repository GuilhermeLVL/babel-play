/**
 * SENTINELA DE QUEDA DO MODELO — "a aba caiu com ele carregado?".
 *
 * Quando o navegador mata a aba por falta de memória, nenhum código nosso roda. O que dá para fazer é
 * deixar uma MARCA no `localStorage` ao começar a carregar um modelo pesado (o Parakeet) e apagá-la na
 * liberação normal e no `pagehide`. Se na próxima captura a marca ainda está lá, a página anterior
 * morreu sem se despedir: o modelo é vetado neste aparelho (`proibirModelo`) e a rota volta ao Whisper.
 *
 * Marca com mais de 30 min não conta (aba que ficou em segundo plano e foi descartada, bateria, etc.
 * não prova que o modelo derrubou). Nunca lança: sem `localStorage`, não há sentinela.
 */

const PREFIXO = 'babel.sentinela.';
const VALIDADE_MS = 30 * 60_000;

function armazem(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** O worker do modelo vai começar a ler pesos: deixa a marca com a hora. */
export function marcarCarregando(id: string, agora = Date.now()): void {
  try {
    armazem()?.setItem(PREFIXO + id, String(agora));
  } catch {
    /* sem persistência */
  }
}

/** Liberação normal (ou `pagehide`): apaga a marca. */
export function desmarcar(id: string): void {
  try {
    armazem()?.removeItem(PREFIXO + id);
  } catch {
    /* sem persistência */
  }
}

/** Há uma marca recente (< 30 min) deixada por uma página que não se despediu? Marca velha é apagada. */
export function quedaSuspeita(id: string, agora = Date.now()): boolean {
  try {
    const s = armazem();
    const bruto = s?.getItem(PREFIXO + id);
    if (!s || bruto == null) return false;
    const marcadaEm = Number(bruto);
    const idade = agora - marcadaEm;
    if (Number.isFinite(marcadaEm) && idade >= 0 && idade < VALIDADE_MS) return true;
    s.removeItem(PREFIXO + id);
    return false;
  } catch {
    return false;
  }
}

/**
 * No início da captura: se a página anterior caiu com o modelo carregado, veta o modelo neste aparelho
 * (`proibir` = `proibirModelo` da sonda) e apaga a marca. `true` = o veto foi gravado agora.
 */
export async function vetarSeCaiuComOModelo(
  id: string,
  proibir: (id: string, motivo: string) => Promise<void>,
): Promise<boolean> {
  if (!quedaSuspeita(id)) return false;
  try {
    await proibir(id, 'a aba caiu com o modelo carregado');
  } finally {
    desmarcar(id);
  }
  return true;
}
