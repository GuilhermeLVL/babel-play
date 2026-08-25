import type { Request, Response } from 'express'
import { z } from 'zod'
import { hasEntitlement } from '../lib/entitlements'
import { reserveManagedCall, refundManagedCall } from '../lib/usageQuota'
import { log } from '../lib/logger'
import { erroDeRota } from '../lib/erroDeRota'

/**
 * Tradução via LLM (Groq) no SERVIDOR — o elo que faltava na cadeia de MT.
 *
 * Por que existe (bug real): a cadeia local (Chrome Translator → opus-mt) falha em
 * muitos ambientes e o MyMemory tem cota diária de ~5k chars — estourou e TODA a
 * tradução do app passou a devolver o texto original. Com a chave Groq que o servidor
 * já usa p/ STT/chat, um LLM rápido traduz com qualidade alta e custo ~zero no free tier.
 *
 * Honesto: sem GROQ_API_KEY responde 501 e a cadeia do cliente segue para o próximo
 * motor. `src` é opcional — o LLM detecta o idioma de origem (base do modo multi-idioma).
 */

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  src: z.string().max(20).optional(),
  tgt: z.string().min(2).max(20),
}).strip()

const LANG_NAMES: Record<string, string> = {
  pt: 'português', en: 'inglês', es: 'espanhol', fr: 'francês', de: 'alemão', it: 'italiano',
  ja: 'japonês', ko: 'coreano', zh: 'chinês', ru: 'russo', ar: 'árabe', hi: 'híndi', nl: 'holandês',
}
const langName = (code: string) => LANG_NAMES[code.split('-')[0].toLowerCase()] || code

export async function mtTranslateProxy(req: Request, res: Response): Promise<void> {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: 'payload inválido: text/tgt obrigatórios' })
    return
  }
  const { text, src, tgt } = parsed.data

  // SaaS Fatia 1b — este proxy é 100% nuvem GERENCIADA (chave do dono). Exige o entitlement; a cadeia
  // de tradução LOCAL (Chrome Translator/opus-mt/MyMemory) roda no cliente e não passa por aqui, então
  // o usuário free ainda traduz — só não usa o Groq gerenciado. FAIL-CLOSED: erro ao checar o plano
  // vira 502 (nunca passa direto), consistente com o STT e o gemini/chat.
  try {
    if (!(await hasEntitlement(req.userId, 'managedCloudLlm'))) {
      res.status(402).json({ error: 'tradução por IA gerenciada requer plano Pro', entitlement: 'managedCloudLlm' })
      return
    }
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'mt_route_error' })}` })
    return
  }

  // Configuração ANTES da reserva: sem chave não há chamada a reservar.
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    res.status(501).json({ error: 'tradução por LLM não configurada no servidor (sem GROQ_API_KEY)' })
    return
  }
  const base = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  const model = process.env.GROQ_LLM_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

  // Fair-use: RESERVA a chamada ANTES de falar com o provedor. Conferir antes e contabilizar
  // depois abria uma janela do tamanho da chamada de rede em que N requisições simultâneas liam
  // o mesmo contador e todas passavam — 20 aceitas contra teto de 5, todas cobradas (P0-1).
  // A cadeia local de tradução roda no cliente e não passa por aqui.
  if (!(await reserveManagedCall(req.userId))) {
    res.status(402).json({ error: 'limite mensal do plano atingido', code: 'quota_exceeded' })
    return
  }
  // Daqui para baixo existe uma reserva pendente: todo caminho que NÃO entrega tradução
  // precisa estorná-la, senão uma falha do provedor consome a quota sem entregar nada.
  let reservaPendente = true

  const t0 = Date.now()
  try {
    const origem = src ? ` O texto está em ${langName(src)}.` : ''
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content: `Você é um tradutor profissional. Traduza o texto do usuário para ${langName(tgt)}.${origem} Responda APENAS com a tradução — sem aspas, sem comentários, sem explicações. Preserve o tom e a pontuação.`,
          },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 160)
      res.status(502).json({ error: `Groq recusou a tradução (HTTP ${r.status}): ${detail}` })
      return
    }
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const translated = data.choices?.[0]?.message?.content?.trim()
    if (!translated) {
      res.status(502).json({ error: 'Groq devolveu resposta vazia' })
      return
    }
    reservaPendente = false // consumada: a reserva vira a chamada entregue
    log('info', {
      event: 'mt_translated', route: '/api/ai/mt', provider: 'groq-llm',
      status: 200, latencyMs: Date.now() - t0, requestId: req.requestId,
    })
    // Procedência no PAYLOAD (auditoria Fase 5): o cliente já tem o contrato de selo
    // (src/components/Provenance.tsx:18) mas precisava adivinhar o `kind` a partir do
    // nome do motor. Aqui a origem viaja junto com o dado — uma tradução por LLM é
    // `ai`, nunca `computed`, e o modelo que a produziu fica explícito.
    // Campo ADITIVO: quem só lê `text`/`engine` continua funcionando.
    res.json({
      text: translated,
      engine: 'groq-llm',
      provenance: {
        kind: 'ai',
        origin: model,
        method: 'tradução por LLM',
        limits: 'Tradução gerada por modelo de linguagem — pode conter erros de sentido, registro ou termo técnico. Confira antes de decorar.',
      },
    })
  } catch (err) {
    res.status(502).json({ error: `falha na tradução por LLM: ${erroDeRota(err, { event: 'mt_route_error' })}` })
  } finally {
    if (reservaPendente) await refundManagedCall(req.userId)
  }
}
