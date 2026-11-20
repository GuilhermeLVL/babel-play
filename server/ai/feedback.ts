/**
 * O FEEDBACK QUE CHEGA — `POST /api/ai/feedback` (Fase B do plano de qualidade da IA paga, item 4).
 *
 * Antes, o 👍/👎 do iChat ficava só no aparelho, e a explicação, o resumo e a Nuance não tinham nenhum. Sem isso a
 * qualidade da IA paga só era medida pela bancada. Agora a avaliação vira:
 *   - a métrica `ia_feedback_total{funcao, nota, motivo}` (Prometheus, `server/http/metricas.ts`);
 *   - uma NOTA no Langfuse (`score-create`, 1 = útil, 0 = não ajudou) com função, modelo, nível e motivo como
 *     metadados, num rastro próprio — sem pseudônimo, sem sessão, sem conteúdo.
 *
 * O CORPO É LISTA FECHADA (`src/core/feedbackDeIa.ts`) e ESTRITO: chave desconhecida (um "comentario", o texto da
 * frase) é 400, e não ignorada em silêncio — o cliente que tentar mandar texto descobre no teste, não em produção.
 * Por isso serve igual a adulto, menor e convidado: não há o que consentir além do clique. Não há tabela: a métrica
 * e o Langfuse bastam, e nada fica guardado ligado a quem avaliou (ROPA: `docs/lgpd/ropa.csv`).
 *
 * O MODELO vem do cliente (que o leu da resposta) e é conferido contra o registro de provedores: fora dele vira
 * `outro` — o rótulo nunca é o texto que chegou.
 *
 * TETO: 30 avaliações por minuto por conta (ou IP), no banco (`METRIC_RATELIMIT_FEEDBACK`), além do limitador caro
 * de `/api/ai`. Responde 202: a tela não espera nem reage a isto.
 */
import type { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'

import {
  FORMATO_DO_MODELO,
  FUNCOES_COM_FEEDBACK,
  MOTIVOS_DO_FEEDBACK,
  NOTAS_DO_FEEDBACK,
} from '../../src/core/feedbackDeIa'
import { NIVEIS_DA_TRADUCAO } from '../../src/core/nivelDeTraducao'
import { contarFeedbackDeIa } from '../http/metricas'
import { langfuse } from '../lib/langfuse'
import { chaveDoRequest, createDbRateLimitStore, METRIC_RATELIMIT_FEEDBACK } from '../lib/rateLimitStore'
import { parseOr400 } from '../validation'
import { rotulosDoRegistro } from './registroDeProvedores'

const feedbackSchema = z.strictObject({
  funcao: z.enum(FUNCOES_COM_FEEDBACK),
  nota: z.enum(NOTAS_DO_FEEDBACK),
  motivo: z.enum(MOTIVOS_DO_FEEDBACK).optional(),
  modelo: z.string().regex(FORMATO_DO_MODELO).optional(),
  nivel: z.enum(NIVEIS_DA_TRADUCAO).optional(),
})

export const tetoDoFeedback = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: chaveDoRequest,
  store: createDbRateLimitStore(METRIC_RATELIMIT_FEEDBACK),
  handler: (_req, res) => {
    res.status(429).json({ error: 'avaliações demais em pouco tempo', code: 'feedback_demais' })
  },
})

/** O modelo como rótulo: só o que o registro declara; o resto é `outro`, e sem modelo, `desconhecido`. */
function modeloConhecido(modelo: string | undefined): string {
  if (!modelo) return 'desconhecido'
  return rotulosDoRegistro().modelos.has(modelo) ? modelo : 'outro'
}

export function registrarFeedback(req: Request, res: Response): void {
  const f = parseOr400(feedbackSchema, req.body, res)
  if (!f) return
  /* O motivo é do 👎: no 👍 ele não diz nada e não vira série. */
  const motivo = f.nota === 'down' ? f.motivo : undefined
  contarFeedbackDeIa(f.funcao, f.nota, motivo)
  /* O HORÁRIO ARREDONDADO AO MINUTO: com o instante exato, a nota poderia ser casada com o rastro da explicação
     (que leva o pseudônimo) pelo horário, e o feedback deixaria de ser anônimo. */
  const agora = Math.floor(Date.now() / 60_000) * 60_000
  const metadados = {
    funcao: f.funcao,
    modelo: modeloConhecido(f.modelo),
    nivel: f.nivel,
    nota: f.nota,
    motivo,
    convidado: req.convidado === true,
  }
  langfuse().pontuar(
    { nome: 'feedback-ia', inicio: agora, fim: agora, tags: ['feedback', f.funcao, f.nota], metadados },
    { nome: `feedback-${f.funcao}`, valor: f.nota === 'up' ? 1 : 0, momento: agora, metadados },
  )
  res.status(202).json({ ok: true })
}
