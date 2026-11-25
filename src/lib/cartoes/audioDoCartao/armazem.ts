/**
 * O ARMAZÉM LOCAL DO ÁUDIO DO CARTÃO (openspec `cartao-com-audio-do-trecho`, tarefa 2.2).
 *
 * Um clipe curto (Ogg Opus, ~25 KB) por cartão, SÓ NESTE APARELHO, no IndexedDB, no molde de
 * `lib/revisao/vozGuardada.ts`. NADA SOBE AO SERVIDOR: este módulo não fala com a rede (retenção zero
 * no servidor; a voz de quem falou fica com a pessoa).
 *
 * O que vale:
 *  · apagar o cartão apaga o clipe (`apagar`); trocar de conta neste aparelho apaga tudo
 *    (`aoMudarIdentidade`); "Apagar todos os áudios" é `apagarTudo`;
 *  · teto de `TETO_BYTES` por aparelho: ao passar, o clipe mais antigo sai (expulsão por data de gravação);
 *  · sem IndexedDB (navegação privada, banco bloqueado) gravar devolve `false` e o cartão segue pelo caminho
 *    de hoje (trecho da sessão, depois a voz do aparelho);
 *  · a mesma interface serve a `cartao-com-captura-de-tela` (imagem), com outra loja.
 *
 * Exportação e exclusão de conta: o clipe mora no aparelho, então a exportação de dados da conta (LGPD art. 18)
 * não o inclui e "Excluir conta" não o alcança pelo servidor; quem apaga é `apagarTudo` (troca de identidade e
 * botão de Ajustes). Registro em `docs/lgpd/` fica na tarefa [D] 3.3.
 */
import { aoMudarIdentidade } from '../../identidade';

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
  /** Quantos clipes e quantos bytes (para os Ajustes e o diagnóstico). */
  uso(): Promise<{ clipes: number; bytes: number }>;
}

const pedido = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export function criarArmazemDeAudioDoCartao(
  o: { fabrica?: IDBFactory | null; agora?: () => number; teto?: number } = {},
): ArmazemDeAudioDoCartao {
  const fabrica = o.fabrica === undefined ? (globalThis.indexedDB ?? null) : o.fabrica;
  const agora = o.agora ?? (() => Date.now());
  const teto = o.teto ?? TETO_BYTES;
  let aberto: Promise<IDBDatabase | null> | null = null;

  const abrirBanco = (): Promise<IDBDatabase | null> => {
    if (!fabrica) return Promise.resolve(null);
    aberto ??= new Promise<IDBDatabase | null>((ok) => {
      try {
        const r = fabrica.open(BANCO, 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore(LOJA, { keyPath: 'cartao' });
        };
        r.onsuccess = () => ok(r.result);
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

  return {
    async gravar(cartao, clipe) {
      try {
        if (!cartao || !clipe.audio.size || clipe.audio.size > MAIOR_CLIPE_BYTES) return false;
        const db = await abrirBanco();
        if (!db) return false;
        const bytes = await clipe.audio.arrayBuffer();
        const linha: Linha = {
          cartao,
          em: agora(),
          durMs: Math.round(clipe.durMs),
          tipo: clipe.audio.type || 'audio/ogg',
          bytes,
          tamanho: bytes.byteLength,
        };
        /* A expulsão conta o clipe novo: sai(m) o(s) mais antigo(s) até caber no teto. */
        const outras = (await todas(db)).filter((l) => l.cartao !== cartao).sort((a, b) => a.em - b.em);
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
        const db = await abrirBanco();
        if (!db) return null;
        const l = (await pedido(db.transaction(LOJA, 'readonly').objectStore(LOJA).get(cartao))) as Linha | undefined;
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
    async uso() {
      try {
        const db = await abrirBanco();
        if (!db) return { clipes: 0, bytes: 0 };
        const linhas = await todas(db);
        return { clipes: linhas.length, bytes: linhas.reduce((s, l) => s + l.tamanho, 0) };
      } catch {
        return { clipes: 0, bytes: 0 };
      }
    },
  };
}

let doAparelho: ArmazemDeAudioDoCartao | null = null;

/** O armazém deste aparelho. Trocar de conta apaga tudo (o áudio de uma pessoa não espera a próxima conta). */
export function armazemDeAudioDoCartao(): ArmazemDeAudioDoCartao {
  if (!doAparelho) {
    const armazem = criarArmazemDeAudioDoCartao();
    doAparelho = armazem;
    if (typeof window !== 'undefined')
      aoMudarIdentidade((_depois, antes) => {
        if (antes !== 'carregando') void armazem.apagarTudo();
      });
  }
  return doAparelho;
}
