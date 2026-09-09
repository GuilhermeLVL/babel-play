/**
 * O TETO VALE PARA AS DUAS INSTÂNCIAS JUNTAS (Fase 5).
 *
 * `tests/integration/replica-sem-estado-local.test.ts` escreve a regra da casa: nada de que o
 * servidor precisa para responder pode viver só na memória de um processo. O teto de relatórios de
 * erro do cliente era a última exceção — um `Map` no heap, com o comentário "estado por processo é
 * suficiente". Não era: o `docker-compose.yml` permite réplicas e `CLUSTER_WORKERS` forka N
 * processos, e cada um contava o seu. Teto efetivo: 10 por minuto × número de instâncias.
 *
 * POR QUE DOIS PROCESSOS DE VERDADE, e não dois `criarApp()` no mesmo teste: dentro de um worker do
 * vitest o módulo `server/db/db` é um só, e duas montagens compartilhariam TUDO — inclusive um
 * `Map` de heap. Um teste assim passaria com o defeito presente, que é a pior espécie de verde.
 * Aqui são dois `node` separados, com `DATABASE_URL` apontando para o mesmo arquivo, cada um com o
 * seu diário em disco — e a prova é a soma das linhas dos dois diários.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'

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

/** Faixa por PID, como em `cluster.test.ts`: duas execuções não podem disputar a mesma porta. */
let proximaPorta = 26_000 + (process.pid % 12_000)

/** Sobe uma instância apontada para `url` e só devolve quando ela está atendendo. */
async function subirInstancia(url: string, dirDeErros: string): Promise<{ porta: number; saida: () => string }> {
  const dados = mkdtempSync(path.join(tmpdir(), 'instancia-'))
  temporarios.push(dados)
  const porta = proximaPorta++
  const filho = spawn(process.execPath, [path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server.ts'], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SECRET_KEY: 'chave-de-teste-somente-para-o-teto-entre-instancias-32+',
      PORT: String(porta),
      HOST: '127.0.0.1',
      DATA_DIR: dados,
      DATABASE_URL: url,
      AUTH_REQUIRED: '0',
      /* Diário PRÓPRIO por instância. Dois processos fora do modo cluster escreveriam no MESMO
         `<dia>.jsonl` (ver `diarioDeErros.ts`), e o teste passaria a depender de `appendFileSync`
         intercalar linhas de dois processos sem se atrapalhar — que não é o que está sendo
         medido. Separados, a soma dos dois arquivos é a contagem exata. */
      ERROS_DIR: dirDeErros,
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
  const t0 = Date.now()
  while (!/rodando em/.test(saida) && Date.now() - t0 < 90_000) await new Promise((r) => setTimeout(r, 100))
  expect(saida, `a instância precisava estar atendendo; saída:\n${saida.slice(-600)}`).toMatch(/rodando em/)
  return { porta, saida: () => saida }
}

/** Linhas do diário (de todas as instâncias) que citam `marca`. */
function linhasDoDiario(dirs: string[], marca: string): number {
  let n = 0
  for (const dir of dirs) {
    for (const nome of readdirSync(dir)) {
      if (!nome.endsWith('.jsonl')) continue
      for (const linha of readFileSync(path.join(dir, nome), 'utf8').split('\n')) {
        if (linha.includes(marca)) n++
      }
    }
  }
  return n
}

async function reportar(porta: number, id: string): Promise<number> {
  const r = await fetch(`http://127.0.0.1:${porta}/api/erros-do-cliente`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, tipo: 'render', mensagem: 'Cannot read properties of undefined' }),
  })
  return r.status
}

describe('teto de relatórios de erro, com duas instâncias sobre o MESMO banco', () => {
  it('as duas somam no mesmo contador: 16 relatórios, no máximo 10 no diário', async () => {
    const banco = mkdtempSync(path.join(tmpdir(), 'banco-comum-'))
    temporarios.push(banco)
    const url = `file:${path.join(banco, 'comum.db').split(path.sep).join('/')}`
    const dirA = path.join(banco, 'erros-a')
    const dirB = path.join(banco, 'erros-b')
    mkdirSync(dirA, { recursive: true })
    mkdirSync(dirB, { recursive: true })

    /* Em SÉRIE, e não em paralelo: as duas aplicam migrations no boot, e o ponto do teste é o teto,
       não a contenção de lock (que `server/db/db.ts` já resolve com WAL + busy_timeout). */
    const a = await subirInstancia(url, dirA)
    const b = await subirInstancia(url, dirB)

    const MARCA = 'e-duas-instancias'
    for (let i = 0; i < 8; i++) {
      expect(
        await reportar(a.porta, `${MARCA}-a${i}`),
        'a resposta é sempre 202 — o cliente não reage a reporte recusado',
      ).toBe(202)
      expect(await reportar(b.porta, `${MARCA}-b${i}`)).toBe(202)
    }

    const logadas = linhasDoDiario([dirA, dirB], MARCA)
    expect(
      logadas,
      `16 relatórios entraram; com o Map por processo o diário receberia todos os 16 (8 em cada instância). Recebeu ${logadas}`,
    ).toBeLessThanOrEqual(10)
    expect(logadas, 'e o teto não pode ser tão apertado que ninguém seja ouvido').toBeGreaterThan(0)

    /* E o contador é UM só, no banco: as 16 requisições estão no mesmo balde, independentemente de
       qual instância as atendeu. É a diferença entre "o teto foi respeitado por sorte" e "as duas
       instâncias contam juntas". */
    const cliente = createClient({ url })
    try {
      const r = await cliente.execute({
        sql: "SELECT SUM(count) AS n FROM usage_counters WHERE metric = 'ratelimit:erros'",
        args: [],
      })
      expect(Number(r.rows[0]?.n), 'as 16 chamadas caíram no mesmo contador compartilhado').toBe(16)
    } finally {
      cliente.close()
    }
  }, 240_000)
})
