import type { Request, Response } from 'express'
import { z } from 'zod'

import { nomeDoIdioma, systemComunicativo, userComunicativo } from '../../src/lib/traducao/promptComunicativo'
import { getEntitlementsForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'
import { responderErro } from '../lib/respostaDeErro'
import { refundManagedCall, registrarTokensDeLlm, reserveManagedCall } from '../lib/usageQuota'
import { chamarChat, type MensagemDeChat, type RespostaDeChat } from './llmClient'
import { cascataDeTraducao } from './provedores'

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

const bodySchema = z
  .object({
    text: z.string().min(1).max(4000),
    src: z.string().max(20).optional(),
    tgt: z.string().min(2).max(20),
    /** Fala espontânea (microfone): usa o prompt COMUNICATIVO (sentido, não palavra por palavra). */
    falada: z.boolean().optional(),
    /** Últimas falas da conversa (≤ 3, ≤ 300 chars cada), só para referência. */
    contexto: z.array(z.string().max(300)).max(3).optional(),
  })
  .strip()

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
  /* UMA leitura de plano, dois usos. `hasEntitlement` resolve o plano do zero a cada chamada (ida
     ao banco em `subscriptions`), e daqui para baixo precisamos de dois entitlements: o que deixa
     entrar e o que escolhe o modelo. */
  let planoDoUsuario
  try {
    planoDoUsuario = await getEntitlementsForUser(req.userId)
    if (!planoDoUsuario.managedCloudLlm) {
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
  /* QUEM E O PROVEDOR sai de `server/ai/provedores.ts`: a cadeia de fallback de env e os defaults
     de modelo estavam escritos aqui, no `server.ts` e no gateway, com ordens ligeiramente
     diferentes — e um default corrigido num lugar deixava os outros dois com o modelo antigo
     (achado A31). A explicacao de POR QUE existe reserva mora la, junto da funcao. */
  const provedores = cascataDeTraducao({ modelosGrandes: planoDoUsuario.largerModels })
  if (provedores.length === 0) {
    res.status(501).json({ error: 'tradução por LLM não configurada no servidor (defina LLM_API_KEY)' })
    return
  }

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
    const messages: MensagemDeChat[] = falada
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
    /**
     * Uma tentativa contra UM provedor — agora pelo cliente unico (`server/ai/llmClient.ts`).
     *
     * O corpo desta funcao era a setima copia da mesma chamada, com o seu proprio timeout, o seu
     * proprio tratamento de resposta vazia e o seu proprio formato de erro. O que era ESPECIFICO
     * da traducao e o que sobrou aqui: 12 s (alguem esta esperando legenda na tela) e o teto de
     * 1200 tokens, folgado de proposito porque modelo de raciocinio gasta saida pensando.
     */
    const tentar = (prov: { base: string; apiKey?: string | null; model: string }) =>
      chamarChat({
        base: prov.base,
        apiKey: prov.apiKey,
        model: prov.model,
        messages,
        // Fala pede um pouco de liberdade para escolher a expressao natural; texto fica deterministico.
        temperature: falada ? 0.2 : 0,
        maxTokens: 1200,
        timeoutMs: 12_000,
      })

    let entregue: { texto: string; tokens: number; rotulo: string; model: string } | null = null
    let ultimaFalha = 'sem provedor'
    for (const prov of provedores) {
      /* Sem `try/catch` aqui: `chamarChat` nunca lanca — timeout e rede viram resultado com causa,
         que e o que a cascata precisa para decidir e para o log dizer QUAL perna quebrou. */
      const resultado: RespostaDeChat = await tentar(prov)
      if (resultado.ok) {
        entregue = {
          texto: resultado.texto ?? '',
          tokens: resultado.tokens ?? 0,
          rotulo: prov.rotulo,
          model: prov.model,
        }
        break
      }
      ultimaFalha = resultado.causa ?? 'falha sem causa declarada'
      /* Todo tipo de falha do primário tenta a reserva — inclusive 4xx: uma chave revogada ou um
         modelo que o provedor aposentou (aconteceu: o llama-3.3-70b sumiu do self-serve em dias)
         são exatamente os casos em que a reserva salva o assinante. */
      log('warn', {
        event: 'mt_provedor_falhou',
        route: '/api/ai/mt',
        provider: prov.rotulo,
        status: resultado.status,
        error: (resultado.causa ?? '').slice(0, 120),
        requestId: req.requestId,
      })
    }

    if (!entregue) {
      /* O CORPO DO TERCEIRO NÃO É PARA O CLIENTE (achado da Fase 4). `ultimaFalha` carrega a causa
         do último provedor — e a causa de um HTTP não-ok é `HTTP <status>: <160 chars do corpo>`
         (`llmClient.ts`), ou seja, texto escrito pelo provedor, que não é contrato nosso e pode
         trazer nome de modelo interno, id de organização ou trecho do pedido. Vai inteira para o
         log; o cliente recebe código estável + `requestId` para citar. */
      log('error', {
        event: 'mt_indisponivel',
        route: '/api/ai/mt',
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: req.requestId,
      })
      responderErro(
        res,
        502,
        req.requestId ? `tradução indisponível (req: ${req.requestId})` : 'tradução indisponível',
        'provedor_indisponivel',
      )
      return
    }

    /* O `usage` era LIDO E JOGADO FORA. Sem ele não existe custo por usuário — e nos modelos de
       raciocínio a saída inclui os tokens de pensamento, a parte cara. Contabiliza, não limita. */
    void registrarTokensDeLlm(req.userId, entregue.tokens)
    reservaPendente = false // consumada: a reserva vira a chamada entregue
    log('info', {
      event: 'mt_translated',
      route: '/api/ai/mt',
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: req.requestId,
    })
    // Procedência no PAYLOAD: a origem diz o modelo que REALMENTE serviu — com a cascata, pode ser
    // o da reserva. `engine` é o id NEUTRO do adaptador (A5): 'groq-llm' mentia quando o provedor
    // era outro. Sessões antigas gravadas com o rótulo velho seguem legíveis (VocabularyPanel
    // mantém as duas chaves).
    res.json({
      text: entregue.texto,
      engine: 'server-llm-mt',
      provenance: {
        kind: 'ai',
        origin: entregue.model,
        method: 'tradução por LLM',
        limits:
          'Tradução gerada por modelo de linguagem — pode conter erros de sentido, registro ou termo técnico. Confira antes de decorar.',
      },
    })
  } catch (err) {
    res.status(502).json({ error: `falha na tradução por LLM: ${erroDeRota(err, { event: 'mt_route_error' })}` })
  } finally {
    if (reservaPendente) await refundManagedCall(req.userId)
  }
}
