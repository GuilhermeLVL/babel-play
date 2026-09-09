/**
 * DESLIGAMENTO GRACIOSO — o servidor de verdade, um SIGTERM no meio de uma escrita (Fase 5).
 *
 * O achado: `grep -rn "SIGTERM\|SIGINT\|process.on(" server server.ts` devolvia ZERO em
 * 2026-09-09. Sem handler, o sinal aplica o padrão do Node — morrer na hora —, então um
 * `docker stop` durante um `POST /api/sessions` deixava o cliente sem resposta e o WAL sem
 * checkpoint. Ver `server/lib/desligamento.ts` para a ordem dos passos e o porquê de cada um.
 *
 * O QUE ESTE ARQUIVO PROVA, sem inferir nada do código:
 *
 *  1. a escrita EM CURSO terminou — a resposta 200 chega DEPOIS do instante em que o sinal foi
 *     mandado, e a sessão gravada está no banco com as suas falas todas;
 *  2. o processo saiu com 0;
 *  3. `PRAGMA integrity_check` devolve `ok` no arquivo que sobrou.
 *
 * O BANCO É UMA CÓPIA de `data/babel.db` — nunca o original. Copiar em vez de criar um vazio é
 * deliberado: um banco de 11 MB com o schema todo migrado é o que faz o `integrity_check` dizer
 * alguma coisa, e é o formato que o checkpoint precisa dobrar de verdade.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'

import { desligarComGraca, TETO_DE_DRENO_PADRAO_MS, tetoDeDreno } from '../../server/lib/desligamento'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const vivos: ChildProcess[] = []
const temporarios: string[] = []

afterEach(() => {
  for (const p of vivos.splice(0)) {
    try {
      p.kill('SIGKILL')
    } catch {
      /* já morreu */
    }
  }
  for (const d of temporarios.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* OneDrive segura */
    }
  }
})

/** Mesma razão de `tests/integration/cluster.test.ts`: faixa por PID, para duas execuções não brigarem. */
let proximaPorta = 21_000 + (process.pid % 15_000)
const portaLivre = () => proximaPorta++

interface Servidor {
  filho: ChildProcess
  porta: number
  dbPath: string
  saida: () => string
  /** Resolve com o código de saída do processo. */
  aoSair: Promise<number | null>
}

/**
 * Sobe `tests/harness/servidorComSinal.ts` (que importa o `server.ts` inteiro) sobre uma CÓPIA do
 * banco, e só devolve quando ele anunciou que está atendendo.
 *
 * `shell: false` e `NODE_ENV=production` pelas mesmas razões medidas em `cluster.test.ts`: com
 * shell, `kill()` mata o invólucro e deixa o servidor órfão na porta; em desenvolvimento o Vite
 * abriria o WebSocket de HMR numa porta fixa.
 */
async function subirServidor(extra: Record<string, string> = {}): Promise<Servidor> {
  const dados = mkdtempSync(path.join(tmpdir(), 'desligamento-'))
  temporarios.push(dados)
  const dbPath = path.join(dados, 'babel.db')
  const original = path.join(RAIZ, 'data', 'babel.db')
  if (existsSync(original)) copyFileSync(original, dbPath)

  const porta = portaLivre()
  const filho = spawn(
    process.execPath,
    [path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join('tests', 'harness', 'servidorComSinal.ts')],
    {
      cwd: RAIZ,
      // 'ipc' no quarto descritor: é por onde o teste pede o sinal no Windows (ver o harness).
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SECRET_KEY: 'chave-de-teste-somente-para-o-desligamento-32+chars',
        PORT: String(porta),
        HOST: '127.0.0.1',
        DATA_DIR: dados,
        DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}`,
        AUTH_REQUIRED: '0',
        // O diário em disco não é o assunto aqui, e ligá-lo só acrescentaria I/O ao dreno.
        ERROS_DIR: 'off',
        ...extra,
      },
    },
  )
  vivos.push(filho)

  let saida = ''
  filho.stdout?.on('data', (b) => {
    saida += String(b)
  })
  filho.stderr?.on('data', (b) => {
    saida += String(b)
  })

  const aoSair = new Promise<number | null>((r) => filho.on('exit', (c) => r(c)))

  const t0 = Date.now()
  while (!/rodando em/.test(saida) && Date.now() - t0 < 90_000) {
    await new Promise((r) => setTimeout(r, 100))
  }
  expect(saida, `o servidor precisava estar atendendo; saída:\n${saida.slice(-600)}`).toMatch(/rodando em/)
  return { filho, porta, dbPath, saida: () => saida, aoSair }
}

/**
 * Manda o SIGTERM da forma que a plataforma permite.
 *
 * No Windows `process.kill` não entrega sinal: ele chama `TerminateProcess` e o handler nunca roda
 * — o que faria este teste "passar" provando o contrário do que quer. Ver o bloco do topo de
 * `tests/harness/servidorComSinal.ts`.
 */
function mandarSigterm(s: Servidor): void {
  if (process.platform === 'win32') s.filho.send('sinal:SIGTERM')
  else s.filho.kill('SIGTERM')
}

/**
 * Uma sessão GRANDE de propósito: a escrita precisa durar o bastante para o sinal a pegar no meio.
 *
 * 1.500 falas, e não as 5.000 que `createSessionSchema` aceita, por um DEFEITO PREEXISTENTE que
 * este teste encontrou: com 4.000 falas o `POST /api/sessions` responde 400 com
 * `LibsqlBatchError: SQLITE_ERROR: too many SQL variables` — o schema de validação permite mais do
 * que o `db.batch()` do repositório consegue enviar numa instrução só. Não é assunto desta fase e
 * está no relatório; aqui o número fica abaixo do teto real para o teste falar do desligamento.
 */
function sessaoComFalas(n: number) {
  return {
    title: 'Sessão do desligamento',
    kind: 'live',
    sourceLang: 'en',
    targetLang: 'pt',
    status: 'done',
    durationMs: n * 1000,
    utterances: Array.from({ length: n }, (_, i) => ({
      idx: i,
      source: 'mic',
      speakerName: 'A',
      sourceLang: 'en',
      sourceText: `linha numero ${i} da sessao que precisa terminar de ser gravada`,
      targetLang: 'pt',
      translatedText: `linha numero ${i} da sessao que precisa terminar de ser gravada`,
      tStartMs: i * 1000,
      tEndMs: i * 1000 + 900,
    })),
  }
}

describe('SIGTERM no meio de uma escrita', () => {
  it('a escrita termina, o processo sai com 0 e o banco fica íntegro', async () => {
    const s = await subirServidor()

    // A requisição sai e NÃO é esperada: o sinal precisa chegar com ela em curso.
    const escrita = fetch(`http://127.0.0.1:${s.porta}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sessaoComFalas(1_500)),
    })
    /* Tempo só para o corpo subir e o handler começar. 40 ms, e não 150: medido, o `POST` inteiro
       das 1.500 falas responde em 130–160 ms, então esperar 150 deixaria o sinal chegar em cima
       do fim da escrita e o teste passaria por coincidência. */
    await new Promise((r) => setTimeout(r, 40))

    const tSinal = Date.now()
    mandarSigterm(s)

    const resposta = await escrita
    const tResposta = Date.now()
    const corpo = (await resposta.json()) as { id?: string }

    expect(resposta.status, `a requisição em curso não pode morrer sem resposta; corpo: ${JSON.stringify(corpo)}`).toBe(
      200,
    )
    expect(corpo.id, 'a sessão precisa ter sido criada').toBeTruthy()
    expect(
      tResposta,
      'se a resposta chegou ANTES do sinal, o teste não exercitou o dreno — aumente as falas',
    ).toBeGreaterThan(tSinal)

    const codigo = await s.aoSair
    expect(codigo, `esperava saída limpa; saída do processo:\n${s.saida().slice(-800)}`).toBe(0)
    expect(s.saida()).toMatch(/\[desligamento\] SIGTERM: conexões drenadas/)

    // O banco que sobrou: íntegro, e com a sessão inteira dentro.
    const cliente = createClient({ url: `file:${s.dbPath.replace(/\\/g, '/')}` })
    try {
      const integridade = await cliente.execute('PRAGMA integrity_check')
      expect(String(Object.values(integridade.rows[0] ?? {})[0])).toBe('ok')

      const falas = await cliente.execute({
        sql: 'SELECT COUNT(*) AS n FROM utterances WHERE session_id = ?',
        args: [String(corpo.id)],
      })
      expect(Number(falas.rows[0]?.n), 'a escrita em curso terminou INTEIRA, não pela metade').toBe(1_500)
    } finally {
      cliente.close()
    }
  }, 180_000)

  /**
   * O PRIMÁRIO DO CLUSTER, que é onde o defeito era pior.
   *
   * `server.ts` refazia QUALQUER worker que morresse. No desligamento isso vira um laço: o primário
   * manda SIGTERM aos workers, cada saída dispara o `cluster.on('exit')`, e cada uma delas forka um
   * processo novo — que ninguém sinalizou — enquanto o primário drena e sai. Sobram órfãos na porta.
   *
   * NO WINDOWS o repasse é degradado e isto precisa ficar escrito: `worker.process.kill('SIGTERM')`
   * chama `TerminateProcess`, então o worker morre sem rodar o próprio dreno. O que este teste
   * prova nas duas plataformas é o que depende do nosso código: os workers vão embora e NÃO são
   * refeitos, e o primário sai com 0.
   */
  it('no cluster, o primário repassa o sinal e PARA de respawnar', async () => {
    const s = await subirServidor({ CLUSTER_WORKERS: '3' })
    expect(
      s.saida(),
      `esperava o anúncio do cluster; saída:
${s.saida().slice(-500)}`,
    ).toMatch(/\[cluster\] \d+ processos/)

    expect((await fetch(`http://127.0.0.1:${s.porta}/api/health`)).status).toBe(200)

    mandarSigterm(s)
    expect(
      await s.aoSair,
      `saída:
${s.saida().slice(-800)}`,
    ).toBe(0)
    expect(s.saida(), 'refazer worker durante o desligamento deixa órfão segurando a porta').not.toMatch(
      /saiu \(.*\); refazendo/,
    )

    /* A PROVA QUE IMPORTA é a porta, não a linha de log: se algum worker tivesse sido refeito —
       ou simplesmente não tivesse recebido o repasse do sinal —, ele continuaria atendendo aqui
       depois de o primário sair, e o `docker stop` seguinte encontraria o container "não
       terminando". Uma tentativa de conexão recusada é o que diz que não sobrou ninguém. */
    let aindaAtende = true
    for (let i = 0; i < 20 && aindaAtende; i++) {
      try {
        await fetch(`http://127.0.0.1:${s.porta}/api/health`)
      } catch {
        aindaAtende = false
      }
      if (aindaAtende) await new Promise((r) => setTimeout(r, 100))
    }
    expect(aindaAtende, 'sobrou processo atendendo na porta depois de o primário sair').toBe(false)
  }, 120_000)

  it('SIGINT (o Ctrl+C do desenvolvedor) segue o mesmo caminho', async () => {
    const s = await subirServidor()
    if (process.platform === 'win32') s.filho.send('sinal:SIGINT')
    else s.filho.kill('SIGINT')
    expect(await s.aoSair, `saída:\n${s.saida().slice(-600)}`).toBe(0)
    expect(s.saida()).toMatch(/\[desligamento\] SIGINT: conexões drenadas/)
  }, 120_000)
})

/**
 * O TETO, exercitado sem subir servidor.
 *
 * O caminho do teto estourado é o que NÃO dá para forçar com um servidor de verdade sem pendurar o
 * teste por 10 s: seria preciso uma requisição que não termina nunca. Um dublê de `http.Server`
 * cujo `close()` nunca chama de volta é exatamente essa condição, sem o relógio de parede — e o
 * que está sendo verificado (o código de saída 1 e o checkpoint ACONTECER mesmo assim) é código
 * deste módulo, não do Express.
 */
describe('teto do dreno', () => {
  /** `close()` que nunca chama de volta = requisição que não termina. */
  const servidorQuePendura = () => ({
    close() {
      /* nunca chama de volta */
    },
  })

  it('teto estourado sai com 1 — e o banco é encerrado assim mesmo', async () => {
    let encerrou = false
    const codigo = await desligarComGraca('SIGTERM', {
      servidor: servidorQuePendura(),
      tetoMs: 60,
      encerrarBanco: async () => {
        encerrou = true
      },
    })
    expect(codigo, 'requisição abandonada precisa aparecer no código de saída').toBe(1)
    expect(encerrou, 'o checkpoint do WAL acontece ANTES de sair, mesmo com o teto estourado').toBe(true)
  })

  it('dreno que termina sai com 0, e a ordem é: repassar o sinal → drenar → encerrar o banco', async () => {
    const ordem: string[] = []
    const codigo = await desligarComGraca('SIGTERM', {
      servidor: {
        close(cb) {
          ordem.push('drenou')
          cb?.()
        },
      },
      antes: () => ordem.push('antes'),
      encerrarBanco: async () => {
        ordem.push('banco')
      },
    })
    expect(codigo).toBe(0)
    expect(ordem).toEqual(['antes', 'drenou', 'banco'])
  })

  it('sem servidor (worker que ainda não escutava) não trava esperando dreno nenhum', async () => {
    expect(await desligarComGraca('SIGTERM', { tetoMs: 60, encerrarBanco: async () => {} })).toBe(0)
  })

  it('DESLIGAMENTO_TIMEOUT_MS ajusta o teto; valor inválido cai no padrão em vez de zerar', () => {
    const guarda = process.env.DESLIGAMENTO_TIMEOUT_MS
    try {
      process.env.DESLIGAMENTO_TIMEOUT_MS = '3000'
      expect(tetoDeDreno()).toBe(3_000)
      // Zero seria "não espere nada", que é o defeito que este módulo existe para corrigir.
      process.env.DESLIGAMENTO_TIMEOUT_MS = '0'
      expect(tetoDeDreno()).toBe(TETO_DE_DRENO_PADRAO_MS)
      process.env.DESLIGAMENTO_TIMEOUT_MS = 'depois'
      expect(tetoDeDreno()).toBe(TETO_DE_DRENO_PADRAO_MS)
      // O explícito (o que o `server.ts` passaria) tem precedência sobre o ambiente.
      expect(tetoDeDreno(500)).toBe(500)
    } finally {
      if (guarda === undefined) delete process.env.DESLIGAMENTO_TIMEOUT_MS
      else process.env.DESLIGAMENTO_TIMEOUT_MS = guarda
    }
  })
})
