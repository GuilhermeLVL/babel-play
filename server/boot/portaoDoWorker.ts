/**
 * AS TRAVAS DE BOOT NO WORKER (Fase 2). No Node, `server.ts` roda `validarBoot()` e encerra o processo em
 * qualquer achado `aborta`. No Worker não há processo para encerrar nem boot antes da primeira requisição:
 * o `worker.ts` pergunta AQUI a cada requisição até a conferência passar. Enquanto houver achado que aborta,
 * toda `/api/*` responde 503 e cada tentativa vai para o log (`boot_falhou`). Só o SUCESSO fica guardado: um
 * secret corrigido (`wrangler secret put`) passa a valer sem esperar o isolate reciclar.
 */
import { log } from '../lib/logger'
import { type Achado, validarBoot } from './validar'

let liberado = false

/** `null` quando o isolate pode servir; senão, os achados que abortam (já registrados no log). */
export function conferirBootDoWorker(): Achado[] | null {
  if (liberado) return null
  const achados = validarBoot()
  const abortam = achados.filter((a) => a.nivel === 'aborta')
  if (abortam.length > 0) {
    for (const a of abortam) {
      log('error', { event: 'boot_falhou', error: a.evento ? `${a.evento}: ${a.texto}` : a.texto })
    }
    return abortam
  }
  for (const a of achados) log('warn', { event: 'boot_aviso', error: a.texto })
  liberado = true
  return null
}
