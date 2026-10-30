// @vitest-environment jsdom
/**
 * BACKUP E RESTAURAÇÃO DA ESTANTE: ida e volta (livros, posições, anotações, status), conflito (manter ou
 * substituir), versão desconhecida, caminho `../evil`, bomba de zip, JSON adulterado; "baixar cópia" fiel; e as
 * exportações de anotações em HTML (escapado) e CSV.
 */
import 'fake-indexeddb/auto'

import { File as ArquivoDoNode } from 'node:buffer'

import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { novaAnotacao } from '../src/core/leitura/anotacao'
import { paraCsvDePlanilha, paraHtml } from '../src/core/leitura/exportar'
import { validarEstante, VERSAO_DO_BACKUP } from '../src/core/livros/backup'
import { estante } from '../src/lib/livros/armazem'
import { criarBackup, ErroDeRestauracao, lerBackup, restaurarBackup } from '../src/lib/livros/backup'
import { copiaFielDoLivro } from '../src/lib/livros/copiaDoArquivo'
import { guardarConteudo, guardarMeuLivro, lerMeusLivros, removerMeuLivro } from '../src/lib/livros/meusLivros'
import { posicoes } from '../src/lib/livros/posicoesDoAparelho'
import { epubMinimo, TEXTO_DO_LIVRO } from './harness/formatosDeTeste'

const arq = (c: Uint8Array | string, nome: string) => new ArquivoDoNode([c], nome) as unknown as File
const enc = (o: unknown) => strToU8(JSON.stringify(o))

async function trazer(id: string, titulo: string, formato: 'txt' | 'epub') {
  const bytes = formato === 'epub' ? epubMinimo() : strToU8(`${titulo}\n\n${TEXTO_DO_LIVRO}`)
  const blob = new Blob([bytes as BlobPart], { type: formato === 'epub' ? 'application/epub+zip' : 'text/plain' })
  await guardarConteudo({
    id,
    capitulos: [{ titulo: 'Parte 1', texto: TEXTO_DO_LIVRO }],
    ...(formato === 'epub' ? { arquivo: blob } : { copia: blob }),
    nomeDoArquivo: `${titulo}.${formato}`,
  })
  guardarMeuLivro({ id, titulo, origem: 'arquivo', formato, status: 'lendo' })
}

beforeEach(async () => {
  /* jsdom: o File dele não tem `stream()`, que o leitor de EPUB usa; o do Node tem. */
  vi.stubGlobal('File', ArquivoDoNode)
  localStorage.clear()
  for (const l of lerMeusLivros()) await removerMeuLivro(l.id)
})

describe('cópia fiel do arquivo', () => {
  it('devolve os mesmos bytes e o nome original (TXT trazido e EPUB)', async () => {
    await trazer('meu-aaaa', 'Diario', 'txt')
    const copia = await copiaFielDoLivro({ id: 'meu-aaaa', titulo: 'Diario', formato: 'txt' })
    expect(copia?.nome).toBe('Diario.txt')
    expect(await copia!.blob.text()).toContain(TEXTO_DO_LIVRO)
    await trazer('meu-bbbb', 'Barco', 'epub')
    const epub = await copiaFielDoLivro({ id: 'meu-bbbb', titulo: 'Barco', formato: 'epub' })
    expect(new Uint8Array(await epub!.blob.arrayBuffer())).toEqual(epubMinimo())
  })
  it('sem conteúdo no aparelho: null', async () => {
    expect(await copiaFielDoLivro({ id: 'meu-zzzz', titulo: 'x', formato: 'txt' })).toBeNull()
  })
})

describe('backup e restauração: ida e volta', () => {
  it('livros, posição, status, anotações e arquivos voltam; o backup é um zip com estante.json', async () => {
    await trazer('meu-aaaa', 'Diario', 'txt')
    await trazer('meu-bbbb', 'Barco', 'epub')
    posicoes.gravar({ livroId: 'meu-bbbb', cfi: 'epubcfi(/6/2!/4/2)', secao: 1, fracao: 0.4, atualizadaEm: 10 })
    const nota = novaAnotacao({
      id: 'anotacao-teste-1',
      livroId: 'meu-bbbb',
      tipo: 'nota',
      cfi: 'epubcfi(/6/2!/4/2)',
      citacao: { exact: 'um barco pequeno', prefix: '', suffix: '' },
      nota: 'ótima frase',
      agora: Date.now(),
    })
    await estante.gravarAnotacoes([{ ...nota, pendente: 0 }])

    const backup = await criarBackup()
    expect(backup).toMatchObject({ livros: 2, semArquivo: 0 })
    const zip = new Uint8Array(await backup!.blob.arrayBuffer())
    expect([0x50, 0x4b]).toEqual([zip[0], zip[1]])

    /* apaga tudo e restaura */
    for (const l of lerMeusLivros()) await removerMeuLivro(l.id)
    await estante.gravarAnotacoes([])
    expect(lerMeusLivros()).toHaveLength(0)

    const plano = await lerBackup(arq(zip, 'backup.zip'))
    expect(plano.conflitos).toHaveLength(0)
    const res = await restaurarBackup(plano, 'manter', (i) => `Parte ${i + 1}`)
    expect(res).toMatchObject({ restaurados: 2, mantidos: 0, falhas: [] })
    expect(
      lerMeusLivros()
        .map((l) => l.titulo)
        .sort(),
    ).toEqual(['Barco', 'Diario'])
    expect(lerMeusLivros().find((l) => l.id === 'meu-bbbb')?.status).toBe('lendo')
    expect(posicoes.ler('meu-bbbb')?.fracao).toBe(0.4)
    expect((await estante.anotacoes('meu-bbbb')).map((a) => a.nota)).toEqual(['ótima frase'])
    const copia = await copiaFielDoLivro({ id: 'meu-aaaa', titulo: 'Diario', formato: 'txt' })
    expect(await copia!.blob.text()).toContain(TEXTO_DO_LIVRO)
  })

  it('conflito: livro que já existe é detectado; manter não mexe, substituir regrava', async () => {
    await trazer('meu-aaaa', 'Diario', 'txt')
    const backup = await criarBackup()
    const zip = new Uint8Array(await backup!.blob.arrayBuffer())
    guardarMeuLivro({ id: 'meu-aaaa', titulo: 'Diario', origem: 'arquivo', formato: 'txt', status: 'lido' })
    const plano = await lerBackup(arq(zip, 'b.zip'))
    expect(plano.conflitos.map((c) => c.id)).toEqual(['meu-aaaa'])
    expect(await restaurarBackup(plano, 'manter')).toMatchObject({ restaurados: 0, mantidos: 1 })
    expect(lerMeusLivros()[0].status).toBe('lido')
    expect(await restaurarBackup(plano, 'substituir')).toMatchObject({ restaurados: 1, mantidos: 0 })
    expect(lerMeusLivros()[0].status).toBe('lendo')
  })

  it('sem nada trazido, não há backup', async () => {
    expect(await criarBackup()).toBeNull()
  })
})

describe('restauração: conteúdo não confiável (falha fechada)', () => {
  const livro = {
    id: 'meu-aaaa',
    titulo: 'Diario',
    formato: 'txt',
    status: 'lendo',
    etiquetas: [],
    adicionadoEm: 1,
    nomeDoArquivo: 'd.txt',
    arquivo: 'livros/0.txt',
  }
  const estanteJson = (extra: object = {}) => ({
    formato: 'frasy-estante',
    versao: VERSAO_DO_BACKUP,
    criadoEm: 1,
    livros: [livro],
    anotacoes: [],
    ...extra,
  })

  it('versão desconhecida, formato errado e JSON adulterado são recusados', async () => {
    const z = (j: unknown) => arq(zipSync({ 'estante.json': enc(j), 'livros/0.txt': strToU8('oi') }), 'b.zip')
    await expect(lerBackup(z(estanteJson({ versao: 99 })))).rejects.toMatchObject({ motivo: 'versao-desconhecida' })
    await expect(lerBackup(z({ ...estanteJson(), formato: 'outro' }))).rejects.toMatchObject({ motivo: 'invalido' })
    await expect(lerBackup(z(estanteJson({ livros: [{ ...livro, id: '../x' }] })))).rejects.toMatchObject({
      motivo: 'invalido',
    })
    await expect(
      lerBackup(z(estanteJson({ livros: [{ ...livro, arquivo: 'livros/../../evil' }] }))),
    ).rejects.toMatchObject({
      motivo: 'invalido',
    })
    await expect(lerBackup(z(estanteJson({ livros: [{ ...livro, formato: 'exe' }] })))).rejects.toBeInstanceOf(
      ErroDeRestauracao,
    )
  })

  it('entrada com ../ no zip e arquivo ausente são recusados; sem estante.json também', async () => {
    const slip = zipSync({ 'estante.json': enc(estanteJson()), '../evil': strToU8('x'), 'livros/0.txt': strToU8('o') })
    await expect(lerBackup(arq(slip, 'b.zip'))).rejects.toMatchObject({ motivo: 'corrompido' })
    const sem = zipSync({ 'estante.json': enc(estanteJson()) })
    await expect(lerBackup(arq(sem, 'b.zip'))).rejects.toMatchObject({ motivo: 'invalido' })
    await expect(lerBackup(arq(zipSync({ 'x.txt': strToU8('a') }), 'b.zip'))).rejects.toMatchObject({
      motivo: 'invalido',
    })
    await expect(lerBackup(arq('isto não é um zip', 'b.zip'))).rejects.toMatchObject({ motivo: 'corrompido' })
  })

  it('bomba de zip (100 MB de zeros) é recusada antes de descompactar', async () => {
    const bomba = zipSync({ 'estante.json': enc(estanteJson()), 'livros/0.txt': new Uint8Array(100 * 1024 * 1024) })
    await expect(lerBackup(arq(bomba, 'b.zip'))).rejects.toMatchObject({ motivo: 'grande' })
  })

  it('um livro do backup que é DRM ou formato inválido falha sozinho; os outros restauram', async () => {
    const z = zipSync({
      'estante.json': enc(
        estanteJson({
          livros: [livro, { ...livro, id: 'meu-bbbb', titulo: 'Quebrado', arquivo: 'livros/1.txt' }],
        }),
      ),
      'livros/0.txt': strToU8(`Texto bom. ${TEXTO_DO_LIVRO}`),
      'livros/1.txt': new Uint8Array([1, 2, 3, 0, 4, 5]),
    })
    const plano = await lerBackup(arq(z, 'b.zip'))
    const res = await restaurarBackup(plano, 'manter')
    expect(res.restaurados).toBe(1)
    expect(res.falhas.map((f) => f.titulo)).toEqual(['Quebrado'])
  })

  it('validarEstante descarta anotação de livro que não está no backup', () => {
    const r = validarEstante(
      estanteJson({
        anotacoes: [
          {
            id: 'abcdefgh12',
            livroId: 'meu-outro',
            tipo: 'grifo',
            alvo: { cfi: '', citacao: { exact: 'x' } },
            criadoEm: 1,
            atualizadoEm: 1,
          },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.estante?.anotacoes).toHaveLength(0)
  })
})

describe('exportar anotações: HTML escapado e CSV', () => {
  const livro = { id: 'meu-aaaa', titulo: 'Diário <b>', autor: 'A & B' }
  const nota = novaAnotacao({
    id: 'anotacao-teste-1',
    livroId: 'meu-aaaa',
    tipo: 'nota',
    cfi: 'epubcfi(/6/2!/4/2)',
    citacao: { exact: '<script>alert(1)</script> trecho', prefix: '', suffix: '' },
    nota: '=HYPERLINK("http://x")',
    agora: 1_700_000_000_000,
  })
  it('HTML: nada vira marcação, sem script nem recurso externo, com CSP', () => {
    const html = paraHtml(livro, [nota], { agora: 1_700_000_000_000 })
    expect(html).not.toMatch(/<script|onerror|<b>Di/)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; trecho')
    expect(html).toContain('Content-Security-Policy')
    expect(html).not.toMatch(/(href|src)=/)
  })
  it('CSV: fórmula neutralizada com apóstrofo', () => {
    expect(paraCsvDePlanilha(livro, [nota])).toContain(`'=HYPERLINK`)
  })
})
