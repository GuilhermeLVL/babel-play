/**
 * O CÓDIGO DA TELA CHEGA ANTES DE ELA SER PEDIDA (auditoria de desempenho de 10/10/2026, G6).
 *
 * Cada tela é um pedaço à parte (`App.tsx`), e o navegador só o pedia quando o React a montava: depois
 * do toque, depois dos 150 ms da saída da tela de antes (`telas.ts`). Na primeira visita, no 4G, o
 * conteúdo levava de 0,6 a 1,5 s para aparecer; na segunda, 0,3 s. A diferença era só a espera do arquivo.
 *
 * Agora o pedido sai mais cedo, e a transição na tela é a mesma (a saída de 150 ms continua lá; ela só
 * deixa de ser tempo parado):
 *   - no toque (`pointerdown`) do item do menu, antes mesmo de o clique terminar, e no foco do teclado;
 *   - com o navegador ocioso depois da carga, um destino do menu por vez.
 * O que é palpite (o ocioso, o foco do teclado) não acontece com a economia de dados ligada nem em
 * conexão lenta; o toque é a própria navegação, e o arquivo seria pedido de qualquer jeito.
 *
 * Quem decide QUAIS telas pedir é o menu (`TrilhoDoQuest`): ele sabe o que o toque vai abrir de verdade
 * (sem conta, a Biblioteca abre um convite, e o pedaço dela não desce).
 */

type Carregador = () => Promise<unknown>;

const carregadores = new Map<string, Carregador>();
const pedidas = new Set<string>();

/** `App.tsx` diz qual `import()` é de qual tela (o mesmo que o `lazy` dela usa). */
export function registrarTelas(mapa: Readonly<Record<string, Carregador>>): void {
  for (const [rota, carregar] of Object.entries(mapa)) carregadores.set(rota, carregar);
}

interface Conexao {
  saveData?: boolean;
  effectiveType?: string;
}

/** A pessoa pediu economia de dados, ou a conexão é lenta (2G e 3G na conta do navegador). */
export function conexaoPoupada(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: Conexao }).connection;
  if (!c) return false;
  return c.saveData === true || /^(slow-2g|2g|3g)$/.test(c.effectiveType ?? '');
}

/**
 * Pede o pedaço de uma tela, uma vez. `palpite`: a pessoa ainda não escolheu a tela (foco do teclado,
 * ocioso), então a economia de dados e a conexão lenta mandam não pedir. Devolve a promessa do pedido
 * (ou `null` se nada foi pedido agora); a falha não sobe: quem monta a tela pede de novo e trata.
 */
export function pedirTela(rota: string, palpite = false): Promise<void> | null {
  const carregar = carregadores.get(rota);
  if (!carregar || pedidas.has(rota)) return null;
  if (palpite && conexaoPoupada()) return null;
  pedidas.add(rota);
  const falhou = () => void pedidas.delete(rota);
  try {
    return carregar().then(() => undefined, falhou);
  } catch {
    falhou();
    return null;
  }
}

type ComOcioso = typeof globalThis & {
  requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Quanto o ocioso pode esperar antes de rodar assim mesmo, em ms. */
const TETO_DO_OCIOSO = 4000;

/**
 * Com o navegador ocioso depois da carga, pede os pedaços de `rotas`, um por vez (o seguinte só depois
 * de o anterior chegar e de outro ocioso). Devolve como cancelar.
 */
export function precarregarNoOcioso(rotas: readonly string[]): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const g = globalThis as ComOcioso;
  const fila = [...rotas];
  let vivo = true;
  let ocioso = 0;
  let relogio = 0;
  const agendar = () => {
    if (!vivo || !fila.length) return;
    if (typeof g.requestIdleCallback === 'function') ocioso = g.requestIdleCallback(proxima, { timeout: TETO_DO_OCIOSO });
    else relogio = window.setTimeout(proxima, 1200);
  };
  const proxima = () => {
    ocioso = 0;
    relogio = 0;
    if (!vivo) return;
    const rota = fila.shift();
    if (rota === undefined) return;
    const pedido = pedirTela(rota, true);
    if (pedido) void pedido.then(agendar);
    else agendar();
  };
  const comecar = () => {
    window.removeEventListener('load', comecar);
    agendar();
  };
  if (document.readyState === 'complete') agendar();
  else window.addEventListener('load', comecar);
  return () => {
    vivo = false;
    window.removeEventListener('load', comecar);
    if (ocioso) g.cancelIdleCallback?.(ocioso);
    if (relogio) window.clearTimeout(relogio);
  };
}

/** Só para os testes: esquece o que foi registrado e pedido. */
export function zerarPrecargaParaTeste(): void {
  carregadores.clear();
  pedidas.clear();
}
