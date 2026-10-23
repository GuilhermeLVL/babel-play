/**
 * SENTINELA DE QUEDA DO MODELO — "a aba anterior caiu com ele carregado?".
 *
 * Quando o navegador mata a aba por falta de memória, nenhum código nosso roda. O que dá para fazer é
 * deixar uma MARCA no `localStorage` ao começar a carregar um modelo pesado (o Parakeet) e apagá-la na
 * liberação normal e no `pagehide`. Se na próxima captura há uma marca de OUTRA instância de página, que
 * não está mais viva, a anterior morreu sem se despedir: o modelo é vetado neste aparelho
 * (`proibirModelo`) e a rota volta ao Whisper.
 *
 * UMA CHAVE POR INSTÂNCIA (`babel.sentinela.<modelo>.<instância>`): a marca da PRÓPRIA página nunca conta
 * (parar e iniciar na mesma aba carrega o modelo de novo sem queda nenhuma), e uma aba não apaga a marca
 * da outra. Outra aba VIVA também não é queda: cada instância segura um Web Lock com o nome da chave
 * enquanto existe; o lock some junto com a página, qualquer que seja a causa. Sem Web Locks, vale só a
 * regra da idade.
 *
 * Marca com mais de 30 min não conta. Nunca lança: sem `localStorage`, não há sentinela.
 */

const PREFIXO = 'babel.sentinela.';
const VALIDADE_MS = 30 * 60_000;

/** Identifica ESTA página (criado uma vez, ao carregar o módulo). */
export const INSTANCIA_DA_PAGINA = Math.random().toString(36).slice(2) + Date.now().toString(36);

const chaveDe = (id: string, instancia: string) => `${PREFIXO}${id}.${instancia}`;

function armazem(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Locks que ESTA página segura, para soltar no `desmarcar`. */
const locksPropriosPorChave = new Map<string, () => void>();

function segurarLock(chave: string): void {
  try {
    const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
    if (!locks || locksPropriosPorChave.has(chave)) return;
    let soltar = () => {};
    const segurando = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    locksPropriosPorChave.set(chave, soltar);
    void locks.request(chave, () => segurando).catch(() => locksPropriosPorChave.delete(chave));
  } catch {
    /* sem Web Locks */
  }
}

/** O worker do modelo vai começar a ler pesos: deixa a marca desta instância, com a hora. */
export function marcarCarregando(id: string, agora = Date.now(), instancia = INSTANCIA_DA_PAGINA): void {
  try {
    const chave = chaveDe(id, instancia);
    armazem()?.setItem(chave, String(agora));
    if (instancia === INSTANCIA_DA_PAGINA) segurarLock(chave);
  } catch {
    /* sem persistência */
  }
}

/** Liberação normal (ou `pagehide`): apaga SÓ a marca desta instância. */
export function desmarcar(id: string, instancia = INSTANCIA_DA_PAGINA): void {
  const chave = chaveDe(id, instancia);
  try {
    armazem()?.removeItem(chave);
  } catch {
    /* sem persistência */
  }
  locksPropriosPorChave.get(chave)?.();
  locksPropriosPorChave.delete(chave);
}

/** Chaves de marcas deste modelo, de qualquer instância. */
function chavesDoModelo(s: Storage, id: string): string[] {
  const achadas: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(`${PREFIXO}${id}.`)) achadas.push(k);
  }
  return achadas;
}

/**
 * Há marca recente (< 30 min) de OUTRA instância que não está viva? `vivas` = chaves cujo lock está
 * segurado (outra aba em uso). Marca velha é apagada; a própria nunca conta.
 */
export function quedaSuspeita(
  id: string,
  agora = Date.now(),
  vivas: ReadonlySet<string> = new Set(),
  instancia = INSTANCIA_DA_PAGINA,
): boolean {
  return marcasDeQueda(id, agora, vivas, instancia).length > 0;
}

function marcasDeQueda(id: string, agora: number, vivas: ReadonlySet<string>, instancia: string): string[] {
  try {
    const s = armazem();
    if (!s) return [];
    const propria = chaveDe(id, instancia);
    const suspeitas: string[] = [];
    for (const chave of chavesDoModelo(s, id)) {
      if (chave === propria || vivas.has(chave)) continue;
      const marcadaEm = Number(s.getItem(chave));
      const idade = agora - marcadaEm;
      if (Number.isFinite(marcadaEm) && idade >= 0 && idade < VALIDADE_MS) suspeitas.push(chave);
      else s.removeItem(chave);
    }
    return suspeitas;
  } catch {
    return [];
  }
}

/** Chaves de sentinela cujo Web Lock está segurado agora (páginas vivas). Vazio sem Web Locks. */
async function chavesVivas(): Promise<Set<string>> {
  try {
    const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
    const estado = await locks?.query();
    return new Set((estado?.held ?? []).map((l) => l.name ?? '').filter((n) => n.startsWith(PREFIXO)));
  } catch {
    return new Set();
  }
}

/**
 * No início da captura: se uma página ANTERIOR caiu com o modelo carregado, veta o modelo neste aparelho
 * (`proibir` = `proibirModelo` da sonda) e apaga a marca dela. `true` = o veto foi gravado agora.
 */
export async function vetarSeCaiuComOModelo(
  id: string,
  proibir: (id: string, motivo: string) => Promise<void>,
  agora = Date.now(),
  instancia = INSTANCIA_DA_PAGINA,
): Promise<boolean> {
  const suspeitas = marcasDeQueda(id, agora, await chavesVivas(), instancia);
  if (!suspeitas.length) return false;
  try {
    await proibir(id, 'a aba caiu com o modelo carregado');
  } finally {
    const s = armazem();
    for (const k of suspeitas) {
      try {
        s?.removeItem(k);
      } catch {
        /* sem persistência */
      }
    }
  }
  return true;
}
