/**
 * O CLIENTE DO "AJUSTAR NÍVEL" (`POST /api/leitura/ajustar-nivel`, flag `ia_ajustar_nivel`; openspec `leitura-assistida`,
 * fatia D). Irmão de `apiDoEstudo.ts`: NUNCA lança; devolve `{ ok: false, motivo }` e a tela escolhe a frase. O servidor
 * decide pelo `code`; aqui só se traduz o `code` para um motivo que a tela entende. Nenhum motivo carrega oferta.
 *
 * Sem espelho no modo sem conta (a rota é de quem tem plano): o servidor em memória responde `EXIGE_CONTA` e vira `sem_conta`.
 */
import type { CustoDoAjuste, EscopoDoAjuste, NivelDoAjuste } from '../../core/leitura/ajustarNivel'
import { apiFetch, lerErro } from '../funil'
import { motivoDeCota } from '../motivoDeCota'

export interface PedidoDeAjusteNaRede {
  texto: string
  /** Só na palavra: a frase em volta (o sentido depende dela). */
  frase?: string
  idioma: string
  escopo: EscopoDoAjuste
  nivelAlvo: NivelDoAjuste
  acao?: 'ajustar' | 'exemplo' | 'gramatica' | 'resumo'
  /** O idioma de quem estuda (a gramática é explicada nele). */
  idiomaDaPessoa?: string
  /** O 1o parágrafo do capítulo: só ele gasta a cota do capítulo. */
  inicioDeCapitulo?: boolean
  conhecidas?: readonly string[]
}

export interface AjusteDeNivel {
  ajustado: string
  nivelMedido: NivelDoAjuste | null
  confianciaDaMedida: 'alta' | 'media' | 'baixa'
  conhecidasTrocadas: string[]
  foraDoNivel: boolean
  reescrito: boolean
  custo: CustoDoAjuste
  modelo?: string
}

export type FalhaDoAjuste =
  | 'sem_conta'
  | 'plano'
  /** A cota do mês acabou (`capitulo`: a do capítulo; `voltam`: a data em que volta, se o servidor disse). */
  | 'cota'
  | 'uso_justo'
  | 'nuvem_ocupada'
  /** 404 `recurso_indisponivel`: a flag está desligada no servidor (a do cliente era um cache velho). */
  | 'fora'
  /** 403 `responsavel_pendente`: a nuvem espera o responsável. */
  | 'idade'
  /** 502 `saida_filtrada`: o filtro do perfil protegido barrou; o texto NÃO vem e o original fica. */
  | 'filtrada'
  | 'invalido'
  | 'indisponivel'

export type ResultadoDoAjusteNaRede =
  | { ok: true; valor: AjusteDeNivel }
  | { ok: false; motivo: FalhaDoAjuste; status: number; capitulo?: boolean; voltam?: string | null }

/** Duas chamadas de modelo cabem em 40 s no servidor (`PRAZO_TOTAL_MS`); o cliente só desiste depois dele. */
export const TEMPO_DO_AJUSTE_MS = 45_000

function motivoDaFalha(status: number, code: string | undefined, detalhes?: Record<string, unknown>): FalhaDoAjuste {
  if (status === 404 && code === 'recurso_indisponivel') return 'fora'
  if (code === 'cota_esgotada') return 'cota'
  if (code === 'sem_plano') return 'plano'
  if (code === 'saida_filtrada') return 'filtrada'
  if (code === 'responsavel_pendente') return 'idade'
  if (status === 401 || code?.toLowerCase() === 'exige_conta') return 'sem_conta'
  const cota = motivoDeCota(status, code, detalhes)
  if (cota === 'cota_do_mes') return 'cota'
  if (cota) return cota
  if (status === 400) return 'invalido'
  return 'indisponivel'
}

const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** Leitura defensiva: forma fora do contrato vira `null` (a tela diz "não deu"). */
export function lerAjuste(corpo: unknown): AjusteDeNivel | null {
  const o = (corpo ?? {}) as Record<string, unknown>
  if (typeof o.ajustado !== 'string' || !o.ajustado.trim()) return null
  const c = (o.custo ?? {}) as Record<string, unknown>
  return {
    ajustado: o.ajustado,
    nivelMedido: typeof o.nivelMedido === 'string' && NIVEIS.includes(o.nivelMedido) ? (o.nivelMedido as NivelDoAjuste) : null,
    confianciaDaMedida:
      o.confianciaDaMedida === 'alta' || o.confianciaDaMedida === 'media' ? o.confianciaDaMedida : 'baixa',
    conhecidasTrocadas: Array.isArray(o.conhecidasTrocadas)
      ? o.conhecidasTrocadas.filter((x): x is string => typeof x === 'string').slice(0, 300)
      : [],
    foraDoNivel: o.foraDoNivel === true,
    reescrito: o.reescrito === true,
    custo: {
      tokensEntrada: numero(c.tokensEntrada),
      tokensSaida: numero(c.tokensSaida),
      usd: numero(c.usd),
      chamadas: numero(c.chamadas),
    },
  }
}

/** Pede o ajuste. Nunca lança. `sinal` cancela (o capítulo). */
export async function pedirAjusteDeNivel(
  p: PedidoDeAjusteNaRede,
  sinal?: AbortSignal,
): Promise<ResultadoDoAjusteNaRede> {
  let res: Response
  try {
    res = await apiFetch('/api/leitura/ajustar-nivel', {
      method: 'POST',
      timeoutMs: TEMPO_DO_AJUSTE_MS,
      signal: sinal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto: p.texto,
        ...(p.frase ? { frase: p.frase } : {}),
        idioma: p.idioma,
        escopo: p.escopo,
        nivelAlvo: p.nivelAlvo,
        ...(p.acao ? { acao: p.acao } : {}),
        ...(p.idiomaDaPessoa ? { idiomaDaPessoa: p.idiomaDaPessoa } : {}),
        ...(p.inicioDeCapitulo ? { inicioDeCapitulo: true } : {}),
        conhecidas: (p.conhecidas ?? []).slice(0, 300),
      }),
    })
  } catch {
    return { ok: false, motivo: 'indisponivel', status: 0 }
  }
  if (!res.ok) {
    const erro = await lerErro(res)
    const d = erro.detalhes ?? {}
    return {
      ok: false,
      motivo: motivoDaFalha(res.status, erro.code, d),
      status: res.status,
      ...(d.capitulo === true ? { capitulo: true } : {}),
      ...(typeof d.voltam === 'string' ? { voltam: d.voltam } : {}),
    }
  }
  const valor = lerAjuste(await res.json().catch(() => null))
  if (!valor) return { ok: false, motivo: 'indisponivel', status: res.status }
  const modelo = res.headers?.get?.('x-ia-modelo')
  return { ok: true, valor: modelo ? { ...valor, modelo } : valor }
}
