import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { lerCorpus } from '../scripts/eval-voz/comum.mjs'
import {
  avaliarOuvintes,
  CABECALHO_DO_CSV,
  degradarWav,
  gerarFormulario,
  lerCsvDeEscuta,
  resumirEscuta,
  sortearCega,
} from '../scripts/eval-voz/gerar-formulario.mjs'
import {
  julgarTextos,
  lerVeredito,
  montarPromptDoJuizDeTexto,
  pastaDoCacheDoJuiz,
} from '../scripts/eval-voz/julgar-texto.mjs'

const CORPUS = path.resolve(__dirname, '../scripts/eval-voz/corpus-voz.jsonl')

/** WAV PCM16 mono com um chunk LIST que carrega o nome do motor (o formulário tem de removê-lo). */
function wavComMetadado(rotulo: string, amostras = 16000, taxa = 16000): Buffer {
  const dados = Buffer.alloc(amostras * 2)
  for (let i = 0; i < amostras; i++) dados.writeInt16LE(Math.round(Math.sin(i / 7) * 12000), i * 2)
  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1, 0)
  fmt.writeUInt16LE(1, 2)
  fmt.writeUInt32LE(taxa, 4)
  fmt.writeUInt32LE(taxa * 2, 8)
  fmt.writeUInt16LE(2, 12)
  fmt.writeUInt16LE(16, 14)
  const lista = Buffer.from(`INFOISFT${String.fromCharCode(rotulo.length + 1, 0, 0, 0)}${rotulo}\0`, 'latin1')
  const listaPad = lista.length % 2 ? Buffer.concat([lista, Buffer.alloc(1)]) : lista
  const chunk = (id: string, c: Buffer) => {
    const h = Buffer.alloc(8)
    h.write(id, 0, 'latin1')
    h.writeUInt32LE(c.length, 4)
    return Buffer.concat([h, c, c.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)])
  }
  const corpo = Buffer.concat([
    Buffer.from('WAVE', 'latin1'),
    chunk('fmt ', fmt),
    chunk('LIST', lista),
    chunk('data', dados),
  ])
  void listaPad
  const topo = Buffer.alloc(8)
  topo.write('RIFF', 0, 'latin1')
  topo.writeUInt32LE(corpo.length, 4)
  return Buffer.concat([topo, corpo])
}

function amostrasFalsas(dir: string) {
  const saida: { motor: string; voz: string; arquivo: string; frase_id: string; idioma: string }[] = []
  for (const motor of ['kokoro-secreto', 'orpheus-secreto']) {
    for (const voz of ['vozAna', 'vozBia']) {
      const arquivo = path.join(dir, `${motor}_${voz}.wav`)
      writeFileSync(arquivo, wavComMetadado(`${motor}/${voz}`))
      saida.push({ motor, voz, arquivo, frase_id: 'pt-dialogo', idioma: 'pt' })
    }
  }
  return saida
}

const pastaTmp = () => mkdtempSync(path.join(tmpdir(), 'escuta-teste-'))

describe('sortearCega', () => {
  const amostras = ['a', 'b', 'c', 'd', 'e'].map((m) => ({ motor: m, voz: 'v', arquivo: `/x/${m}.wav` }))

  it('mesma semente, mesma ordem; outra semente, outra ordem', () => {
    const ordem = (s: number) => sortearCega(amostras, s).itens.map((i) => i.arquivo)
    expect(ordem(7)).toEqual(ordem(7))
    expect(ordem(7)).not.toEqual(ordem(8))
  })

  it('traz exatamente 1 âncora e 2 repetidas, com o mesmo áudio sob outra voz_cega', () => {
    const { itens, chave } = sortearCega(amostras, 3)
    expect(itens.filter((i) => i.ancora)).toHaveLength(1)
    const repetidas = itens.filter((i) => i.repetida)
    expect(repetidas).toHaveLength(2)
    expect(new Set(itens.map((i) => i.voz_cega)).size).toBe(itens.length)
    for (const r of repetidas) {
      const originais = itens.filter((i) => !i.repetida && !i.ancora && i.arquivo === r.arquivo)
      expect(originais).toHaveLength(1)
      expect(originais[0].voz_cega).not.toBe(r.voz_cega)
    }
    expect(Object.keys(chave).sort()).toEqual(itens.map((i) => i.voz_cega).sort())
  })

  it('usa a amostra marcada como âncora, sem fabricar outra', () => {
    const com = [...amostras, { motor: 'ruim', voz: 'v', arquivo: '/x/ruim.wav', ancora: true as const }]
    const { itens } = sortearCega(com, 1)
    expect(itens.filter((i) => i.ancora).map((i) => i.arquivo)).toEqual(['/x/ruim.wav'])
    expect(itens).toHaveLength(amostras.length + 1 + 2)
  })
})

describe('gerarFormulario (cegueira)', () => {
  it('não vaza motor/voz no HTML, no CSV-modelo, nos nomes nem nos bytes dos WAV; a chave fica à parte', () => {
    const origem = pastaTmp()
    const saida = path.join(pastaTmp(), 'escuta')
    const amostras = amostrasFalsas(origem)
    const r = gerarFormulario({ amostras, semente: 11, saida })

    const arquivos = readdirSync(saida)
    expect(arquivos).toContain('formulario.html')
    expect(arquivos).toContain('modelo.csv')
    expect(arquivos).not.toContain('chave.json')
    const proibidos = ['kokoro', 'orpheus', 'secreto', 'vozAna', 'vozBia', origem]
    for (const nome of arquivos) {
      const bytes = readFileSync(path.join(saida, nome)).toString('latin1')
      for (const p of proibidos) {
        expect(nome).not.toContain(p)
        expect(bytes).not.toContain(p)
      }
      if (nome.endsWith('.wav')) expect(nome).toMatch(/^a\d+\.wav$/)
    }
    // só fmt + data nos WAV copiados
    const wav = readFileSync(path.join(saida, arquivos.find((n) => n.endsWith('.wav'))!))
    expect(wav.toString('latin1')).not.toContain('LIST')
    expect(wav.toString('latin1', 12, 16)).toBe('fmt ')

    expect(existsSync(r.arquivoDaChave)).toBe(true)
    expect(path.dirname(r.arquivoDaChave)).not.toBe(saida)
    const chave = JSON.parse(readFileSync(r.arquivoDaChave, 'utf8'))
    expect(Object.keys(chave)).toHaveLength(r.itens.length)
    expect(JSON.stringify(chave)).toContain('kokoro-secreto/vozAna')
    const modelo = readFileSync(path.join(saida, 'modelo.csv'), 'utf8')
    expect(modelo.split('\n')[0]).toBe(CABECALHO_DO_CSV)
  })

  it('fabrica a âncora degradando a primeira amostra quando ninguém a fornece', () => {
    const origem = pastaTmp()
    const saida = path.join(pastaTmp(), 'escuta')
    const amostras = amostrasFalsas(origem)
    const r = gerarFormulario({ amostras, semente: 2, saida })
    const ancora = r.itens.find((i) => i.ancora)!
    const original = readFileSync(amostras[0].arquivo)
    const gerado = readFileSync(path.join(saida, `${ancora.voz_cega}.wav`))
    expect(gerado.equals(original)).toBe(false)
    // mesma duração (mesmo nº de bytes de dados: 16000 amostras * 2)
    expect(gerado.readUInt32LE(gerado.indexOf('data') + 4)).toBe(32000)
  })

  it('degradarWav quantiza em 6 bits e mantém o comprimento', () => {
    const deg = degradarWav(wavComMetadado('x'))
    const dados = deg.subarray(deg.indexOf('data') + 8)
    expect(dados.length).toBe(32000)
    for (let i = 0; i < dados.length; i += 2) expect(Math.abs(dados.readInt16LE(i) % 1024)).toBe(0)
    expect(() => degradarWav(Buffer.from('lixo'))).toThrow(/WAV/)
  })
})

describe('lerCsvDeEscuta', () => {
  const cab = CABECALHO_DO_CSV
  it('lê linha simples e lista de erros', () => {
    const l = lerCsvDeEscuta(`${cab}\nana,pt,f1,a01,4,5,nome_errado|omissao,ok\nana,pt,f2,a02,3,3,,\n`)
    expect(l[0]).toEqual({
      ouvinte: 'ana',
      idioma: 'pt',
      frase_id: 'f1',
      voz_cega: 'a01',
      naturalidade: 4,
      clareza: 5,
      erros: ['nome_errado', 'omissao'],
      comentario: 'ok',
    })
    expect(l[1].erros).toEqual([])
  })

  it('aceita BOM, CRLF e aspas com vírgula, aspas duplas e quebra de linha', () => {
    const csv = `${String.fromCharCode(0xfeff)}${cab}\r\nana,pt,f1,a01,4,5,,"fala, com ""aspas""\nlinha 2"\r\nbia,pt,f1,a01,2,2,omissao,x\r\n`
    const l = lerCsvDeEscuta(csv)
    expect(l).toHaveLength(2)
    expect(l[0].comentario).toBe('fala, com "aspas"\nlinha 2')
    expect(l[1].ouvinte).toBe('bia')
  })

  it('rejeita coluna faltando, extra ou renomeada, citando a coluna', () => {
    expect(() => lerCsvDeEscuta('ouvinte,idioma,frase_id,voz_cega,naturalidade,clareza,comentario\n')).toThrow(
      /erros\[\]/,
    )
    expect(() => lerCsvDeEscuta(`${cab},extra\n`)).toThrow(/extra/)
    expect(() => lerCsvDeEscuta(cab.replace('erros[]', 'erros') + '\n')).toThrow(/erros\[\]/)
  })

  it('rejeita nota fora de 1..5 ou não inteira, com o número da linha', () => {
    expect(() => lerCsvDeEscuta(`${cab}\nana,pt,f1,a01,6,5,,\n`)).toThrow(/linha 2/)
    expect(() => lerCsvDeEscuta(`${cab}\nana,pt,f1,a01,4,5,,\nana,pt,f1,a02,3.5,5,,\n`)).toThrow(/linha 3/)
    expect(() => lerCsvDeEscuta(`${cab}\nana,pt,f1,a01,4,,,\n`)).toThrow(/clareza/)
  })
})

const linha = (ouvinte: string, voz_cega: string, naturalidade: number, clareza = 5, erros: string[] = []) => ({
  ouvinte,
  idioma: 'pt',
  frase_id: 'f1',
  voz_cega,
  naturalidade,
  clareza,
  erros,
  comentario: '',
})

describe('resumirEscuta', () => {
  const chave = {
    a01: 'kokoro/ana',
    a02: 'orpheus/bia',
    a03: '__ancora__',
    a04: '__repetida__:a01',
  }

  it('média de naturalidade 4,0 para notas [5,3] e conta ouvintes distintos', () => {
    const r = resumirEscuta([linha('ana', 'a01', 5), linha('bia', 'a01', 3)], chave)
    expect(r['kokoro/ana'].naturalidade).toBe(4)
    expect(r['kokoro/ana'].ouvintes).toBe(2)
  })

  it('aguenta30 = fração de notas com naturalidade e clareza >= 4', () => {
    const r = resumirEscuta(
      [linha('ana', 'a01', 5, 4), linha('bia', 'a01', 4, 3), linha('cai', 'a01', 3, 5), linha('dai', 'a01', 4, 4)],
      chave,
    )
    expect(r['kokoro/ana'].aguenta30).toBe(0.5)
  })

  it('erro grave só conta se 2 ouvintes DISTINTOS o citam', () => {
    const um = resumirEscuta(
      [linha('ana', 'a01', 4, 4, ['nome_errado']), linha('ana', 'a01', 4, 4, ['nome_errado'])],
      chave,
    )
    expect(um['kokoro/ana'].errosGravesRepetidos).toBe(0)
    const dois = resumirEscuta(
      [linha('ana', 'a01', 4, 4, ['nome_errado']), linha('bia', 'a01', 4, 4, ['nome_errado', 'omissao'])],
      chave,
    )
    expect(dois['kokoro/ana'].errosGravesRepetidos).toBe(1)
    const leve = resumirEscuta(
      [linha('ana', 'a01', 4, 4, ['robotico']), linha('bia', 'a01', 4, 4, ['robotico'])],
      chave,
    )
    expect(leve['kokoro/ana'].errosGravesRepetidos).toBe(0)
  })

  it('âncora e repetidas ficam fora das médias; voz_cega desconhecida é erro claro', () => {
    const r = resumirEscuta([linha('ana', 'a01', 5), linha('ana', 'a03', 1), linha('ana', 'a04', 1)], chave)
    expect(Object.keys(r)).toEqual(['kokoro/ana'])
    expect(r['kokoro/ana'].naturalidade).toBe(5)
    expect(() => resumirEscuta([linha('ana', 'zzz', 3)], chave)).toThrow(/zzz/)
  })

  it('marca ouvinte suspeito: âncora >= 4 ou repetida com diferença >= 2', () => {
    const s = avaliarOuvintes(
      [
        linha('ana', 'a03', 4),
        linha('bia', 'a01', 5),
        linha('bia', 'a04', 3),
        linha('cai', 'a01', 4),
        linha('cai', 'a04', 3),
        linha('cai', 'a03', 1),
      ],
      chave,
    )
    expect(s.map((o) => o.ouvinte).sort()).toEqual(['ana', 'bia'])
    expect(s.find((o) => o.ouvinte === 'ana')!.motivos.join(' ')).toMatch(/âncora/)
    expect(s.find((o) => o.ouvinte === 'bia')!.motivos.join(' ')).toMatch(/repetid/)
  })
})

describe('juiz de texto', () => {
  const corpus = lerCorpus(CORPUS)
  const ref = corpus[0].texto

  it('o prompt só tem texto e proíbe julgar naturalidade', () => {
    const p = montarPromptDoJuizDeTexto(ref, 'transcrição qualquer')
    expect(p).toContain('não avalie naturalidade')
    expect(p).toMatch(/prosódia/)
    expect(p).toMatch(/timbre/)
    expect(p).not.toMatch(/\.wav|\/tmp\/|\/Users\//)
    for (const c of ['nome_errado', 'numero_lido_errado', 'omissao', 'repeticao']) expect(p).toContain(c)
    expect(p).toContain(ref)
  })

  it('lerVeredito tolera cerca de código e prosa e rejeita classe inválida', () => {
    const ok = lerVeredito(
      'Claro!\n```json\n{"diferencas":[{"ref":"Ana","hip":"Anna","classe":"nome_errado"}]}\n```\nfim',
    )
    expect(ok.diferencas[0].classe).toBe('nome_errado')
    expect(lerVeredito('{"diferencas":[]}').diferencas).toEqual([])
    expect(() => lerVeredito('{"diferencas":[{"ref":"a","hip":"b","classe":"robotico"}]}')).toThrow(/classe/)
    expect(() => lerVeredito('sem json nenhum')).toThrow()
  })

  const executarFalso = (resposta = '{"diferencas":[]}') => {
    const estado = { chamadas: 0, simultaneas: 0, maximo: 0 }
    const executar = async () => {
      estado.chamadas++
      estado.simultaneas++
      estado.maximo = Math.max(estado.maximo, estado.simultaneas)
      await new Promise((r) => setTimeout(r, 15))
      estado.simultaneas--
      return resposta
    }
    return { estado, executar }
  }

  it('limita a 3 chamadas simultâneas e grava a classificação por item', async () => {
    const { estado, executar } = executarFalso()
    const pasta = pastaTmp()
    const itens = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, ref, hip: `hip ${i}` }))
    const r = await julgarTextos({ itens, corpus, executar, cache: pastaTmp(), saida: pasta, juiz: 'claude' })
    expect(estado.chamadas).toBe(8)
    expect(estado.maximo).toBeLessThanOrEqual(3)
    expect(estado.maximo).toBeGreaterThan(1)
    expect(r.resultados).toHaveLength(8)
    expect(existsSync(path.join(pasta, 'julgamento.json'))).toBe(true)
  })

  it('cache por hash do prompt evita a segunda chamada', async () => {
    const { estado, executar } = executarFalso()
    const cache = pastaTmp()
    const itens = [{ id: 'a', ref, hip: 'mesma hipótese' }]
    await julgarTextos({ itens, corpus, executar, cache, saida: pastaTmp(), juiz: 'claude' })
    const r = await julgarTextos({ itens, corpus, executar, cache, saida: pastaTmp(), juiz: 'claude' })
    expect(estado.chamadas).toBe(1)
    expect(r.resultados[0].doCache).toBe(true)
  })

  it('recusa texto de referência fora do corpus, sem chamar o modelo', async () => {
    const { estado, executar } = executarFalso()
    await expect(
      julgarTextos({
        itens: [{ id: 'x', ref: 'Um trecho de livro protegido qualquer.', hip: 'h' }],
        corpus,
        executar,
        cache: pastaTmp(),
        saida: pastaTmp(),
        juiz: 'claude',
      }),
    ).rejects.toThrow(/corpus/)
    expect(estado.chamadas).toBe(0)
  })

  it('timeout e resposta ilegível viram erro por item, sem derrubar o lote', async () => {
    let n = 0
    const executar = async () => {
      n++
      if (n === 1) throw new Error('alarme de 240 s')
      return 'isto não é JSON'
    }
    const itens = [
      { id: 'a', ref, hip: 'um' },
      { id: 'b', ref, hip: 'dois' },
    ]
    const r = await julgarTextos({ itens, corpus, executar, cache: pastaTmp(), saida: pastaTmp(), juiz: 'claude' })
    expect(r.resultados.map((x: { erro?: string }) => Boolean(x.erro))).toEqual([true, true])
    expect(r.resultados[0].erro).toMatch(/alarme/)
  })

  it('a pasta de cache fica fora do repositório e respeita CLAUDE_JOB_DIR', () => {
    expect(pastaDoCacheDoJuiz({ CLAUDE_JOB_DIR: '/tmp/job' })).toBe(path.join('/tmp/job', 'tmp', 'juiz-voz'))
    expect(pastaDoCacheDoJuiz({})).toBe(path.join(tmpdir(), 'juiz-voz'))
    mkdirSync(pastaTmp(), { recursive: true })
  })
})
