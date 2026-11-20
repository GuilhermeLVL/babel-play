/**
 * A GALERIA AO VIVO da coleção 100Avatars (ToxSam): as requisições a terceiros.
 *
 * NADA aqui roda sem o opt-in explícito da pessoa (a tela só chama estas funções depois do "Quero ver"), e o perfil
 * protegido nem chega a ver a galeria (`core/avatar/politicaDeMenor`). Toda requisição vai com `credentials: 'omit'`
 * e `referrerPolicy: 'no-referrer'`: nenhum cookie, nenhum referer. O registro vem de `raw.githubusercontent.com`
 * (já liberado na CSP, com CORS aberto) e o modelo do `arweave.net` (liberado em `connect-src` só quando o
 * deploy liga `AVATAR_GALERIA_TERCEIROS=1`). O que vem é validado em `core/avatar/galeria` antes de virar tela.
 */
import {
  avataresDaColecao,
  type ColecaoDaGaleria,
  colecoesAceitas,
  type ItemDaGaleria,
} from '../../core/avatar/galeria';
import { TETO_DO_MODELO_BYTES } from '../../core/avatar/tiers';

const RAIZ = 'https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/';
const TETO_DO_REGISTRO = 4 * 1024 * 1024;

const PEDIDO: RequestInit = { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' };

export class ErroDaGaleria extends Error {
  constructor(
    readonly codigo: 'rede' | 'invalido' | 'grande' | 'cancelado',
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDaGaleria';
  }
}

async function json(url: string, buscar: typeof fetch, sinal?: AbortSignal): Promise<unknown> {
  let r: Response;
  try {
    r = await buscar(url, { ...PEDIDO, signal: sinal });
  } catch {
    if (sinal?.aborted) throw new ErroDaGaleria('cancelado', 'cancelado');
    throw new ErroDaGaleria('rede', 'sem rede');
  }
  if (!r.ok) throw new ErroDaGaleria('rede', `HTTP ${r.status}`);
  const declarado = Number(r.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > TETO_DO_REGISTRO) throw new ErroDaGaleria('grande', 'registro grande');
  const texto = await r.text();
  if (texto.length > TETO_DO_REGISTRO) throw new ErroDaGaleria('grande', 'registro grande');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroDaGaleria('invalido', 'registro ilegível');
  }
}

export const carregarColecoes = async (buscar: typeof fetch = fetch, sinal?: AbortSignal) =>
  colecoesAceitas(await json(`${RAIZ}projects.json`, buscar, sinal));

export async function carregarItens(
  colecao: ColecaoDaGaleria,
  buscar: typeof fetch = fetch,
  sinal?: AbortSignal,
): Promise<ItemDaGaleria[]> {
  return avataresDaColecao(await json(`${RAIZ}avatars/${colecao}.json`, buscar, sinal), colecao);
}

/** Baixa o modelo escolhido, com teto de bytes (pelo cabeçalho e pelo que de fato chega). */
export async function baixarModelo(
  item: ItemDaGaleria,
  buscar: typeof fetch = fetch,
  sinal?: AbortSignal,
): Promise<Uint8Array> {
  let r: Response;
  try {
    r = await buscar(item.modelo, { ...PEDIDO, signal: sinal });
  } catch {
    if (sinal?.aborted) throw new ErroDaGaleria('cancelado', 'cancelado');
    throw new ErroDaGaleria('rede', 'sem rede');
  }
  if (!r.ok) throw new ErroDaGaleria('rede', `HTTP ${r.status}`);
  const declarado = Number(r.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > TETO_DO_MODELO_BYTES) {
    void r.body?.cancel();
    throw new ErroDaGaleria('grande', 'modelo grande');
  }
  const leitor = r.body?.getReader();
  if (!leitor) {
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.byteLength > TETO_DO_MODELO_BYTES) throw new ErroDaGaleria('grande', 'modelo grande');
    return b;
  }
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read().catch(() => {
      throw new ErroDaGaleria(sinal?.aborted ? 'cancelado' : 'rede', 'leitura interrompida');
    });
    if (done) break;
    total += value.byteLength;
    if (total > TETO_DO_MODELO_BYTES) {
      void leitor.cancel();
      throw new ErroDaGaleria('grande', 'modelo grande');
    }
    partes.push(value);
  }
  const saida = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    saida.set(p, o);
    o += p.byteLength;
  }
  return saida;
}
