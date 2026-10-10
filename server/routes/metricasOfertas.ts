/**
 * `POST /api/metricas/ofertas` — o funil de conversão das ofertas de planos (Fase 8), ANÔNIMO.
 *
 * Irmã de `POST /api/metricas/captura` e montada no mesmo lugar (`server/http/app.ts`): pública,
 * ANTES do auth, com o corpo de 8 KB de `/api/metricas` e, no modo público, o mesmo balde por IP.
 * Nada é gravado: cada evento vira incremento de contador Prometheus (`server/http/metricas.ts`) e
 * some. A rota não lê identidade — nem com token existe `req.userId` aqui.
 *
 * O CONTRATO (`src/lib/ofertas/instrumentacao.ts` manda exatamente isto):
 *
 *   { v: 1, eventos: [{ evento, gatilho, componente, plano_atual, plano_sugerido, variante }] }
 *
 * CARDINALIDADE. Tudo o que vira label é de um alfabeto FECHADO:
 *   - `evento`, `componente`, `plano_atual`, `plano_sugerido`: listas do código (fora delas = 400);
 *   - `gatilho` e `variante`: só os que EXISTEM — os embutidos no código (`IDS_FUNCIONAIS`,
 *     `embutida`, `padrao`, `nenhum`) e os do payload ATUAL da flag `oferta_planos` (até 50, lidos
 *     do cache de 30 s de `server/lib/flags.ts`). Id bem formado mas desconhecido vira `outro`: um
 *     cliente inventando ids não cria série nova.
 */
import { type Request, type Response, Router } from 'express'

import { planoDaFlag } from '../../src/core/flags'
import {
  COMPONENTES_DE_OFERTA,
  EVENTOS_DE_OFERTA,
  FORMATO_DA_VARIANTE,
  FORMATO_DO_ID_DE_GATILHO,
  IDS_FUNCIONAIS,
  planoSugeridoDe,
  type RegistroDeOferta,
  SEM_OFERTA,
} from '../../src/core/ofertas'
import { contarEventosDeOferta } from '../http/metricas'
import { definicoesDasFlags } from '../lib/flags'
import { log } from '../lib/logger'

/** Eventos por lote. O cliente junta em 2 s; 20 é folga para uma sessão agitada. */
export const MAX_EVENTOS_POR_LOTE = 20
/** Rótulo de gatilho/variante bem formado mas desconhecido. */
export const ROTULO_DESCONHECIDO = 'outro'

export interface RotulosConhecidos {
  gatilhos: ReadonlySet<string>
  variantes: ReadonlySet<string>
}

const COMPONENTES: readonly string[] = [...COMPONENTES_DE_OFERTA, SEM_OFERTA]
const incluso = (lista: readonly string[], v: unknown): v is string => typeof v === 'string' && lista.includes(v)

/**
 * Valida e sanea o lote. `null` = fora do contrato (a rota responde 400). Exportada para o teste:
 * é ela que protege o `/metrics`.
 */
export function validarLoteDeOfertas(corpo: unknown, conhecidos: RotulosConhecidos): RegistroDeOferta[] | null {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return null
  const c = corpo as Record<string, unknown>
  if (c.v !== 1 || !Array.isArray(c.eventos)) return null
  if (c.eventos.length === 0 || c.eventos.length > MAX_EVENTOS_POR_LOTE) return null
  const saida: RegistroDeOferta[] = []
  for (const bruto of c.eventos) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null
    const e = bruto as Record<string, unknown>
    if (!incluso(EVENTOS_DE_OFERTA, e.evento)) return null
    if (!incluso(COMPONENTES, e.componente)) return null
    /* Os planos passam pela leitura tolerante (matriz v2): uma aba aberta com o bundle anterior manda
       `pro`, e o evento dela conta como Premium em vez de derrubar o lote inteiro em 400. Na matriz
       v3 o plano ATUAL é o da pessoa (o Essencial e o Ao Vivo são planos); o SUGERIDO continua um
       rótulo só para qualquer plano pago (`planoSugeridoDe`). */
    const planoAtual = planoDaFlag(e.plano_atual)
    const planoSugerido = planoSugeridoDe(e.plano_sugerido)
    if (!planoAtual || !planoSugerido) return null
    if (typeof e.gatilho !== 'string' || !FORMATO_DO_ID_DE_GATILHO.test(e.gatilho)) return null
    if (typeof e.variante !== 'string' || !FORMATO_DA_VARIANTE.test(e.variante)) return null
    saida.push({
      evento: e.evento as RegistroDeOferta['evento'],
      componente: e.componente as RegistroDeOferta['componente'],
      plano_atual: planoAtual,
      plano_sugerido: planoSugerido,
      gatilho: conhecidos.gatilhos.has(e.gatilho) ? e.gatilho : ROTULO_DESCONHECIDO,
      variante: conhecidos.variantes.has(e.variante) ? e.variante : ROTULO_DESCONHECIDO,
    })
  }
  return saida
}

/** Os ids e variantes que existem agora: os embutidos + os do payload de `oferta_planos`. */
export async function rotulosConhecidos(): Promise<RotulosConhecidos> {
  const gatilhos = new Set<string>([...IDS_FUNCIONAIS, SEM_OFERTA])
  const variantes = new Set<string>(['embutida', 'padrao', SEM_OFERTA])
  try {
    const def = (await definicoesDasFlags()).find((d) => d.chave === 'oferta_planos')
    const lista = (def?.payload as { gatilhos?: Array<{ id?: unknown; variante?: unknown }> } | undefined)?.gatilhos
    for (const g of Array.isArray(lista) ? lista : []) {
      if (typeof g.id === 'string') gatilhos.add(g.id)
      if (typeof g.variante === 'string') variantes.add(g.variante)
    }
  } catch (err) {
    /* Banco fora: só os embutidos são rótulos conhecidos; os da flag viram `outro` por um tempo. */
    log('warn', { event: 'ofertas_rotulos_sem_flag', error: String(err).slice(0, 200) })
  }
  return { gatilhos, variantes }
}

export const metricasOfertasRouter = Router()

metricasOfertasRouter.post('/ofertas', async (req: Request, res: Response) => {
  const lote = validarLoteDeOfertas(req.body, await rotulosConhecidos())
  if (!lote) {
    res.status(400).json({ error: 'eventos de oferta fora do contrato', code: 'payload_invalido' })
    return
  }
  contarEventosDeOferta(lote)
  res.status(204).end()
})
