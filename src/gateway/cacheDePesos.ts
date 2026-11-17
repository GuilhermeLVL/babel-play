/**
 * O CACHE DE PESOS QUE SE CONFERE E SE CURA (change `modelos-confiaveis-e-offline`, DISP-01).
 *
 * A transformers.js grava no Cache Storage o que o `fetch` devolver, sem conferir o tamanho. A auditoria de
 * disponibilidade (17/11/2026) cortou um `.onnx` do moonshine pela metade, com status 200 e sem
 * `content-length`: o arquivo foi gravado, e daí em diante a legenda ficou morta para sempre — 0 falas em 90 s
 * depois de reabrir o navegador, nenhum pedido à rede (o modelo vinha do cache) e "protobuf parsing failed"
 * na tela.
 *
 * Este é o `customCache` da transformers.js (`env.useCustomCache`), instalado em `configureModelDelivery`, sobre
 * o MESMO cache de antes (`transformers-cache`: o que já estava baixado continua valendo):
 *
 *  - `put`: lê o corpo, conta os bytes e calcula o sha256 (WebCrypto, no próprio worker). Peso do manifesto
 *    (`manifestoDosPesos.json`, a revisão fixada de `revisoesDosModelos.ts`) só é gravado se bytes e sha256
 *    baterem. Arquivo fora do manifesto (o runtime do ORT, por exemplo) só se o `content-length`, quando vier,
 *    bater com os bytes. Recusar não lança: a carga segue com o que veio, e a sessão que não abrir passa pela
 *    cura abaixo — com a recusa anotada, para a tela dizer "a conexão caiu", e não "o modelo veio com defeito";
 *  - `match`: a cópia de um peso do manifesto com tamanho errado (gravada antes desta conferência) é apagada
 *    e tratada como ausente, e o arquivo vem de novo da rede;
 *  - `carregarComCura`: se a sessão ONNX não abrir, apaga do cache as entradas DAQUELE modelo e refaz a carga
 *    da rede UMA vez por modelo por página (sem laço). Falhou de novo: a mensagem leva a marca da classe
 *    (`[falha:modelo-corrompido]` ou `[falha:download-interrompido]`) e o adaptador rebaixa o modelo.
 *
 * O sha256 é calculado de uma vez sobre o corpo inteiro (o WebCrypto não tem hash incremental), e só na
 * primeira gravação: a transformers.js já tem o arquivo inteiro na memória nesse ponto.
 */
import { classificarFalha, comMarcaDeFalha } from '../core/falhas/mensagemDeFalha';
import manifesto from './manifestoDosPesos.json';
import { REVISOES_DOS_MODELOS } from './revisoesDosModelos';

type Entrada = [number] | [number, string];
type Manifesto = Record<string, Record<string, Entrada>>;

const MANIFESTO = manifesto as unknown as Manifesto;

/** O nome do cache da transformers.js (`env.cacheKey`): o mesmo, para não perder o que já foi baixado. */
export const NOME_DO_CACHE = 'transformers-cache';

const DO_HUB = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/;
const DO_MESMO_DOMINIO = /^(?:https?:\/\/[^/]+)?\/models\/([^/]+\/[^/]+)\/(.+)$/;

/** O arquivo de modelo por trás de uma chave do cache, com a entrada do manifesto (ou `null`, se não houver). */
export function arquivoDoModelo(
  chave: string,
  m: Manifesto = MANIFESTO,
): { modelo: string; arquivo: string; entrada: Entrada | null } | null {
  let modelo: string;
  let arquivo: string;
  let revisao: string | undefined;
  const hub = DO_HUB.exec(chave);
  if (hub) [, modelo, revisao, arquivo] = hub;
  else {
    const local = DO_MESMO_DOMINIO.exec(chave);
    if (!local) return null;
    [, modelo, arquivo] = local;
  }
  arquivo = arquivo.split('?')[0];
  const sha = REVISOES_DOS_MODELOS[modelo];
  if (!sha) return { modelo, arquivo, entrada: null };
  // Revisão pedida que não é a fixada (nem `main`, que o fetch troca pela fixada): sem régua.
  if (revisao && revisao !== 'main' && revisao !== sha) return { modelo, arquivo, entrada: null };
  return { modelo, arquivo, entrada: m[`${modelo}@${sha}`]?.[arquivo] ?? null };
}

export async function sha256Hex(dados: ArrayBuffer | Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', dados as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Os modelos que tiveram um arquivo RECUSADO nesta página (rede que cortou o download). */
const recusados = new Set<string>();

export interface Recusa {
  chave: string;
  modelo: string | null;
  motivo: 'tamanho' | 'sha256' | 'content-length';
  bytes: number;
}

export interface OpcoesDoCache {
  abrir: () => Promise<Cache>;
  manifesto?: Manifesto;
  aoRecusar?: (r: Recusa) => void;
}

/** O `customCache` da transformers.js: `match`/`put`/`delete` do Web Cache, com a conferência. */
export function criarCacheDePesos(op: OpcoesDoCache) {
  const m = op.manifesto ?? MANIFESTO;
  const recusar = (r: Recusa) => {
    if (r.modelo) recusados.add(r.modelo);
    console.warn('[cacheDePesos] recusado:', r.chave, r.motivo, r.bytes);
    op.aoRecusar?.(r);
  };

  return {
    async match(chave: string): Promise<Response | undefined> {
      const cache = await op.abrir();
      const r = await cache.match(chave);
      if (!r) return undefined;
      const entrada = arquivoDoModelo(chave, m)?.entrada;
      if (!entrada) return r;
      const cabecalho = Number(r.headers.get('content-length'));
      const tamanho = Number.isFinite(cabecalho) && cabecalho > 0 ? cabecalho : (await r.clone().blob()).size;
      if (tamanho === entrada[0]) return r;
      // A cópia envenenada de antes desta conferência: sai do cache, e o arquivo vem de novo da rede.
      console.warn('[cacheDePesos] cópia com tamanho errado apagada:', chave, tamanho, '≠', entrada[0]);
      await cache.delete(chave).catch(() => false);
      return undefined;
    },

    async put(chave: string, resposta: Response): Promise<void> {
      try {
        const corpo = new Uint8Array(await resposta.arrayBuffer());
        const doModelo = arquivoDoModelo(chave, m);
        const base = { chave, modelo: doModelo?.modelo ?? null, bytes: corpo.byteLength };
        if (doModelo?.entrada) {
          const [bytes, sha] = doModelo.entrada;
          if (corpo.byteLength !== bytes) return recusar({ ...base, motivo: 'tamanho' });
          if (sha && (await sha256Hex(corpo)) !== sha) return recusar({ ...base, motivo: 'sha256' });
        } else {
          const declarado = Number(resposta.headers.get('content-length'));
          if (Number.isFinite(declarado) && declarado > 0 && declarado !== corpo.byteLength)
            return recusar({ ...base, motivo: 'content-length' });
        }
        const cabecalhos = new Headers(resposta.headers);
        cabecalhos.set('content-length', String(corpo.byteLength));
        const cache = await op.abrir();
        await cache.put(chave, new Response(corpo, { status: 200, headers: cabecalhos }));
      } catch (e) {
        // Cota cheia, cache indisponível (aba anônima): a carga segue sem guardar, como a transformers.js faz.
        console.warn('[cacheDePesos] não gravou', chave, String(e).slice(0, 120));
      }
    },

    async delete(chave: string): Promise<boolean> {
      const cache = await op.abrir();
      return cache.delete(chave);
    },
  };
}

/** Apaga do cache TODAS as entradas de um modelo (as do Hub e as do mesmo domínio). */
export async function apagarModeloDoCache(modelo: string, abrir: () => Promise<Cache>): Promise<number> {
  const cache = await abrir();
  let apagadas = 0;
  for (const req of await cache.keys()) {
    if (arquivoDoModelo(req.url)?.modelo !== modelo) continue;
    if (await cache.delete(req)) apagadas += 1;
  }
  return apagadas;
}

const ehFalhaDeSessao = (e: unknown) => classificarFalha(e) === 'modelo-corrompido';

/** O erro final, com a classe na frente da mensagem: a tela e o contador leem a marca. */
function marcado(e: unknown, modelo: string): unknown {
  const msg = String((e as Error)?.message ?? e);
  if (msg.startsWith('[falha:')) return e;
  if (recusados.has(modelo)) return new Error(comMarcaDeFalha('download-interrompido', `${modelo}: ${msg}`));
  if (ehFalhaDeSessao(e)) return new Error(comMarcaDeFalha('modelo-corrompido', `${modelo}: ${msg}`));
  return e;
}

/**
 * Carrega um modelo e, se a SESSÃO não abrir (protobuf, `ERROR_CODE`), APAGA as entradas dele do cache e
 * devolve o erro MARCADO (`[falha:modelo-corrompido]`, ou `[falha:download-interrompido]` se o cache recusou um
 * arquivo cortado). Erro que não é de sessão (rede, memória) passa direto.
 *
 * A nova tentativa NÃO é feita aqui, no mesmo worker: a transformers.js 4.2 encadeia a criação das sessões numa
 * promessa do módulo (`webInitChain` em `backends/onnx.js`) e, depois de uma rejeição, toda sessão seguinte
 * NAQUELE worker rejeita com o mesmo erro, sem nem tentar (medido no aceite de 17/11/2026: o modelo íntegro
 * baixava de novo e a legenda seguia com 0 falas). Quem tenta de novo é o adaptador, num worker NOVO
 * (`whisperLocal.ts`, uma vez por modelo por página), com o cache já limpo.
 */
export async function carregarComCura<T>(
  modelo: string,
  carregar: () => Promise<T>,
  apagar: (modelo: string) => Promise<unknown> = (mo) =>
    typeof caches === 'undefined' ? Promise.resolve(0) : apagarModeloDoCache(mo, () => caches.open(NOME_DO_CACHE)),
): Promise<T> {
  try {
    return await carregar();
  } catch (e) {
    if (ehFalhaDeSessao(e)) {
      console.warn('[cacheDePesos] a sessão de', modelo, 'não abriu: a cópia sai do cache');
      await apagar(modelo).catch(() => 0);
    }
    throw marcado(e, modelo);
  }
}

/** Só para os testes: uma página nova. */
export function _zerarCacheDePesos(): void {
  recusados.clear();
}
