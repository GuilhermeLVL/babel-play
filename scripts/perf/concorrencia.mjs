#!/usr/bin/env node
/**
 * O MESMO USUÁRIO GASTANDO DE DOIS LUGARES AO MESMO TEMPO — pelo HTTP, contra o servidor de
 * verdade, e conferido no banco depois.
 *
 * POR QUE ISTO EXISTE, SE JÁ HÁ TESTE. `tests/integration/economia-atomica.test.ts` cobre o
 * MECANISMO: dez gastos simultâneos chamando o handler direto, com o teto dentro do INSERT. O que
 * ele não cobre é a pilha inteira — `express.json`, o limitador contando no banco, o pool do
 * libsql, e (quando `CLUSTER_WORKERS>1`) mais de um PROCESSO decidindo sobre a mesma conta. Foi
 * exatamente essa diferença que produziu o achado P1-3 da auditoria: um teto que valia no teste e
 * virava "teto × número de réplicas" em produção.
 *
 *   node scripts/perf/concorrencia.mjs --db=<copia.db> [--porta=3105] [--gastos=40] [--ondas=10] [--workers=1]
 *
 * Use SEMPRE uma cópia do banco: a rota grava de verdade em `seed_credits` e `seed_spends`.
 *
 * O QUE REPROVA:
 *   1. saldo final NEGATIVO — o teto falhou;
 *   2. soma dos gastos gravados != número de respostas 200 — alguém pagou sem receber, ou recebeu
 *      sem pagar;
 *   3. qualquer 5xx.
 * Um 402 `saldo_insuficiente` NÃO reprova: é o teto funcionando, e é o resultado esperado da
 * maioria das requisições quando o saldo paga só algumas.
 */
import { execFileSync, spawn } from 'node:child_process'
import { openSync } from 'node:fs'

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const db = arg('db', '')
if (!db) {
  console.error('uso: node scripts/perf/concorrencia.mjs --db=<copia.db> [--porta=] [--gastos=] [--workers=]')
  process.exit(2)
}
const porta = arg('porta', '3105')
const gastos = Number(arg('gastos', 40))
/**
 * ONDAS, E NAO UMA RAJADA UNICA GIGANTE — e o motivo foi medido, nao suposto.
 *
 * A primeira versao disparava `--gastos` de uma vez. Com 300, o cliente recebia `ECONNREFUSED` e o
 * log do servidor ficava LIMPO: ele nao caiu. Testei a hipotese obvia (esperar `/api/ready` em vez
 * de `/api/health`, ou seja, "ele ainda nao estava pronto") e ela FALHOU do mesmo jeito — o que
 * derruba a explicacao. O que sobra e o lado do cliente: o `fetch` do Node abre uma conexao por
 * requisicao quando nao ha pool quente, e 300 sockets novos no mesmo tique esbarram no limite do
 * SO antes de esbarrar em qualquer coisa do servidor. Com o pool ja aberto, o MESMO servidor
 * atende 300 de uma vez sem reclamar (medido).
 *
 * Entao: cada onda dispara `--gastos` ao mesmo tempo (que e o que exercita a corrida entre duas
 * conferencias de saldo) e as ondas se sucedem (que e o que esgota o saldo e faz o teto agir).
 * `--gastos` acima de ~100 mede o `fetch` do Node, nao o servidor.
 */
const ondas = Number(arg('ondas', 10))
const workers = arg('workers', '1')
const base = `http://127.0.0.1:${porta}`

const env = {
  ...process.env,
  DATABASE_URL: `file:${db}`,
  PORT: porta,
  HOST: '127.0.0.1',
  AUTH_REQUIRED: '0',
  CLUSTER_WORKERS: workers,
}

const sql = (q) => execFileSync('sqlite3', [db, q], { encoding: 'utf8' }).trim()
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/* A saida do servidor VAI PARA UM ARQUIVO, e nao para `ignore`. Com `ignore`, uma queda do
   processo no meio da rajada aparecia so como `ECONNREFUSED` no cliente — sem causa, sem stack,
   sem como distinguir "caiu" de "recusou conexao". */
const logDoServidor = process.env.LOG_DO_SERVIDOR || `${db}.servidor.log`
const saida = openSync(logDoServidor, 'w')
const filho = spawn('node', ['dist-server/server.cjs'], { env, stdio: ['ignore', saida, saida] })

/**
 * ESPERA `/api/ready`, E NAO `/api/health` — e a diferenca foi MEDIDA aqui, nao suposta.
 *
 * A primeira versao esperava o `health` e disparava as 300 requisicoes assim que ele respondia
 * 200. Resultado, reproduzido em duas execucoes: `ECONNREFUSED` no cliente, e o log do servidor
 * SEM erro nenhum — ele nao caiu, ele ainda nao estava atendendo. `health` responde "o processo
 * esta vivo"; entre isso e "consigo atender" ha o boot que este servidor faz depois de escutar
 * (migracoes, e em modo desenvolvimento o Vite montado como middleware). Uma rajada que chega
 * nessa janela enche a fila de accept e volta como recusa.
 *
 * E exatamente a distincao que `/api/ready` existe para fazer (Fase 5). O fallback para `health`
 * mantem o script util contra um servidor anterior a essa separacao.
 */
async function esperarPronto(teto = 60_000) {
  const t0 = performance.now()
  while (performance.now() - t0 < teto) {
    for (const caminho of ['/api/ready', '/api/health']) {
      try {
        const r = await fetch(`${base}${caminho}`)
        if (r.status === 200) return Math.round(performance.now() - t0)
        // 503 do `ready` e a resposta certa de quem ainda nao consegue atender: espera mais.
        if (r.status === 503) break
      } catch {
        /* ainda nao escuta */
      }
    }
    await dormir(20)
  }
  return -1
}

/**
 * `seedsGastas` DO PERFIL, e não um "saldo" lido de algum campo.
 *
 * O saldo não é coluna: ele é derivado das métricas em `economiaDeMetricas`
 * (`server/db/repositories/metrics.ts:494`) — ganhas menos gastas, com o mapeamento métrica →
 * evento morando no núcleo. Somar `seed_credits` menos `seed_spends` em SQL aqui seria escrever
 * uma segunda implementação da regra de economia dentro de um script de medição, que é o defeito
 * que o ADR 0002 registra. O que este script precisa é de um número CONTÁVEL antes e depois, e
 * `seedsGastas` é exatamente isso.
 */
async function seedsGastas() {
  const r = await fetch(`${base}/api/metrics/profile`)
  if (!r.ok) throw new Error(`profile devolveu ${r.status}`)
  return Number((await r.json()).seedsGastas ?? 0)
}

try {
  const subiu = await esperarPronto()
  if (subiu < 0) throw new Error('o servidor não respondeu /api/health em 60 s')

  const gastasAntes = await seedsGastas()
  const gastosAntes = Number(sql('SELECT COUNT(*) FROM seed_spends;') || 0)

  /* `pular-rodada` e o motivo mais simples do catalogo (`src/core/economiaAutoridade.ts:69`) e o
     unico com preco fixo em constante — os de loja dependem do item. Preco errado nao mede
     concorrencia nenhuma: a rota recusa antes, com `preco_divergente`. */
  const razao = process.env.RAZAO_DE_GASTO || 'pular-rodada'
  const preco = Number(process.env.PRECO_DO_ITEM || 40)

  console.log(`# concorrencia — ${base}, ${ondas} ondas de ${gastos} gastos simultaneos, CLUSTER_WORKERS=${workers}`)
  console.log(`# subiu em ${subiu} ms; seedsGastas antes: ${gastasAntes}; linhas em seed_spends: ${gastosAntes}`)

  /* TODAS DE UMA VEZ, e não em série: o defeito que se procura só aparece quando duas conferências
     de saldo acontecem antes de qualquer uma das duas escritas. `Promise.all` de N `fetch` é o mais
     próximo disso que o cliente consegue produzir. */
  const respostas = []
  for (let onda = 0; onda < ondas; onda++) {
    const lote = await Promise.all(
      Array.from({ length: gastos }, (_, i) =>
        fetch(`${base}/api/metrics/seeds/gastar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            spendId: `conc-${Date.now()}-${onda}-${i}`,
            amount: preco,
            reason: razao,
            ref: `conc-${onda}-${i}`,
          }),
        }).then(async (r) => ({ status: r.status, corpo: await r.text() })),
      ),
    )
    respostas.push(...lote)
  }

  const porStatus = respostas.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {})
  const aceitos = respostas.filter((r) => r.status === 200).length
  const cincoxx = respostas.filter((r) => r.status >= 500)
  const recusados = respostas.filter((r) => r.status === 402).length

  const gastasDepois = await seedsGastas()
  const gastosDepois = Number(sql('SELECT COUNT(*) FROM seed_spends;') || 0)
  const gravados = gastosDepois - gastosAntes

  console.log(`\n| medida | valor |`)
  console.log(`|---|---:|`)
  console.log(`| respostas por status | ${JSON.stringify(porStatus)} |`)
  console.log(`| 200 (gasto aceito) | ${aceitos} |`)
  console.log(`| linhas novas em seed_spends | ${gravados} |`)
  console.log(`| 402 saldo_insuficiente (o teto agindo) | ${recusados} |`)
  console.log(`| seedsGastas antes -> depois | ${gastasAntes} -> ${gastasDepois} |`)
  console.log(`| delta de seedsGastas | ${gastasDepois - gastasAntes} (esperado ${aceitos * preco}) |`)

  const falhas = []
  /* SEM ISTO O TESTE PASSA POR VACUIDADE, e ele passou: na primeira execucao apontei o script para
     um caminho de banco inexistente, o SQLite criou um vazio, as 40 requisicoes voltaram 400 e a
     saida disse "APROVADO: teto respeitado". Zero gasto aceito nao prova teto nenhum — prova que
     nada aconteceu. E o mesmo defeito que a Fase 4 fechou no teste de IDOR (a chamada de controle
     do usuario A). */
  if (!aceitos) {
    falhas.push(
      `NENHUM gasto foi aceito (${JSON.stringify(porStatus)}) — o teste nao exercitou concorrencia. ` +
        'Verifique o caminho do banco, o saldo da conta e se RAZAO_DE_GASTO/PRECO_DO_ITEM batem com o catalogo.',
    )
  }
  if (cincoxx.length) falhas.push(`${cincoxx.length} resposta(s) 5xx`)
  if (gravados !== aceitos) falhas.push(`gravados ${gravados} != aceitos ${aceitos}`)
  /* O DEBITO TEM DE BATER COM O QUE FOI ACEITO. E aqui que um teto furado aparece: se duas compras
     simultaneas passassem pela mesma conferencia de saldo, o numero de linhas gravadas continuaria
     igual ao de 200 — o que estouraria e a SOMA. */
  if (gastasDepois - gastasAntes !== aceitos * preco) {
    falhas.push(
      `seedsGastas subiu ${gastasDepois - gastasAntes}, e ${aceitos} aceitos x ${preco} dariam ${aceitos * preco}`,
    )
  }

  if (falhas.length) {
    console.error(`\nREPROVADO: ${falhas.join('; ')}`)
    process.exitCode = 1
  } else {
    console.log(`\nAPROVADO: teto respeitado sob ${gastos} gastos simultaneos, ledger consistente.`)
  }
} finally {
  filho.kill('SIGTERM')
  await dormir(500)
  filho.kill('SIGKILL')
}
