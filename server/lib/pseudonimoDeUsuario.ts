/**
 * O PSEUDÔNIMO DO USUÁRIO FORA DO PROCESSO — um só, para o Langfuse e para os alertas.
 *
 * Saiu de `server/ai/telemetriaDeIa.ts` (Fase 5 de prontidão, 25/09/2026) quando o alerta de gasto
 * anômalo (`server/lib/gastoAnomalo.ts`) precisou dizer QUEM gastou demais sem pôr o id do Supabase
 * num log que vai para o Sentry. Mesmo sal, mesma função: o `u_…` do alerta é o MESMO `u_…` do rastro
 * no Langfuse, e é isso que deixa o operador ir do alerta às chamadas daquele usuário sem nunca ver o
 * id real. O porquê de ser HMAC com sal, e não hash puro, está em `pseudonimo` (`server/lib/langfuse.ts`).
 */
import { createHmac } from 'node:crypto'

import { pseudonimo } from './langfuse'

/**
 * O SAL DO PSEUDÔNIMO, derivado da `SECRET_KEY` — nunca ela própria, e diferente de toda outra
 * derivação: quem obtivesse este sal (ele não sai do processo, mas a defesa é em camadas) não
 * obtém a chave que decifra credenciais nem a do hash do ranking.
 */
let sal: Buffer | undefined
export async function salDoPseudonimo(): Promise<Buffer> {
  /* Import DINÂMICO: `server/crypto.ts` resolve a SECRET_KEY no carregamento, e este módulo é
     importado pela cascata — carregá-lo não pode ser o que decide quando a chave é lida. */
  if (!sal) {
    const { CHAVE_DE_HASH } = await import('../crypto')
    sal = createHmac('sha256', CHAVE_DE_HASH).update('babel-play-web:langfuse:usuario:v1').digest()
  }
  return sal
}

/** `u_` + 24 hex, estável por usuário e irreversível fora deste servidor. */
export async function pseudonimoDoUsuario(userId: string): Promise<string> {
  return pseudonimo(await salDoPseudonimo(), String(userId))
}
