/**
 * OPERAÇÃO DO BANCO NA MÁQUINA DE PRODUÇÃO — empacotado em `dist-server/operacao.cjs` pelo
 * `npm run build`, e por isso roda dentro da imagem sem `tsx` nem devDependencies.
 *
 *   node dist-server/operacao.cjs snapshot
 *       VACUUM INTO + integrity_check + gzip + envio ao R2 (o mesmo do agendador diário), agora.
 *
 *   node dist-server/operacao.cjs restaurar-snapshot --dia=2026-09-24 --destino=/data/restauro.db
 *       Baixa o snapshot do dia, descomprime num arquivo NOVO e confere. Nunca toca o banco vivo:
 *       trocar o banco é um passo separado e consciente (ver `docs/runbook.md`).
 *
 *   node dist-server/operacao.cjs verificar --arquivo=/data/restauro.db
 *       `PRAGMA integrity_check` + contagens de qualquer arquivo — é o que se roda depois de um
 *       `litestream restore`, antes de apontar o app para o arquivo restaurado.
 *
 * Sai com 0 quando deu certo e a verificação passou; 1 em falha; 2 em uso errado.
 */
import path from 'node:path'

import { destinoDoBackup, fazerSnapshot, restaurarSnapshot, type Verificacao, verificarBanco } from './snapshot'

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)

function imprimir(v: Verificacao) {
  console.log(`integrity_check: ${v.integridade}`)
  for (const [t, n] of Object.entries(v.contagens)) console.log(`  ${t}: ${n ?? '(sem tabela)'}`)
}

async function principal(): Promise<number> {
  const comando = process.argv[2]
  if (comando === 'verificar') {
    const arquivo = arg('arquivo')
    if (!arquivo) return uso()
    const v = await verificarBanco(path.resolve(arquivo))
    imprimir(v)
    return v.ok ? 0 : 1
  }

  const destino = destinoDoBackup()
  if (!destino) {
    console.error('faltam S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY e BACKUP_S3_BUCKET (ou S3_BUCKET)')
    return 1
  }

  if (comando === 'snapshot') {
    const url = process.env.DATABASE_URL ?? 'file:./data/babel.db'
    if (!url.startsWith('file:')) {
      console.error('o snapshot é para banco em ARQUIVO (DATABASE_URL=file:…)')
      return 1
    }
    const r = await fazerSnapshot({ urlDoBanco: url, dirTemporario: path.dirname(url.slice(5)), destino })
    console.log(`enviado: ${r.chave} (${(r.bytes / 1024).toFixed(0)} KB)`)
    imprimir(r.verificacao)
    return 0
  }

  if (comando === 'restaurar-snapshot') {
    const dia = arg('dia')
    const saida = arg('destino')
    if (!dia || !saida) return uso()
    const v = await restaurarSnapshot({ destino, dia, arquivoSaida: path.resolve(saida) })
    imprimir(v)
    return v.ok ? 0 : 1
  }

  return uso()
}

function uso(): number {
  console.error(
    'uso: operacao.cjs snapshot | restaurar-snapshot --dia=AAAA-MM-DD --destino=<arquivo novo> | verificar --arquivo=<banco>',
  )
  return 2
}

principal().then(
  (codigo) => process.exit(codigo),
  (err) => {
    console.error(`[operacao] FALHOU: ${(err as Error)?.message || err}`)
    process.exit(1)
  },
)
