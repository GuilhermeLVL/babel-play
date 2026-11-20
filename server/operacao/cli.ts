/**
 * OPERAÇÃO DO BANCO DO SERVIDOR — empacotado em `dist-server/operacao.cjs` pelo
 * `npm run build`, e por isso roda dentro da imagem sem `tsx` nem devDependencies.
 *
 *   (Os comandos `snapshot`, `restaurar-snapshot` e `verificar`, do SQLite, saíram com o Fly: o backup
 *   do Postgres é `pg_dump` — `scripts/backup.mjs` e `.github/workflows/backup-pg-dump.yml`.)
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
 *   node dist-server/operacao.cjs palavras reindexar [--usuario <id>]
 *       Reconstrói o índice das palavras vistas (`palavras_vistas`) a partir das falas vivas — o legado de
 *       antes da migração PG 0012, ou um reparo. Idempotente. Ver `server/operacao/palavras.ts`.
 *
 * Sai com 0 quando deu certo; 1 em falha; 2 em uso errado.
 */
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
  if (comando === 'palavras') {
    // Import dinâmico, como `flags`: só este comando precisa do banco da aplicação.
    const { comandoDePalavras } = await import('./palavras')
    return comandoDePalavras(process.argv.slice(3))
  }
  if (comando === 'reparar-idiomas') {
    // Import dinâmico, como `flags`: só este comando precisa do banco da aplicação.
    const { repararIdiomasNoBanco } = await import('./reparoDeIdioma')
    const aplicar = process.argv.includes('--aplicar')
    const r = await repararIdiomasNoBanco({ aplicar })
    console.log(`${aplicar ? 'APLICADO' : 'ENSAIO (nada gravado; use --aplicar)'}:`, r)
    return 0
  }
  return uso()
}

function uso(): number {
  console.error(
    'uso: operacao.cjs flags listar|ligar|desligar|definir | conta listar|papel|plano | reparar-idiomas [--aplicar] | palavras reindexar [--usuario <id>]',
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
