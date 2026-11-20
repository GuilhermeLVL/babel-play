/**
 * "ALGUMA CAPTURA ESTÁ GRAVANDO?", em qualquer aba deste navegador.
 *
 * A captura segura a trava `babel.captura.gravando` (Web Locks) enquanto grava; a tela "Modelos no
 * aparelho" pergunta por ela antes de baixar o Parakeet (672 MB, e a carga dele ocupa ~2 GB de memória
 * enquanto verifica): o download nunca disputa a máquina com uma captura. A trava é do navegador, então
 * some sozinha quando a aba fecha ou cai — nada fica preso como ficaria uma marca no `localStorage`.
 * Sem Web Locks (navegador antigo), a resposta é "não" e segurar não faz nada.
 */
const NOME = 'babel.captura.gravando';

type Locks = {
  request?: (nome: string, opcoes: { mode: 'shared' }, f: () => Promise<unknown>) => Promise<unknown>;
  query?: () => Promise<{ held?: { name?: string }[] }>;
};

const locks = (): Locks | undefined =>
  typeof navigator !== 'undefined' ? (navigator as unknown as { locks?: Locks }).locks : undefined;

/** Segura a trava até a função devolvida ser chamada. Compartilhada: duas abas gravando convivem. */
export function segurarTravaDaGravacao(): () => void {
  let soltar: () => void = () => {};
  const l = locks();
  if (typeof l?.request !== 'function') return soltar;
  const fim = new Promise<void>((resolve) => (soltar = resolve));
  try {
    void Promise.resolve(l.request(NOME, { mode: 'shared' }, () => fim)).catch(() => undefined);
  } catch {
    /* sem trava: a pergunta responde "não" */
  }
  return () => soltar();
}

/** Alguma aba segura a trava agora? Nunca lança. */
export async function algumaAbaGravando(): Promise<boolean> {
  const l = locks();
  if (typeof l?.query !== 'function') return false;
  try {
    const r = await l.query();
    return !!r.held?.some((x) => x.name === NOME);
  } catch {
    return false;
  }
}
