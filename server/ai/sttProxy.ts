/**
 * Proxy de STT (chokepoint de segredos, espelha a transcrição do desktop). O
 * navegador POST áudio WAV bruto (`req.body` é Buffer) ao header `x-credential-id`;
 * o server resolve a credencial → segredo + baseUrl, valida SSRF, e encaminha ao
 * Whisper de nuvem (OpenAI-compatible `/audio/transcriptions`). A chave NUNCA
 * chega ao cliente.
 */
import type { Request, Response } from 'express'
import { credentialsRepo } from '../db/repositories/credentials'
import { hasEntitlement } from '../lib/entitlements'
import { reserveManagedCall, refundManagedCall } from '../lib/usageQuota'
import { assertPublicUrl } from './ssrf'
import { erroDeRota } from '../lib/erroDeRota'
import { normalizarIdiomaDoWhisper } from '../lib/idiomaDoWhisper'

/** POST /api/ai/stt/transcribe (OpenAI-compatible Whisper). */
export async function sttTranscribeProxy(req: Request, res: Response): Promise<void> {
  // Reserva pendente de quota gerenciada. Só o ramo da chave do DONO reserva; BYOK não.
  let reservaPendente = false
  try {
    const audioBuffer = req.body as Buffer | undefined
    if (!audioBuffer || !audioBuffer.length) {
      res.status(400).json({ error: 'corpo de áudio vazio' })
      return
    }

    // Duas formas de resolver a chave:
    //  (a) x-credential-id → credencial POR USUÁRIO (cifrada no DB) — modo BYO-key.
    //  (b) SEM credencial → chave do DONO no servidor (env GROQ_API_KEY). É o modo padrão
    //      "distribuível em escala": o usuário não precisa de chave nenhuma, o app só funciona.
    const credentialId = req.header('x-credential-id')
    let baseUrl: string | null
    let secret: string | null
    let defaultModel: string | null

    if (credentialId) {
      ({ baseUrl, secret, defaultModel } = await credentialsRepo.getSecret(req.userId, credentialId))
    } else {
      // SaaS Fatia 1b — STT de nuvem GERENCIADA (chave do DONO) exige o entitlement. BYOK (ramo `if`)
      // e o STT local (no navegador) passam livres: só o caminho que gasta a chave do serviço é gateado.
      if (!(await hasEntitlement(req.userId, 'managedCloudStt'))) {
        res.status(402).json({ error: 'STT de nuvem gerenciada requer plano Pro', entitlement: 'managedCloudStt' })
        return
      }
      // Fair-use: RESERVA antes de chamar o provedor (P0-1 — conferir antes e contabilizar
      // depois deixava N requisições simultâneas passarem pelo mesmo teto). BYOK/local não
      // chegam aqui, então só o uso da chave do DONO consome quota.
      if (!(await reserveManagedCall(req.userId))) {
        res.status(402).json({ error: 'limite mensal do plano atingido', code: 'quota_exceeded' })
        return
      }
      reservaPendente = true
      secret = process.env.GROQ_API_KEY ?? process.env.STT_API_KEY ?? null
      baseUrl = process.env.GROQ_BASE_URL ?? process.env.STT_BASE_URL ?? 'https://api.groq.com/openai/v1'
      defaultModel = process.env.STT_MODEL ?? 'whisper-large-v3-turbo'
      if (!secret) {
        res.status(501).json({ error: 'STT de nuvem não configurado: defina GROQ_API_KEY no servidor (.env)' })
        return
      }
    }

    if (!baseUrl) {
      res.status(400).json({ error: 'credencial sem baseUrl' })
      return
    }
    if (!secret) {
      res.status(400).json({ error: 'credencial sem segredo' })
      return
    }
    await assertPublicUrl(baseUrl) // anti-SSRF

    const model = req.header('x-model') || defaultModel || 'whisper-large-v3-turbo'
    const lang = req.header('x-language')
    const endpoint = baseUrl.replace(/\/+$/, '') + '/audio/transcriptions'

    /* PEDIMOS `verbose_json` PARA NÃO JOGAR FORA O IDIOMA.
       O Whisper identifica o idioma a partir do ÁUDIO, dentro do decode. Pedindo `json` recebíamos
       só o texto, e o cliente reconstruía o idioma passando esse texto por um detector de
       palavras-função — que não tem sinal em fala curta. Foi assim que uma sessão inteira em
       espanhol apareceu rotulada como inglês. `verbose_json` traz `language` no MESMO custo de API.

       FormData é de uso único (o corpo é consumido no envio), então cada tentativa monta a sua. */
    const montarForm = (formato: 'verbose_json' | 'json'): FormData => {
      const f = new FormData()
      f.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
      f.append('model', model)
      if (lang) f.append('language', lang)
      f.append('response_format', formato)
      return f
    }
    // Sem anotação de retorno: neste arquivo `Response` é o da Express (importado acima), não o
    // do fetch. Deixar o TypeScript inferir evita a colisão de nomes.
    const enviar = (formato: 'verbose_json' | 'json') => fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secret },
      body: montarForm(formato),
      signal: AbortSignal.timeout(30_000),
    })

    let upstream = await enviar('verbose_json')
    // Nem todo endpoint OpenAI-compatible implementa `verbose_json`. Quando ele RECUSA o formato
    // (4xx), repetimos em `json` — degrada para o comportamento antigo (sem idioma) em vez de
    // quebrar a transcrição de quem usa outro provedor. Erro 5xx não é sobre o formato: não repete.
    if (!upstream.ok && upstream.status >= 400 && upstream.status < 500) {
      upstream = await enviar('json')
    }

    if (!upstream.ok) {
      const text = await upstream.text()
      res.status(502).json({ error: 'STT upstream HTTP ' + upstream.status + ': ' + text.slice(0, 160) })
      return
    }

    const j = await upstream.json()
    // Consumada. Antes daqui havia um `recordManagedCall` incondicional, que contabilizava
    // TAMBÉM o caminho BYOK — uso da chave do próprio usuário descontava da quota gerenciada.
    reservaPendente = false
    // `language` vazio = o provedor não informou (ou caímos no `json`): o cliente volta ao
    // detector de texto. Nunca inventamos um código aqui.
    res.json({ text: j.text ?? '', language: normalizarIdiomaDoWhisper(j.language) })
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: erroDeRota(err, { event: 'stt_route_error' }) })
  } finally {
    if (reservaPendente) await refundManagedCall(req.userId)
  }
}
