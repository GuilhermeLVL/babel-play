/**
 * CONTADOR DE CONSULTAS PARA OS TESTES DE CUSTO DE ROTA.
 *
 * No SQLite os testes embrulhavam `client.execute` e `client.batch` do libsql. No Postgres o gancho
 * de produção é `registrarObservadorDeConsultas` (`server/db/observadorDeConsultas.ts`), que o
 * `db.ts` chama a cada instrução — avulsa ou dentro de `emTransacao`/`emLote`. Este contador só
 * acrescenta a conta de IDAS AO BANCO como o `batch` a fazia: embrulha o `transaction` do PGlite
 * (`db.$client`) para que uma transação inteira valha UMA ida, e as instruções de dentro não.
 *
 *   idas        — chamadas ao banco: uma por consulta avulsa, uma por transação (o `batch` de antes);
 *   instrucoes  — o texto SQL de cada instrução, avulsa ou dentro de transação (o que o observador vê).
 *
 * Só para o PGlite do harness. Um contador por arquivo; `parar()` desfaz os dois ganchos.
 */
type Carregar = (spec: string) => Promise<any>

export interface ContadorDeConsultas {
  idas: number
  instrucoes: string[]
  zerar: () => void
  parar: () => void
}

/** `carregar` é o `load` do harness (`h.load`/`s.load`): o mesmo módulo `db` do servidor. */
export async function contarConsultas(carregar: Carregar): Promise<ContadorDeConsultas> {
  const { db, bancoEmbutido } = await carregar('../../server/db/db')
  const { registrarObservadorDeConsultas } = await carregar('../../server/db/observadorDeConsultas')
  if (!bancoEmbutido()) throw new Error('contarConsultas: só para o PGlite do harness')

  /* Transações abertas agora. O PGlite serializa: uma consulta avulsa espera a transação terminar, então
     o que o observador vê com uma transação aberta é instrução DE DENTRO dela. */
  let abertas = 0
  const c: ContadorDeConsultas = {
    idas: 0,
    instrucoes: [],
    zerar() {
      c.idas = 0
      c.instrucoes = []
    },
    parar() {
      registrarObservadorDeConsultas(undefined)
      cliente.transaction = original
    },
  }
  registrarObservadorDeConsultas(({ instrucoes }: { instrucoes: string[] }) => {
    if (abertas === 0) c.idas += 1
    c.instrucoes.push(...instrucoes)
  })

  const cliente = db.$client as { transaction: (fn: (tx: any) => Promise<unknown>) => Promise<unknown> }
  const original = cliente.transaction
  cliente.transaction = function (this: unknown, fn: (tx: any) => Promise<unknown>) {
    c.idas += 1
    abertas += 1
    return original.call(this, fn).finally(() => {
      abertas -= 1
    })
  }
  return c
}
