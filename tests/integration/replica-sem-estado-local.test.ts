/**
 * NADA QUE O SERVIDOR PRECISA PARA RESPONDER PODE VIVER SÓ NO DISCO OU NA MEMÓRIA DE UM PROCESSO
 * (auditoria de 2026-09-07, achados A33, A34 e A61).
 *
 * Três provas, uma por forma de estado local que existia:
 *
 *  1. **A chave dos segredos.** Era gravada em `process.cwd() + '/data/secret.key'`. No
 *     `docker-compose.yml` deste projeto o processo roda em `/app` e o volume está em `/data`: a
 *     chave nascia no sistema de arquivos efêmero do contêiner e sumia no restart, levando junto a
 *     leitura de toda credencial de IA já cifrada. Com duas réplicas o estrago é imediato — cada
 *     uma gera a sua e nenhuma lê os segredos da outra.
 *  2. **A varredura de armazenamento.** Ler-decidir-varrer é uma corrida: duas requisições
 *     simultâneas do mesmo usuário liam o mesmo carimbo vencido e varriam as duas.
 *  3. **A coerência da topologia.** O servidor não tem como descobrir quantas réplicas existem;
 *     quem opera declara, e o boot recusa a combinação que serve dado que some.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const guardaDoEnv = { ...process.env }

beforeEach(() => { vi.resetModules() })
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in guardaDoEnv)) delete process.env[k]
  Object.assign(process.env, guardaDoEnv)
  vi.resetModules()
})

/** Cada import fresco do módulo é um "processo": ele resolve a chave de novo, do zero. */
async function processoNovo() {
  vi.resetModules()
  return await import('../../server/crypto')
}

/**
 * Roda o corpo com o `cwd` num diretório vazio.
 *
 * SEM ISTO O TESTE PASSA PELO MOTIVO ERRADO, e este arquivo já foi pego por isso: o repositório
 * tem um `data/secret.key` de desenvolvimento, e a migração do caminho legado (que existe para
 * não quebrar quem já usava) o adotava nos dois "processos" — as duas instâncias liam os segredos
 * uma da outra por causa do `cwd` compartilhado, não do `DATA_DIR`. Um verde que não fala sobre a
 * mudança é pior que um vermelho.
 */
async function comCwdLimpo<T>(corpo: (raiz: string) => Promise<T>): Promise<T> {
  const raiz = mkdtempSync(join(tmpdir(), 'babel-cwd-'))
  const anterior = process.cwd()
  process.chdir(raiz)
  try {
    return await corpo(raiz)
  } finally {
    process.chdir(anterior)
    rmSync(raiz, { recursive: true, force: true })
  }
}

describe('a chave dos segredos vive no diretório gravável', () => {
  it('duas instâncias com o mesmo DATA_DIR leem os segredos uma da outra', async () => {
    await comCwdLimpo(async (raiz) => {
      const dir = join(raiz, 'volume')
      mkdirSync(dir, { recursive: true })
      process.env.DATA_DIR = dir
      delete process.env.SECRET_KEY

      const a = await processoNovo()
      const cifrado = a.encryptSecret('minha-chave-de-api')

      // Outra instância: memória zerada, mesmo volume.
      const b = await processoNovo()
      expect(b.decryptSecret(cifrado)).toBe('minha-chave-de-api')

      expect(existsSync(join(dir, 'secret.key')), 'a chave tem de estar no volume, não no cwd').toBe(true)
    })
  })

  it('instâncias com volumes DIFERENTES não leem uma a outra — é o defeito que a correção evita', async () => {
    await comCwdLimpo(async (raiz) => {
      const dirA = join(raiz, 'a')
      const dirB = join(raiz, 'b')
      mkdirSync(dirA, { recursive: true })
      mkdirSync(dirB, { recursive: true })
      delete process.env.SECRET_KEY

      process.env.DATA_DIR = dirA
      const a = await processoNovo()
      const cifrado = a.encryptSecret('segredo')

      process.env.DATA_DIR = dirB
      const b = await processoNovo()
      expect(() => b.decryptSecret(cifrado)).toThrow()
    })
  })

  it('instalação existente NÃO perde os segredos: a chave antiga é adotada, não substituída', async () => {
    /* A correção do caminho não pode custar os dados de quem já usava: existe gente com a chave em
       `<cwd>/data/secret.key` e credenciais cifradas com ela. Gerar uma nova aqui tornaria esses
       segredos ilegíveis para sempre. */
    await comCwdLimpo(async (raiz) => {
      const antigo = join(raiz, 'data')
      mkdirSync(antigo, { recursive: true })
      const chaveAntiga = 'a'.repeat(64)
      writeFileSync(join(antigo, 'secret.key'), chaveAntiga, 'utf8')

      const volume = join(raiz, 'volume')
      mkdirSync(volume, { recursive: true })
      process.env.DATA_DIR = volume
      delete process.env.SECRET_KEY

      const m = await processoNovo()
      const cifrado = m.encryptSecret('credencial-antiga')
      expect(m.decryptSecret(cifrado)).toBe('credencial-antiga')
      // Mesma chave, copiada para o lugar certo.
      expect(readFileSync(join(volume, 'secret.key'), 'utf8').trim()).toBe(chaveAntiga)
    })
  })
})

describe('topologia declarada', () => {
  async function diretorios() {
    vi.resetModules()
    return await import('../../server/lib/diretorios')
  }

  it('uma instância não exige nada', async () => {
    delete process.env.REPLICAS
    expect((await diretorios()).erroDeMultiReplica()).toBeNull()
  })

  it('duas instâncias sem armazenamento compartilhado são recusadas, com o motivo', async () => {
    process.env.REPLICAS = '2'
    delete process.env.ARMAZENAMENTO_COMPARTILHADO
    delete process.env.S3_BUCKET
    const erro = (await diretorios()).erroDeMultiReplica()
    expect(erro).toContain('REPLICAS=2')
    expect(erro).toContain('404')
  })

  it('duas instâncias com S3 completo, ou com volume declarado, sobem', async () => {
    process.env.REPLICAS = '2'
    process.env.S3_ENDPOINT = 'https://x'
    process.env.S3_BUCKET = 'b'
    process.env.S3_ACCESS_KEY_ID = 'k'
    process.env.S3_SECRET_ACCESS_KEY = 's'
    expect((await diretorios()).erroDeMultiReplica()).toBeNull()

    delete process.env.S3_ENDPOINT
    delete process.env.S3_BUCKET
    delete process.env.S3_ACCESS_KEY_ID
    delete process.env.S3_SECRET_ACCESS_KEY
    process.env.ARMAZENAMENTO_COMPARTILHADO = '1'
    expect((await diretorios()).erroDeMultiReplica()).toBeNull()
  })

  it('S3 pela metade não conta como compartilhado — o seam só liga com as quatro', async () => {
    process.env.REPLICAS = '2'
    delete process.env.ARMAZENAMENTO_COMPARTILHADO
    process.env.S3_ENDPOINT = 'https://x'
    process.env.S3_BUCKET = 'b'
    delete process.env.S3_ACCESS_KEY_ID
    delete process.env.S3_SECRET_ACCESS_KEY
    expect((await diretorios()).erroDeMultiReplica()).not.toBeNull()
  })

  it('o diretório gravável segue o banco quando DATA_DIR não é declarado', async () => {
    delete process.env.DATA_DIR
    process.env.DATABASE_URL = 'file:/data/babel.db'
    const { diretorioGravavel } = await diretorios()
    expect(diretorioGravavel().replace(/\\/g, '/')).toBe('/data')
  })
})
