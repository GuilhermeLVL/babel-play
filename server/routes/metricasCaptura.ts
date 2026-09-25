/**
 * `POST /api/metricas/captura` — telemetria ANÔNIMA de qualidade da captura.
 *
 * POR QUE EXISTE. `ia_provedor_latencia_ms` (server/ai) diz quanto o PROVEDOR demorou; não diz
 * quanto a PESSOA esperou. O primeiro parcial na tela, o texto final depois do fim da fala, a
 * tradução e o fator de tempo real do Whisper LOCAL só existem no navegador — e sem eles não há
 * como saber se uma mudança no VAD, no modelo ou na cadeia de fallback piorou a experiência.
 *
 * O QUE ELA NÃO É. Não guarda nada: cada lote vira observação em histograma do Prometheus
 * (`server/http/metricas.ts`) e some. Não tem identidade: a rota fica ANTES do `authMiddleware`,
 * então nem com sessão aberta existe `req.userId` aqui — e nada neste arquivo o procuraria. Com
 * `METRICS_ENABLED` desligado o lote é validado e descartado (204 do mesmo jeito: o cliente não
 * precisa saber como o servidor está configurado).
 *
 * O CONTRATO (o cliente manda exatamente isto; `v` é a versão do formato):
 *
 *   { v: 1, sttFinalMs: number[], primeiroParcialMs: number[], mtMs: number[], rtf: number[],
 *     descartesAlucinacao: number, fallbacks: Record<string, number>, motorStt: string,
 *     motorMt: string }
 *
 * CARDINALIDADE É O RISCO, como em todo o `/metrics`: o nome do motor vira LABEL, e label com texto
 * livre do cliente é uma série nova por string inventada. Por isso o motor passa por um alfabeto
 * fechado (`[a-z0-9-]{1,40}`) e o que não casa vira `outro`; os números são grampeados em faixas
 * plausíveis em vez de recusados — um relógio de navegador que pulou não deve derrubar o lote todo.
 */
import { type Request, type Response, Router } from 'express'

import { observarCaptura, type RelatorioDeCaptura } from '../http/metricas'

/** Itens por lista. Um lote é de uma sessão de captura, e 200 falas é mais que uma hora de conversa. */
export const MAX_ITENS = 200
/** Faixa das latências, em ms: 2 minutos é o teto de qualquer espera que ainda seja "latência". */
export const MAX_MS = 120_000
/** Faixa do fator de tempo real: 50× mais lento que a fala é a CPU mais fraca que ainda termina. */
export const MAX_RTF = 50
/** Chaves em `fallbacks`: um motor por elo da cadeia, com folga. */
const MAX_FALLBACKS = 20

const MOTOR = /^[a-z0-9-]{1,40}$/

const motorSaneado = (v: unknown): string => (typeof v === 'string' && MOTOR.test(v) ? v : 'outro')

const grampear = (n: number, max: number): number => Math.min(max, Math.max(0, n))

/** Lista de números finitos com no máximo `MAX_ITENS`, grampeados em `[0, max]`; `null` se inválida. */
function listaDeNumeros(v: unknown, max: number): number[] | null {
  if (!Array.isArray(v) || v.length > MAX_ITENS) return null
  const out: number[] = []
  for (const n of v) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    out.push(grampear(n, max))
  }
  return out
}

/** Contagem inteira não negativa; `null` se não for número finito. */
function contagem(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.max(0, Math.floor(v))
}

/**
 * Valida e sanea o corpo. `null` = fora do contrato (a rota responde 400).
 *
 * Exportada para o teste: as regras de faixa e de alfabeto são o que protege o `/metrics`, e
 * merecem ser cobradas sem subir servidor.
 */
export function validarRelatorioDeCaptura(corpo: unknown): RelatorioDeCaptura | null {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return null
  const c = corpo as Record<string, unknown>
  if (c.v !== 1) return null

  const sttFinalMs = listaDeNumeros(c.sttFinalMs, MAX_MS)
  const primeiroParcialMs = listaDeNumeros(c.primeiroParcialMs, MAX_MS)
  const mtMs = listaDeNumeros(c.mtMs, MAX_MS)
  const rtf = listaDeNumeros(c.rtf, MAX_RTF)
  const descartesAlucinacao = contagem(c.descartesAlucinacao)
  if (!sttFinalMs || !primeiroParcialMs || !mtMs || !rtf || descartesAlucinacao === null) return null
  if (typeof c.motorStt !== 'string' || typeof c.motorMt !== 'string') return null

  const brutos = c.fallbacks
  if (!brutos || typeof brutos !== 'object' || Array.isArray(brutos)) return null
  const entradas = Object.entries(brutos as Record<string, unknown>)
  if (entradas.length > MAX_FALLBACKS) return null
  const fallbacks: Record<string, number> = {}
  for (const [motor, n] of entradas) {
    const q = contagem(n)
    if (q === null) return null
    const chave = motorSaneado(motor)
    // Dois nomes inválidos caem no mesmo `outro`: somar, e não sobrescrever.
    fallbacks[chave] = (fallbacks[chave] ?? 0) + q
  }

  return {
    sttFinalMs,
    primeiroParcialMs,
    mtMs,
    rtf,
    descartesAlucinacao,
    fallbacks,
    motorStt: motorSaneado(c.motorStt),
    motorMt: motorSaneado(c.motorMt),
  }
}

export const metricasCapturaRouter = Router()

metricasCapturaRouter.post('/captura', (req: Request, res: Response) => {
  const relatorio = validarRelatorioDeCaptura(req.body)
  if (!relatorio) {
    res.status(400).json({ error: 'relatório de captura fora do contrato', code: 'payload_invalido' })
    return
  }
  observarCaptura(relatorio)
  res.status(204).end()
})
