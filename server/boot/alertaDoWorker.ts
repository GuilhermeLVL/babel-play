/**
 * LIGA O ALERTA POR E-MAIL NO WORKER. O Node liga o diário em disco e o Sentry em `preparar.ts`
 * (`ligarRegistroDeErros`); o Worker nunca passava por lá, então nenhum `log('error')` chegava a ninguém. Aqui entra o
 * destino que funciona sem disco: o e-mail pelo Resend (`server/lib/alertaPorEmail.ts`).
 *
 * Idempotente e sem efeito ao ser importado: o `worker.ts` chama no começo de cada `fetch`/`scheduled`, ANTES do
 * portão do boot, para o erro de um boot mal configurado (`boot_falhou`) também sair por e-mail. Sem a configuração
 * (`ALERTA_EMAIL_DESTINO`, `RESEND_API_KEY`, `EMAIL_REMETENTE`) não faz nada, como o Sentry sem `SENTRY_DSN`.
 */
import { sinkDeAlertaPorEmail } from '../lib/alertaPorEmail'
import { configDoAlertaPorEmail } from '../lib/config'
import { registrarSinkDeErro } from '../lib/logger'

let desligar: (() => void) | null = null

/** `true` se o alerta está ligado neste isolate (agora ou desde antes). */
export function ligarAlertaDoWorker(env: NodeJS.ProcessEnv = process.env): boolean {
  if (desligar) return true
  const cfg = configDoAlertaPorEmail(env)
  if (!cfg) return false
  desligar = registrarSinkDeErro(sinkDeAlertaPorEmail(cfg))
  return true
}

/** Só para o teste: tira o destino e permite ligar de novo. */
export function desligarAlertaDoWorkerParaTeste(): void {
  desligar?.()
  desligar = null
}
