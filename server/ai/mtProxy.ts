import type { Request, Response } from 'express'
import { z } from 'zod'
import { hasEntitlement } from '../lib/entitlements'
import { reserveManagedCall, refundManagedCall, registrarTokensDeLlm } from '../lib/usageQuota'
import { log } from '../lib/logger'
import { erroDeRota } from '../lib/erroDeRota'
import { nomeDoIdioma, systemComunicativo, userComunicativo } from '../../src/lib/traducao/promptComunicativo'

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
  /** Fala espontânea (microfone): usa o prompt COMUNICATIVO (sentido, não palavra por palavra). */
  falada: z.boolean().optional(),
  /** Últimas falas da conversa (≤ 3, ≤ 300 chars cada), só para referência. */
  contexto: z.array(z.string().max(300)).max(3).optional(),
}).strip()

const langName = nomeDoIdioma

export async function mtTranslateProxy(req: Request, res: Response): Promise<void> {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: 'payload inválido: text/tgt obrigatórios' })
    return
  }
  const { text, src, tgt, falada, contexto } = parsed.data

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
  /* `llama-3.3-70b-versatile` foi movido para enterprise pela Groq e responde `model_not_found`
     para uma chave normal — verificado CONTRA A API, não só na documentação. Enquanto foi o
     padrão, esta rota devolvia 502 e a cascata caía calada no opus-mt local, ou seja, o produto
     voltava à tradução literal sem dizer que tinha degradado.
     O substituto foi MEDIDO no mesmo gold set (docs/auditoria/eval-producao-v1.md): chrF++ 85,2%
     contra 56,6% do local, e o idiomático — a queixa de origem — sobe de 27,4% para 83,1%.
     ATENÇÃO: é modelo de raciocínio, e os tokens de pensamento contam como SAÍDA. Com
     `max_tokens` baixo ele devolve string VAZIA (medido: 64 tokens → vazio). O teto abaixo é
     1200 e precisa continuar folgado. */
  const model = process.env.GROQ_LLM_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

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
    /* Dois prompts, um por natureza do texto. FALA (microfone): intérprete — sentido, registro
       informal, contexto das falas anteriores (src/lib/traducao/promptComunicativo.ts, compartilhado
       com o eval). TEXTO (legenda do sistema, importação): o tradutor fiel de sempre. */
    const messages = falada
      ? [
          { role: 'system', content: systemComunicativo(tgt, src) },
          { role: 'user', content: userComunicativo(text, contexto) },
        ]
      : [
          {
            role: 'system',
            content: `Você é um tradutor profissional. Traduza o texto do usuário para ${langName(tgt)}.${origem} Responda APENAS com a tradução — sem aspas, sem comentários, sem explicações. Preserve o tom e a pontuação.`,
          },
          { role: 'user', content: text },
        ]
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        // Fala pede um pouco de liberdade para escolher a expressão natural; texto fica determinístico.
        temperature: falada ? 0.2 : 0,
        max_tokens: 1200,
        messages,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 160)
      res.status(502).json({ error: `Groq recusou a tradução (HTTP ${r.status}): ${detail}` })
      return
    }
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        completion_tokens_details?: { reasoning_tokens?: number }
      }
    }
    /* O `usage` era LIDO E JOGADO FORA. Sem ele não existe custo por usuário — e nos modelos de
       raciocínio a saída inclui os tokens de pensamento, a parte cara. Contabiliza, não limita:
       tokens só se conhecem depois da resposta, e recusar aqui já não devolveria o dinheiro. */
    void registrarTokensDeLlm(
      req.userId,
      (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0)
    )
    const translated = data.choices?.[0]?.message?.content?.trim()
    if (!translated) {
      /* RESPOSTA VAZIA TEM UMA CAUSA COMUM E NADA ÓBVIA: modelo de raciocínio que gasta o
         `max_tokens` inteiro PENSANDO, sem sobrar orçamento para a resposta. O provedor devolve
         HTTP 200 e conteúdo vazio — não há erro para ler. Medido na bancada
         (scripts/eval-fala/medir-traducao-llm.mjs): o `qwen3.7-flash` gasta 593 tokens para
         responder "Boa sorte!". Um "resposta vazia" seco mandaria quem depura procurar no lugar
         errado; o número de tokens de raciocínio aponta direto para o teto. */
      const raciocinio = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0
      const causa = raciocinio > 0
        ? `o modelo gastou ${raciocinio} tokens raciocinando dentro do teto de 1200 e não sobrou orçamento para a tradução`
        : 'o provedor devolveu conteúdo vazio'
      log('warn', { event: 'mt_vazio', route: '/api/ai/mt', raciocinio, requestId: req.requestId })
      res.status(502).json({ error: `tradução vazia: ${causa}` })
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
