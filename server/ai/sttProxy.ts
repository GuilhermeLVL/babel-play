/**
 * Proxy de STT (chokepoint de segredos, espelha a transcrição do desktop): o ADAPTADOR do Express para
 * `admitirTranscricao` e `transcrever` (Fase F). O navegador faz POST do áudio (Ogg Opus ou WAV cru;
 * `req.body` é Buffer), opcionalmente com `x-credential-id`; o servidor resolve a chave e encaminha ao
 * Whisper de nuvem. A chave NUNCA chega ao cliente.
 *
 * A regra mora no núcleo (`server/ai/nucleo/transcrever.ts`): a porta barata (plano, portão,
 * configuração, admissão) e a transcrição (medição do áudio, cota do mês e do dia, cascata, custo,
 * limpeza do texto). Aqui fica o que é do HTTP do app: a porta GRATUITA (convidado, pool do dia, nuvem
 * de alívio — lê IP, cabeçalho e flag do request), o plano resolvido uma vez, os cabeçalhos e a
 * resposta, no instante em que o núcleo decide.
 */
import type { NextFunction, Request, Response } from 'express'

import { abrirPortaGratuita } from '../lib/convidado'
import { getEntitlements } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { ContadorIndisponivel } from '../lib/usageQuota'
import {
  admitirTranscricao,
  fecharPortaDoStt,
  type PortaDoStt,
  type ResultadoDaTranscricao,
  transcrever,
} from './nucleo/transcrever'
import { recusaContadorIndisponivel } from './reservaDeNuvem'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

/* ─────────────── a PORTA do STT: tudo que é barato, ANTES de ler o corpo ─────────────── */

/** O que a porta decidiu, do middleware até o handler. */
const portas = new WeakMap<Request, PortaDoStt>()

/**
 * A porta do app. BYOK passa direto: a chave e o limite são do usuário. A chave do DONO passa pela
 * porta GRATUITA (Fase 7: convidado, limite por IP, tetos e pool do dia — antes do entitlement, porque
 * é ela que diz ao convidado POR QUE não pode) e pela porta do núcleo. Devolve `null` quando JÁ
 * RESPONDEU.
 */
async function abrirPortaDoStt(req: Request, res: Response): Promise<PortaDoStt | null> {
  if (req.header('x-credential-id')) return { byok: true }
  const gratuita = await abrirPortaGratuita(req, res, 'stt')
  if (!gratuita) return null
  const porta = await admitirTranscricao({
    userId: req.userId,
    requestId: req.requestId,
    entitlements: getEntitlements(gratuita.plano),
    emTeste: gratuita.teste === true,
    modo: gratuita.alivio === true ? 'alivio' : 'plano',
    canal: 'app',
    perfilProtegido: null,
    registrarCusto: (usd) => gratuita.registrarCusto(usd),
  })
  if (porta.ok === false) {
    responderRecusa(res, porta)
    return null
  }
  return porta.porta
}

/** Contador fora do ar é 503 com motivo; o resto, 502 com a mensagem estável. Só se nada saiu ainda. */
function responderFalha(res: Response, err: unknown): void {
  if (res.headersSent) return
  if (err instanceof ContadorIndisponivel) responderRecusa(res, recusaContadorIndisponivel())
  else res.status(502).json({ error: erroDeRota(err, { status: 502, event: 'stt_route_error' }) })
}

/**
 * MIDDLEWARE montado ANTES do `express.raw()` em `server/routes/ai.ts` (fase 2, §2.3): o corpo de
 * até 25 MB só é lido por quem passou pelo plano, pelo portão, pela configuração e pela admissão.
 * Antes o `raw()` lia tudo e SÓ DEPOIS vinham o 402 e o 501 — memória gasta para recusar.
 *
 * A vaga em voo é solta no `close` da resposta além do `finally` da transcrição: se o `raw()` recusar
 * o corpo (413) o handler nem roda, e a vaga ficaria presa para sempre.
 */
export async function portaDoStt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const porta = await abrirPortaDoStt(req, res)
    if (!porta) return
    portas.set(req, porta)
    res.on('close', () => fecharPortaDoStt(porta))
    next()
  } catch (err) {
    responderFalha(res, err)
  }
}

/**
 * POST /api/ai/stt (OpenAI-compatible Whisper) — embrulhado no rastro de telemetria
 * (`telemetriaDeIa.ts`): um rastro por requisição, uma geração por tentativa ao provedor, com os
 * segundos de áudio REAIS e os FATURADOS lado a lado. A diferença entre os dois é o mínimo de 10 s
 * da Groq, e é ela que diz se vale juntar falas curtas antes de mandar.
 */
export async function sttTranscribeProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'stt')
  try {
    await transcreverPelaRota(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

function responderTranscricao(res: Response, r: ResultadoDaTranscricao): void {
  if (r.ok === false) responderRecusa(res, r)
  else res.json({ text: r.texto, language: r.idioma })
}

async function transcreverPelaRota(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  /* A porta normalmente já rodou no middleware (antes do `raw()`); chamada direta ao handler — os
     testes, e qualquer montagem sem o middleware — passa por ela aqui. */
  let porta: PortaDoStt | undefined = portas.get(req)
  try {
    if (!porta) {
      porta = (await abrirPortaDoStt(req, res)) ?? undefined
      if (!porta) return
    }
    await transcrever(
      { userId: req.userId, requestId: req.requestId, rastro, canal: 'app', perfilProtegido: null },
      porta,
      {
        audio: req.body as Buffer | undefined,
        credencialId: req.header('x-credential-id'),
        modelo: req.header('x-model'),
        idioma: req.header('x-language'),
        prompt: req.header('x-stt-prompt'),
      },
      { aoDecidir: (r) => responderTranscricao(res, r) },
    )
  } catch (err) {
    responderFalha(res, err)
  } finally {
    if (porta) fecharPortaDoStt(porta)
  }
}
