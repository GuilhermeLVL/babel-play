/**
 * O OPFS (armazenamento privado de origem) FUNCIONA aqui? A voz no aparelho guarda ~400 MB nele. O Safari em navegação
 * privada (e alguns modos restritos) expõe `navigator.storage.getDirectory`, mas falha ao usar; então só a existência da API
 * não basta: a sonda pede a pasta raiz e cria e apaga um arquivo minúsculo. Nenhum I/O pesado, uma vez por sessão.
 * NUNCA LANÇA: qualquer falha é `false`.
 */
const NOME_DA_SONDA = '.sonda';

let resposta: Promise<boolean> | null = null;
let ultimo: boolean | null = null;

async function sondar(): Promise<boolean> {
  try {
    const armazenamento = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (typeof armazenamento?.getDirectory !== 'function') return false;
    const raiz = await armazenamento.getDirectory();
    await raiz.getFileHandle(NOME_DA_SONDA, { create: true });
    await raiz.removeEntry(NOME_DA_SONDA);
    return true;
  } catch {
    return false;
  }
}

/** A sonda, assíncrona e cacheada na sessão. */
export function opfsUtilizavel(): Promise<boolean> {
  resposta ??= sondar().then((ok) => (ultimo = ok));
  return resposta;
}

/** O que a sonda já respondeu (`'desconhecido'` enquanto não respondeu). Não dispara a sonda. */
export const opfsConhecido = (): boolean | 'desconhecido' => ultimo ?? 'desconhecido';

/** Esquece a resposta (para os testes refazerem a sonda). */
export function esquecerOpfsSondado(): void {
  resposta = null;
  ultimo = null;
}
