/**
 * A VOZ DA NUVEM GUARDADA NO APARELHO — a mesma frase não é sintetizada nem cobrada duas vezes
 * (auditoria do servidor de 10/10/2026, achado A9).
 *
 * `POST /api/ai/tts` responde `no-store`, e a única memória do cliente era a da ÚLTIMA fala (o
 * Repetir). A mesma palavra ouvida de novo dali a pouco, ou amanhã, voltava ao provedor: outra
 * síntese paga e outro desconto na cota de quem ouve.
 *
 * O QUE FICA GUARDADO: o áudio que o servidor devolveu, no IndexedDB deste navegador, pela chave
 * SHA-256 de (texto, idioma, voz, velocidade). O texto em si não é guardado, só o resumo dele.
 *
 * OS LIMITES. 12 MB no total e 14 dias por áudio: ao guardar, sai o que venceu e depois o mais
 * antigo, até caber. Áudio de mais de 1 MB não entra (não é uma palavra nem uma frase). Trocar de
 * conta (ou sair dela) apaga tudo: o áudio é de quem o ouviu.
 *
 * NUNCA ATRAPALHA A FALA. Sem IndexedDB, sem `crypto.subtle` (página sem HTTPS), banco bloqueado ou
 * cheio: toda operação devolve "não tenho" e a voz segue pelo caminho de sempre, a rede.
 */
import { registrarArmazemPorConta } from '../armazemLocalPorConta';
import { donoDaIdentidade } from '../identidade';

/** O que identifica um áudio: muda qualquer um, é outro áudio. */
export interface PedidoDeVoz {
  texto: string;
  idioma: string;
  /** A voz pedida ao servidor; vazia = a padrão do idioma. */
  voz?: string;
  /** A velocidade pedida; 1 (ou ausente) = a do modelo. */
  velocidade?: number;
}

export interface GuardadosDaVoz {
  ler(pedido: PedidoDeVoz): Promise<Blob | null>;
  guardar(pedido: PedidoDeVoz, audio: Blob): Promise<void>;
  limpar(): Promise<void>;
}

export const TETO_DO_CACHE_DE_VOZ_BYTES = 12 * 1024 * 1024;
export const VALIDADE_DO_CACHE_DE_VOZ_MS = 14 * 24 * 60 * 60 * 1000;
/** Acima disto o áudio não é guardado. */
export const MAIOR_AUDIO_GUARDADO_BYTES = 1024 * 1024;

const BANCO = 'babel-voz';
const AUDIOS = 'audios';
const INDICE = 'indice';

interface AudioGuardado {
  bytes: ArrayBuffer;
  tipo: string;
}
interface LinhaDoIndice {
  chave: string;
  tamanho: number;
  em: number;
}

export interface OpcoesDoCacheDeVoz {
  /** O IndexedDB a usar (padrão: o do navegador; `null` = sem cache). Os testes trocam. */
  fabrica?: IDBFactory | null;
  agora?: () => number;
  tetoBytes?: number;
  validadeMs?: number;
}

/** SHA-256 em hexadecimal; `null` onde não há `crypto.subtle` (página sem HTTPS, navegador antigo). */
export async function chaveDoPedidoDeVoz(p: PedidoDeVoz): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const velocidade = p.velocidade && p.velocidade !== 1 ? p.velocidade : 1;
  const dados = new TextEncoder().encode(JSON.stringify([p.texto, p.idioma, p.voz ?? '', velocidade]));
  const resumo = new Uint8Array(await subtle.digest('SHA-256', dados));
  let hex = '';
  for (const b of resumo) hex += b.toString(16).padStart(2, '0');
  return hex;
}

const pedido = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
const fim = (t: IDBTransaction): Promise<void> =>
  new Promise((ok, falha) => {
    t.oncomplete = () => ok();
    t.onerror = () => falha(t.error);
    t.onabort = () => falha(t.error);
  });

export function criarCacheDeVoz(o: OpcoesDoCacheDeVoz = {}): GuardadosDaVoz {
  const fabrica = o.fabrica === undefined ? (typeof indexedDB === 'undefined' ? null : indexedDB) : o.fabrica;
  const agora = o.agora ?? (() => Date.now());
  const teto = o.tetoBytes ?? TETO_DO_CACHE_DE_VOZ_BYTES;
  const validade = o.validadeMs ?? VALIDADE_DO_CACHE_DE_VOZ_MS;

  let banco: Promise<IDBDatabase | null> | null = null;
  const abrir = (): Promise<IDBDatabase | null> => {
    if (!fabrica) return Promise.resolve(null);
    banco ??= new Promise<IDBDatabase | null>((ok) => {
      try {
        const r = fabrica.open(BANCO, 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore(AUDIOS);
          r.result.createObjectStore(INDICE, { keyPath: 'chave' });
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ok(null);
        r.onblocked = () => ok(null);
      } catch {
        ok(null);
      }
    });
    return banco;
  };

  return {
    async ler(p) {
      try {
        const [db, chave] = await Promise.all([abrir(), chaveDoPedidoDeVoz(p)]);
        if (!db || !chave) return null;
        const t = db.transaction([AUDIOS, INDICE], 'readonly');
        const [linha, audio] = await Promise.all([
          pedido(t.objectStore(INDICE).get(chave) as IDBRequest<LinhaDoIndice | undefined>),
          pedido(t.objectStore(AUDIOS).get(chave) as IDBRequest<AudioGuardado | undefined>),
        ]);
        if (!linha || !audio || agora() - linha.em >= validade) return null;
        return new Blob([audio.bytes], { type: audio.tipo });
      } catch {
        return null;
      }
    },

    async guardar(p, audio) {
      try {
        if (!audio.size || audio.size > MAIOR_AUDIO_GUARDADO_BYTES || audio.size > teto) return;
        const [db, chave, bytes] = await Promise.all([abrir(), chaveDoPedidoDeVoz(p), audio.arrayBuffer()]);
        if (!db || !chave) return;
        const t = db.transaction([AUDIOS, INDICE], 'readwrite');
        const indice = t.objectStore(INDICE);
        const audios = t.objectStore(AUDIOS);
        const linhas = (await pedido(indice.getAll() as IDBRequest<LinhaDoIndice[]>)).filter((l) => l.chave !== chave);
        const tirar = (l: LinhaDoIndice) => {
          indice.delete(l.chave);
          audios.delete(l.chave);
        };
        /* Primeiro o que venceu; depois o mais antigo, até o novo caber. */
        const vivos = linhas.filter((l) => {
          const venceu = agora() - l.em >= validade;
          if (venceu) tirar(l);
          return !venceu;
        });
        vivos.sort((a, b) => a.em - b.em);
        let total = vivos.reduce((soma, l) => soma + l.tamanho, 0);
        while (vivos.length && total + audio.size > teto) {
          const maisAntigo = vivos.shift() as LinhaDoIndice;
          total -= maisAntigo.tamanho;
          tirar(maisAntigo);
        }
        audios.put({ bytes, tipo: audio.type } satisfies AudioGuardado, chave);
        indice.put({ chave, tamanho: audio.size, em: agora() } satisfies LinhaDoIndice);
        await fim(t);
      } catch {
        /* cota do navegador, banco fechado: a fala já foi lida, nada a fazer */
      }
    },

    async limpar() {
      try {
        const db = await abrir();
        if (!db) return;
        const t = db.transaction([AUDIOS, INDICE], 'readwrite');
        t.objectStore(AUDIOS).clear();
        t.objectStore(INDICE).clear();
        await fim(t);
      } catch {
        /* idem */
      }
    },
  };
}

let doAparelho: GuardadosDaVoz | null | undefined;

export const CHAVE_DO_DONO_DO_CACHE_DE_VOZ = 'babel.cacheDeVoz.dono';

/**
 * O cache não tem dono por linha (a chave é um resumo e o áudio é sintético), então o dono é do cache INTEIRO, numa
 * chave: antes de ler, gravar ou purgar, se o dono guardado for outro (ou não houver), o cache é esvaziado e o dono novo
 * é gravado. Sem dono conhecido (identidade carregando), não lê nem grava.
 */
export function comDonoDoCache(cache: GuardadosDaVoz, dono: () => string | null = donoDaIdentidade) {
  const garantir = async (): Promise<boolean> => {
    const atual = dono();
    if (!atual) return false;
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(CHAVE_DO_DONO_DO_CACHE_DE_VOZ);
    } catch {
      /* sem armazenamento: não há como provar o dono, então o cache é esvaziado a cada troca de leitura */
    }
    if (guardado === atual) return true;
    await cache.limpar();
    try {
      localStorage.setItem(CHAVE_DO_DONO_DO_CACHE_DE_VOZ, atual);
    } catch {
      return false; // sem como guardar o dono, o cache não é usado
    }
    return true;
  };
  return {
    async ler(p: PedidoDeVoz) {
      return (await garantir()) ? cache.ler(p) : null;
    },
    async guardar(p: PedidoDeVoz, audio: Blob) {
      if (await garantir()) await cache.guardar(p, audio);
    },
    limpar: cache.limpar,
    async purgarDeOutros() {
      await garantir();
    },
  };
}

/* Apaga tudo ao sair/trocar de conta, limpar tudo e excluir a conta (guarda comum, `lib/armazemLocalPorConta`); o dono do
   cache fecha o caso da recarga com outra conta. */
const limparDoAparelho = async () => {
  await cacheDeVozDoAparelho()?.limpar();
  try {
    localStorage.removeItem(CHAVE_DO_DONO_DO_CACHE_DE_VOZ);
  } catch {
    /* nada guardado */
  }
};
registrarArmazemPorConta({
  nome: 'cache-de-voz',
  apagarTudo: limparDoAparelho,
  purgarDeOutros: () => (cacheDeVozDoAparelho() as ReturnType<typeof comDonoDoCache> | null)?.purgarDeOutros(),
  destruir: limparDoAparelho,
});

/**
 * O cache deste navegador (um só), ou `null` onde não dá para guardar (sem IndexedDB, sem
 * `crypto.subtle`): aí a voz nem pergunta por ele. Trocar de conta, ou sair dela, apaga o que estava
 * guardado.
 */
export function cacheDeVozDoAparelho(): GuardadosDaVoz | null {
  if (doAparelho === undefined) {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
      doAparelho = null;
      return null;
    }
    doAparelho = comDonoDoCache(criarCacheDeVoz());
  }
  return doAparelho;
}
