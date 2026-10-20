/**
 * MODO CLUSTER (F6-01) — opt-in por `CLUSTER_WORKERS`. Saiu do `server.ts` sem mudar de comportamento.
 *
 * A carga mediu vazão PLANA (~100 req/s) e latência crescendo linear com a concorrência a partir
 * de 2 VUs: saturação de processo único, não consulta lenta (sem concorrência, `/api/sessions`
 * responde em 7 ms). Índice não resolve fila; mais processo resolve.
 *
 * Exige Postgres remoto (`DATABASE_URL=postgres://…`): o PGlite embutido é de processo único e a
 * trava `erroDeClusterComBancoEmbutido` recusa o boot. As outras barreiras já caíram: rate limit
 * contado no banco (`rateLimitStore.ts`, `localKeys: false`) e áudio fora do `cwd` (`AUDIO_DIR`).
 *
 * Só o primário migra: os workers são forkados DEPOIS de `startServer()` do primário terminar, o
 * que elimina a contenção de lock no boot que hoje depende de restart do orquestrador.
 */
import { erroDeClusterComBancoEmbutido } from '../lib/diretorios'

type IniciarServidor = (opcoes?: { prepararDados?: boolean }) => Promise<void>

/**
 * O QUE O PRIMÁRIO FAZ AO RECEBER O SINAL — nulo fora do cluster.
 *
 * Vive no escopo do módulo porque quem registra o handler é o `startServer()` (que não sabe nada
 * de cluster) e quem sabe quais workers existem é o `iniciar()`, que roda DEPOIS. Uma variável
 * lida no momento do sinal resolve as duas metades sem `startServer()` ganhar um parâmetro sobre
 * um modo que ele não conhece.
 */
let repassarSinal: (() => void) | null = null

/** Chamado pelo desligamento do `startServer()`: repassa o sinal aos workers (nada fora do cluster). */
export function repassarSinalAosWorkers(): void {
  repassarSinal?.()
}

export async function iniciar(startServer: IniciarServidor): Promise<void> {
  const pedidos = Number(process.env.CLUSTER_WORKERS || 0)
  if (!Number.isFinite(pedidos) || pedidos <= 1) {
    await startServer()
    return
  }

  /*
   * CAPTURA DE LOOPBACK NAO SOBREVIVE AO CLUSTER (achado A61).
   *
   * O dispositivo WASAPI e um recurso unico do SISTEMA, e a exclusao que protege ele
   * (`LoopbackExclusion`, em `server/audio/loopback.ts`) e um contador em memoria de UM processo.
   * Com N processos, N exclusoes independentes acham que tem o dispositivo: duas capturas
   * simultaneas passam pelo mutex e brigam pelo hardware. Declarar a incompatibilidade e melhor
   * que descobri-la como audio cortado em producao.
   */
  if (process.platform === 'win32') {
    console.warn('[cluster] captura de loopback do servidor desligada: o mutex do dispositivo')
    console.warn('   WASAPI e por processo, e /api/audio/loopback/* recusa neste modo.')
  }

  /* O PGlite é de processo único: com o banco embutido, o cluster não sobe (ver a trava). */
  const clusterComBancoEmbutido = erroDeClusterComBancoEmbutido()
  if (clusterComBancoEmbutido) {
    console.error(`[boot] ABORTADO: ${clusterComBancoEmbutido}`)
    process.exit(1)
  }

  const { default: cluster } = await import('node:cluster')
  const { availableParallelism } = await import('node:os')
  const workers = Math.min(pedidos, availableParallelism())

  if (cluster.isPrimary) {
    /*
     * O primário sobe o servidor INTEIRO primeiro — é isso que garante migrations aplicadas
     * uma vez só, antes de qualquer worker existir. Ele também atende, então não há processo
     * ocioso.
     */
    await startServer()
    /*
     * O RESPAWN PRECISA SABER QUE ESTAMOS DESLIGANDO (Fase 5).
     *
     * O `cluster.on('exit')` abaixo refazia QUALQUER worker que morresse — que é o comportamento
     * certo para queda acidental e o errado para desligamento: no SIGTERM os workers terminam de
     * propósito, e cada um deles era refeito enquanto o primário drenava. O resultado é um
     * processo recém-forkado, sem sinal nenhum recebido, segurando a porta depois de o primário
     * sair; para o orquestrador o container "não termina".
     *
     * A trava é uma variável simples, e não um `removeAllListeners`, porque o handler também
     * precisa continuar imprimindo a saída de cada worker durante o desligamento — quem opera quer
     * ver os N processos indo embora, não silêncio.
     */
    let desligandoOCluster = false
    repassarSinal = () => {
      desligandoOCluster = true
      /* O sinal chega ao primário e a MAIS NINGUÉM quando vem de um `docker stop` (SIGTERM para o
         PID 1) ou de um `kill` avulso: só o Ctrl+C do terminal alcança o grupo inteiro. Repassar é
         o que faz cada worker rodar o seu próprio dreno em vez de morrer no SIGKILL seguinte. */
      for (const worker of Object.values(cluster.workers ?? {})) {
        try {
          worker?.process.kill('SIGTERM')
        } catch {
          /* já morreu */
        }
      }
    }
    for (let i = 1; i < workers; i++) cluster.fork()
    cluster.on('exit', (worker, code, signal) => {
      if (desligandoOCluster) {
        console.log(
          `[cluster] worker ${worker.process.pid} saiu (${signal || code}) durante o desligamento; NÃO refazendo`,
        )
        return
      }
      console.error(`[cluster] worker ${worker.process.pid} saiu (${signal || code}); refazendo`)
      cluster.fork()
    })
    console.log(`[cluster] ${workers} processos (1 primário + ${workers - 1} workers)`)
    return
  }

  /*
   * Worker: NÃO migra e NÃO faz seed — o primário já fez, e repetir seria contenção de lock
   * pelo caminho que o cluster existe para eliminar. `cluster` compartilha o listener, então
   * o `app.listen` na mesma porta é o comportamento correto, não um EADDRINUSE.
   */
  await startServer({ prepararDados: false })
}
