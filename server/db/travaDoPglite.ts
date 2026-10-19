/**
 * TRAVA DE DIRETÓRIO DO PGLITE: um processo por `pglite:<dir>`.
 *
 * O PGlite NÃO trava o diretório de dados. Dois processos abrindo o mesmo `pglite:<dir>` sobem os
 * dois, cada um com a sua cópia em memória, e o último a gravar no disco apaga as escritas do outro —
 * em silêncio (reproduzido na revisão final da Fase 1). O boot já recusa `REPLICAS>1` e
 * `CLUSTER_WORKERS>1` com PGlite (`server/lib/diretorios.ts`), mas nada impedia um segundo
 * `npm run dev`, um script de operação ou um servidor órfão sobre o mesmo diretório.
 *
 * O ARQUIVO `<dir>/.babel-lock` guarda pid, máquina, início do processo e hora. Existe e o dono está
 * vivo: recusa, com o pid e o diretório na mensagem. Dono morto (o servidor caiu sem soltar): trava
 * velha, sobrescrita. Quem a cria a solta no `fecharBanco()` e no `exit` do processo.
 *
 * O MESMO PID NÃO BASTA PARA "VIVO": num contêiner o servidor nasce sempre com o mesmo pid (1, ou o
 * do filho do init), e uma trava deixada por um SIGKILL/OOM pareceria do processo novo — o volume
 * nunca mais subiria. Para o próprio pid vale também o início do processo: igual, é este processo
 * abrindo de novo (recusa); diferente, é uma encarnação anterior (trava velha).
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'

export const ARQUIVO_DA_TRAVA = '.babel-lock'

interface DonoDaTrava {
  pid?: number
  host?: string
  inicio?: string
  em?: string
}

/* Início deste processo, ao segundo: lido uma vez, para a comparação com a própria trava ser exata. */
const INICIO_DO_PROCESSO = new Date(Math.floor((Date.now() - process.uptime() * 1000) / 1000) * 1000).toISOString()

function pidVivo(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM: o processo existe, só não é nosso de sinalizar.
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function donoVivo(d: DonoDaTrava): boolean {
  if (typeof d.pid !== 'number' || !Number.isInteger(d.pid) || d.pid <= 0) return false
  if (d.pid === process.pid) return d.host === hostname() && d.inicio === INICIO_DO_PROCESSO
  return pidVivo(d.pid)
}

/**
 * Trava `dir` para este processo e devolve a função que a solta (idempotente; só apaga a trava se
 * ela ainda for deste processo). Lança se outro processo vivo a tem.
 */
export function travarDiretorio(dir: string): () => void {
  const arquivo = join(dir, ARQUIVO_DA_TRAVA)
  const meu: DonoDaTrava = { pid: process.pid, host: hostname(), inicio: INICIO_DO_PROCESSO, em: '' }
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    meu.em = new Date().toISOString()
    try {
      // `wx`: cria só se não existir — dois processos ao mesmo tempo não ganham os dois.
      writeFileSync(arquivo, JSON.stringify(meu), { flag: 'wx' })
      let solta = false
      const soltar = () => {
        if (solta) return
        solta = true
        process.removeListener('exit', soltar)
        try {
          const atual = JSON.parse(readFileSync(arquivo, 'utf8')) as DonoDaTrava
          if (atual.pid === meu.pid && atual.inicio === meu.inicio) rmSync(arquivo, { force: true })
        } catch {
          /* já não existe (ou ilegível): nada a soltar */
        }
      }
      process.once('exit', soltar)
      return soltar
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
    let dono: DonoDaTrava = {}
    try {
      dono = JSON.parse(readFileSync(arquivo, 'utf8')) as DonoDaTrava
    } catch {
      /* ilegível ou apagado entre o `wx` e a leitura: trata como trava velha */
    }
    if (donoVivo(dono)) {
      throw new Error(
        `[db] o diretório do PGlite ${dir} já está aberto pelo processo ${dono.pid}` +
          `${dono.host ? ` na máquina ${dono.host}` : ''}${dono.em ? ` desde ${dono.em}` : ''}. ` +
          'O PGlite aceita um processo por diretório, e dois perdem escritas em silêncio. Pare esse processo ' +
          `(ou use outro DATABASE_URL); se ele não existe mais, apague ${arquivo}.`,
      )
    }
    // Trava velha: o dono morreu sem soltá-la.
    rmSync(arquivo, { force: true })
  }
  throw new Error(`[db] não consegui travar o diretório do PGlite ${dir} (${arquivo} disputado)`)
}
