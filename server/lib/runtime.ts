/**
 * ONDE ESTE CÓDIGO RODA — Node (servidor de sempre, CI, scripts) ou Cloudflare Worker.
 *
 * Regra da Fase 2 (boot preguiçoso): nenhum módulo do servidor lê ambiente ou disco ao ser importado.
 * Quem precisa saber se há disco, ou se está num isolate, pergunta AQUI, na hora de usar.
 */

/**
 * Num Worker, `navigator.userAgent` é exatamente `Cloudflare-Workers`. No Node é `Node.js/<versão>`.
 *
 * `BABEL_RUNTIME=worker` é o GANCHO DE TESTE (como `BABEL_SEM_DISCO`): faz o Node responder como o Worker, para
 * provar que a fachada de métricas não carrega o `prom-client` ali. Lido a cada chamada, nunca no import.
 */
export function ehWorker(): boolean {
  if (process.env.BABEL_RUNTIME === 'worker') return true
  return (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'Cloudflare-Workers'
}

/**
 * Há sistema de arquivos gravável (PGlite em diretório, `secret.key`, áudio em disco)? Por ora: só fora do Worker.
 *
 * `BABEL_SEM_DISCO=1` é o GANCHO DE TESTE: faz o Node responder como o Worker, para os testes exercitarem
 * o caminho sem disco (upload em stream para o R2) sem `workerd`. Lido a cada chamada, nunca no import.
 */
export function temDisco(): boolean {
  if (ehWorker()) return false
  return process.env.BABEL_SEM_DISCO !== '1'
}

/**
 * Trabalho que segue depois da resposta, sem segurar quem pediu. No Node basta não esperar a promessa —
 * mas a falha precisa ir para o log, nunca virar rejeição não tratada. A Task 11 completa o lado do
 * Worker (`ctx.waitUntil`), onde uma promessa solta morre com o fim da requisição.
 *
 * @public — ainda sem chamador: a Task 11 liga os primeiros.
 */
export function emSegundoPlano(p: Promise<unknown>): void {
  void p.catch((err: unknown) => {
    console.error('[segundo-plano] tarefa falhou:', String((err as Error)?.message ?? err).slice(0, 300))
  })
}
