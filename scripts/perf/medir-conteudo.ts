/**
 * MEDE AS CONTAGENS DO SELETOR DE CONTEÚDO (`GET /api/vocab/conteudo`) SEM O CACHE: o custo de ler e
 * contar, que é o que a rota paga uma vez por (versão dos dados, minuto, idioma).
 *
 *   DATABASE_URL=file:<banco TEMPORÁRIO> npx tsx scripts/perf/medir-conteudo.ts [usuário] [idioma]
 *
 * Nunca aponte para `data/babel.db`: o script recusa.
 */
import { contagensDeConteudo, versaoDosBaralhos } from '../../server/db/repositories/contagensDeConteudo'
import { versoesRepo } from '../../server/db/repositories/versoes'
import type { UserId } from '../../server/lib/authContext'

if (!process.env.DATABASE_URL || /data[\\/]babel\.db$/i.test(process.env.DATABASE_URL)) {
  console.error('uso: DATABASE_URL=file:<banco de TESTE> npx tsx scripts/perf/medir-conteudo.ts [usuário] [idioma]')
  process.exit(2)
}
const usuario = (process.argv[2] ?? 'local-owner') as UserId
const idioma = process.argv[3] ?? 'en'
const p = (l: number[], q: number) => [...l].sort((a, b) => a - b)[Math.min(l.length - 1, Math.floor(l.length * q))]

async function medir(nome: string, f: () => Promise<unknown>, vezes = 40) {
  for (let i = 0; i < 5; i++) await f()
  const tempos: number[] = []
  for (let i = 0; i < vezes; i++) {
    const t = performance.now()
    await f()
    tempos.push(performance.now() - t)
  }
  console.log(`${nome.padEnd(30)} mediana ${p(tempos, 0.5).toFixed(1)} ms · p95 ${p(tempos, 0.95).toFixed(1)} ms · máx ${Math.max(...tempos).toFixed(1)} ms`)
}

const agora = Math.ceil(Date.now() / 60_000) * 60_000
const k = await contagensDeConteudo(usuario, { agora, idioma })
console.log(
  `${k.tudo.palavras} palavras em ${k.idioma || 'todos'} · ${k.sessoes.length} sessões · ${k.anki.length} baralhos · corpo ${(JSON.stringify(k).length / 1024).toFixed(1)} KB`,
)
await medir('ler e contar (sem cache)', () => contagensDeConteudo(usuario, { agora, idioma }))
await medir('só as versões (o custo do 304)', () => Promise.all([versoesRepo.de(usuario), versaoDosBaralhos(usuario)]))
process.exit(0)
