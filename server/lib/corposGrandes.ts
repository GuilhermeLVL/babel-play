/**
 * SEMÁFORO DE CORPOS GRANDES (fase 2 de prontidão, §2.3/§4.1; ADR 0009).
 *
 * O medido que motivou: numa VM de 1 GB, 4 uploads simultâneos de 120 MB em
 * `POST /api/sessions/:id/audio` levaram o RSS a 1.011 MB. Tirar o corpo da memória (ver
 * `corpoEmArquivo.ts`) resolve o custo POR upload; este módulo resolve QUANTOS existem ao mesmo
 * tempo. Mesmo em streaming, cada corpo grande ocupa disco temporário, banda e uma conexão por
 * minutos — e o import Anki ainda precisa do `.apkg` inteiro na memória (o JSZip lê de Buffer).
 *
 * A vaga é pedida ANTES de ler um byte do corpo: recusar depois de ler seria pagar o custo que o
 * semáforo existe para evitar. Excedente recebe 429 com `Retry-After` e código `upload_ocupado`.
 *
 * O estado é do PROCESSO, e isto é deliberado: o recurso protegido (memória e disco desta máquina)
 * também é. Com mais de uma réplica cada uma tem o seu teto — que é exatamente o que se quer.
 */
import type { NextFunction, Request, Response } from 'express'

import { descartarRestoDoCorpo } from './corpoEmArquivo'
import { envelopeDeErro } from './respostaDeErro'

export interface LimitesDeCorpos {
  porUsuario: number
  porProcesso: number
}

export interface VagaConcedida {
  ok: true
  liberar: () => void
}
export interface VagaRecusada {
  ok: false
  motivo: 'usuario' | 'processo'
}
export type Vaga = VagaConcedida | VagaRecusada

export interface SemaforoDeCorpos {
  adquirir(chave: string): Vaga
  /** Corpos grandes em voo agora (diagnóstico e teste). */
  emVoo(): number
}

const PADRAO: LimitesDeCorpos = { porUsuario: 1, porProcesso: 2 }

function inteiroPositivo(bruto: string | undefined, padrao: number): number {
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 ? n : padrao
}

/** Lidos UMA vez, no carregamento do módulo; inválido ou ausente cai no padrão (1 e 2). */
export function limitesDeCorposGrandes(env: NodeJS.ProcessEnv = process.env): LimitesDeCorpos {
  return {
    porUsuario: inteiroPositivo(env.UPLOADS_GRANDES_POR_USUARIO, PADRAO.porUsuario),
    porProcesso: inteiroPositivo(env.UPLOADS_GRANDES_POR_PROCESSO, PADRAO.porProcesso),
  }
}

export function criarSemaforoDeCorpos(limites: LimitesDeCorpos): SemaforoDeCorpos {
  const porChave = new Map<string, number>()
  let total = 0

  return {
    adquirir(chave) {
      if (total >= limites.porProcesso) return { ok: false, motivo: 'processo' }
      const doUsuario = porChave.get(chave) ?? 0
      if (doUsuario >= limites.porUsuario) return { ok: false, motivo: 'usuario' }
      total++
      porChave.set(chave, doUsuario + 1)

      /* IDEMPOTENTE. A liberação é ligada a `close` do response, e quem chama pode também liberar
         no `finally`; duas chamadas para o mesmo request abririam uma vaga fantasma e o teto
         deixaria de valer em silêncio. */
      let liberada = false
      return {
        ok: true,
        liberar() {
          if (liberada) return
          liberada = true
          total--
          const resta = (porChave.get(chave) ?? 1) - 1
          if (resta > 0) porChave.set(chave, resta)
          else porChave.delete(chave)
        },
      }
    },
    emVoo: () => total,
  }
}

/** O semáforo do processo — um só para todas as rotas de corpo grande. */
export const semaforoDeCorposGrandes = criarSemaforoDeCorpos(limitesDeCorposGrandes())

/** Segundos sugeridos ao cliente antes de tentar de novo. Um upload grande leva dezenas de segundos. */
export const ESPERA_SUGERIDA_S = 15

/**
 * Middleware: pede a vaga antes de qualquer leitura do corpo e a devolve quando o response fecha
 * (`close` dispara no fim normal E quando o cliente desiste — os dois casos em que a vaga precisa
 * voltar). Monte-o ANTES de qualquer parser de corpo da rota.
 */
export function vagaDeCorpoGrande(semaforo: SemaforoDeCorpos = semaforoDeCorposGrandes) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const vaga = semaforo.adquirir(String(req.userId))
    if (!vaga.ok) {
      const { motivo } = vaga as VagaRecusada
      descartarRestoDoCorpo(req)
      res.setHeader('Retry-After', String(ESPERA_SUGERIDA_S))
      res
        .status(429)
        .json(
          envelopeDeErro(
            motivo === 'usuario'
              ? 'já existe um envio grande seu em andamento; espere ele terminar e tente de novo.'
              : 'o servidor está recebendo outros envios grandes agora; tente de novo em alguns segundos.',
            'upload_ocupado',
            { motivo },
          ),
        )
      return
    }
    res.once('close', vaga.liberar)
    res.once('finish', vaga.liberar)
    next()
  }
}
