/**
 * O ARMAZÉM LOCAL DO ÁUDIO DO CARTÃO (openspec `cartao-com-audio-do-trecho`, tarefa 2.2).
 *
 * Um clipe curto (Ogg Opus, ~25 KB) por cartão, SÓ NESTE APARELHO, no IndexedDB, no molde de
 * `lib/revisao/vozGuardada.ts`. NADA SOBE AO SERVIDOR: este módulo não fala com a rede (retenção zero
 * no servidor; a voz de quem falou fica com a pessoa).
 *
 * O que vale:
 *  · apagar o cartão apaga o clipe (`apagar`); trocar de conta (conta->conta, sair, ou entre recargas) apaga tudo:
 *    cada linha leva o id do DONO e `abrir`/`uso`/`gravar` descartam o que é de outro (linha sem dono, de antes desta
 *    regra, também sai); o ouvinte nasce no boot (`iniciarGuardaDoAudioDoCartao`), não no primeiro uso;
 *    "Apagar todos os áudios" é `apagarTudo`; "esquecer este navegador" e excluir a conta apagam o BANCO (`destruirBanco`);
 *  · teto de `TETO_BYTES` por aparelho: ao passar, o clipe mais antigo sai (expulsão por data de gravação);
 *  · sem IndexedDB (navegação privada, banco bloqueado) gravar devolve `false` e o cartão segue pelo caminho
 *    de hoje (trecho da sessão, depois a voz do aparelho);
 *  · a mesma interface serve a `cartao-com-captura-de-tela` (imagem), com outra loja.
 *
 * Exportação e exclusão de conta: o clipe mora no aparelho, então a exportação de dados da conta (LGPD art. 18)
 * não o inclui e "Excluir conta" não o alcança pelo servidor; quem apaga é o aparelho (troca de identidade, sair,
 * excluir conta, limpar o navegador e botão de Ajustes). Registro em `docs/lgpd/` fica na tarefa [D] 3.3.
 */
import { aoMudarDono, aoMudarIdentidade, donoDaIdentidade } from '../../identidade';

export interface ClipeGuardado {
  /** O áudio (Ogg Opus, ou WAV quando o navegador não tem Opus). */
  audio: Blob;
  /** Duração (ms). */
  durMs: number;
  /** Quando foi gravado (ms). */
  em: number;
}

interface Linha {
  cartao: string;
  em: number;
  durMs: number;
  tipo: string;
  bytes: ArrayBuffer;
  tamanho: number;
  /** O id da conta (ou `anonimo`/`selfhost`) que gravou. Sem ele, a linha é de antes desta regra e não é de ninguém. */
  dono?: string;
}

/** O teto por aparelho (200 MB): ~8.000 clipes de 25 KB. */
export const TETO_BYTES = 200 * 1024 * 1024;
/** Um clipe de 8 s em WAV 16 kHz/16 bits tem ~256 KB; acima disto não é um clipe desta tela. */
export const MAIOR_CLIPE_BYTES = 512 * 1024;

const BANCO = 'babel-audio-do-cartao';
const LOJA = 'clipes';

export interface ArmazemDeAudioDoCartao {
  /** Guarda (troca o do cartão, se houver). Devolve se guardou. Expulsa os mais antigos acima do teto. */
  gravar(cartao: string, clipe: { audio: Blob; durMs: number }): Promise<boolean>;
  abrir(cartao: string): Promise<ClipeGuardado | null>;
  apagar(cartao: string): Promise<void>;
  apagarTudo(): Promise<void>;
  /** Apaga o que é de outro dono (ou sem dono). Sem dono conhecido ainda, não mexe em nada. */
  purgarDeOutros(): Promise<void>;
  /** Apaga o banco inteiro (limpar o navegador, excluir a conta). */
  destruirBanco(): Promise<void>;
  /** Quantos clipes e quantos bytes (para os Ajustes e o diagnóstico). */
  uso(): Promise<{ clipes: number; bytes: number }>;
}

const pedido = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export function criarArmazemDeAudioDoCartao(
  o: {
    fabrica?: IDBFactory | null;
    agora?: () => number;
    teto?: number;
    dono?: () => string | null;
    /** Outro banco/loja e outro tamanho máximo por item: é como `cenaDoCartao` reaproveita este armazém (imagem). */
    banco?: string;
    maiorBytes?: number;
    tipoPadrao?: string;
  } = {},
): ArmazemDeAudioDoCartao {
  const fabrica = o.fabrica === undefined ? (globalThis.indexedDB ?? null) : o.fabrica;
  const agora = o.agora ?? (() => Date.now());
  const teto = o.teto ?? TETO_BYTES;
  const donoAtual = o.dono ?? donoDaIdentidade;
  const banco = o.banco ?? BANCO;
  const maiorBytes = o.maiorBytes ?? MAIOR_CLIPE_BYTES;
  const tipoPadrao = o.tipoPadrao ?? 'audio/ogg';
  let aberto: Promise<IDBDatabase | null> | null = null;

  const abrirBanco = (): Promise<IDBDatabase | null> => {
    if (!fabrica) return Promise.resolve(null);
    aberto ??= new Promise<IDBDatabase | null>((ok) => {
      try {
        const r = fabrica.open(banco, 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore(LOJA, { keyPath: 'cartao' });
        };
        r.onsuccess = () => {
          /* Outra aba que apague o banco não fica esperando esta conexão. */
          r.result.onversionchange = () => {
            r.result.close();
            aberto = null;
          };
          ok(r.result);
        };
        r.onerror = () => ok(null);
        r.onblocked = () => ok(null);
      } catch {
        ok(null);
      }
    });
    return aberto;
  };

  const todas = async (db: IDBDatabase): Promise<Linha[]> =>
    (await pedido(db.transaction(LOJA, 'readonly').objectStore(LOJA).getAll())) as Linha[];

  /** Tira as linhas que não são de `dono` e devolve as que são. */
  const soDoDono = async (db: IDBDatabase, dono: string): Promise<Linha[]> => {
    const linhas = await todas(db);
    const alheias = linhas.filter((l) => l.dono !== dono);
    if (alheias.length) {
      const loja = db.transaction(LOJA, 'readwrite').objectStore(LOJA);
      for (const l of alheias) void loja.delete(l.cartao);
    }
    return linhas.filter((l) => l.dono === dono);
  };

  return {
    async gravar(cartao, clipe) {
      try {
        const dono = donoAtual();
        if (!dono) return false;
        if (!cartao || !clipe.audio.size || clipe.audio.size > maiorBytes) return false;
        const db = await abrirBanco();
        if (!db) return false;
        const bytes = await clipe.audio.arrayBuffer();
        const linha: Linha = {
          cartao,
          em: agora(),
          durMs: Math.round(clipe.durMs),
          tipo: clipe.audio.type || tipoPadrao,
          bytes,
          tamanho: bytes.byteLength,
          dono,
        };
        /* A expulsão conta o clipe novo: sai(m) o(s) mais antigo(s) até caber no teto. */
        const outras = (await soDoDono(db, dono)).filter((l) => l.cartao !== cartao).sort((a, b) => a.em - b.em);
        let total = outras.reduce((s, l) => s + l.tamanho, 0) + linha.tamanho;
        const loja = db.transaction(LOJA, 'readwrite').objectStore(LOJA);
        for (const l of outras) {
          if (total <= teto) break;
          void loja.delete(l.cartao);
          total -= l.tamanho;
        }
        await pedido(loja.put(linha));
        return true;
      } catch {
        return false;
      }
    },
    async abrir(cartao) {
      try {
        const dono = donoAtual();
        if (!dono) return null;
        const db = await abrirBanco();
        if (!db) return null;
        const l = (await pedido(db.transaction(LOJA, 'readonly').objectStore(LOJA).get(cartao))) as Linha | undefined;
        if (l && l.dono !== dono) {
          /* De outra conta (ou de antes da regra): não se mostra, e sai agora. */
          await pedido(db.transaction(LOJA, 'readwrite').objectStore(LOJA).delete(cartao));
          return null;
        }
        return l ? { audio: new Blob([l.bytes], { type: l.tipo }), durMs: l.durMs, em: l.em } : null;
      } catch {
        return null;
      }
    },
    async apagar(cartao) {
      try {
        const db = await abrirBanco();
        if (!db) return;
        await pedido(db.transaction(LOJA, 'readwrite').objectStore(LOJA).delete(cartao));
      } catch {
        /* nada guardado, nada a apagar */
      }
    },
    async apagarTudo() {
      try {
        const db = await abrirBanco();
        if (!db) return;
        await pedido(db.transaction(LOJA, 'readwrite').objectStore(LOJA).clear());
      } catch {
        /* idem */
      }
    },
    async purgarDeOutros() {
      try {
        const dono = donoAtual();
        if (!dono) return;
        const db = await abrirBanco();
        if (db) await soDoDono(db, dono);
      } catch {
        /* idem */
      }
    },
    async destruirBanco() {
      try {
        const db = await abrirBanco();
        db?.close();
        aberto = null;
        if (!fabrica) return;
        await new Promise<void>((ok) => {
          const r = fabrica.deleteDatabase(banco);
          r.onsuccess = () => ok();
          r.onerror = () => ok();
          r.onblocked = () => ok();
        });
      } catch {
        /* idem */
      }
    },
    async uso() {
      try {
        const dono = donoAtual();
        if (!dono) return { clipes: 0, bytes: 0 };
        const db = await abrirBanco();
        if (!db) return { clipes: 0, bytes: 0 };
        const linhas = await soDoDono(db, dono);
        return { clipes: linhas.length, bytes: linhas.reduce((s, l) => s + l.tamanho, 0) };
      } catch {
        return { clipes: 0, bytes: 0 };
      }
    },
  };
}

let doAparelho: ArmazemDeAudioDoCartao | null = null;
let guardaIniciada = false;

/**
 * O armazém deste aparelho. O ouvinte de troca de dono nasce JUNTO (e no boot do app, `main.tsx`), não só no primeiro
 * uso: sem ele, quem troca de conta antes de abrir os Ajustes herdaria o áudio da conta anterior.
 */
export function armazemDeAudioDoCartao(): ArmazemDeAudioDoCartao {
  doAparelho ??= criarArmazemDeAudioDoCartao();
  iniciarGuardaDoAudioDoCartao();
  return doAparelho;
}

/** Registra cedo (idempotente) o que apaga o áudio quando a identidade ou a conta muda. Não abre o IndexedDB. */
export function iniciarGuardaDoAudioDoCartao(): void {
  if (guardaIniciada || typeof window === 'undefined') return;
  guardaIniciada = true;
  doAparelho ??= criarArmazemDeAudioDoCartao();
  const armazem = doAparelho;
  /* Conta -> sem conta (sair) e qualquer troca de estado depois de carregado. */
  aoMudarIdentidade((depois, antes) => {
    if (antes !== 'carregando' && antes !== depois) void armazem.apagarTudo();
    else void armazem.purgarDeOutros();
  });
  /* Conta -> conta, sair, e a primeira conta conhecida depois de uma recarga (aí só sai o que não é dela). */
  aoMudarDono((_depois, antes) => {
    if (antes !== null) void armazem.apagarTudo();
    else void armazem.purgarDeOutros();
  });
}

/** Apaga o banco do áudio (limpar o navegador, excluir a conta). Nunca lança. */
export async function destruirBancoDoAudioDoCartao(): Promise<void> {
  await (doAparelho ?? criarArmazemDeAudioDoCartao()).destruirBanco();
}

/** Só para testes: esquece o armazém e o registro do ouvinte. */
export function _reiniciarGuardaDoAudioDoCartao(): void {
  doAparelho = null;
  guardaIniciada = false;
}
