/**
 * F5-04 — o diário de erros em disco, exercitado.
 *
 * O que estes testes travam, e cada um corresponde a uma promessa que o módulo faz:
 *  1. evento de nível `error` chega ao arquivo do dia; `info` e `warn` NÃO — o diário é para o que
 *     precisa sobreviver, não para tudo;
 *  2. o que chega é o objeto JÁ SANEADO pela allowlist do logger, e não os campos crus: a garantia
 *     de que transcrição e chave não vazam vale para o disco como vale para o stdout;
 *  3. a rotação apaga o que passou do prazo — com relógio injetado, porque um teste que espera um
 *     dia não é um teste;
 *  4. diário que não consegue escrever NÃO derruba quem o chamou.
 *
 * O quarto é o que separa telemetria de armadilha. Um sink que lança no caminho de erro
 * transformaria "o request falhou" em "o processo morreu ao anotar que o request falhou".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { diarioEmArquivo } from '../../server/lib/diarioDeErros'
import { log, registrarSinkDeErro } from '../../server/lib/logger'

let dir: string
const desfazer: Array<() => void> = []

beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'diario-')) })
afterEach(() => {
  for (const f of desfazer.splice(0)) f()
  vi.restoreAllMocks()
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignora */ }
})

const linhasDe = (arquivo: string) =>
  readFileSync(path.join(dir, arquivo), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

describe('F5-04 — diário de erros em disco', () => {
  it('grava só evento de erro, no arquivo do dia', () => {
    const agora = () => new Date('2026-08-14T10:00:00Z')
    desfazer.push(registrarSinkDeErro(diarioEmArquivo({ dir, agora })))

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    log('info', { event: 'boot' })
    log('warn', { event: 'lento' })
    log('error', { event: 'falha_de_rota', route: '/api/sessions', status: 500 })

    expect(readdirSync(dir)).toEqual(['2026-08-14.jsonl'])
    const linhas = linhasDe('2026-08-14.jsonl')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].event).toBe('falha_de_rota')
    expect(linhas[0].level).toBe('error')
    expect(linhas[0].route).toBe('/api/sessions')
  })

  it('recebe o objeto SANEADO: campo fora da allowlist não chega ao disco', () => {
    const agora = () => new Date('2026-08-14T10:00:00Z')
    desfazer.push(registrarSinkDeErro(diarioEmArquivo({ dir, agora })))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // `transcricao` e `apiKey` NÃO estão na allowlist do logger. Se aparecerem aqui, o sink está
    // recebendo os campos crus e a garantia do stdout não vale para o destino externo.
    log('error', { event: 'falha', route: '/api/x', transcricao: 'texto sigiloso', apiKey: 'sk-123' } as never)

    const bruto = readFileSync(path.join(dir, '2026-08-14.jsonl'), 'utf8')
    expect(bruto).not.toContain('texto sigiloso')
    expect(bruto).not.toContain('sk-123')
    expect(linhasDe('2026-08-14.jsonl')[0].event).toBe('falha')
  })

  it('apaga o diário que passou do prazo, e só ele', () => {
    // Um arquivo velho e um de ontem, ambos plantados à mão com mtime controlado.
    const velho = path.join(dir, '2026-07-01.jsonl')
    const recente = path.join(dir, '2026-08-13.jsonl')
    mkdirSync(dir, { recursive: true })
    writeFileSync(velho, '{"level":"error"}\n')
    writeFileSync(recente, '{"level":"error"}\n')
    const seg = (d: string) => new Date(d).getTime() / 1000
    utimesSync(velho, seg('2026-07-01'), seg('2026-07-01'))
    utimesSync(recente, seg('2026-08-13'), seg('2026-08-13'))

    const sink = diarioEmArquivo({ dir, manter: 14, agora: () => new Date('2026-08-14T10:00:00Z') })
    sink({ level: 'error', event: 'agora' })

    const restantes = readdirSync(dir).sort()
    expect(restantes).toContain('2026-08-13.jsonl')  // 1 dia — dentro do prazo
    expect(restantes).toContain('2026-08-14.jsonl')  // o de hoje, recém-criado
    expect(restantes).not.toContain('2026-07-01.jsonl') // 44 dias — fora
  })

  it('a cadeia real de produção chega ao disco: erroGlobal -> log -> sink -> arquivo', async () => {
    const { erroGlobal } = await import('../../server/lib/erroGlobal')
    const agora = () => new Date('2026-08-14T10:00:00Z')
    desfazer.push(registrarSinkDeErro(diarioEmArquivo({ dir, agora })))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    /*
     * Chamar `erroGlobal` diretamente, e não por HTTP, é deliberado: o que este teste precisa
     * provar é o TRECHO entre o handler de erro e o arquivo. Subir servidor para isso acrescentaria
     * porta, socket e prazo — três fontes de intermitência — sem cobrir uma linha a mais desta
     * cadeia. Que o Express chega em `erroGlobal` já está travado em `erro-global.test.ts`.
     */
    const req = { path: '/api/sessions/42/audio', method: 'GET', requestId: 'req-abc' }
    const res = { headersSent: false, status: () => res, json: () => res, end: () => res }
    const erro = Object.assign(new Error('falhou a consulta'), { cause: new Error('SQLITE_BUSY: database is locked') })
    erroGlobal(erro, req as never, res as never, (() => {}) as never)

    const linhas = linhasDe('2026-08-14.jsonl')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].event).toBe('erro_nao_tratado')
    expect(linhas[0].route).toBe('/api/sessions/42/audio')
    expect(linhas[0].requestId).toBe('req-abc')
    // A causa VAI para o diário — é interno e é o que serve para investigar. O que nunca sai é a
    // resposta HTTP, e disso cuida `erro-global.test.ts`.
    expect(String(linhas[0].error)).toContain('SQLITE_BUSY')
  })

  it('diário que não consegue escrever NÃO derruba quem o chamou', () => {
    // Diretório que existe mas cujo caminho de arquivo é impossível: o append tem de falhar.
    const sink = diarioEmArquivo({ dir, agora: () => new Date('2026-08-14T10:00:00Z') })
    rmSync(dir, { recursive: true, force: true }) // o diretório some DEPOIS de criado

    expect(() => sink({ level: 'error', event: 'falha' })).not.toThrow()
  })
})
