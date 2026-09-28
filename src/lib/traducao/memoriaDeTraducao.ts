/**
 * MEMÓRIA DE TRADUÇÃO PERSISTENTE da legenda ao vivo (auditoria de eficiência da IA, 2026-09-28,
 * achado 2).
 *
 * O cache do cliente era só um `Map` de 300 entradas por aba: recarregar a página, ou abrir a
 * próxima sessão, esquecia "thank you", "let's go", "ok" — as frases que MAIS se repetem numa
 * conversa — e cada uma voltava a pagar uma chamada ao LLM (ou a esperar o opus-mt). Aqui fica a
 * camada de baixo: IndexedDB, até ~5.000 entradas, 30 dias de validade, sai primeiro a usada há mais
 * tempo. O `Map` da aba continua na frente, síncrono.
 *
 * DECISÕES (dado pessoal): a fala do microfone é dado da pessoa, e guardá-la por 30 dias é retenção.
 *  - Só entram falas de até 12 palavras (`MAX_PALAVRAS_GUARDADAS`). É onde está o ganho (frase
 *    curta se repete; frase longa quase nunca volta igual) e o que limita a retenção a expressões,
 *    não a relatos. Vale para o microfone E para o áudio do sistema, uma regra só.
 *  - Só a tradução do FINAL entra: a do parcial é de texto pela metade e, vinda do motor local, é a
 *    literal — guardá-la entregaria a quem paga a tradução que motivou a assinatura.
 *  - Tradução aproximada (MyMemory, "≈") não entra: o marcador se perderia e o erro ficaria 30 dias.
 *  - Modo anônimo/estático: permitido. O dado não sai do navegador, que é onde o anônimo já guarda
 *    tudo o que tem.
 *
 * RESILIÊNCIA: IndexedDB falha de verdade (aba privada do Firefox, cota, navegador antigo). Qualquer
 * falha troca o armazém pela versão em MEMÓRIA, com o mesmo contrato, e a legenda segue — a pessoa
 * só perde a persistência entre sessões. Nenhuma falha daqui chega à tela.
 */

/** Até quantas palavras uma fala é guardada entre sessões (ver DECISÕES acima). */
export const MAX_PALAVRAS_GUARDADAS = 12;
/** Até quantas palavras a fala vai ao tradutor SEM o contexto da conversa (a chave não depende dele). */
export const MAX_PALAVRAS_SEM_CONTEXTO = 4;
/** Validade de uma entrada. */
export const TTL_DA_MEMORIA_MS = 30 * 24 * 60 * 60 * 1000;
/** Teto de entradas; passado ele, saem as usadas há mais tempo. */
export const LIMITE_DA_MEMORIA = 5000;

export interface EntradaDaMemoria {
  texto: string;
  /** Motor que traduziu: quem paga pela nuvem não recebe da memória a tradução do motor local. */
  motor: string;
}

/** Contrato do armazém. Nunca rejeita: falhar é devolver `undefined` (leitura) ou não guardar. */
export interface ArmazemDeTraducoes {
  ler(chave: string): Promise<EntradaDaMemoria | undefined>;
  gravar(chave: string, texto: string, motor: string): Promise<void>;
}

export function contarPalavras(texto: string): number {
  const t = texto.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** A fala cabe na memória persistente? (até 12 palavras — ver DECISÕES.) */
export function deveGuardarNaMemoria(texto: string): boolean {
  const n = contarPalavras(texto);
  return n > 0 && n <= MAX_PALAVRAS_GUARDADAS;
}

interface Registro extends EntradaDaMemoria {
  chave: string;
  criadoEm: number;
  usadoEm: number;
}

interface OpcoesDoArmazem {
  agora?: () => number;
  limite?: number;
}

/**
 * Armazém em MEMÓRIA com o mesmo contrato do IndexedDB (validade, limite, recência). É o reserva do
 * IndexedDB e o que os testes usam; dura enquanto a aba durar.
 */
export function criarArmazemEmMemoria(opts: OpcoesDoArmazem = {}): ArmazemDeTraducoes {
  const agora = opts.agora ?? Date.now;
  const limite = opts.limite ?? LIMITE_DA_MEMORIA;
  // `Map` preserva a ordem de inserção: reinserir no uso deixa a mais antiga sempre na frente.
  const mapa = new Map<string, Registro>();
  return {
    async ler(chave) {
      const r = mapa.get(chave);
      if (!r) return undefined;
      const t = agora();
      mapa.delete(chave);
      if (t - r.criadoEm > TTL_DA_MEMORIA_MS) return undefined;
      mapa.set(chave, { ...r, usadoEm: t });
      return { texto: r.texto, motor: r.motor };
    },
    async gravar(chave, texto, motor) {
      const t = agora();
      mapa.delete(chave);
      mapa.set(chave, { chave, texto, motor, criadoEm: t, usadoEm: t });
      while (mapa.size > limite) {
        const velha = mapa.keys().next().value;
        if (velha === undefined) break;
        mapa.delete(velha);
      }
    },
  };
}

const NOME_DO_BANCO = 'babel-memoria-de-traducao';
const LOJA = 'traducoes';
/** Poda em lote: só quando passa do teto por esta folga, para não contar a loja a cada gravação. */
const FOLGA_DA_PODA = 100;

const pedido = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB: pedido falhou'));
  });

interface OpcoesDoIndexedDb extends OpcoesDoArmazem {
  /** A fábrica do IndexedDB (injeção para teste). `undefined` = não há IndexedDB. */
  fabrica?: IDBFactory;
}

/**
 * Armazém no IndexedDB. Abre o banco na primeira operação; qualquer falha (abrir, ler, gravar) troca
 * para o armazém em memória pelo resto da sessão, com um aviso no console — uma vez só.
 */
export function criarArmazemIndexedDb(opts: OpcoesDoIndexedDb): ArmazemDeTraducoes {
  const agora = opts.agora ?? Date.now;
  const limite = opts.limite ?? LIMITE_DA_MEMORIA;
  const reserva = criarArmazemEmMemoria(opts);
  let degradado = !opts.fabrica;
  let banco: Promise<IDBDatabase> | null = null;

  const degradar = (motivo: unknown) => {
    if (degradado) return;
    degradado = true;
    console.warn('[memória de tradução] IndexedDB indisponível; seguindo só em memória nesta sessão:', motivo);
  };

  const abrir = (): Promise<IDBDatabase> => {
    if (!banco) {
      banco = new Promise<IDBDatabase>((resolve, reject) => {
        const r = opts.fabrica!.open(NOME_DO_BANCO, 1);
        r.onupgradeneeded = () => {
          const loja = r.result.createObjectStore(LOJA, { keyPath: 'chave' });
          loja.createIndex('usadoEm', 'usadoEm');
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('IndexedDB: open falhou'));
        r.onblocked = () => reject(new Error('IndexedDB: open bloqueado por outra aba'));
      });
    }
    return banco;
  };

  const loja = async (modo: IDBTransactionMode) => (await abrir()).transaction(LOJA, modo).objectStore(LOJA);

  /** Tira as vencidas e, passado o teto, as usadas há mais tempo (pelo índice `usadoEm`). */
  const podar = async () => {
    const l = await loja('readwrite');
    const total = await pedido(l.count());
    if (total <= limite + FOLGA_DA_PODA) return;
    let sobra = total - limite;
    const t = agora();
    await new Promise<void>((resolve, reject) => {
      const cursor = l.index('usadoEm').openCursor();
      cursor.onerror = () => reject(cursor.error ?? new Error('IndexedDB: cursor falhou'));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        const r = c.value as Registro;
        if (sobra > 0 || t - r.criadoEm > TTL_DA_MEMORIA_MS) {
          c.delete();
          sobra--;
          c.continue();
        } else resolve();
      };
    });
  };

  return {
    async ler(chave) {
      if (degradado) return reserva.ler(chave);
      try {
        const l = await loja('readwrite');
        const r = (await pedido(l.get(chave))) as Registro | undefined;
        if (!r) return undefined;
        const t = agora();
        if (t - r.criadoEm > TTL_DA_MEMORIA_MS) {
          l.delete(chave);
          return undefined;
        }
        l.put({ ...r, usadoEm: t }); // recência: a usada agora é a última a sair
        return { texto: r.texto, motor: r.motor };
      } catch (e) {
        degradar(e);
        return reserva.ler(chave);
      }
    },
    async gravar(chave, texto, motor) {
      if (degradado) return reserva.gravar(chave, texto, motor);
      try {
        const t = agora();
        const l = await loja('readwrite');
        await pedido(l.put({ chave, texto, motor, criadoEm: t, usadoEm: t } satisfies Registro));
        await podar();
      } catch (e) {
        degradar(e);
        await reserva.gravar(chave, texto, motor);
      }
    },
  };
}

let padrao: ArmazemDeTraducoes | null = null;

/** O armazém da aplicação: IndexedDB quando há, memória quando não. Um por página. */
export function armazemPadrao(): ArmazemDeTraducoes {
  if (!padrao) {
    const fabrica = typeof indexedDB !== 'undefined' ? indexedDB : undefined;
    padrao = criarArmazemIndexedDb({ fabrica });
  }
  return padrao;
}
