/**
 * O "AJUSTAR NÍVEL" DO LEITOR: o que une a regra pura (`core/leitura/ajustarNivel`), o cache do aparelho e a rota. Sem React.
 *
 *  - `ajustarComCache`: o mesmo pedido (texto + nível + conhecidas) vem do aparelho, sem rede e sem gastar cota;
 *  - `ajustarCapitulo`: parágrafo a parágrafo, CANCELÁVEL, com progresso; o 1o pedido de rede leva `inicioDeCapitulo`
 *    (a cota do capítulo é UMA por capítulo); para no primeiro erro e devolve o que já ficou pronto. O custo somado é só o
 *    do que foi pedido de verdade (o que veio do cache não custa, e o que foi cancelado não conta).
 */
import {
  chaveDoAjuste,
  conhecidasParaOPedido,
  CUSTO_ZERO,
  type CustoDoAjuste,
  type EscopoDoAjuste,
  somarCusto,
} from '../../core/leitura/ajustarNivel';
import {
  type AjusteDeNivel,
  type FalhaDoAjuste,
  type PedidoDeAjusteNaRede,
  pedirAjusteDeNivel,
  type ResultadoDoAjusteNaRede,
} from '../../data/rotas/ajustarNivel';
import { ajusteGuardado, guardarAjuste } from './ajustesNoAparelho';

export interface DependenciasDoAjuste {
  pedir: (p: PedidoDeAjusteNaRede, sinal?: AbortSignal) => Promise<ResultadoDoAjusteNaRede>;
  lerCache: (chave: string) => Promise<AjusteDeNivel | null>;
  guardarCache: (chave: string, v: AjusteDeNivel) => Promise<void>;
}

const PADRAO: DependenciasDoAjuste = {
  pedir: pedirAjusteDeNivel,
  lerCache: ajusteGuardado,
  guardarCache: guardarAjuste,
};

export type ResultadoComCache =
  | { ok: true; valor: AjusteDeNivel; doCache: boolean }
  | Extract<ResultadoDoAjusteNaRede, { ok: false }>;

/** A chave do cache de um pedido (as conhecidas já filtradas ao que aparece no texto). */
export function chaveDoPedido(p: PedidoDeAjusteNaRede): string {
  const acao = p.acao ?? 'ajustar';
  return `${acao}:${chaveDoAjuste({
    texto: p.texto,
    frase: p.frase,
    idioma: p.idioma,
    escopo: p.escopo,
    alvo: p.nivelAlvo,
    conhecidas: p.conhecidas ?? [],
  })}`;
}

/** Pede o ajuste, ou devolve o que o aparelho já tem para este pedido (sem rede, sem cota). Só o sucesso é guardado. */
export async function ajustarComCache(
  p: PedidoDeAjusteNaRede,
  sinal?: AbortSignal,
  dep: DependenciasDoAjuste = PADRAO,
): Promise<ResultadoComCache> {
  const chave = chaveDoPedido(p);
  const guardado = await dep.lerCache(chave);
  if (guardado) return { ok: true, valor: guardado, doCache: true };
  const r = await dep.pedir(p, sinal);
  if (r.ok === false) return r;
  await dep.guardarCache(chave, r.valor);
  return { ok: true, valor: r.valor, doCache: false };
}

export interface ProgressoDoCapitulo {
  feitos: number;
  total: number;
}

export interface ResultadoDoCapitulo {
  /** Um por parágrafo, na ordem; `null` = ainda não feito (cancelou ou parou antes). */
  ajustados: Array<AjusteDeNivel | null>;
  situacao: 'completo' | 'cancelado' | 'erro';
  motivo?: FalhaDoAjuste;
  /** Só o que foi pedido de verdade à rede (cache e cancelados não contam). */
  custo: CustoDoAjuste;
  /** Quantos vieram do cache do aparelho. */
  doCache: number;
}

/**
 * Ajusta o capítulo parágrafo a parágrafo. `conhecidasDaPessoa` é filtrada a cada parágrafo (só as que aparecem nele, até
 * 300). Cancelar (`sinal`) para ANTES do próximo parágrafo e aborta o que está em voo: o que já ficou pronto fica.
 */
export async function ajustarCapitulo(
  p: {
    paragrafos: readonly string[];
    idioma: string;
    alvo: PedidoDeAjusteNaRede['nivelAlvo'];
    conhecidasDaPessoa: Iterable<string>;
    sinal?: AbortSignal;
    aoProgresso?: (pr: ProgressoDoCapitulo, parcial: Array<AjusteDeNivel | null>) => void;
  },
  dep: DependenciasDoAjuste = PADRAO,
): Promise<ResultadoDoCapitulo> {
  const ajustados: Array<AjusteDeNivel | null> = p.paragrafos.map(() => null);
  const conhecidas = [...p.conhecidasDaPessoa];
  let custo = CUSTO_ZERO;
  let doCache = 0;
  let inicioFeito = false;
  for (let i = 0; i < p.paragrafos.length; i++) {
    if (p.sinal?.aborted) return { ajustados, situacao: 'cancelado', custo, doCache };
    const texto = p.paragrafos[i];
    const pedido: PedidoDeAjusteNaRede = {
      texto,
      idioma: p.idioma,
      escopo: 'capitulo' as EscopoDoAjuste,
      nivelAlvo: p.alvo,
      conhecidas: conhecidasParaOPedido(texto, conhecidas),
      ...(inicioFeito ? {} : { inicioDeCapitulo: true }),
    };
    /* Só o 1o pedido de REDE gasta a cota do capítulo: o `inicioDeCapitulo` vai com ele, mesmo que antes tenha vindo cache. */
    const chave = chaveDoPedido({ ...pedido, inicioDeCapitulo: undefined });
    const guardado = await dep.lerCache(chave);
    let valor: AjusteDeNivel;
    if (guardado) {
      valor = guardado;
      doCache++;
    } else {
      const r = await dep.pedir(pedido, p.sinal);
      if (r.ok === false) {
        if (p.sinal?.aborted) return { ajustados, situacao: 'cancelado', custo, doCache };
        return { ajustados, situacao: 'erro', motivo: r.motivo, custo, doCache };
      }
      inicioFeito = true;
      valor = r.valor;
      custo = somarCusto(custo, r.valor.custo);
      await dep.guardarCache(chave, r.valor);
    }
    ajustados[i] = valor;
    p.aoProgresso?.({ feitos: i + 1, total: p.paragrafos.length }, ajustados);
  }
  return { ajustados, situacao: 'completo', custo, doCache };
}
