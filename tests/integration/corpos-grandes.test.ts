/**
 * CORPOS GRANDES — semáforo e recepção em arquivo (fase 2 de prontidão, §2.3/§4.1; ADR 0009).
 *
 * Medido em 25/09: 4 uploads simultâneos de 120 MB levaram o RSS de uma VM de 1 GB a 1.011 MB, porque
 * cada corpo existia DUAS vezes na memória (o `express.raw` e o sha256 do SigV4). Estes testes cobram
 * as duas peças que tiram o corpo da memória e limitam quantos existem ao mesmo tempo:
 *
 *  - o SEMÁFORO: 1 corpo grande em voo por usuário, 2 por processo, liberado uma única vez;
 *  - a RECEPÇÃO EM ARQUIVO: o corpo vai para o disco em pedaços, com teto contado em bytes (413 sem
 *    acumular) e interrupção do cliente reconhecida como tal.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough, Readable } from 'node:stream'

import { afterAll, describe, expect, it } from 'vitest'

import {
  CorpoGrandeDemais,
  CorpoInterrompido,
  receberCorpoEmArquivo,
  tamanhoDeclarado,
} from '../../server/lib/corpoEmArquivo'
import { criarSemaforoDeCorpos, limitesDeCorposGrandes } from '../../server/lib/corposGrandes'

const dir = mkdtempSync(path.join(tmpdir(), 'babel-corpos-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let n = 0
const destino = () => path.join(dir, `t-${++n}.bin`)

describe('semáforo de corpos grandes', () => {
  it('segundo corpo do MESMO usuário é recusado enquanto o primeiro está em voo', () => {
    const s = criarSemaforoDeCorpos({ porUsuario: 1, porProcesso: 2 })
    const a = s.adquirir('u1')
    expect(a.ok).toBe(true)
    expect(s.adquirir('u1')).toEqual({ ok: false, motivo: 'usuario' })
  })

  it('terceiro corpo no processo é recusado mesmo vindo de outro usuário', () => {
    const s = criarSemaforoDeCorpos({ porUsuario: 1, porProcesso: 2 })
    expect(s.adquirir('u1').ok).toBe(true)
    expect(s.adquirir('u2').ok).toBe(true)
    expect(s.adquirir('u3')).toEqual({ ok: false, motivo: 'processo' })
  })

  it('liberar devolve a vaga — e liberar DUAS vezes não devolve duas', () => {
    const s = criarSemaforoDeCorpos({ porUsuario: 1, porProcesso: 2 })
    const a = s.adquirir('u1')
    const b = s.adquirir('u2')
    if (!a.ok || !b.ok) throw new Error('deveria ter vaga')
    a.liberar()
    a.liberar() // finish + close do mesmo request: a segunda chamada não pode abrir vaga fantasma
    expect(s.emVoo()).toBe(1)
    expect(s.adquirir('u1').ok).toBe(true)
    expect(s.adquirir('u3').ok).toBe(false) // o processo está cheio de novo: 2 em voo
  })

  it('limites vêm do ambiente, com padrão 1/2 e valor inválido caindo no padrão', () => {
    expect(limitesDeCorposGrandes({})).toEqual({ porUsuario: 1, porProcesso: 2 })
    expect(limitesDeCorposGrandes({ UPLOADS_GRANDES_POR_USUARIO: '2', UPLOADS_GRANDES_POR_PROCESSO: '6' })).toEqual({
      porUsuario: 2,
      porProcesso: 6,
    })
    expect(
      limitesDeCorposGrandes({ UPLOADS_GRANDES_POR_USUARIO: '0', UPLOADS_GRANDES_POR_PROCESSO: 'muitos' }),
    ).toEqual({
      porUsuario: 1,
      porProcesso: 2,
    })
  })
})

describe('receberCorpoEmArquivo', () => {
  it('grava o corpo em pedaços e devolve bytes + cabeça para a detecção de tipo', async () => {
    const alvo = destino()
    const pedacos = [Buffer.from('RIFF'), Buffer.alloc(4, 1), Buffer.from('WAVE'), Buffer.alloc(1000, 2)]
    const r = await receberCorpoEmArquivo(Readable.from(pedacos), alvo, 10_000)
    expect(r.bytes).toBe(1012)
    expect(r.cabeca.subarray(0, 12).toString('latin1')).toBe('RIFF\x01\x01\x01\x01WAVE')
    expect(readFileSync(alvo).length).toBe(1012)
  })

  it('acima do teto rejeita com CorpoGrandeDemais e apaga o parcial', async () => {
    const alvo = destino()
    const fonte = Readable.from([Buffer.alloc(600), Buffer.alloc(600)])
    await expect(receberCorpoEmArquivo(fonte, alvo, 1000)).rejects.toBeInstanceOf(CorpoGrandeDemais)
    expect(existsSync(alvo)).toBe(false)
  })

  it('cliente que some no meio do corpo vira CorpoInterrompido, e o parcial é apagado', async () => {
    const alvo = destino()
    const fonte = new PassThrough()
    const p = receberCorpoEmArquivo(fonte, alvo, 10_000)
    fonte.write(Buffer.alloc(100))
    setTimeout(() => fonte.destroy(), 20)
    await expect(p).rejects.toBeInstanceOf(CorpoInterrompido)
    expect(existsSync(alvo)).toBe(false)
  })

  it('tamanhoDeclarado lê o Content-Length, e ausente/inválido é null', () => {
    expect(tamanhoDeclarado({ headers: { 'content-length': '1234' } })).toBe(1234)
    expect(tamanhoDeclarado({ headers: {} })).toBeNull()
    expect(tamanhoDeclarado({ headers: { 'content-length': 'x' } })).toBeNull()
  })
})
