/**
 * O CLIENTE DO PARCEIRO DE LEITURA (`POST /api/ai/leitura/parceiro`; L4 de Livros & Leitura), atrás da flag
 * `parceiro_de_leitura` e só nos planos pagos (e no teste). Sem tela nesta fase: o painel do leitor importa daqui.
 *
 * O CONTRATO (o servidor é `server/ai/nucleo/parceiroDeLeitura.ts`):
 *
 *   pedido   { modo, livro: {origem:'catalogo', id} | {origem:'proprio'}, tituloDoCapitulo?, selecao?,
 *              trechos: [{id, texto}], pergunta?, nivel: 'A1'..'C2', idiomaDoLivro, idiomaDaPessoa }
 *            - `selecao` é obrigatória em explicar/analogia/curiosidade; `pergunta` só (e sempre) em `pergunta`;
 *            - os `trechos` são o capítulo EM VOLTA da seleção, com o id que a tela usa para achar o trecho citado
 *              (o índice do parágrafo, um CFI curto); o id `selecao` é reservado;
 *            - livro do CATÁLOGO: até 40 trechos e 8.000 caracteres somados (com a seleção). Livro TRAZIDO pela
 *              pessoa: só a seleção e até 2 trechos vizinhos, 1.500 somados — `montarTrechos` corta antes de enviar.
 *   sucesso  { resposta: { texto, pontos[], citacoes: [{trechoId, exato}], naoEstaNoTrecho }, origem: 'cache'|'modelo',
 *              restanteHoje?: number|null, textoConferido: boolean, aviso } — `exato` está, letra por letra, no trecho `trechoId` (o servidor
 *              conferiu); na pergunta que o texto não responde, `naoEstaNoTrecho: true` e o texto fixo.
 *   recusas  404 `recurso_indisponivel` (flag) · 402 `sem_plano` · 403 `livro_fora_da_faixa` (menor) · 404
 *            `livro_inexistente` · 429 `teto_do_parceiro` (dia) · 402 `cota_do_parceiro` (mês) · 413
 *            `contexto_grande_demais` · 400 `invalido` · 429 `nuvem_ocupada` · 502 `resposta_invalida`.
 *
 * NENHUMA FUNÇÃO LANÇA: devolvem `{ ok: false, motivo }`, e a tela escolhe a frase. Nenhum motivo carrega oferta
 * (`copy-br-etica`): quem decide mostrar Planos é a tela, e nunca no instante da recusa.
 */
import {
  type CitacaoDoParceiro,
  type ModoDoParceiro,
  type RespostaDoParceiro,
  TETOS_DO_PARCEIRO,
  type TrechoDoCapitulo,
  trechosEmVolta,
} from '../../lib/estudo/promptDoParceiro';
import { apiFetch, lerErro } from '../funil';
import { motivoDeCota } from '../motivoDeCota';

export type { CitacaoDoParceiro, ModoDoParceiro, RespostaDoParceiro, TrechoDoCapitulo };

export type FalhaDoParceiro =
  | 'sem_conta'
  | 'sem_plano'
  /** 403 `livro_fora_da_faixa`: o perfil (menor) não vê este livro do catálogo. */
  | 'fora_da_faixa'
  | 'cota_do_mes'
  | 'uso_justo'
  | 'nuvem_ocupada'
  /** 404 `recurso_indisponivel`: a flag está desligada no servidor. */
  | 'fora'
  | 'grande_demais'
  | 'invalido'
  | 'indisponivel';

export type LivroDoPedido = { origem: 'catalogo'; id: string } | { origem: 'proprio' };

export interface PedidoAoParceiro {
  modo: ModoDoParceiro;
  livro: LivroDoPedido;
  tituloDoCapitulo?: string;
  selecao?: string;
  trechos: TrechoDoCapitulo[];
  pergunta?: string;
  nivel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  idiomaDoLivro: string;
  idiomaDaPessoa: string;
}

export type ResultadoDoParceiro =
  | {
      ok: true;
      resposta: RespostaDoParceiro;
      origem: 'cache' | 'modelo';
      /** `undefined` = o servidor não soube dizer agora (resposta do cache com o contador fora do ar). */
      restanteHoje?: number | null;
      /** O texto casou com o manifesto do livro PD (teto do catálogo e cache); `false` = tratado como livro trazido. */
      textoConferido: boolean;
      aviso: string;
      modelo?: string;
    }
  | { ok: false; motivo: FalhaDoParceiro; status: number };

/** Quanto a tela espera: 35 s, DEPOIS do prazo da cascata no servidor (30 s). */
export const TEMPO_DO_PARCEIRO_MS = 35_000;

function motivoDaFalha(status: number, code: string | undefined, detalhes?: Record<string, unknown>): FalhaDoParceiro {
  if (status === 404 && code === 'recurso_indisponivel') return 'fora';
  if (code === 'sem_plano') return 'sem_plano';
  if (code === 'livro_fora_da_faixa') return 'fora_da_faixa';
  if (code === 'contexto_grande_demais') return 'grande_demais';
  if (status === 401 || code?.toLowerCase() === 'exige_conta') return 'sem_conta';
  const cota = motivoDeCota(status, code, detalhes);
  if (cota) return cota;
  if (status === 400 || code === 'livro_inexistente') return 'invalido';
  return 'indisponivel';
}

/**
 * OS TRECHOS QUE CABEM, em volta da seleção: o capítulo inteiro em parágrafos (`paragrafos`, na ordem) e o índice do
 * parágrafo selecionado; sai alternando antes/depois até o teto da origem do livro. No livro TRAZIDO, no máximo 2
 * vizinhos — o texto dela não vai ao servidor além disso. Parágrafo longo é cortado no teto de um trecho.
 *
 * PARA O LIVRO DO CATÁLOGO SER RECONHECIDO (teto do catálogo e cache compartilhado), cada trecho tem de ser um
 * parágrafo INTEIRO de `paragrafosDoCapitulo(texto do capítulo)` (`src/core/livros/manifesto.ts`), com o texto que
 * `lerEpubComoTexto` dá. O servidor confere no manifesto; trecho que não casa (ou cortado) vale como livro trazido, e a
 * resposta vem com `textoConferido: false`.
 */
export function montarTrechos(
  paragrafos: readonly TrechoDoCapitulo[],
  indiceDaSelecao: number,
  origem: LivroDoPedido['origem'],
  selecao = '',
): TrechoDoCapitulo[] {
  return trechosEmVolta(
    paragrafos,
    indiceDaSelecao,
    origem === 'catalogo' ? TETOS_DO_PARCEIRO.catalogo : TETOS_DO_PARCEIRO.proprio,
    selecao.length,
  );
}

const ehTexto = (v: unknown): v is string => typeof v === 'string';

/** A leitura defensiva do corpo de sucesso (o servidor já validou; aqui só a forma). */
function lerCorpo(c: Record<string, unknown>): Omit<Extract<ResultadoDoParceiro, { ok: true }>, 'modelo'> | null {
  const r = c.resposta as Record<string, unknown> | undefined;
  if (!r || !ehTexto(r.texto) || !Array.isArray(r.pontos) || !Array.isArray(r.citacoes)) return null;
  if (typeof r.naoEstaNoTrecho !== 'boolean') return null;
  const citacoes = r.citacoes.flatMap((x): CitacaoDoParceiro[] => {
    const o = x as Record<string, unknown> | null;
    return o && ehTexto(o.trechoId) && ehTexto(o.exato) ? [{ trechoId: o.trechoId, exato: o.exato }] : [];
  });
  return {
    ok: true,
    resposta: { texto: r.texto, pontos: r.pontos.filter(ehTexto), citacoes, naoEstaNoTrecho: r.naoEstaNoTrecho },
    origem: c.origem === 'cache' ? 'cache' : 'modelo',
    ...(c.restanteHoje === undefined ? {} : { restanteHoje: typeof c.restanteHoje === 'number' ? c.restanteHoje : null }),
    textoConferido: c.textoConferido === true,
    aviso: ehTexto(c.aviso) ? c.aviso : '',
  };
}

/** Pede ao parceiro. Ver o contrato no topo. */
export async function pedirAoParceiro(p: PedidoAoParceiro): Promise<ResultadoDoParceiro> {
  let res: Response;
  try {
    res = await apiFetch('/api/ai/leitura/parceiro', {
      method: 'POST',
      timeoutMs: TEMPO_DO_PARCEIRO_MS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 };
  }
  if (!res.ok) {
    const erro = await lerErro(res);
    return { ok: false, motivo: motivoDaFalha(res.status, erro.code, erro.detalhes), status: res.status };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const lido = json && typeof json === 'object' ? lerCorpo(json) : null;
  if (!lido) return { ok: false, motivo: 'indisponivel', status: res.status };
  const modelo = res.headers?.get?.('x-ia-modelo');
  return { ...lido, ...(modelo ? { modelo } : {}) };
}
