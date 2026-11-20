/**
 * Integração da bancada de voz: encadeia os PRODUTORES reais com o corpus real, e só o sintetizador e o
 * transcritor são falsos (nada de rede nem de Whisper):
 *   sintetizarCorpus -> medirRoundtrip -> montarRegistro (estabilidade) -> resumirEscuta -> montarRelatorio.
 * Se o formato que um passo grava e o que o próximo lê divergirem, este teste quebra.
 */
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { wavDeSilencio } from '../scripts/audiolivros/wav.mjs'
import { lerCorpus, LIMIARES } from '../scripts/eval-voz/comum.mjs'
import { resumirEscuta, sortearCega } from '../scripts/eval-voz/gerar-formulario.mjs'
import { medirEstabilidadeDoLongo, montarRegistro } from '../scripts/eval-voz/medir-estabilidade.mjs'
import { medirRoundtrip, montarRegistroDoRoundtrip } from '../scripts/eval-voz/medir-roundtrip.mjs'
import { montarRelatorio } from '../scripts/eval-voz/relatorio.mjs'
import { sintetizarCorpus } from '../scripts/eval-voz/sintetizar.mjs'

const corpus = lerCorpus(path.join(__dirname, '..', 'scripts', 'eval-voz', 'corpus-voz.jsonl'))

/** Sintetizador falso que guarda o texto enviado por frase (a "voz" que o Whisper falso vai "ouvir"). */
function sintetizadorFalso() {
  const ouvido: string[] = []
  return {
    ouvido,
    sintetizador: {
      id: 'falso',
      versao: '0',
      idiomas: ['pt', 'en', 'es'],
      limiteDeCaracteres: 100_000,
      async vozes() {
        return []
      },
      async sintetizar(texto: string) {
        ouvido.push(texto)
        const duracaoS = texto.length * 0.06
        return {
          wav: wavDeSilencio(duracaoS, 16000),
          duracaoS,
          taxaHz: 16000,
          tempoDeSinteseS: duracaoS * 0.2,
          origemDoTempo: 'servidor' as const,
        }
      },
    },
  }
}

/** Roda a cadeia de UMA voz e devolve o que cada passo produziu. */
async function cadeiaDaVoz(motor: string, voz: string, preprocessar = true) {
  const falso = sintetizadorFalso()
  const sintese = await sintetizarCorpus({
    corpus,
    sintetizador: falso.sintetizador,
    voz,
    escrever: () => {},
    preprocessar,
  })
  expect(sintese.erros).toEqual([])
  const duracoes = new Map(sintese.frases.map((f) => [f.id, f.duracaoS]))
  const ouvidoPorId = new Map(corpus.map((c, i) => [c.id, falso.ouvido[i]]))
  const rt = await medirRoundtrip({
    corpus,
    transcrever: async (item) => ouvidoPorId.get(item.id),
    duracaoDe: (item) => duracoes.get(item.id),
  })
  const registroRt = montarRegistroDoRoundtrip({
    motor,
    voz,
    medidas: rt.medidas,
    pendentes: [],
    avaliacao: { passou: true, falhas: [] },
    frases: rt.frases,
  })

  const texto = 'o rio corre devagar entre as pedras e o vento leva as folhas para longe da casa velha '
    .repeat(4)
    .trim()
  const longo = await medirEstabilidadeDoLongo({
    texto,
    idioma: 'pt',
    pcm: new Float32Array(16000 * 5).fill(0.1),
    transcrever: async () => texto,
  })
  const registroEst = montarRegistro({
    motor,
    voz,
    idioma: 'pt',
    textoId: 'longo.txt',
    texto,
    audioDuracaoS: 5,
    r: longo,
  })
  return { sintese: { motor, voz, ...sintese }, registroRt, registroEst }
}

describe('cadeia completa da bancada de voz (corpus real, sintetizador e transcritor falsos)', () => {
  it('síntese -> round-trip -> estabilidade -> escuta -> relatório, por idioma e com a bandeira do preprocessador', async () => {
    const a = await cadeiaDaVoz('qwen', 'ryan')
    const b = await cadeiaDaVoz('piper', 'faber')

    // Escuta cega: uma frase de cada idioma do corpus, por voz; 3 ouvintes dão 5 em pt e 2 em en para qwen/ryan.
    const frasePt = corpus.find((c) => c.idioma === 'pt')?.id ?? ''
    const fraseEn = corpus.find((c) => c.idioma === 'en')?.id ?? ''
    const amostras = ['qwen/ryan', 'piper/faber'].flatMap((id) => [
      { motor: id.split('/')[0], voz: id.split('/')[1], arquivo: `/x/${id}-pt.wav`, frase_id: frasePt, idioma: 'pt' },
      { motor: id.split('/')[0], voz: id.split('/')[1], arquivo: `/x/${id}-en.wav`, frase_id: fraseEn, idioma: 'en' },
    ])
    const { itens, chave } = sortearCega(amostras, 7)
    const nota = (arquivo: string, frase_id: string) =>
      arquivo.includes('qwen') ? (frase_id.startsWith('pt-') ? 5 : 2) : 3
    const linhas = itens.flatMap((it) =>
      ['ana', 'bia', 'cai'].map((ouvinte) => ({
        ouvinte,
        idioma: it.idioma ?? '',
        frase_id: it.frase_id ?? '',
        voz_cega: it.voz_cega,
        // âncora e repetidas recebem nota baixa e NÃO podem entrar em nenhuma média
        naturalidade: it.ancora || it.repetida ? 1 : nota(it.arquivo, it.frase_id ?? ''),
        clareza: 5,
        erros: [] as string[],
        comentario: '',
      })),
    )
    const escuta = { vozes: resumirEscuta(linhas, chave) }
    expect(escuta.vozes['qwen/ryan'].porIdioma?.pt?.naturalidade).toBe(5)
    expect(escuta.vozes['qwen/ryan'].porIdioma?.en?.naturalidade).toBe(2)
    expect(escuta.vozes['qwen/ryan'].porIdioma?.pt?.ouvintes).toBe(3)

    const r = montarRelatorio({
      roundtrips: [a.registroRt, b.registroRt],
      estabilidades: [a.registroEst],
      sinteses: [a.sintese, b.sintese],
      escuta,
      manifesto: [
        { id: 'qwen/ryan', licencaLimpa: true, temComponenteGpl: false, melhorQueAparelho: 1 },
        { id: 'piper/faber', licencaLimpa: true, temComponenteGpl: false, melhorQueAparelho: 1 },
      ],
      limiares: LIMIARES,
      idiomas: ['pt', 'en', 'es'],
    })

    // Aviso de provisório e nenhum aviso de fonte (preprocessador e origem do tempo registrados)
    expect(r.texto).toMatch(/Provisório/)
    expect(a.sintese.preprocessado).toBe(true)
    expect(r.avisos).toEqual([])

    // Os dois candidatos aparecem em CADA idioma, com a nota daquele idioma
    const secao = (idioma: string) => {
      const partes = r.texto.split(/^## \d+\. /m).filter((p) => p.startsWith(`${idioma}\n`))
      expect(partes, idioma).toHaveLength(1)
      return partes[0]
    }
    for (const idioma of ['pt', 'en', 'es']) {
      expect(secao(idioma)).toContain('`qwen/ryan`')
      expect(secao(idioma)).toContain('`piper/faber`')
    }
    expect(secao('pt')).toMatch(/`qwen\/ryan` \|.*\| 5,0 \| 100,0% \| 3 \|/)
    expect(secao('en')).toMatch(/`qwen\/ryan` \|.*\| 2,0 \| 0,0% \| 3 \|/)
    expect(secao('es')).toMatch(/`qwen\/ryan` \|.*\| sem escuta \| sem escuta \| 0 \|/)
    // sem escuta em es: a recomendação de es não escolhe ninguém
    expect(r.recomendacoes.es.escolhido).toBeNull()
    expect(r.recomendacoes.es.motivos['qwen/ryan'].join(' ')).toMatch(/escuta insuficiente: 0 ouvinte/)
    // en: nota 2 reprova qwen/ryan; piper (nota 3) também fica abaixo de 3,5
    expect(r.recomendacoes.en.escolhido).toBeNull()
    expect(r.recomendacoes.en.motivos['qwen/ryan'].join(' ')).toMatch(/naturalidade 2 abaixo/)
    // o RTF veio do servidor (0,2) e a estabilidade do arquivo de estabilidade
    expect(r.candidatos.find((c) => c.id === 'qwen/ryan')?.rtf).toBeCloseTo(0.2)
    expect(r.candidatos.find((c) => c.id === 'qwen/ryan')?.medidas.porIdioma.pt?.estabilidade).toBe(0)
  })

  it('síntese diagnóstica (sem preprocessador) acende o aviso no relatório', async () => {
    const crua = await cadeiaDaVoz('qwen', 'ryan', false)
    expect(crua.sintese.preprocessado).toBe(false)
    const r = montarRelatorio({
      roundtrips: [crua.registroRt],
      sinteses: [crua.sintese],
      limiares: LIMIARES,
      idiomas: ['pt'],
    })
    expect(r.avisos.join('\n')).toMatch(/SEM pré-processador/)
    expect(r.texto).toMatch(/SEM pré-processador/)
  })
})
