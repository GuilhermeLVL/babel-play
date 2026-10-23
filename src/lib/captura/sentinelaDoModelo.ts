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
 * BATIMENTO: enquanto o modelo segue carregado, a marca desta página é renovada a cada 5 min, e a regra
 * dos 30 min conta do ÚLTIMO carimbo. Sem isso, uma captura longa (episódio) que derruba a aba depois
 * de 30 min deixava uma marca "velha", apagada em vez de vetar. Para no `desmarcar` (liberar, `pagehide`).
 *
 * Marca cujo último carimbo tem mais de 30 min não conta. Nunca lança: sem `localStorage`, não há sentinela.
 *
 * O VETO É VISTO: cada veto gravado emite UM evento pelo relatório de erros do app (`reportarErro`,
 * tipo `modelo-vetado`): só o id do modelo e o tipo de aparelho, nada de áudio nem de pessoa.
 */

const PREFIXO = 'babel.sentinela.';
const VALIDADE_MS = 30 * 60_000;
const BATIMENTO_MS = 5 * 60_000;

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
/** Batimentos desta página (renovam o carimbo da marca enquanto o modelo segue carregado). */
const batimentosPorChave = new Map<string, ReturnType<typeof setInterval>>();

function pararBatimento(chave: string): void {
  const id = batimentosPorChave.get(chave);
  if (id !== undefined) clearInterval(id);
  batimentosPorChave.delete(chave);
}

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
    const s = armazem();
    if (!s) return;
    s.setItem(chave, String(agora));
    if (instancia !== INSTANCIA_DA_PAGINA) return;
    segurarLock(chave);
    pararBatimento(chave);
    batimentosPorChave.set(
      chave,
      setInterval(() => {
        try {
          armazem()?.setItem(chave, String(Date.now()));
        } catch {
          /* sem persistência */
        }
      }, BATIMENTO_MS),
    );
  } catch {
    /* sem persistência */
  }
}

/** Liberação normal (ou `pagehide`): apaga SÓ a marca desta instância. */
export function desmarcar(id: string, instancia = INSTANCIA_DA_PAGINA): void {
  const chave = chaveDe(id, instancia);
  pararBatimento(chave);
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
    avisarDoVeto(id);
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

/** Um evento pelo relatório de erros que o app já tem: o id do modelo e o tipo de aparelho. Nunca lança. */
function avisarDoVeto(id: string): void {
  void Promise.all([import('../relatorioDeErros'), import('../dispositivo/perfil')])
    .then(([r, p]) => r.reportarErro('modelo-vetado', `${id} · ${p.perfilDoDispositivo().tipo}`))
    .catch(() => undefined);
}

/**
 * "Tentar de novo" na tela de modelos: apaga as marcas de queda de páginas que não estão vivas (a própria
 * e as de abas vivas ficam). Quem chama tira o veto da sonda (`permitirModelo`). Nunca lança.
 */
export async function esquecerQuedas(id: string, instancia = INSTANCIA_DA_PAGINA): Promise<void> {
  const vivas = await chavesVivas();
  try {
    const s = armazem();
    if (!s) return;
    const propria = chaveDe(id, instancia);
    for (const chave of chavesDoModelo(s, id)) if (chave !== propria && !vivas.has(chave)) s.removeItem(chave);
  } catch {
    /* sem persistência */
  }
}
