/**
 * OPERAÇÃO DO BANCO NA MÁQUINA DE PRODUÇÃO — empacotado em `dist-server/operacao.cjs` pelo
 * `npm run build`, e por isso roda dentro da imagem sem `tsx` nem devDependencies.
 *
 *   node dist-server/operacao.cjs snapshot
 *       VACUUM INTO + integrity_check + gzip + envio ao R2, agora. É também o que o agendador
 *       diário do servidor roda, como PROCESSO FILHO (`fazerSnapshotEmProcessoFilho`): o trabalho
 *       síncrono do libsql fica fora do event loop de quem atende, e o resultado volta por IPC.
 *
 *   node dist-server/operacao.cjs restaurar-snapshot --dia=2026-09-24 --destino=/data/restauro.db
 *       Baixa o snapshot do dia, descomprime num arquivo NOVO e confere. Nunca toca o banco vivo:
 *       trocar o banco é um passo separado e consciente (ver `docs/runbook.md`).
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
 *   node dist-server/operacao.cjs verificar --arquivo=/data/restauro.db
 *       `PRAGMA integrity_check` + contagens de qualquer arquivo — é o que se roda depois de um
 *       `litestream restore`, antes de apontar o app para o arquivo restaurado.
 *
 * Sai com 0 quando deu certo e a verificação passou; 1 em falha; 2 em uso errado.
 */
import path from 'node:path'

import {
  destinoDoBackup,
  fazerSnapshot,
  type MensagemDoSnapshot,
  restaurarSnapshot,
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
    await avisarOPai({ tipo: 'snapshot_ok', chave: r.chave, bytes: r.bytes, integridade: r.verificacao.integridade })
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
    'uso: operacao.cjs snapshot | restaurar-snapshot --dia=AAAA-MM-DD --destino=<arquivo novo> | verificar --arquivo=<banco> | flags listar|ligar|desligar|definir | conta listar|papel|plano | reparar-idiomas [--aplicar]',
  )
  return 2
}

/**
 * Quando o servidor roda esta CLI como PROCESSO FILHO (`fazerSnapshotEmProcessoFilho`, via `fork`),
 * há um canal IPC e o resultado vai por ele. Rodada à mão (`node dist-server/operacao.cjs …`), não
 * há canal e isto não faz nada. Espera o envio terminar: `process.exit` logo depois de um `send`
 * pode descartar a mensagem ainda na fila.
 */
function avisarOPai(m: MensagemDoSnapshot): Promise<void> {
  const enviar = process.send?.bind(process)
  if (!enviar || !process.connected) return Promise.resolve()
  return new Promise((ok) => {
    enviar(m, undefined, {}, () => ok())
  })
}

principal().then(
  (codigo) => process.exit(codigo),
  async (err) => {
    const erro = String((err as Error)?.message || err)
    console.error(`[operacao] FALHOU: ${erro}`)
    if (process.argv[2] === 'snapshot') await avisarOPai({ tipo: 'snapshot_falhou', erro: erro.slice(0, 300) })
    process.exit(1)
  },
)
