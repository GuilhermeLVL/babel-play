/**
 * RECONCILIA `seed_credits` CONTRA A REGRA — o passivo que o endpoint aberto deixou.
 *
 * O QUE ACONTECEU. Até 01/09 `POST /api/metrics/seeds/creditar` gravava o `amount` e o `xp` que o
 * cliente mandasse, com um `creditoId` que era qualquer string de 8 a 80 caracteres. As linhas
 * gravadas naquele período ficaram no banco, e o saldo as soma até hoje: `computeProfile` lê
 * `seed_credits` inteiro. Endurecer a rota impediu linhas NOVAS; não desfez as antigas.
 *
 * A REGRA DESTE SCRIPT, e ela vale para qualquer linha, de qualquer época:
 *
 *   o valor de um crédito é `valorDoCredito(creditoId)`, e nada mais.
 *
 * Daí saem os três casos, sem exceção e sem julgamento caso a caso:
 *
 *   - o `creditoId` NÃO resolve  → a linha é soft-deletada (`deleted_at`). Não é apagada: o
 *     razão continua auditável, e as duas consultas que somam o saldo já filtram `deleted_at`;
 *   - resolve e o valor DIVERGE  → `amount` e `xp` passam a ser os da regra, e `reason` também
 *     (a posse de conquista é derivada dele);
 *   - resolve e bate            → nada a fazer.
 *
 * IDEMPOTENTE por construção: rodar duas vezes seguidas não muda nada na segunda, porque a
 * segunda encontra tudo já igual à regra. É o que permite rodá-lo como parte de um deploy.
 *
 * Uso:
 *   npx tsx scripts/economia/reconciliar-creditos.ts                 # só relata (padrão)
 *   npx tsx scripts/economia/reconciliar-creditos.ts --aplicar       # escreve
 *   DATABASE_URL=file:./copia.db npx tsx ... --aplicar               # contra outro banco
 *
 * SEM `--aplicar` ELE NÃO ESCREVE NADA. O padrão é o relatório porque a decisão de mexer em saldo
 * é de quem opera, não de quem roda o script por engano.
 */
import { createClient } from '@libsql/client'
import { valorDoCredito, ehRecusa } from '../../src/core/economiaAutoridade'

const aplicar = process.argv.includes('--aplicar')
const url = process.env.DATABASE_URL ?? 'file:./data/babel.db'
const cliente = createClient({ url })

interface Linha {
  id: string
  user_id: string
  credito_id: string
  amount: number
  xp: number
  reason: string | null
}

const n = (x: unknown) => Number(x ?? 0)

async function main() {
  const { rows } = await cliente.execute(
    'select id, user_id, credito_id, amount, xp, reason from seed_credits where deleted_at is null order by credito_id',
  )
  const linhas = rows as unknown as Linha[]

  const remover: Array<{ linha: Linha; motivo: string }> = []
  const corrigir: Array<{ linha: Linha; seeds: number; xp: number; reason: string }> = []
  let intactas = 0

  for (const l of linhas) {
    const v = valorDoCredito(l.credito_id)
    if (ehRecusa(v)) {
      remover.push({ linha: l, motivo: v.erro })
      continue
    }
    if (n(l.amount) !== v.seeds || n(l.xp) !== v.xp || l.reason !== v.reason) {
      corrigir.push({ linha: l, seeds: v.seeds, xp: v.xp, reason: v.reason })
      continue
    }
    intactas++
  }

  const somaDe = (xs: Linha[]) => xs.reduce((t, l) => t + n(l.amount), 0)
  const antes = somaDe(linhas)
  const depois = antes
    - somaDe(remover.map((r) => r.linha))
    - corrigir.reduce((t, c) => t + n(c.linha.amount) - c.seeds, 0)

  console.log(`\nbanco: ${url}`)
  console.log(`modo:  ${aplicar ? 'APLICAR (escreve)' : 'relatório (não escreve)'}\n`)
  console.log(`linhas vivas:      ${linhas.length}`)
  console.log(`  já corretas:     ${intactas}`)
  console.log(`  a corrigir:      ${corrigir.length}`)
  console.log(`  a soft-deletar:  ${remover.length}`)
  console.log(`\nSeeds creditadas:  ${antes} → ${depois}  (${depois - antes >= 0 ? '+' : ''}${depois - antes})\n`)

  for (const { linha, motivo } of remover) {
    console.log(`  fora  ${linha.credito_id.padEnd(34)} ${String(linha.amount).padStart(6)}  ${motivo}`)
  }
  for (const c of corrigir) {
    console.log(`  ajus  ${c.linha.credito_id.padEnd(34)} ${String(c.linha.amount).padStart(6)} → ${String(c.seeds).padStart(5)}`)
  }

  if (!aplicar) {
    console.log('\n(nada foi escrito — repita com --aplicar)')
    return
  }

  const agora = Date.now()
  for (const { linha } of remover) {
    await cliente.execute({
      sql: 'update seed_credits set deleted_at = ?, updated_at = ? where id = ?',
      args: [agora, agora, linha.id],
    })
  }
  for (const c of corrigir) {
    await cliente.execute({
      sql: 'update seed_credits set amount = ?, xp = ?, reason = ?, updated_at = ? where id = ?',
      args: [c.seeds, c.xp, c.reason, agora, c.linha.id],
    })
  }
  console.log(`\naplicado: ${remover.length} soft-deletadas, ${corrigir.length} corrigidas.`)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
