/**
 * OPERAÇÃO DO BANCO NA MÁQUINA DE PRODUÇÃO — empacotado em `dist-server/operacao.cjs` pelo
 * `npm run build`, e por isso roda dentro da imagem sem `tsx` nem devDependencies.
 *
 *   node dist-server/operacao.cjs snapshot
 *       Aposentado na migração para o Postgres: só imprime que o snapshot está indisponível neste
 *       banco (o backup é `pg_dump` no CI) e sai com 0. Ver `server/operacao/snapshot.ts`.
 *
 *   node dist-server/operacao.cjs restaurar-snapshot --dia=2026-09-24 --destino=/data/restauro.db
 *       Baixa o snapshot SQLITE do dia (os de antes da migração para o Postgres), descomprime num
 *       arquivo NOVO e confere. Nunca toca o banco vivo (ver `docs/runbook.md`).
 *
 *   node dist-server/operacao.cjs verificar --arquivo=/data/restauro.db
 *       `PRAGMA integrity_check` + contagens de um arquivo SQLite (um snapshot restaurado).
 *
 *   node dist-server/operacao.cjs flags listar | ligar <chave> | desligar <chave> | definir <chave> '<json>'
 *       As feature flags (Fase 6b) — ver `server/operacao/flags.ts` e `docs/flags.md`.
 *
 *   node dist-server/operacao.cjs conta listar | papel <e-mail-ou-id> <admin|support|user> | plano <e-mail-ou-id> <free|premium>
 *       Papel e plano de uma conta EXISTENTE — é por aqui que nasce o primeiro admin (a rota
 *       `/api/admin` exige um). Ver `server/operacao/contas.ts`.
 *
 *   node dist-server/operacao.cjs reparar-idiomas [--aplicar]
 *       Reetiqueta o idioma de falas, sessões e cartões gravados errado (ver `reparoDeIdioma.ts`).
 *       Sem `--aplicar` só mostra o plano.
 *
 * Sai com 0 quando deu certo e a verificação passou; 1 em falha; 2 em uso errado.
 */
import path from 'node:path'

import {
  destinoDoBackup,
  fazerSnapshot,
  restaurarSnapshot,
  SNAPSHOT_INDISPONIVEL,
  type Verificacao,
  verificarBanco,
} from './snapshot'

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)

function imprimir(v: Verificacao) {
  console.log(`integrity_check: ${v.integridade}`)
  for (const [t, n] of Object.entries(v.contagens)) console.log(`  ${t}: ${n ?? '(sem tabela)'}`)
}

async function principal(): Promise<number> {
  const comando = process.argv[2]
  if (comando === 'flags') {
    // Import dinâmico: só este comando precisa do banco da aplicação (e do `DATABASE_URL`).
    const { comandoDeFlags } = await import('./flags')
    return comandoDeFlags(process.argv.slice(3))
  }
  if (comando === 'conta') {
    // Import dinâmico, como `flags`: só este comando precisa do banco da aplicação.
    const { comandoDeContas } = await import('./contas')
    return comandoDeContas(process.argv.slice(3))
  }
  if (comando === 'reparar-idiomas') {
    // Import dinâmico, como `flags`: só este comando precisa do banco da aplicação.
    const { repararIdiomasNoBanco } = await import('./reparoDeIdioma')
    const aplicar = process.argv.includes('--aplicar')
    const r = await repararIdiomasNoBanco({ aplicar })
    console.log(`${aplicar ? 'APLICADO' : 'ENSAIO (nada gravado; use --aplicar)'}:`, r)
    return 0
  }
  if (comando === 'snapshot') {
    await fazerSnapshot()
    console.log(`snapshot: ${SNAPSHOT_INDISPONIVEL}`)
    return 0
  }
  if (comando === 'verificar') {
    const arquivo = arg('arquivo')
    if (!arquivo) return uso()
    const v = await verificarBanco(path.resolve(arquivo))
    imprimir(v)
    return v.ok ? 0 : 1
  }
  if (comando === 'restaurar-snapshot') {
    const destino = destinoDoBackup()
    if (!destino) {
      console.error('faltam S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY e BACKUP_S3_BUCKET (ou S3_BUCKET)')
      return 1
    }
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
    'uso: operacao.cjs snapshot | restaurar-snapshot --dia=AAAA-MM-DD --destino=<arquivo novo> | verificar --arquivo=<banco> | flags listar|ligar|desligar|definir | conta listar|papel|plano | reparar-idiomas [--aplicar]',
  )
  return 2
}

principal().then(
  (codigo) => process.exit(codigo),
  (err) => {
    const erro = String((err as Error)?.message || err)
    console.error(`[operacao] FALHOU: ${erro}`)
    process.exit(1)
  },
)
