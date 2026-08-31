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
  /* NOME NEUTRO, COM COMPATIBILIDADE. O corpo desta requisição é OpenAI-compatible puro, então
     qualquer provedor com essa API serve trocando URL, chave e modelo — zero código. O que
     atrapalhava era o NOME: apontar `GROQ_API_KEY` para o OpenRouter funciona e mente para quem
     for ler o `.env` depois. `LLM_*` é o nome honesto; os `GROQ_*` continuam válidos para não
     quebrar deploy existente.
     Medido, e é dinheiro parado: o MESMO `gpt-oss-120b` custa US$ 0,029 por mil falas no OpenRouter
     contra US$ 0,107 na Groq (docs/auditoria/eval-modelos-v1.md). */
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY
  if (!apiKey) {
    res.status(501).json({ error: 'tradução por LLM não configurada no servidor (defina LLM_API_KEY)' })
    return
  }
  const base = process.env.LLM_BASE_URL || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  /* `llama-3.3-70b-versatile` foi movido para enterprise pela Groq e responde `model_not_found`
     para uma chave normal — verificado CONTRA A API, não só na documentação. Enquanto foi o
     padrão, esta rota devolvia 502 e a cascata caía calada no opus-mt local, ou seja, o produto
     voltava à tradução literal sem dizer que tinha degradado.
     O substituto foi MEDIDO no mesmo gold set (docs/auditoria/eval-producao-v1.md): chrF++ 85,2%
     contra 56,6% do local, e o idiomático — a queixa de origem — sobe de 27,4% para 83,1%.
     ATENÇÃO: é modelo de raciocínio, e os tokens de pensamento contam como SAÍDA. Com
     `max_tokens` baixo ele devolve string VAZIA (medido: 64 tokens → vazio). O teto abaixo é
     1200 e precisa continuar folgado. */
  const model = process.env.LLM_MODEL || process.env.GROQ_LLM_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

  /* CASCATA COM RESERVA (E2 do plano de lançamento). O primário pode ser um modelo barato ou
     gratuito — a bancada mediu o `minimax-m3:free` EMPATANDO com o pago nas duas métricas
     (docs/auditoria/eval-modelos-v1.md §6) — mas a camada gratuita é INTERMITENTE: some por
     janelas inteiras com 429. A reserva é o que permite colher a economia sem apostar a
     experiência do assinante na cota de um terceiro. Só existe se as TRÊS envs estiverem
     definidas; sem elas, o comportamento é exatamente o de antes. */
  const reserva =
    process.env.LLM_RESERVA_BASE_URL && process.env.LLM_RESERVA_API_KEY && process.env.LLM_RESERVA_MODEL
      ? {
          rotulo: 'llm-reserva' as const,
          base: process.env.LLM_RESERVA_BASE_URL,
          apiKey: process.env.LLM_RESERVA_API_KEY,
          model: process.env.LLM_RESERVA_MODEL,
        }
      : null
  const provedores = [{ rotulo: 'llm-primario' as const, base, apiKey, model }, ...(reserva ? [reserva] : [])]

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
    /** Uma tentativa contra UM provedor. Falha vira valor, nunca exceção — a cascata decide. */
    const tentar = async (prov: (typeof provedores)[number]) => {
      const r = await fetch(`${prov.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prov.apiKey}` },
        body: JSON.stringify({
          model: prov.model,
          // Fala pede um pouco de liberdade para escolher a expressão natural; texto fica determinístico.
          temperature: falada ? 0.2 : 0,
          max_tokens: 1200,
          messages,
        }),
        signal: AbortSignal.timeout(12_000),
      })
      if (!r.ok) {
        return { ok: false as const, status: r.status, causa: `HTTP ${r.status}: ${(await r.text()).slice(0, 160)}` }
      }
      const data = (await r.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          completion_tokens_details?: { reasoning_tokens?: number }
        }
      }
      const texto = data.choices?.[0]?.message?.content?.trim()
      if (!texto) {
        /* RESPOSTA VAZIA TEM UMA CAUSA COMUM E NADA ÓBVIA: modelo de raciocínio que gasta o
           `max_tokens` inteiro PENSANDO — o provedor devolve HTTP 200 sem conteúdo, sem erro para
           ler. Medido: o `qwen3.7-flash` gasta 593 tokens para responder "Boa sorte!". O número de
           raciocínio na mensagem aponta direto para o teto, em vez de mandar procurar no provedor. */
        const raciocinio = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0
        return {
          ok: false as const,
          status: 200,
          causa: raciocinio > 0
            ? `resposta vazia — gastou ${raciocinio} tokens raciocinando dentro do teto de 1200`
            : 'resposta vazia do provedor',
        }
      }
      return {
        ok: true as const,
        texto,
        tokens: (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
      }
    }

    let entregue: { texto: string; tokens: number; rotulo: string; model: string } | null = null
    let ultimaFalha = 'sem provedor'
    for (const prov of provedores) {
      let resultado: Awaited<ReturnType<typeof tentar>>
      try {
        resultado = await tentar(prov)
      } catch (e) {
        // Timeout/rede também é motivo de cair para a reserva, não de responder 502 direto.
        resultado = { ok: false, status: 0, causa: String((e as Error)?.message ?? e).slice(0, 120) }
      }
      if (resultado.ok) {
        entregue = { texto: resultado.texto, tokens: resultado.tokens, rotulo: prov.rotulo, model: prov.model }
        break
      }
      ultimaFalha = resultado.causa
      /* Todo tipo de falha do primário tenta a reserva — inclusive 4xx: uma chave revogada ou um
         modelo que o provedor aposentou (aconteceu: o llama-3.3-70b sumiu do self-serve em dias)
         são exatamente os casos em que a reserva salva o assinante. */
      log('warn', {
        event: 'mt_provedor_falhou', route: '/api/ai/mt', provider: prov.rotulo,
        status: resultado.status, error: resultado.causa.slice(0, 120), requestId: req.requestId,
      })
    }

    if (!entregue) {
      res.status(502).json({ error: `tradução indisponível: ${ultimaFalha}` })
      return
    }

    /* O `usage` era LIDO E JOGADO FORA. Sem ele não existe custo por usuário — e nos modelos de
       raciocínio a saída inclui os tokens de pensamento, a parte cara. Contabiliza, não limita. */
    void registrarTokensDeLlm(req.userId, entregue.tokens)
    reservaPendente = false // consumada: a reserva vira a chamada entregue
    log('info', {
      event: 'mt_translated', route: '/api/ai/mt', provider: entregue.rotulo,
      status: 200, latencyMs: Date.now() - t0, requestId: req.requestId,
    })
    // Procedência no PAYLOAD: a origem diz o modelo que REALMENTE serviu — com a cascata, pode ser
    // o da reserva. `engine` continua 'groq-llm' por contrato com o cliente (serverLlmMt.ts e
    // capMetrics chaveiam nele); o rename é o item A5 de PROXIMOS-PASSOS.
    res.json({
      text: entregue.texto,
      engine: 'groq-llm',
      provenance: {
        kind: 'ai',
        origin: entregue.model,
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
