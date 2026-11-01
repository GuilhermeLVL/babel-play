import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { lerLimiares, LIMIARES, LIMIARES_DA_SPEC, validarLimiares } from '../scripts/eval-voz/comum.mjs'
import { principal as principalRecomendar, recomendar } from '../scripts/eval-voz/recomendar.mjs'
import { montarCandidatos, montarRelatorio, principal as principalRelatorio } from '../scripts/eval-voz/relatorio.mjs'

// Os números abaixo são FIXTURES: o que vale está em scripts/eval-voz/limiares.json.

type Cand = Record<string, any>

const medidasOk = () => ({
  porIdioma: {
    pt: {
      cer: 0.01,
      wer: 0.03,
      itensAcerto: 0.95,
      itensNumerosEAnos: 1,
      estabilidade: 0.005,
      foraDaMediana: 0.01,
      semAudio: 0,
      invalidos: 0,
    },
    en: {
      cer: 0.01,
      wer: 0.03,
      itensAcerto: 0.95,
      itensNumerosEAnos: 1,
      estabilidade: 0.005,
      foraDaMediana: 0.01,
      semAudio: 0,
      invalidos: 0,
    },
    es: {
      cer: 0.01,
      wer: 0.03,
      itensAcerto: 0.95,
      itensNumerosEAnos: 1,
      estabilidade: 0.005,
      foraDaMediana: 0.01,
      semAudio: 0,
      invalidos: 0,
    },
  },
})

const cand = (id: string, extra: Cand = {}): Cand => ({
  id,
  licencaLimpa: true,
  temComponenteGpl: false,
  medidas: medidasOk(),
  rtf: 0.3,
  naturalidade: 4,
  aguenta30: 0.8,
  errosGravesRepetidos: 0,
  melhorQueAparelho: 0.8,
  ...extra,
})

const rodar = (cs: Cand[], idioma = 'pt' as 'pt' | 'en' | 'es', t3Mantido = false) =>
  recomendar(cs as never, LIMIARES, idioma, { t3Mantido })

describe('limiares.json é a única fonte dos números', () => {
  it('LIMIARES_DA_SPEC é exatamente a parte por idioma do JSON em disco', () => {
    const json = JSON.parse(readFileSync(new URL('../scripts/eval-voz/limiares.json', import.meta.url), 'utf8'))
    expect(LIMIARES_DA_SPEC).toEqual(json.porIdioma)
    expect(LIMIARES).toEqual(json)
  })

  it('PROVISÓRIO: a F0 ainda não calibrou (a Tarefa 13 troca este teste de propósito ao travar os números)', () => {
    expect(LIMIARES.provisorio).toBe(true)
  })

  it('valida a forma e nomeia a chave que falta', () => {
    const base = JSON.parse(readFileSync(new URL('../scripts/eval-voz/limiares.json', import.meta.url), 'utf8'))
    expect(() => validarLimiares(base)).not.toThrow()
    const semRtf = { ...base }
    delete semRtf.rtfMax
    expect(() => validarLimiares(semRtf)).toThrow(/rtfMax/)
    expect(() => validarLimiares({ ...base, provisorio: 'sim' })).toThrow(/provisorio/)
    expect(() =>
      validarLimiares({ ...base, porIdioma: { ...base.porIdioma, es: { ...base.porIdioma.es, werMax: null } } }),
    ).toThrow(/porIdioma\.es\.werMax/)
    expect(() => validarLimiares({ ...base, escuta: { ...base.escuta, aguenta30Min: undefined } })).toThrow(
      /escuta\.aguenta30Min/,
    )
    expect(() => validarLimiares({ ...base, t3: undefined })).toThrow(/t3\./)
    expect(() => validarLimiares(null)).toThrow(/raiz/)
  })

  it('lerLimiares: arquivo inexistente ou JSON quebrado dá erro com o caminho', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'limiares-'))
    expect(() => lerLimiares(path.join(dir, 'nao-existe.json'))).toThrow(/nao-existe\.json/)
    const ruim = path.join(dir, 'ruim.json')
    writeFileSync(ruim, '{ quebrado')
    expect(() => lerLimiares(ruim)).toThrow(/ruim\.json/)
  })
})

describe('recomendar: portões da spec 6.4, nesta ordem', () => {
  it('um candidato limpo passa e é escolhido', () => {
    const r = rodar([cand('a')])
    expect(r.escolhido).toBe('a')
    expect(r.motivos).toEqual({ a: [] })
  })

  it('licença não limpa reprova', () => {
    const r = rodar([cand('a', { licencaLimpa: false })])
    expect(r.escolhido).toBeNull()
    expect(r.motivos.a).toEqual(['licença não limpa'])
  })

  it('temComponenteGpl reprova com o motivo exato', () => {
    const r = rodar([cand('a', { temComponenteGpl: true })])
    expect(r.escolhido).toBeNull()
    expect(r.motivos.a).toContain('GPL no caminho distribuído')
  })

  it('RTF: 0.51 reprova, 0.5 passa', () => {
    expect(rodar([cand('a', { rtf: 0.51 })]).escolhido).toBeNull()
    expect(rodar([cand('a', { rtf: 0.5 })]).escolhido).toBe('a')
    expect(rodar([cand('a', { rtf: 0.1 + 0.4 })]).escolhido).toBe('a')
    expect(rodar([cand('a', { rtf: undefined })]).motivos.a.join(' ')).toMatch(/RTF não medido/)
  })

  it('TTFA p95: 3.1 reprova, 3.0 passa, ausente não é checado', () => {
    expect(rodar([cand('a', { ttfaP95S: 3.1 })]).escolhido).toBeNull()
    expect(rodar([cand('a', { ttfaP95S: 3.0 })]).escolhido).toBe('a')
    expect(rodar([cand('a')]).escolhido).toBe('a')
  })

  it('T3 mantido: acertoTimbres 0.79 e timbresDistinguiveis 3 reprovam; 0.8 e 4 passam', () => {
    const t3 = { timbresDistinguiveis: 4, acertoTimbres: 0.8 }
    expect(rodar([cand('a', t3)], 'pt', true).escolhido).toBe('a')
    expect(rodar([cand('a', { ...t3, acertoTimbres: 0.79 })], 'pt', true).escolhido).toBeNull()
    expect(rodar([cand('a', { ...t3, timbresDistinguiveis: 3 })], 'pt', true).escolhido).toBeNull()
  })

  it('T3 mantido sem medidas de timbre: reprova com "timbres não medidos"', () => {
    const r = rodar([cand('a')], 'pt', true)
    expect(r.escolhido).toBeNull()
    expect(r.motivos.a.join(' ')).toMatch(/timbres não medidos/)
  })

  it('T3 não mantido ignora timbres, mesmo ruins', () => {
    expect(rodar([cand('a', { timbresDistinguiveis: 1, acertoTimbres: 0.1 })], 'pt', false).escolhido).toBe('a')
  })

  it('medidas automáticas reprovadas eliminam (CER acima do limite)', () => {
    const m = medidasOk()
    m.porIdioma.pt.cer = 0.5
    const r = rodar([cand('a', { medidas: m })])
    expect(r.escolhido).toBeNull()
    expect(r.motivos.a.join(' ')).toMatch(/CER/)
  })

  it('idioma sem medidas: "não medida", nunca passa', () => {
    const m = { porIdioma: { en: medidasOk().porIdioma.en } }
    const r = rodar([cand('a', { medidas: m })], 'pt')
    expect(r.escolhido).toBeNull()
    expect(r.motivos.a.join(' ')).toMatch(/não medida/)
    expect(rodar([cand('a', { medidas: { porIdioma: {} } })], 'es').escolhido).toBeNull()
  })

  it('medida faltando dentro do idioma (estabilidade) reprova', () => {
    const m = medidasOk()
    delete (m.porIdioma.pt as Cand).estabilidade
    const r = rodar([cand('a', { medidas: m })])
    expect(r.escolhido).toBeNull()
    expect(r.motivos.a.join(' ')).toMatch(/estabilidade.*não medida/)
  })

  it('escuta: naturalidade 3.49 reprova, 3.5 passa', () => {
    expect(rodar([cand('a', { naturalidade: 3.49 })]).escolhido).toBeNull()
    expect(rodar([cand('a', { naturalidade: 3.5 })]).escolhido).toBe('a')
  })

  it('escuta: aguenta30 0.59 reprova, 0.6 passa', () => {
    expect(rodar([cand('a', { aguenta30: 0.59 })]).escolhido).toBeNull()
    expect(rodar([cand('a', { aguenta30: 0.6 })]).escolhido).toBe('a')
  })

  it('escuta: erro grave repetido reprova', () => {
    const r = rodar([cand('a', { errosGravesRepetidos: 1 })])
    expect(r.escolhido).toBeNull()
    expect(r.motivos.a.join(' ')).toMatch(/erro grave/)
  })

  it('escuta: melhorQueAparelho 0.4 reprova, 0.5 passa', () => {
    expect(rodar([cand('a', { melhorQueAparelho: 0.4 })]).escolhido).toBeNull()
    expect(rodar([cand('a', { melhorQueAparelho: 0.5 })]).escolhido).toBe('a')
  })

  it('null, undefined e NaN na escuta são "sem escuta", nunca zero nem aprovação', () => {
    for (const v of [null, undefined, Number.NaN]) {
      const r1 = rodar([cand('a', { naturalidade: v })])
      expect(r1.escolhido).toBeNull()
      expect(r1.motivos.a.join(' ')).toMatch(/sem escuta/)
      const r2 = rodar([cand('a', { aguenta30: v })])
      expect(r2.escolhido).toBeNull()
      expect(r2.motivos.a.join(' ')).toMatch(/sem escuta/)
      expect(rodar([cand('a', { errosGravesRepetidos: v })]).escolhido).toBeNull()
      expect(rodar([cand('a', { melhorQueAparelho: v })]).escolhido).toBeNull()
    }
  })

  it('licencaLimpa ou temComponenteGpl não informados também reprovam', () => {
    expect(rodar([cand('a', { licencaLimpa: undefined })]).escolhido).toBeNull()
    expect(rodar([cand('a', { temComponenteGpl: undefined })]).escolhido).toBeNull()
  })

  it('coleta TODOS os portões reprovados, na ordem da spec 6.4', () => {
    const m = medidasOk()
    m.porIdioma.pt.wer = 0.5
    const r = rodar(
      [
        cand('a', {
          licencaLimpa: false,
          temComponenteGpl: true,
          rtf: 0.9,
          ttfaP95S: 5,
          medidas: m,
          naturalidade: 2,
          aguenta30: 0.1,
          errosGravesRepetidos: 3,
          melhorQueAparelho: 0,
        }),
      ],
      'pt',
      true,
    )
    const motivos = r.motivos.a
    expect(motivos[0]).toBe('licença não limpa')
    expect(motivos[1]).toBe('GPL no caminho distribuído')
    const indice = (re: RegExp) => motivos.findIndex((x: string) => re.test(x))
    const ordem = [/WER/, /RTF/, /1º áudio/, /timbres/, /naturalidade/, /aguenta/, /erro grave/, /aparelho/].map(indice)
    expect(ordem.every((i: number) => i >= 0)).toBe(true)
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem)
  })
})

describe('recomendar: escolha entre aprovados', () => {
  it('vence a maior naturalidade', () => {
    const r = rodar([
      cand('a', { naturalidade: 3.8 }),
      cand('b', { naturalidade: 4.4 }),
      cand('c', { naturalidade: 4.0 }),
    ])
    expect(r.escolhido).toBe('b')
    expect(r.motivos).toEqual({ a: [], b: [], c: [] })
  })

  it('reprovado nunca vence, mesmo com a maior nota', () => {
    const r = rodar([cand('a', { naturalidade: 4.9, temComponenteGpl: true }), cand('b', { naturalidade: 3.6 })])
    expect(r.escolhido).toBe('b')
    expect(r.motivos.a).toEqual(['GPL no caminho distribuído'])
  })

  it('empate de naturalidade: menor RTF; depois id alfabético', () => {
    expect(rodar([cand('a', { rtf: 0.4 }), cand('b', { rtf: 0.2 })]).escolhido).toBe('b')
    expect(rodar([cand('z'), cand('m'), cand('b')]).escolhido).toBe('b')
  })

  it('nenhum passa: escolhido null e "opção 0 + T2" em __geral__, com os motivos de cada um', () => {
    const r = rodar([cand('a', { rtf: 0.9 }), cand('b', { naturalidade: 2 })])
    expect(r.escolhido).toBeNull()
    expect(r.motivos.__geral__.join(' ')).toMatch(/opção 0 \+ T2/)
    expect(r.motivos.a.length).toBeGreaterThan(0)
    expect(r.motivos.b.length).toBeGreaterThan(0)
  })

  it('lista vazia: nenhum candidato, "opção 0 + T2"', () => {
    const r = rodar([])
    expect(r.escolhido).toBeNull()
    expect(r.motivos.__geral__.join(' ')).toMatch(/opção 0 \+ T2/)
  })

  it('com escolhido, __geral__ não existe', () => {
    expect(rodar([cand('a')]).motivos).not.toHaveProperty('__geral__')
  })

  it('é determinística: repetida e com a ordem embaralhada dá o mesmo resultado', () => {
    const lote = [
      cand('d', { naturalidade: 4.2 }),
      cand('a', { naturalidade: 4.2 }),
      cand('c', { naturalidade: 4.2, rtf: 0.1 }),
      cand('b', { rtf: 0.9 }),
    ]
    const copia = structuredClone(lote)
    const r1 = rodar(lote)
    expect(rodar(lote)).toEqual(r1)
    expect(rodar([...lote].reverse())).toEqual(r1)
    expect(rodar([lote[2], lote[0], lote[3], lote[1]])).toEqual(r1)
    expect(r1.escolhido).toBe('c')
    expect(lote).toEqual(copia)
  })

  it('id repetido ou reservado é erro de uso', () => {
    expect(() => rodar([cand('a'), cand('a')])).toThrow(/repetido/)
    expect(() => rodar([cand('__geral__')])).toThrow(/reservado/)
    expect(() => recomendar([cand('a')] as never, LIMIARES, 'fr' as never, { t3Mantido: false })).toThrow(/idioma/)
  })
})

describe('montarCandidatos e relatório', () => {
  const roundtrip = (motor: string, voz: string, extra: Cand = {}) => ({ motor, voz, medidas: medidasOk(), ...extra })
  const sintese = (motor: string, voz: string, rtfMediano: number, extra: Cand = {}) => ({
    motor,
    voz,
    rtfMediano,
    rtfMax: rtfMediano * 2,
    memoriaPicoMB: 2048,
    frases: [
      { id: 'pt-1', idioma: 'pt', duracaoS: 4, caracteres: 40, tempoDeSinteseS: 1, rtf: 0.25 },
      { id: 'pt-2', idioma: 'pt', duracaoS: 6, caracteres: 60, tempoDeSinteseS: 2, rtf: 0.33 },
    ],
    foraDaMediana: { pt: { ids: [], fracao: 0.02 } },
    ...extra,
  })
  const manifesto = [
    { id: 'qwen/ryan', licencaLimpa: true, temComponenteGpl: false, melhorQueAparelho: 1.2 },
    { id: 'piper/faber', licencaLimpa: true, temComponenteGpl: true, melhorQueAparelho: 0 },
  ]
  const escuta = {
    vozes: {
      'qwen/ryan': { naturalidade: 4.1, aguenta30: 0.8, errosGravesRepetidos: 0, ouvintes: 3 },
      'piper/faber': { naturalidade: null, aguenta30: null, errosGravesRepetidos: 0, ouvintes: 0 },
    },
  }

  const entradas = () => ({
    roundtrips: [roundtrip('qwen', 'ryan'), roundtrip('piper', 'faber')],
    estabilidades: [
      { motor: 'qwen', voz: 'ryan', idioma: 'pt', medidas: { porIdioma: { pt: { estabilidade: 0.004 } } } },
    ],
    sinteses: [sintese('qwen', 'ryan', 0.3), sintese('piper', 'faber', 0.05, { memoriaPicoMB: 512 })],
    escuta,
    manifesto,
  })

  it('junta as fontes por motor/voz: medidas, RTF mediano, GB, duração por frase e escuta', () => {
    const cs = montarCandidatos(entradas()) as Cand[]
    const q = cs.find((c) => c.id === 'qwen/ryan')!
    expect(q.rtf).toBe(0.3)
    expect(q.memoriaGB).toBeCloseTo(2)
    expect(q.duracaoMediaFraseS).toBe(5)
    expect(q.naturalidade).toBe(4.1)
    expect(q.melhorQueAparelho).toBe(1.2)
    expect(q.temComponenteGpl).toBe(false)
    expect(q.medidas.porIdioma.pt.estabilidade).toBe(0.004)
    // o round-trip não trouxe foraDaMediana: usa o da síntese; o que o round-trip já mediu prevalece
    const sem = montarCandidatos({
      ...entradas(),
      roundtrips: [roundtrip('qwen', 'ryan', { medidas: { porIdioma: { pt: { cer: 0.01 } } } })],
    }) as Cand[]
    expect(sem.find((c) => c.id === 'qwen/ryan')!.medidas.porIdioma.pt.foraDaMediana).toBe(0.02)
    const p = cs.find((c) => c.id === 'piper/faber')!
    expect(p.naturalidade).toBeNull()
    expect(p.temComponenteGpl).toBe(true)
  })

  it('o relatório recomenda o aprovado e justifica o reprovado', () => {
    const r = montarRelatorio({ ...entradas(), limiares: LIMIARES, idiomas: ['pt'] })
    expect(r.recomendacoes.pt.escolhido).toBe('qwen/ryan')
    expect(r.recomendacoes.pt.motivos['piper/faber']).toContain('GPL no caminho distribuído')
    expect(r.texto).toMatch(/Provisório/)
  })

  it('golden: tabela do relatório', () => {
    const r = montarRelatorio({ ...entradas(), limiares: LIMIARES, idiomas: ['pt'], geradoEm: '2026-11-01' })
    expect(r.texto).toMatchInlineSnapshot(`
      "# voz-fase-0 — bancada de voz: motores candidatos

      Gerado em 2026-11-01.

      > Provisório: os limiares de \`scripts/eval-voz/limiares.json\` ainda não foram calibrados pela F0.
      > O número só elimina; o dono ouve e aprova (spec §7.3).

      ## 1. Motores e vozes

      | candidato | RTF (mediana) | memória (GB) | vozes do motor | duração por frase (s) | GPL |
      |---|---|---|---|---|---|
      | \`piper/faber\` | 0,050 | 0,50 | 1 | 5,0 | sim |
      | \`qwen/ryan\` | 0,300 | 2,00 | 1 | 5,0 | não |

      ## 2. pt

      | candidato | CER | WER | itens | números e anos | estabilidade | fora de ±30% | nota | aguenta 30 min |
      |---|---|---|---|---|---|---|---|---|
      | \`piper/faber\` | 1,0% | 3,0% | 95,0% | 100,0% | 0,5% | 1,0% | sem escuta | sem escuta |
      | \`qwen/ryan\` | 1,0% | 3,0% | 95,0% | 100,0% | 0,4% | 1,0% | 4,1 | 80,0% |

      **Recomendação (pt):** \`qwen/ryan\`

      - \`piper/faber\`: GPL no caminho distribuído; sem escuta (naturalidade); sem escuta (aguentaria 30 min); melhor que a voz do aparelho em 0 ponto(s), mínimo 0,5
      - \`qwen/ryan\`: passou em todos os portões
      "
    `)
  })

  it('sem candidato com medidas no idioma, diz isso em vez de inventar', () => {
    const e = entradas()
    const r = montarRelatorio({ ...e, roundtrips: [], estabilidades: [], limiares: LIMIARES, idiomas: ['en'] })
    expect(r.texto).toMatch(/nenhum candidato com medidas em en/i)
    expect(r.recomendacoes.en.escolhido).toBeNull()
  })
})

describe('CLIs: principal(argv)', () => {
  const io = () => {
    const saida: string[] = []
    const erro: string[] = []
    return { saida, erro, io: { out: (s: string) => saida.push(s), err: (s: string) => erro.push(s) } }
  }
  const pasta = () => mkdtempSync(path.join(tmpdir(), 'recomendar-'))
  const gravar = (dir: string, nome: string, dados: unknown) => {
    const f = path.join(dir, nome)
    mkdirSync(path.dirname(f), { recursive: true })
    writeFileSync(f, JSON.stringify(dados))
    return f
  }

  it('recomendar: exit 0 com escolha e imprime a escolha', async () => {
    const f = gravar(pasta(), 'c.json', [cand('a'), cand('b', { naturalidade: 3.6 })])
    const t = io()
    expect(await principalRecomendar(['--candidatos', f, '--idioma', 'pt'], t.io)).toBe(0)
    expect(t.saida.join('\n')).toMatch(/escolhido: a/)
  })

  it('recomendar: exit 2 sem sobrevivente, imprime "opção 0 + T2" e os motivos', async () => {
    const f = gravar(pasta(), 'c.json', [cand('a', { temComponenteGpl: true })])
    const t = io()
    expect(await principalRecomendar(['--candidatos', f, '--idioma', 'pt'], t.io)).toBe(2)
    const s = t.saida.join('\n')
    expect(s).toMatch(/opção 0 \+ T2/)
    expect(s).toMatch(/GPL no caminho distribuído/)
  })

  it('recomendar: --t3 liga os portões de timbre', async () => {
    const f = gravar(pasta(), 'c.json', [cand('a')])
    const t = io()
    expect(await principalRecomendar(['--candidatos', f, '--idioma', 'pt', '--t3'], t.io)).toBe(2)
    expect(t.saida.join('\n')).toMatch(/timbres não medidos/)
  })

  it('recomendar: uso errado dá exit 1 (sem idioma, idioma inválido, arquivo ausente, JSON que não é lista)', async () => {
    const dir = pasta()
    const f = gravar(dir, 'c.json', [cand('a')])
    const objeto = gravar(dir, 'o.json', { a: 1 })
    for (const argv of [
      ['--candidatos', f],
      ['--candidatos', f, '--idioma', 'fr'],
      ['--candidatos', path.join(dir, 'nao.json'), '--idioma', 'pt'],
      ['--candidatos', objeto, '--idioma', 'pt'],
      ['--idioma', 'pt'],
    ]) {
      const t = io()
      expect(await principalRecomendar(argv, t.io)).toBe(1)
      expect(t.erro.length).toBeGreaterThan(0)
    }
  })

  it('relatório: --fase 0 lê a pasta, imprime e NÃO grava sem --gravar', async () => {
    const dir = pasta()
    gravar(dir, 'voz-qwen-ryan.json', { motor: 'qwen', voz: 'ryan', medidas: medidasOk() })
    gravar(dir, 'voz-estabilidade-qwen-ryan.json', {
      motor: 'qwen',
      voz: 'ryan',
      idioma: 'pt',
      medidas: { porIdioma: { pt: { estabilidade: 0.004 } } },
    })
    const manifesto = gravar(dir, 'm/manifesto.json', [
      { id: 'qwen/ryan', licencaLimpa: true, temComponenteGpl: false, melhorQueAparelho: 1 },
    ])
    const t = io()
    const codigo = await principalRelatorio(['--fase', '0', '--entrada', dir, '--candidatos', manifesto], t.io)
    expect(codigo).toBe(0)
    expect(t.saida.join('\n')).toMatch(/qwen\/ryan/)
    expect(t.saida.join('\n')).toMatch(/sem escuta/)
    expect(() => readFileSync(path.join(dir, 'voz-relatorio-fase-0.md'))).toThrow()
    const g = io()
    expect(
      await principalRelatorio(['--fase', '0', '--entrada', dir, '--candidatos', manifesto, '--gravar'], g.io),
    ).toBe(0)
    expect(readFileSync(path.join(dir, 'voz-relatorio-fase-0.md'), 'utf8')).toMatch(/qwen\/ryan/)
  })

  it('relatório: uso errado dá exit 1 (sem --fase, fase desconhecida, pasta sem resultados, JSON sem medidas)', async () => {
    const vazia = pasta()
    const semMedidas = pasta()
    gravar(semMedidas, 'voz-x-y.json', { motor: 'x', voz: 'y' })
    for (const argv of [
      [],
      ['--fase', '9', '--entrada', vazia],
      ['--fase', '0', '--entrada', vazia],
      ['--fase', '0', '--entrada', semMedidas],
    ]) {
      const t = io()
      expect(await principalRelatorio(argv, t.io)).toBe(1)
      expect(t.erro.length).toBeGreaterThan(0)
    }
  })
})
