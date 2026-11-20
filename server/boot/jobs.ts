/**
 * OS JOBS NO NODE — agendados a partir do registro único (`server/jobs/registro.ts`), o mesmo que o
 * `scheduled` do Worker lê. Cada job é um `setTimeout` encadeado, com `unref()` (um job nunca é o motivo
 * de o processo não sair num SIGTERM): primeira passada `node.atrasoInicialMs` depois do boot (subir é o
 * momento em que o banco mais trabalha) e as seguintes a cada `node.intervaloMs` — os mesmos atrasos e
 * a mesma cadência dos agendadores que cada módulo tinha antes do registro.
 *
 * Só o processo que prepara os dados os agenda (o primário, no cluster): uma varredura por deploy, não
 * uma por worker. E, mesmo que dois processos agendassem, a lease de `executarJob` faz a passada rodar
 * uma vez. Job com `condicao` falsa no boot não é agendado (era o `if` de cada bloco aqui); a condição é
 * conferida de novo a cada passada.
 */
import { JOBS } from '../jobs/registro'

export async function agendarJobsNoNode(): Promise<void> {
  const { executarJob } = await import('../jobs/executar')
  for (const job of JOBS) {
    if (job.condicao && !job.condicao(process.env)) continue
    const armar = (ms: number) => {
      const relogio = setTimeout(() => {
        // `executarJob` não lança por falha do job (loga `job_falhou`); o `catch` é para o que sobrar.
        void executarJob(job.nome)
          .catch((err: unknown) =>
            console.error(`[jobs] ${job.nome}:`, String((err as Error)?.message ?? err).slice(0, 300)),
          )
          .finally(() => armar(job.node.intervaloMs))
      }, ms)
      relogio.unref?.()
    }
    armar(job.node.atrasoInicialMs)
    console.log(
      `[jobs] ${job.nome}: primeira passada em ${Math.round(job.node.atrasoInicialMs / 60_000)} min, ` +
        `depois a cada ${Math.round(job.node.intervaloMs / 3_600_000)} h`,
    )
  }
}
