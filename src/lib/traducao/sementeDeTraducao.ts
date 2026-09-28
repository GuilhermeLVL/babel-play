/**
 * SEMENTE DA MEMÓRIA DE TRADUÇÃO: frases curtas e frequentes do Tatoeba, já traduzidas por gente
 * (harness adaptativo §1.2, degrau M2). A memória do usuário começa vazia; a semente faz o "Thank
 * you." e o "Good morning." da PRIMEIRA sessão já saírem sem motor nenhum.
 *
 * SÓ LEITURA E ATRÁS DA MEMÓRIA DO USUÁRIO (`memoriaEmCamadas.ts`): a tradução que a pessoa já
 * recebeu e aceitou vence a do Tatoeba. Nada do que ela fala entra aqui.
 *
 * PREGUIÇOSA E FORA DO BUNDLE: o arquivo mora em `public/semente-traducao/<a>-<b>.tsv` (gerado por
 * `scripts/semente-traducao/gerar.mjs`) e só é pedido na primeira busca daquele par. A busca que
 * dispara o download NÃO espera por ele — responde "não sei" e segue para o tradutor —, então a
 * rede lenta ou ausente nunca atrasa uma legenda. Um arquivo serve às duas direções (`en-pt` atende
 * `en→pt` e `pt→en`).
 *
 * QUEM PAGA PELA NUVEM não recebe a semente: o motor dela (`tatoeba`) não está na lista de motores
 * de nuvem que `traducaoDaFala.ts` aceita da memória. É tradução humana, mas de uma frase fora de
 * contexto (o "you" do Tatoeba não sabe se é "você" ou "vocês"); o grátis ganha, o pago segue igual.
 *
 * LICENÇA: Tatoeba, CC BY 2.0 FR — atribuição obrigatória. Vai no cabeçalho de cada arquivo e na
 * tela Sobre (`atribuicaoTatoeba.ts`, traduzida pelo i18n).
 */
import { criarIndiceAproximado, diferencaSegura, separarChave } from './memoriaAproximada';
import type { ResultadoDaMemoria } from './memoriaDeTraducao';
import { chaveNormalizada } from './prepararFala';

/** O "motor" das entradas da semente, para a regra de quem aceita o quê. */
export const MOTOR_DA_SEMENTE = 'tatoeba';

/** Os arquivos publicados, um por par sem direção. */
export const PARES_DA_SEMENTE: readonly string[] = ['en-pt', 'es-pt'];

const RAIZ = '/semente-traducao';

/**
 * Os pares `origem \t destino` do TSV, UM A UM (sem `split` do arquivo inteiro): `#` abre comentário
 * (o cabeçalho de atribuição) e linha sem os dois lados é ignorada.
 */
export function* linhasDaSemente(tsv: string): Generator<[string, string]> {
  let i = 0;
  while (i < tsv.length) {
    const fim = tsv.indexOf('\n', i);
    const linha = tsv.slice(i, fim === -1 ? tsv.length : fim);
    i = fim === -1 ? tsv.length : fim + 1;
    if (!linha || linha.startsWith('#')) continue;
    const tab = linha.indexOf('\t');
    if (tab < 0) continue;
    const a = linha.slice(0, tab).trim();
    const b = linha
      .slice(tab + 1)
      .split('\t')[0]
      .trim();
    if (a && b) yield [a, b];
  }
}

/** `origem \t destino` por linha; `#` abre comentário (o cabeçalho de atribuição). */
export function lerSementeTsv(tsv: string): Array<[string, string]> {
  return [...linhasDaSemente(tsv)];
}

/**
 * Teto de uma fatia de trabalho na thread principal. Abaixo dos 16,7 ms de um quadro com folga
 * para o React pintar a legenda no mesmo quadro — e longe dos 50 ms de uma long task.
 */
export const ORCAMENTO_DA_FATIA_MS = 8;

export interface OpcoesDasFatias {
  orcamentoMs?: number;
  agora?: () => number;
  /** Devolve a thread (padrão: `scheduler.yield()` onde existe, senão um `setTimeout(0)`). */
  ceder?: () => Promise<void>;
  /** Olhar o relógio a cada N itens (padrão 1: o item da semente custa microssegundos, o relógio menos). */
  checarACada?: number;
}

function cederPadrao(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof s?.yield === 'function') return s.yield();
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Faz `fazer(item)` para cada item em FATIAS de até `orcamentoMs`, cedendo a thread entre elas.
 * Devolve quantas fatias usou. O erro de `fazer` sobe.
 */
export async function processarEmFatias<T>(
  itens: Iterable<T>,
  fazer: (item: T) => void,
  o: OpcoesDasFatias = {},
): Promise<number> {
  const orcamento = o.orcamentoMs ?? ORCAMENTO_DA_FATIA_MS;
  const agora = o.agora ?? (() => performance.now());
  const ceder = o.ceder ?? cederPadrao;
  const aCada = Math.max(1, o.checarACada ?? 1);
  let fatias = 1;
  let inicio = agora();
  let n = 0;
  for (const item of itens) {
    fazer(item);
    if (++n % aCada !== 0 || agora() - inicio < orcamento) continue;
    await ceder();
    fatias += 1;
    inicio = agora();
  }
  return fatias;
}

/** Espera o ocioso (com teto), ou um temporizador onde `requestIdleCallback` não existe (Safari). */
function agendarNoOcioso(f: () => void): void {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => unknown };
  if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(f, { timeout: 3000 });
  else setTimeout(f, 1500);
}

async function baixarSemente(par: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${RAIZ}/${par}.tsv`);
    return r.ok ? await r.text() : undefined;
  } catch {
    return undefined; // offline: a semente só não ajuda nesta sessão
  }
}

export interface OpcoesDaBuscaNaSemente {
  limiar: number;
  consultaOriginal?: string;
}

export interface SementeDeTraducao {
  /** A frase exata. `undefined` também enquanto o par ainda baixa (e aí começa a baixar). */
  exata(chave: string): Promise<ResultadoDaMemoria | undefined>;
  /** A frase parecida o bastante e com diferença segura (ver `memoriaAproximada.ts`). */
  aproximada(chave: string, opts: OpcoesDaBuscaNaSemente): Promise<ResultadoDaMemoria | undefined>;
}

interface OpcoesDaSemente {
  /** Quem busca o TSV de um par (`en-pt`). Injeção para teste; o padrão é `fetch` em `public/`. */
  carregar?: (par: string) => Promise<string | undefined>;
  /** Quando começar o download + montagem (padrão: no ocioso, depois da primeira legenda). */
  agendar?: (f: () => void) => void;
  /** Relógio e cessão das fatias da montagem (injeção para teste). */
  agora?: () => number;
  ceder?: () => Promise<void>;
}

export function criarSemente(opts: OpcoesDaSemente = {}): SementeDeTraducao {
  const carregar = opts.carregar ?? baixarSemente;
  const agendar = opts.agendar ?? agendarNoOcioso;
  const traducoes = new Map<string, string>();
  const indice = criarIndiceAproximado();
  const pedidos = new Set<string>();
  /** Arquivos com o índice INTEIRO montado: antes disso a busca não acha nada na semente. */
  const montados = new Set<string>();

  const guardar = (a: string, b: string, origem: string, destino: string) => {
    const chave = `${a}|${b}|${chaveNormalizada(origem)}`;
    // Primeira vence: o gerador ordena da frase mais frequente para a menos.
    if (traducoes.has(chave)) return;
    traducoes.set(chave, destino);
    indice.adicionar(chave);
  };

  /**
   * O arquivo que cobre a chave, disparando a carga na primeira vez. `true` = índice inteiro pronto.
   *
   * FORA DO CAMINHO DA LEGENDA (Quest emulado, 2026-09-28): a primeira busca vem da primeira fala, e
   * o parse + o índice aproximado do TSV (430 KB) de uma vez só travavam a thread principal por
   * 1,3–1,6 s no meio dela. Agora a carga espera o OCIOSO (a legenda já pintou) e a montagem vai em
   * fatias de ~8 ms; até acabar, a semente só não acha nada e a cascata segue para o tradutor.
   */
  const pronto = (chave: string): boolean => {
    const [a, b] = separarChave(chave).par.split('|');
    const arquivo = PARES_DA_SEMENTE.find((p) => p === `${a}-${b}` || p === `${b}-${a}`);
    if (!arquivo) return false;
    if (!pedidos.has(arquivo)) {
      pedidos.add(arquivo);
      const [x, y] = arquivo.split('-');
      agendar(() => {
        void carregar(arquivo)
          .then((tsv) =>
            processarEmFatias(
              linhasDaSemente(tsv ?? ''),
              ([ox, oy]) => {
                guardar(x, y, ox, oy);
                guardar(y, x, oy, ox);
              },
              { agora: opts.agora, ceder: opts.ceder },
            ),
          )
          .then(
            () => void montados.add(arquivo),
            () => {
              /* TSV com defeito: a semente só não ajuda nesta sessão */
            },
          );
      });
      return false;
    }
    return montados.has(arquivo);
  };

  const resultado = (texto: string, aproximada: boolean, similaridade: number): ResultadoDaMemoria => ({
    texto,
    motor: MOTOR_DA_SEMENTE,
    aproximada,
    similaridade,
    camada: 'semente',
  });

  return {
    async exata(chave) {
      if (!pronto(chave)) return undefined;
      const t = traducoes.get(chave);
      return t === undefined ? undefined : resultado(t, false, 1);
    },
    async aproximada(chave, { limiar, consultaOriginal }) {
      if (!pronto(chave)) return undefined;
      const { texto } = separarChave(chave);
      for (const v of indice.buscar(chave, limiar).slice(0, 5)) {
        const t = traducoes.get(v.chave);
        if (t === undefined) continue;
        if (diferencaSegura(texto, separarChave(v.chave).texto, { consultaOriginal, traducaoCandidata: t }))
          return resultado(t, true, v.similaridade);
      }
      return undefined;
    },
  };
}
