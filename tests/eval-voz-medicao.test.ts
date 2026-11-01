/**
 * Correções da rodada final da bancada de voz: o que a síntese manda ao motor, a pasta por voz e o marcador
 * de origem, as aspas angulares na comparação e a origem do tempo de síntese.
 * Nada aqui toca a rede nem o Whisper de verdade.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { criarSintetizadorFalso, criarSintetizadorHttp } from '../scripts/audiolivros/sintetizador.mjs'
import { wavDeSilencio } from '../scripts/audiolivros/wav.mjs'
import {
  ARQUIVO_DE_ORIGEM,
  conferirOrigem,
  escreverOrigem,
  lerCorpus,
  lerOrigem,
  pastaDeSaida,
} from '../scripts/eval-voz/comum.mjs'
import { LIMIARES } from '../scripts/eval-voz/comum.mjs'
import { montarRegistro } from '../scripts/eval-voz/medir-estabilidade.mjs'
import { montarRegistroDoRoundtrip } from '../scripts/eval-voz/medir-roundtrip.mjs'
import { acertoDosItens, medirTrecho, PALAVRAS_DE_NUMERO } from '../scripts/eval-voz/metricas.mjs'
import { montarRelatorio } from '../scripts/eval-voz/relatorio.mjs'
import { sintetizarCorpus } from '../scripts/eval-voz/sintetizar.mjs'
import { cardinalPt } from '../src/core/leitura/numerosPt'
import { VERSAO_DO_PREPROCESSADOR } from '../src/core/leitura/prepararTextoParaVoz'

const pastas: string[] = []
const pastaTemporaria = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'eval-voz-medicao-'))
  pastas.push(d)
  return d
}
afterEach(() => {
  for (const d of pastas.splice(0)) rmSync(d, { recursive: true, force: true })
})

const item = (id: string, texto: string, idioma: 'pt' | 'en' | 'es' = 'pt') => ({
  id,
  idioma,
  texto,
  categoria: 'x',
  itens: [],
})

/** Sintetizador que grava o texto exato que recebeu. */
function gravador(origemDoTempo: 'servidor' | 'relogio' = 'servidor') {
  const recebidos: string[] = []
  return {
    recebidos,
    sintetizador: {
      id: 'grav',
      versao: '0',
      idiomas: ['pt', 'en', 'es'],
      limiteDeCaracteres: 10_000,
      async vozes() {
        return []
      },
      async sintetizar(texto: string) {
        recebidos.push(texto)
        return {
          wav: wavDeSilencio(texto.length * 0.05, 16000),
          duracaoS: texto.length * 0.05,
          taxaHz: 16000,
          tempoDeSinteseS: 1,
          origemDoTempo,
        }
      },
    },
  }
}

describe('sintetizarCorpus: o motor recebe o texto PREPARADO', () => {
  const corpus = [
    item('pt-moeda', 'Custa R$ 49,90 hoje.'),
    item('pt-hora', 'Saiu às 7h30 da manhã.'),
    item('pt-seculo', 'No século XX houve guerras.'),
  ]

  it('moeda, hora e século chegam por extenso; o resumo registra o preprocessador', async () => {
    const g = gravador()
    const r = await sintetizarCorpus({ corpus, sintetizador: g.sintetizador, voz: 'v', escrever: () => {} })
    expect(g.recebidos).toEqual([
      'Custa quarenta e nove reais e noventa centavos hoje.',
      'Saiu às sete horas e trinta da manhã.',
      'No século vinte houve guerras.',
    ])
    expect(r.preprocessado).toBe(true)
    expect(r.versaoPreprocessador).toBe(VERSAO_DO_PREPROCESSADOR)
  })

  it('os caracteres por frase (base do ±30 %) são os do texto PREPARADO', async () => {
    const g = gravador()
    const r = await sintetizarCorpus({ corpus, sintetizador: g.sintetizador, voz: 'v', escrever: () => {} })
    expect(r.frases.map((f) => f.caracteres)).toEqual(g.recebidos.map((t) => t.length))
    expect(r.frases[0].caracteres).not.toBe(corpus[0].texto.length)
  })

  it('--sem-preprocessador (preprocessar: false) manda o texto cru e grava preprocessado: false', async () => {
    const g = gravador()
    const r = await sintetizarCorpus({
      corpus,
      sintetizador: g.sintetizador,
      voz: 'v',
      escrever: () => {},
      preprocessar: false,
    })
    expect(g.recebidos).toEqual(corpus.map((c) => c.texto))
    expect(r.preprocessado).toBe(false)
    expect(r.versaoPreprocessador).toBeNull()
  })

  it('o relatório avisa de síntese sem preprocessador (e de resumo que não registra)', () => {
    const base = { motor: 'm', voz: 'v', rtfMediano: 0.2, frases: [], origemDoTempo: 'servidor' }
    const sem = montarRelatorio({ sinteses: [{ ...base, preprocessado: false }], limiares: LIMIARES, idiomas: [] })
    expect(sem.avisos.join('\n')).toMatch(/SEM pré-processador/)
    const antigo = montarRelatorio({ sinteses: [base], limiares: LIMIARES, idiomas: [] })
    expect(antigo.avisos.join('\n')).toMatch(/pré-processador não registrado/)
    const ok = montarRelatorio({ sinteses: [{ ...base, preprocessado: true }], limiares: LIMIARES, idiomas: [] })
    expect(ok.avisos).toEqual([])
  })
})

describe('pasta por voz e marcador origem.json', () => {
  it('a pasta padrão é <base>/eval-voz/<motor>/<voz>', () => {
    const env = { CLAUDE_JOB_DIR: '/tmp/job-x' }
    expect(pastaDeSaida({ motor: 'qwen', voz: 'ryan', env })).toBe(
      path.join('/tmp/job-x', 'tmp', 'eval-voz', 'qwen', 'ryan'),
    )
    expect(pastaDeSaida({ motor: 'qwen', voz: 'ana', env })).not.toBe(pastaDeSaida({ motor: 'qwen', voz: 'ryan', env }))
    expect(pastaDeSaida({ motor: 'qwen', voz: 'ryan', env: {} })).toBe(path.join(tmpdir(), 'eval-voz', 'qwen', 'ryan'))
    // sem voz continua sendo por motor (o juiz e o resumo da escuta usam assim)
    expect(pastaDeSaida({ motor: 'juiz-voz', env })).toBe(path.join('/tmp/job-x', 'tmp', 'eval-voz', 'juiz-voz'))
  })

  it('escreve e lê o marcador; no mesmo motor/voz preserva o idioma do longo', () => {
    const d = pastaTemporaria()
    escreverOrigem(d, { motor: 'qwen', voz: 'ryan', idioma: 'pt', versaoPreprocessador: '1', preprocessado: true })
    escreverOrigem(d, { motor: 'qwen', voz: 'ryan', versaoPreprocessador: '1', preprocessado: true })
    expect(lerOrigem(d)).toMatchObject({ motor: 'qwen', voz: 'ryan', idioma: 'pt', versaoPreprocessador: '1' })
    escreverOrigem(d, { motor: 'piper', voz: 'faber', versaoPreprocessador: '1' })
    expect(lerOrigem(d)?.idioma).toBeUndefined()
    expect(readFileSync(path.join(d, ARQUIVO_DE_ORIGEM), 'utf8')).toMatch(/piper/)
  })

  it('conferirOrigem: igual passa, diferente é ERRO com os dois ids, ausente avisa', () => {
    const d = pastaTemporaria()
    expect(conferirOrigem(d, { motor: 'qwen', voz: 'ryan' }).avisos[0]).toMatch(/sem origem\.json/)
    escreverOrigem(d, { motor: 'qwen', voz: 'ryan', versaoPreprocessador: '1' })
    expect(conferirOrigem(d, { motor: 'qwen', voz: 'ryan' }).avisos).toEqual([])
    expect(() => conferirOrigem(d, { motor: 'qwen', voz: 'ana' })).toThrow(/qwen\/ryan.*qwen\/ana/)
    expect(() => conferirOrigem(d, { motor: 'piper', voz: 'ryan' })).toThrow(/origem\.json/)
  })

  it('marcador ilegível conta como ausente (aviso), não como casamento', () => {
    const d = pastaTemporaria()
    mkdirSync(d, { recursive: true })
    writeFileSync(path.join(d, ARQUIVO_DE_ORIGEM), '{ não é json')
    expect(conferirOrigem(d, { motor: 'a', voz: 'b' }).avisos).toHaveLength(1)
  })

  it('os registros de round-trip e de estabilidade carregam tipo e avisos', () => {
    const rt = montarRegistroDoRoundtrip({
      motor: 'estabilidade',
      voz: 'a-b',
      medidas: { porIdioma: {} },
      pendentes: [],
      avaliacao: { passou: true, falhas: [] },
      frases: [],
      avisos: ['sem origem.json'],
    })
    expect(rt.tipo).toBe('roundtrip')
    expect(rt.avisos).toEqual(['sem origem.json'])
    const est = montarRegistro({
      motor: 'm',
      voz: 'v',
      idioma: 'pt',
      textoId: 't',
      texto: 'abc',
      audioDuracaoS: 1,
      r: {
        palavrasNaReferencia: 1,
        insercoes: 0,
        delecoes: 0,
        taxa: 0,
        limite: 0.01,
        passou: true,
        chunks: 1,
        cortesSemPausa: 0,
        decodificador: {},
      },
      avisos: ['sem origem.json'],
    })
    expect(est.tipo).toBe('estabilidade')
    expect(est.notas).toContain('sem origem.json')
  })
})

describe('aspas angulares na comparação (WER/CER)', () => {
  const frase = lerCorpus(path.join(__dirname, '..', 'scripts', 'eval-voz', 'corpus-voz.jsonl')).find(
    (c) => c.id === 'pt-frase-longa',
  )

  it('a frase real do corpus: transcrição perfeita SEM « » dá WER 0 e CER 0', () => {
    expect(frase).toBeDefined()
    const texto = frase?.texto ?? ''
    expect(texto).toMatch(/[«»]/)
    const semAspas = texto.replace(/[«»]/g, '')
    expect(medirTrecho(texto, semAspas, 'pt')).toEqual({ wer: 0, cer: 0 })
  })

  it('é simétrico: « » de qualquer lado dá o mesmo resultado', () => {
    expect(medirTrecho('Ele disse «vamos» embora', 'Ele disse vamos embora', 'pt')).toEqual({ wer: 0, cer: 0 })
    expect(medirTrecho('Ele disse vamos embora', 'Ele disse «vamos» embora', 'pt')).toEqual({ wer: 0, cer: 0 })
    expect(medirTrecho('‹oi› „você“', 'oi você', 'pt')).toEqual({ wer: 0, cer: 0 })
  })

  it('não esconde erro de verdade', () => {
    expect(medirTrecho('«vamos embora»', 'vamos agora', 'pt').wer).toBeGreaterThan(0)
  })
})

describe('origemDoTempo do tempo de síntese', () => {
  const wav = wavDeSilencio(1, 16000)
  const http = (cabecalhos: Record<string, string>) =>
    criarSintetizadorHttp(
      { id: 'h', versao: '1', url: 'http://x' },
      {
        fetch: (async () =>
          new Response(wav, { headers: { 'content-type': 'audio/wav', ...cabecalhos } })) as unknown as typeof fetch,
      },
    )

  it('HTTP: servidor com X-Tempo-Sintese, relógio sem ele', async () => {
    expect((await http({ 'x-tempo-sintese': '0.2' }).sintetizar('oi', { voz: 'v', idioma: 'pt' })).origemDoTempo).toBe(
      'servidor',
    )
    expect((await http({}).sintetizar('oi', { voz: 'v', idioma: 'pt' })).origemDoTempo).toBe('relogio')
  })

  it('o falso é servidor', async () => {
    expect((await criarSintetizadorFalso().sintetizar('oi', { voz: 'v', idioma: 'pt' })).origemDoTempo).toBe('servidor')
  })

  it('a síntese guarda a origem por frase e geral (qualquer frase por relógio contamina)', async () => {
    const a = await sintetizarCorpus({
      corpus: [item('a', 'um'), item('b', 'dois')],
      sintetizador: gravador('servidor').sintetizador,
      voz: 'v',
      escrever: () => {},
    })
    expect(a.origemDoTempo).toBe('servidor')
    expect(a.frases.map((f) => f.origemDoTempo)).toEqual(['servidor', 'servidor'])
    const b = await sintetizarCorpus({
      corpus: [item('a', 'um')],
      sintetizador: gravador('relogio').sintetizador,
      voz: 'v',
      escrever: () => {},
    })
    expect(b.origemDoTempo).toBe('relogio')
  })

  it('texto longo em vários pedaços: um pedaço por relógio faz o total ser relógio', async () => {
    const g = gravador()
    let n = 0
    const base = g.sintetizador
    const original = base.sintetizar.bind(base)
    base.limiteDeCaracteres = 12
    base.sintetizar = async (t: string) => {
      const c = await original(t)
      return { ...c, origemDoTempo: ++n === 2 ? ('relogio' as const) : ('servidor' as const) }
    }
    const r = await sintetizarCorpus({
      corpus: [item('a', 'Frase um aqui. Frase dois aqui. Frase tres aqui.')],
      sintetizador: base,
      voz: 'v',
      escrever: () => {},
    })
    expect(n).toBeGreaterThan(1)
    expect(r.frases[0].origemDoTempo).toBe('relogio')
  })

  it('o relatório avisa em destaque quando o RTF veio do relógio (e não quando veio do servidor)', () => {
    const s = (origemDoTempo: string) => ({
      motor: 'deepinfra',
      voz: 'v',
      rtfMediano: 0.2,
      frases: [],
      preprocessado: true,
      origemDoTempo,
    })
    const relogio = montarRelatorio({ sinteses: [s('relogio')], limiares: LIMIARES, idiomas: [] })
    expect(relogio.avisos.join('\n')).toMatch(/RTF medido pelo relógio, inclui rede — não vale para o portão da GPU/)
    expect(relogio.texto).toMatch(/RTF medido pelo relógio/)
    expect(montarRelatorio({ sinteses: [s('servidor')], limiares: LIMIARES, idiomas: [] }).avisos).toEqual([])
  })
})

describe('vocabulário numérico do casamento dos itens', () => {
  const itemNumero = (texto: string, aceita: string[]) => ({ texto, aceita, tipo: 'numero' as const })

  it('es: "mil cuatrocientos noventa" NÃO acerta dentro de "mil cuatrocientos noventa y dos"', () => {
    const item = itemNumero('1490', ['1490', 'mil cuatrocientos noventa'])
    expect(acertoDosItens('Llegó en mil cuatrocientos noventa y dos', [item], 'es').acertos).toBe(0)
    expect(acertoDosItens('Llegó en mil cuatrocientos noventa', [item], 'es').acertos).toBe(1)
  })

  it('pt: centenas femininas contam como numeral vizinho ("duzentas e trinta" não acerta "trinta")', () => {
    const item = itemNumero('30', ['30', 'trinta'])
    expect(acertoDosItens('Vieram duzentas e trinta pessoas', [item], 'pt').acertos).toBe(0)
    expect(acertoDosItens('Vieram quinhentas e trinta pessoas', [item], 'pt').acertos).toBe(0)
    expect(acertoDosItens('Vieram trinta pessoas', [item], 'pt').acertos).toBe(1)
  })

  it('toda palavra que cardinalPt gera (masculino e feminino, até 999 999 999) está na lista', () => {
    const faltam = new Set<string>()
    for (const genero of ['m', 'f'] as const) {
      for (let n = 0; n < 1000; n++) {
        for (const base of [n, n * 1000 + 17, n * 1_000_000]) {
          const semAcento = cardinalPt(base, genero).normalize('NFD').replace(/[̀-ͯ]/g, '')
          for (const w of semAcento.split(' ')) {
            if (w !== 'e' && w !== 'um' && w !== 'uma' && !PALAVRAS_DE_NUMERO.has(w)) faltam.add(w)
          }
        }
      }
    }
    expect([...faltam]).toEqual([])
  })
})
