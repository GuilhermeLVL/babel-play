/**
 * CONTADOR DE CONSULTAS PARA OS TESTES DE CUSTO DE ROTA.
 *
 * No SQLite os testes embrulhavam `client.execute` e `client.batch` do libsql. No Postgres o gancho
 * de produção é `registrarObservadorDeConsultas` (`server/db/observadorDeConsultas.ts`), que o
 * `db.ts` chama a cada consulta FORA de transação. As transações (`emTransacao`/`emLote`, o que era
 * o `batch`) rodam num objeto próprio do PGlite e não passam por ali; para a conta continuar a de
 * antes, este contador também embrulha o `transaction` do PGlite (`db.$client`): cada transação é
 * UMA ida ao banco, como o `batch` era, e as instruções de dentro entram na lista.
 *
 *   idas        — chamadas ao banco: uma por consulta avulsa, uma por transação (o `batch` de antes);
 *   instrucoes  — o texto SQL de cada instrução, avulsa ou dentro de transação;
 *   avulsas     — só as de FORA de transação. É o que o contador antigo via quando a transação era
 *                 INTERATIVA (`db.transaction` do libsql, como a reconstrução dos agregados): ela rodava
 *                 num objeto próprio do driver, e o embrulho de `client.execute` não a enxergava.
 *
 * Só para o PGlite do harness. Um contador por arquivo; `parar()` desfaz os dois ganchos.
 */
type Carregar = (spec: string) => Promise<any>

export interface ContadorDeConsultas {
  idas: number
  instrucoes: string[]
  avulsas: string[]
  zerar: () => void
  parar: () => void
}

const textoDe = (q: unknown): string =>
  typeof q === 'string' ? q : String((q as { text?: string; sql?: string } | undefined)?.text ?? (q as any)?.sql ?? '')

/** `carregar` é o `load` do harness (`h.load`/`s.load`): o mesmo módulo `db` do servidor. */
export async function contarConsultas(carregar: Carregar): Promise<ContadorDeConsultas> {
  const { db, bancoEmbutido } = await carregar('../../server/db/db')
  const { registrarObservadorDeConsultas } = await carregar('../../server/db/observadorDeConsultas')
  if (!bancoEmbutido) throw new Error('contarConsultas: só para o PGlite do harness')

  const c: ContadorDeConsultas = {
    idas: 0,
    instrucoes: [],
    avulsas: [],
    zerar() {
      c.idas = 0
      c.instrucoes = []
      c.avulsas = []
    },
    parar() {
      registrarObservadorDeConsultas(undefined)
      cliente.transaction = original
    },
  }
  registrarObservadorDeConsultas(({ instrucoes }: { instrucoes: string[] }) => {
    c.idas += 1
    c.instrucoes.push(...instrucoes)
    c.avulsas.push(...instrucoes)
  })

  const cliente = db.$client as { transaction: (fn: (tx: any) => Promise<unknown>) => Promise<unknown> }
  const original = cliente.transaction
  cliente.transaction = function (this: unknown, fn: (tx: any) => Promise<unknown>) {
    c.idas += 1
    return original.call(this, async (tx: any) => {
      const consulta = tx.query.bind(tx)
      tx.query = (q: unknown, ...resto: unknown[]) => {
        c.instrucoes.push(textoDe(q))
        return consulta(q, ...resto)
      }
      return fn(tx)
    })
  }
  return c
}
