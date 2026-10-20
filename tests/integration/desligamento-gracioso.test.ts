/**
 * DESLIGAMENTO GRACIOSO — o servidor de verdade, um SIGTERM no meio de uma escrita (Fase 5).
 *
 * O achado: `grep -rn "SIGTERM\|SIGINT\|process.on(" server server.ts` devolvia ZERO em
 * 2026-09-09. Sem handler, o sinal aplica o padrão do Node — morrer na hora —, então um
 * `docker stop` durante um `POST /api/sessions` deixava o cliente sem resposta e o banco sem
 * fechar. Ver `server/lib/desligamento.ts` para a ordem dos passos e o porquê de cada um.
 *
 * O QUE ESTE ARQUIVO PROVA, sem inferir nada do código:
 *
 *  1. a escrita EM CURSO terminou — a resposta 200 chega DEPOIS do instante em que o sinal foi
 *     mandado, e a sessão gravada está no banco com as suas falas todas;
 *  2. o processo saiu com 0;
 *  3. o diretório do banco que sobrou reabre e tem a sessão inteira.
 *
 * Postgres (Fase 1): o banco é um diretório PGlite novo (`pglite:<dir>`), migrado pelo próprio boot.
 * O PGlite é de processo único: o teste só abre o diretório DEPOIS de o filho sair. As afirmações
 * sobre o WAL do SQLite (`-wal` dobrado no `.db`, `integrity_check`) saíram com ele.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'

import { desligarComGraca, TETO_DE_DRENO_PADRAO_MS, tetoDeDreno } from '../../server/lib/desligamento'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const vivos: ChildProcess[] = []
const temporarios: string[] = []

afterEach(async () => {
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

/** Faixa por PID, para duas execuções não brigarem. */
let proximaPorta = 21_000 + (process.pid % 15_000)
const portaLivre = () => proximaPorta++

interface Servidor {
  filho: ChildProcess
  porta: number
  /** Diretório do PGlite. */
  dbPath: string
  saida: () => string
  /** Resolve com o código de saída do processo. */
  aoSair: Promise<number | null>
}

/**
 * Sobe `tests/harness/servidorComSinal.ts` (que importa o `server.ts` inteiro) sobre um banco novo
 * (um diretório PGlite), e só devolve quando ele anunciou que está atendendo.
 *
 * `shell: false` e `NODE_ENV=production` pelas razões medidas: com
 * shell, `kill()` mata o invólucro e deixa o servidor órfão na porta; em desenvolvimento o Vite
 * abriria o WebSocket de HMR numa porta fixa.
 */
async function subirServidor(extra: Record<string, string> = {}): Promise<Servidor> {
  const dados = mkdtempSync(path.join(tmpdir(), 'desligamento-'))
  temporarios.push(dados)
  const dbPath = path.join(dados, 'pg')

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
        // GAP-004: em produção o boot exige a decisão sobre proxy; aqui não há proxy nenhum.
        TRUST_PROXY: 'false',
        SECRET_KEY: 'chave-de-teste-somente-para-o-desligamento-32+chars',
        PORT: String(porta),
        HOST: '127.0.0.1',
        DATA_DIR: dados,
        DATABASE_URL: `pglite:${dbPath.replace(/\\/g, '/')}`,
        AUTH_REQUIRED: '0',
        SELF_HOST: '1', // instalação pessoal declarada (GAP-003 aceita sem login só assim)
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

    /* A requisição sai em DUAS metades. O sinal vai entre elas: o servidor já leu o cabeçalho e
       parte do corpo (a requisição está em curso, não é conexão ociosa) e a outra metade só sobe
       DEPOIS do SIGTERM — o dreno precisa esperá-la. Antes o sinal ia 40 ms depois de um `fetch`,
       e na CI (Linux) o servidor às vezes nem tinha lido o cabeçalho: a conexão ainda contava como
       ociosa, o `close()` a derrubava (comportamento certo) e o teste falhava por corrida. */
    const corpoJson = Buffer.from(JSON.stringify(sessaoComFalas(1_500)))
    const metade = Math.floor(corpoJson.length / 2)
    let recebida: (r: { status: number; texto: string }) => void = () => {}
    const escrita = new Promise<{ status: number; texto: string }>((ok) => (recebida = ok))
    const req = request(
      {
        host: '127.0.0.1',
        port: s.porta,
        path: '/api/sessions',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': corpoJson.length },
      },
      (res) => {
        let texto = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => (texto += c))
        res.on('end', () => recebida({ status: res.statusCode ?? 0, texto }))
      },
    )
    await new Promise<void>((ok) => req.write(corpoJson.subarray(0, metade), () => ok()))
    // Folga para o servidor ler o cabeçalho e começar a consumir o corpo.
    await new Promise((r) => setTimeout(r, 300))

    const tSinal = Date.now()
    mandarSigterm(s)
    await new Promise((r) => setTimeout(r, 100))
    req.end(corpoJson.subarray(metade))

    const bruta = await escrita
    const tResposta = Date.now()
    const resposta = { status: bruta.status, json: async () => JSON.parse(bruta.texto) as unknown }
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

    /* O banco que sobrou, aberto só agora que o filho saiu (o PGlite é de processo único): reabre,
       e com a sessão inteira dentro. */
    const banco = new PGlite(s.dbPath)
    try {
      const falas = await banco.query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM utterances WHERE session_id = $1',
        [String(corpo.id)],
      )
      expect(Number(falas.rows[0]?.n), 'a escrita em curso terminou INTEIRA, não pela metade').toBe(1_500)
    } finally {
      await banco.close()
    }
  }, 180_000)

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
 * que está sendo verificado (o código de saída 1 e o banco FECHAR mesmo assim) é código
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
    expect(encerrou, 'o banco é fechado ANTES de sair, mesmo com o teto estourado').toBe(true)
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
