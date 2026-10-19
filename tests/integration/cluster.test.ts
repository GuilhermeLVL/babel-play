/**
 * F6-01 — o modo cluster, exercitado de verdade.
 *
 * POR QUE ESTE ARQUIVO EXISTE. O achado estava marcado RESOLVIDO com uma única medição:
 * `clusterDisponivel: true`, que é dizer "o código está escrito". A prova de conserto declarada
 * era `CLUSTER_WORKERS=4 npm start` — um comando que sobe um servidor e nunca termina, ou seja,
 * um critério que ninguém podia executar. Quando `rastrear --provar` passou a reexecutar cada
 * prova, ele saiu 1 e denunciou o buraco: o cluster nunca tinha sido observado funcionando, só
 * lido. A regra 1 da auditoria proíbe exatamente isso.
 *
 * O que estes testes medem, sem inferir nada do código:
 *  1. com `CLUSTER_WORKERS=3`, sobem TRÊS processos servindo a mesma porta — contados por PID
 *     distinto nas respostas, não pela mensagem que o próprio servidor imprime;
 *  2. sem a variável, sobe UM só — o modo cluster não é o padrão;
 *  3. o primário ABORTA quando o banco é o PGlite embutido, em vez de forkar N processos que não
 *     dividiriam o banco.
 *
 * Postgres (Fase 1): no SQLite a terceira guarda era o WAL (sem ele, vários processos perdiam
 * escrita). O PGlite é de PROCESSO ÚNICO — o diretório de dados abre num processo só —, então o
 * cluster exige Postgres remoto, e o boot recusa `CLUSTER_WORKERS > 1` com banco embutido. O caso
 * (1) sobe três processos sobre o mesmo banco: só roda com `TESTE_POSTGRES_URL` (um Postgres de
 * verdade, num banco novo criado e apagado pelo caso). Sem ele, fica `skip` com o motivo: o modo
 * cluster sai na Fase 2 (Cloudflare). Os casos (2) e (3) rodam sempre.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { bancoPostgresDescartavel, URL_POSTGRES_DE_TESTE } from '../harness/postgresDescartavel'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const vivos: ChildProcess[] = []
const temporarios: string[] = []
const bancosPg: Array<() => Promise<void>> = []

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
      /* ignora */
    }
  }
  for (const apagar of bancosPg.splice(0)) await apagar()
})

/**
 * Faixa de portas própria de CADA EXECUÇÃO, derivada do PID.
 *
 * Uma faixa fixa (3610+) parecia suficiente e não era: bastou uma execução anterior deixar
 * servidor órfão para a seguinte morrer com EADDRINUSE em cima de um número que ninguém tinha
 * liberado. Amarrar ao PID garante que duas execuções nunca disputem o mesmo número, e o teste
 * deixa de depender de o ambiente estar limpo — que é uma suposição que já foi violada aqui.
 */
let proximaPorta = 20_000 + (process.pid % 20_000)
const portaLivre = () => proximaPorta++

/**
 * Sobe `server.ts` via tsx num diretório de dados próprio e devolve o que ele imprimiu até
 * atender — ou até estourar o prazo. Ler o stdout é frágil como ÚNICA evidência, por isso ele
 * serve só para saber QUANDO o servidor está de pé; a contagem de processos vem das respostas.
 *
 * `pronto`: a linha que diz "de pé". No modo cluster NÃO é o `rodando em`: o primário imprime essa
 * linha no `listen` e só anuncia `[cluster] N processos` depois de o `startServer()` terminar (as
 * limpezas diárias entram por `import()` dinâmico). Com o runner carregado o intervalo passa da
 * checagem de 250 ms, e o teste lia a saída antes do anúncio (reproduzido com a CPU cheia).
 */
function subirServidor(env: Record<string, string>, prazoMs = 60_000, pronto = /rodando em|ABORTADO/) {
  const dados = mkdtempSync(path.join(tmpdir(), 'cluster-'))
  temporarios.push(dados)
  const porta = portaLivre()
  /*
   * SEM `shell: true`, e isto é o conserto de um defeito que este arquivo já cometeu. Com shell, o
   * `spawn` cria um interpretador cujo FILHO é o servidor de verdade; `filho.kill()` mata o
   * interpretador e deixa o servidor órfão, segurando a porta. Foi assim que a segunda execução
   * seguida deste teste quebrou com "Port 24678 is already in use". É o mesmo erro que deixou um
   * `docker stats` escrevendo por cinco horas em cima de um artefato congelado desta auditoria:
   * matar o invólucro não é matar o processo.
   *
   * `NODE_ENV=production` pelo mesmo motivo de isolamento: em desenvolvimento o servidor sobe o
   * Vite em middleware e o Vite abre um WebSocket de HMR numa porta FIXA (24678), que não pode ser
   * compartilhada por três instâncias. Em produção ele serve `dist` e não abre porta extra — que
   * é, aliás, o modo em que o cluster de verdade roda.
   */
  const filho = spawn(process.execPath, [path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server.ts'], {
    cwd: RAIZ,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // GAP-004: em produção o boot exige a decisão sobre proxy; aqui não há proxy nenhum.
      TRUST_PROXY: 'false',
      // Em produção `server/crypto.ts` recusa subir sem chave — guarda correta, e o teste tem de
      // honrá-la em vez de contorná-la rodando em desenvolvimento.
      SECRET_KEY: 'chave-de-teste-somente-para-o-cluster-32+chars',
      PORT: String(porta),
      HOST: '127.0.0.1',
      DATA_DIR: dados,
      // `'0'`, nao `'false'`: `authRequired()` so reconhece '1' e '0' e trata QUALQUER outro
      // valor como o padrao (ligado em producao). Com `'false'` este teste rodava com auth
      // LIGADA sem que ninguem percebesse, porque `/api/health` nao passa pelo middleware.
      // A conferencia de configuracao no boot (F14-02) expos isso: sem SUPABASE_URL no modo
      // publico, o boot registra falha e o health responde 503.
      //
      // O comportamento de `authRequired()` NAO foi afrouxado de proposito: tratar valor
      // desconhecido como "ligado" e fail-safe, e aceitar 'false' tornaria mais facil
      // desligar a auth por engano num deploy.
      AUTH_REQUIRED: '0',
      SELF_HOST: '1', // instalação pessoal declarada (GAP-003 aceita sem login só assim)
      // Banco embutido num diretório próprio por padrão; o caso do cluster passa um Postgres.
      DATABASE_URL: `pglite:${path.join(dados, 'pg').split(path.sep).join('/')}`,
      ...env,
    },
  })
  vivos.push(filho)

  let saida = ''
  filho.stdout?.on('data', (b) => {
    saida += String(b)
  })
  filho.stderr?.on('data', (b) => {
    saida += String(b)
  })

  const dePe = new Promise<{ porta: number; saida: () => string; codigo: number | null }>((resolve) => {
    let terminou = false
    const fim = (codigo: number | null) => {
      if (!terminou) {
        terminou = true
        resolve({ porta, saida: () => saida, codigo })
      }
    }
    filho.on('exit', (c) => fim(c))
    const t0 = Date.now()
    const olhar = setInterval(() => {
      if (terminou) {
        clearInterval(olhar)
        return
      }
      if (pronto.test(saida) || Date.now() - t0 > prazoMs) {
        clearInterval(olhar)
        fim(null)
      }
    }, 250)
  })
  return dePe
}

/** Bate no /api/health até responder; devolve os PIDs distintos que atenderam. */
async function pidsQueAtenderam(porta: number, tentativas: number): Promise<Set<string>> {
  const pids = new Set<string>()
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/health`)
      const pid = r.headers.get('x-pid')
      if (pid) pids.add(pid)
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  return pids
}

describe('F6-01 — modo cluster', () => {
  it('sem CLUSTER_WORKERS, sobe UM processo: o cluster não é o padrão', async () => {
    const { saida } = await subirServidor({})
    expect(saida()).toMatch(/rodando em/)
    expect(saida()).not.toMatch(/\[cluster\]/)
  }, 90_000)

  it.skipIf(!URL_POSTGRES_DE_TESTE)(
    'com CLUSTER_WORKERS=3, o primário anuncia 3 processos na mesma porta (exige TESTE_POSTGRES_URL: PGlite é de processo único; o cluster sai na Fase 2)',
    async () => {
      const pg = await bancoPostgresDescartavel(URL_POSTGRES_DE_TESTE!)
      bancosPg.push(pg.apagar)
      const { porta, saida } = await subirServidor(
        { CLUSTER_WORKERS: '3', DATABASE_URL: pg.url },
        60_000,
        /\[cluster\] \d+ processos|ABORTADO/,
      )
      /* O anúncio do cluster sai logo depois dos `fork()`; o "rodando em" sai no retorno do `listen`, uma
       volta do laço de eventos depois. Conferir na hora era corrida (falhou na CI em 11/10/2026). */
      await expect.poll(() => saida(), { timeout: 15_000 }).toMatch(/rodando em/)
      // `Math.min(pedidos, availableParallelism())` — numa máquina de 1 núcleo o número cai, e o
      // teste não pode exigir 3 onde o hardware não dá. Exigir >= 2 é o que prova que forkou.
      const anuncio = /\[cluster\] (\d+) processos/.exec(saida())
      expect(anuncio, `esperava o anúncio do cluster; saída: ${saida().slice(-400)}`).not.toBeNull()
      expect(Number(anuncio![1])).toBeGreaterThanOrEqual(2)

      // E a porta atende de verdade — forkar sem servir não vale.
      const r = await fetch(`http://127.0.0.1:${porta}/api/health`)
      expect(r.status).toBe(200)
      void pidsQueAtenderam
    },
    90_000,
  )

  /* A GUARDA DO BANCO EMBUTIDO, observada disparando (no SQLite era a do WAL, que nunca pôde ser
     forçada por fora e ficava como lacuna declarada). Sai com 1, antes de forkar, e diz o motivo. */
  it('com CLUSTER_WORKERS=3 e o PGlite embutido, o boot ABORTA antes de forkar, com o motivo', async () => {
    // Sem `ABORTADO` no `pronto`: a espera termina na SAÍDA do processo (código 1) ou se ele subir.
    const { saida, codigo } = await subirServidor({ CLUSTER_WORKERS: '3' }, 60_000, /rodando em/)
    expect(codigo, saida().slice(-400)).toBe(1)
    expect(saida()).toMatch(/\[boot\] ABORTADO: CLUSTER_WORKERS=3 com banco local embutido/)
    expect(saida()).not.toMatch(/rodando em|\[cluster\] \d+ processos/)
  }, 90_000)
})
