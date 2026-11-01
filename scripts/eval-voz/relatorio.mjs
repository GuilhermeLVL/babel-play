/**
 * Relatório da bancada de voz (spec §7.1 passo 9) e recomendação por idioma (spec §6.4).
 *
 * Uso (precisa de `tsx`, porque `metricas.mjs` importa TypeScript de `src/core`):
 *   node --import tsx scripts/eval-voz/relatorio.mjs --fase 0 [--entrada <dir>] [--sintese <dir>[,<dir>...]]
 *     [--escuta <resumo.json>] [--candidatos <manifesto.json>] [--t3] [--gravar]
 *
 * Fontes (nada é medido aqui; tudo vem de resultados que as outras ferramentas gravaram):
 *   --entrada     pasta com `voz-<motor>-<voz>.json` (round-trip, `medir-roundtrip.mjs`) e
 *                 `voz-estabilidade-<motor>-<voz>.json` (`medir-estabilidade.mjs`); o tipo vem do campo `tipo`.
 *                 Padrão: `docs/auditoria/eval/`.
 *   --sintese     pasta(s) de `sintetizar.mjs` com `resumo.json` (RTF, memória, duração por frase, ±30 % da mediana).
 *   --escuta      `resumo.json` do `gerar-formulario.mjs resumir`
 *                 (`{ vozes: { "<motor>/<voz>": { ..., porIdioma: { pt: {...}, en: {...} } } } }`).
 *   --candidatos  manifesto do OPERADOR, lista de `{ id: "<motor>/<voz>", licencaLimpa, temComponenteGpl,
 *                 melhorQueAparelho, ttfaP95S?, timbresDistinguiveis?, acertoTimbres? }`: o que a máquina não mede
 *                 (licença lida no LICENSE, GPL no caminho distribuído, comparação com a voz do aparelho).
 *                 Campo ausente reprova ("não informado"): nada é presumido.
 *
 * Mapeamento para `Candidato` (um por `<motor>/<voz>`; o id é `motor/voz`):
 *   medidas.porIdioma[i] = round-trip + `estabilidade` do arquivo de estabilidade; `foraDaMediana` do round-trip,
 *                          senão `foraDaMediana[i].fracao` da síntese
 *   rtf                  = `rtfMediano` da síntese (o `rtfMax` aparece só no JSON da síntese)
 *   naturalidade/aguenta30/errosGravesRepetidos/ouvintes = `escuta.vozes[id].porIdioma[idioma]` (a decisão é
 *                          POR IDIOMA, spec §6.4); idioma sem notas = `null` = "sem escuta". O candidato guarda
 *                          `escutaPorIdioma` e o relatório copia o do idioma para a chamada de `recomendar`.
 *   o resto              = manifesto
 * Extras só para a tabela (o `recomendar` ignora): `memoriaGB`, `duracaoMediaFraseS`, `vozesDoMotor`.
 *
 * Limite conhecido (en/es): a normalização do WER/CER expande números por extenso só em pt. Um Whisper que
 * transcreva "one thousand" contra "1000" na referência em en/es soma erro de WER; o plano cobre números em
 * en/es apenas se o orçamento permitir.
 *
 * Classificação dos resultados de `--entrada`: pelo campo `tipo` DENTRO do JSON ('roundtrip' | 'estabilidade').
 * Arquivo antigo sem `tipo` cai no nome (`voz-estabilidade-...`) e gera um aviso.
 *
 * Imprime e NÃO grava nada, a menos que `--gravar` (aí também escreve `<entrada>/voz-relatorio-fase-0.md`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { VERSAO_DO_PREPROCESSADOR } from '../../src/core/leitura/prepararTextoParaVoz.ts'
import { avisosDoPreprocessador, IDIOMAS, LIMIARES, pegarOpcao } from './comum.mjs'
import { CHAVE_GERAL, recomendar } from './recomendar.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENTRADA_PADRAO = path.join(RAIZ, 'docs', 'auditoria', 'eval')

const idDe = (motor, voz) => `${motor}/${voz}`
const pct = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${(x * 100).toFixed(1).replace('.', ',')}%` : '-')
const dec = (x, casas = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(casas).replace('.', ',') : '-')
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

/**
 * Junta as fontes em `Candidato[]` (ver o mapeamento no cabeçalho do arquivo). Ordem estável por id.
 * @param {{ roundtrips?: any[], estabilidades?: any[], sinteses?: any[], escuta?: any, manifesto?: any[] }} p
 * @returns {Array<import('./recomendar.mjs').Candidato & { memoriaGB?: number, duracaoMediaFraseS?: number, vozesDoMotor: number }>}
 */
export function montarCandidatos({ roundtrips = [], estabilidades = [], sinteses = [], escuta, manifesto = [] }) {
  const porId = new Map()
  const pegar = (motor, voz) => {
    const id = idDe(motor, voz)
    if (!porId.has(id)) porId.set(id, { id, motor, medidas: { porIdioma: {} }, sintese: undefined })
    return porId.get(id)
  }
  const mesclar = (c, medidas) => {
    for (const [idioma, m] of Object.entries(medidas?.porIdioma ?? {}))
      c.medidas.porIdioma[idioma] = { ...c.medidas.porIdioma[idioma], ...m }
  }
  for (const r of roundtrips) mesclar(pegar(r.motor, r.voz), r.medidas)
  for (const e of estabilidades) mesclar(pegar(e.motor, e.voz), e.medidas)
  for (const s of sinteses) {
    const c = pegar(s.motor, s.voz)
    c.sintese = s
    for (const [idioma, f] of Object.entries(s.foraDaMediana ?? {})) {
      const m = c.medidas.porIdioma[idioma]
      if (m && m.foraDaMediana === undefined && typeof f?.fracao === 'number') m.foraDaMediana = f.fracao
    }
  }
  const vozesPorMotor = new Map()
  for (const c of porId.values()) vozesPorMotor.set(c.motor, (vozesPorMotor.get(c.motor) ?? 0) + 1)
  const doManifesto = new Map(manifesto.map((m) => [m.id, m]))

  return [...porId.values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, motor, medidas, sintese }) => {
      const man = doManifesto.get(id) ?? {}
      const esc = escuta?.vozes?.[id] ?? {}
      const frases = sintese?.frases ?? []
      return {
        id,
        licencaLimpa: man.licencaLimpa,
        temComponenteGpl: man.temComponenteGpl,
        medidas,
        rtf: sintese?.rtfMediano ?? undefined,
        ttfaP95S: man.ttfaP95S,
        timbresDistinguiveis: man.timbresDistinguiveis,
        acertoTimbres: man.acertoTimbres,
        escutaPorIdioma: esc.porIdioma ?? {},
        melhorQueAparelho: man.melhorQueAparelho,
        memoriaGB: typeof sintese?.memoriaPicoMB === 'number' ? sintese.memoriaPicoMB / 1024 : undefined,
        duracaoMediaFraseS: media(frases.map((f) => f.duracaoS).filter((d) => Number.isFinite(d))),
        vozesDoMotor: vozesPorMotor.get(motor),
      }
    })
}

/**
 * O candidato com a escuta DO IDIOMA (`escutaPorIdioma[idioma]`); sem notas naquele idioma, `null` = "sem escuta".
 * Nenhuma nota de um idioma vale para outro.
 */
function comEscutaDoIdioma(c, idioma) {
  const { escutaPorIdioma, ...resto } = c
  const e = escutaPorIdioma?.[idioma]
  return {
    ...resto,
    naturalidade: e?.naturalidade ?? null,
    aguenta30: e?.aguenta30 ?? null,
    errosGravesRepetidos: e?.errosGravesRepetidos,
    ouvintes: e?.ouvintes ?? 0,
  }
}

/**
 * Avisos sobre as fontes: o mesmo motor/voz em mais de um arquivo (o ÚLTIMO vale, como em `montarCandidatos`) e
 * id do manifesto sem nenhuma medição. O nome do arquivo vem de `arquivo` (o CLI preenche); sem ele, "#n".
 * @param {{ roundtrips?: any[], estabilidades?: any[], sinteses?: any[], manifesto?: any[] }} p
 * @returns {string[]}
 */
/** Ids de candidatos cujas medidas vieram de áudio com versão defasada do pré-processador ou sem ele. */
function idsComAudioDefasado({ roundtrips = [], estabilidades = [] }) {
  return new Set(
    [...roundtrips, ...estabilidades]
      .filter((o) => avisosDoPreprocessador(o.origem, VERSAO_DO_PREPROCESSADOR).length > 0)
      .map((o) => idDe(o.motor, o.voz)),
  )
}

const MARCA_DEFASADO = ' (medido com áudio defasado/sem pré-processador)'

function avisosDasFontes({ roundtrips = [], estabilidades = [], sinteses = [], manifesto = [], escuta }) {
  const avisos = [...(escuta?.avisos ?? []).map((a) => `escuta: ${a}`)]
  for (const [id, v] of Object.entries(escuta?.vozes ?? {}))
    if (v?.ouvintes > 0 && !v.porIdioma)
      avisos.push(`escuta de ${id} sem porIdioma (resumo antigo): gere de novo com \`gerar-formulario.mjs resumir\``)
  for (const s of sinteses) {
    const quem = `${idDe(s.motor, s.voz)}${s.arquivo ? ` (${s.arquivo})` : ''}`
    if (s.origemDoTempo === 'relogio')
      avisos.push(
        `**ATENÇÃO, RTF medido pelo relógio, inclui rede — não vale para o portão da GPU:** ${quem}. O tempo de síntese não veio do servidor (sem \`X-Tempo-Sintese\`).`,
      )
    else if (s.origemDoTempo !== 'servidor')
      avisos.push(`origem do tempo de síntese não registrada em ${quem}: o RTF pode incluir rede`)
    if (s.preprocessado === false)
      avisos.push(
        `**ATENÇÃO, síntese SEM pré-processador:** ${quem} mandou o texto cru ao motor; o portão de números e anos não reflete a produção`,
      )
    else if (s.preprocessado !== true)
      avisos.push(`pré-processador não registrado em ${quem}: o resumo é anterior ao registro`)
  }
  const duplicados = (tipo, itens) => {
    const por = new Map()
    itens.forEach((o, i) =>
      por.set(idDe(o.motor, o.voz), [...(por.get(idDe(o.motor, o.voz)) ?? []), o.arquivo ?? `#${i + 1}`]),
    )
    for (const [id, arquivos] of por)
      if (arquivos.length > 1)
        avisos.push(`${tipo} repetido para ${id} (${arquivos.join(', ')}): vale o último, ${arquivos.at(-1)}`)
  }
  for (const o of [...roundtrips, ...estabilidades])
    for (const a of avisosDoPreprocessador(o.origem, VERSAO_DO_PREPROCESSADOR))
      avisos.push(`**ATENÇÃO** ${idDe(o.motor, o.voz)}: ${a}`)
  duplicados('round-trip', roundtrips)
  duplicados('estabilidade', estabilidades)
  duplicados('síntese', sinteses)
  const medidos = new Set([...roundtrips, ...estabilidades, ...sinteses].map((o) => idDe(o.motor, o.voz)))
  for (const m of manifesto)
    if (!medidos.has(m.id)) avisos.push(`o manifesto lista ${m.id}, mas não há nenhuma medição dele`)
  return avisos
}

/**
 * Relatório em Markdown (formato dos de `docs/auditoria/`) mais a recomendação por idioma. Pura.
 * @param {{ roundtrips?: any[], estabilidades?: any[], sinteses?: any[], escuta?: any, manifesto?: any[],
 *           limiares: import('./comum.mjs').LimiaresDaBancada, idiomas?: string[], t3Mantido?: boolean,
 *           geradoEm?: string, avisosExtras?: string[] }} p
 * @returns {{ candidatos: ReturnType<typeof montarCandidatos>,
 *             recomendacoes: Record<string, import("./recomendar.mjs").Recomendacao>, avisos: string[], texto: string }}
 */
export function montarRelatorio({
  limiares,
  idiomas = IDIOMAS,
  t3Mantido = false,
  geradoEm,
  avisosExtras = [],
  ...fontes
}) {
  const candidatos = montarCandidatos(fontes)
  const avisos = [...avisosDasFontes(fontes), ...avisosExtras]
  const defasados = idsComAudioDefasado(fontes)
  const linhas = ['# voz-fase-0 — bancada de voz: motores candidatos', '']
  if (geradoEm) linhas.push(`Gerado em ${geradoEm}.`, '')
  if (limiares.provisorio) {
    linhas.push(
      '> Provisório: os limiares de `scripts/eval-voz/limiares.json` ainda não foram calibrados pela F0.',
      '> O número só elimina; o dono ouve e aprova (spec §7.3).',
      '',
    )
  }

  if (avisos.length) linhas.push('## Avisos', '', ...avisos.map((a) => `- ${a}`), '')
  linhas.push(
    '## 1. Motores e vozes',
    '',
    '| candidato | RTF (mediana) | memória (GB) | vozes do motor | duração por frase (s) | GPL |',
    '|---|---|---|---|---|---|',
  )
  for (const c of candidatos) {
    const gpl = c.temComponenteGpl === true ? 'sim' : c.temComponenteGpl === false ? 'não' : 'não informado'
    linhas.push(
      `| \`${c.id}\` | ${dec(c.rtf, 3)} | ${dec(c.memoriaGB)} | ${c.vozesDoMotor} | ${dec(c.duracaoMediaFraseS, 1)} | ${gpl} |`,
    )
  }
  linhas.push('')

  const recomendacoes = {}
  let n = 2
  for (const idioma of idiomas) {
    const doIdioma = candidatos.filter((c) => c.medidas.porIdioma[idioma])
    linhas.push(`## ${n++}. ${idioma}`, '')
    if (doIdioma.length === 0) {
      linhas.push(`Nenhum candidato com medidas em ${idioma}.`, '')
      recomendacoes[idioma] = recomendar([], limiares, idioma, { t3Mantido })
      continue
    }
    linhas.push(
      '| candidato | CER | WER | itens | números e anos | estabilidade | fora de ±30% | nota | aguenta 30 min | ouvintes |',
      '|---|---|---|---|---|---|---|---|---|---|',
    )
    const doIdiomaComEscuta = doIdioma.map((c) => comEscutaDoIdioma(c, idioma))
    for (const c of doIdiomaComEscuta) {
      const m = c.medidas.porIdioma[idioma]
      const nota = typeof c.naturalidade === 'number' ? dec(c.naturalidade, 1) : 'sem escuta'
      const ag = typeof c.aguenta30 === 'number' ? pct(c.aguenta30) : 'sem escuta'
      linhas.push(
        `| \`${c.id}\` | ${pct(m.cer)} | ${pct(m.wer)} | ${pct(m.itensAcerto)} | ${pct(m.itensNumerosEAnos)} | ${pct(m.estabilidade)} | ${pct(m.foraDaMediana)} | ${nota} | ${ag} | ${c.ouvintes ?? 0} |`,
      )
    }
    const r = recomendar(doIdiomaComEscuta, limiares, idioma, { t3Mantido })
    recomendacoes[idioma] = r
    const marca = limiares.provisorio ? ' (provisório)' : ''
    linhas.push(
      '',
      `**Recomendação (${idioma}):** ${r.escolhido ? `\`${r.escolhido}\`${marca}${defasados.has(r.escolhido) ? MARCA_DEFASADO : ''}` : `${r.motivos[CHAVE_GERAL].join('; ')}${marca}`}`,
      '',
    )
    for (const [id, ms] of Object.entries(r.motivos)) {
      if (id === CHAVE_GERAL) continue
      {
        const base = ms.length === 0 ? `- \`${id}\`: passou em todos os portões` : `- \`${id}\`: ${ms.join('; ')}`
        linhas.push(defasados.has(id) ? `${base}${MARCA_DEFASADO}` : base)
      }
    }
    linhas.push('')
  }
  return { candidatos, recomendacoes, avisos, texto: `${linhas.join('\n').trimEnd()}\n` }
}

const lerJson = (arquivo) => {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch (e) {
    throw new Error(`${arquivo}: não foi possível ler (${e.message})`)
  }
}

/**
 * Tipo de um resultado: o campo `tipo` DENTRO do JSON ('roundtrip' | 'estabilidade'). O nome do arquivo é
 * ambíguo (`voz-estabilidade-a-b.json` pode ser a estabilidade de a/b ou o round-trip do motor "estabilidade"),
 * então só vale como plano B para arquivo antigo SEM `tipo`, e então vem um aviso.
 * @param {{ tipo?: unknown }} o
 * @param {string} nome
 * @returns {{ tipo: 'roundtrip'|'estabilidade', aviso?: string }}
 */
export function classificarResultado(o, nome) {
  if (o.tipo === 'roundtrip' || o.tipo === 'estabilidade') return { tipo: o.tipo }
  if (o.tipo !== undefined) throw new Error(`${nome}: tipo "${String(o.tipo)}" inválido (use roundtrip|estabilidade)`)
  const tipo = nome.startsWith('voz-estabilidade-') ? 'estabilidade' : 'roundtrip'
  return {
    tipo,
    aviso: `${nome} não tem o campo "tipo": classificado como ${tipo} pelo NOME do arquivo (resultado antigo; meça de novo)`,
  }
}

/** Lê `voz-*.json` da pasta: round-trip e estabilidade, cada um com `motor`, `voz` e `medidas`. */
function lerResultados(pasta) {
  if (!existsSync(pasta)) throw new Error(`pasta de entrada inexistente: ${pasta}`)
  const roundtrips = []
  const estabilidades = []
  const avisos = []
  for (const nome of readdirSync(pasta).sort()) {
    if (!/^voz-.+\.json$/.test(nome)) continue
    const o = lerJson(path.join(pasta, nome))
    if (typeof o.motor !== 'string' || typeof o.voz !== 'string' || !o.medidas?.porIdioma)
      throw new Error(`${path.join(pasta, nome)}: faltam motor, voz ou medidas.porIdioma`)
    o.arquivo = nome
    const { tipo, aviso } = classificarResultado(o, nome)
    if (aviso) avisos.push(aviso)
    ;(tipo === 'estabilidade' ? estabilidades : roundtrips).push(o)
    for (const a of o.avisos ?? []) avisos.push(`${nome}: ${a}`)
  }
  if (roundtrips.length + estabilidades.length === 0) throw new Error(`nenhum resultado voz-*.json em ${pasta}`)
  return { roundtrips, estabilidades, avisos }
}

const IO_PADRAO = { out: (s) => console.log(s), err: (s) => console.error(s) }

/**
 * CLI. Devolve o código de saída (0 relatório impresso, 1 uso errado ou entrada ruim).
 * @param {string[]} argv
 * @param {{ out: (s: string) => void, err: (s: string) => void }} [io]
 * @returns {Promise<number>}
 */
export async function principal(argv, io = IO_PADRAO) {
  try {
    const fase = pegarOpcao(argv, 'fase')
    if (fase !== '0') throw new Error('--fase 0 é obrigatório (só a fase 0 existe)')
    const entrada = path.resolve(pegarOpcao(argv, 'entrada') ?? ENTRADA_PADRAO)
    const { roundtrips, estabilidades, avisos: avisosDeLeitura } = lerResultados(entrada)
    const dirSintese = pegarOpcao(argv, 'sintese')
    const sinteses = (dirSintese ? dirSintese.split(',') : []).map((d) => {
      const arquivo = path.join(path.resolve(d), 'resumo.json')
      if (!existsSync(arquivo)) throw new Error(`resumo.json ausente em ${d} (saída de sintetizar.mjs)`)
      return { ...lerJson(arquivo), arquivo: d }
    })
    const arquivoEscuta = pegarOpcao(argv, 'escuta')
    const arquivoManifesto = pegarOpcao(argv, 'candidatos')
    const manifesto = arquivoManifesto ? lerJson(path.resolve(arquivoManifesto)) : []
    if (!Array.isArray(manifesto)) throw new Error(`${arquivoManifesto}: esperava uma lista`)
    const r = montarRelatorio({
      roundtrips,
      estabilidades,
      sinteses,
      escuta: arquivoEscuta ? lerJson(path.resolve(arquivoEscuta)) : undefined,
      manifesto,
      avisosExtras: avisosDeLeitura,
      limiares: LIMIARES,
      t3Mantido: argv.includes('--t3'),
      geradoEm: new Date().toISOString().slice(0, 10),
    })
    io.out(r.texto)
    if (argv.includes('--gravar')) {
      const destino = path.join(entrada, 'voz-relatorio-fase-0.md')
      writeFileSync(destino, r.texto)
      io.out(`gravado: ${destino}`)
    }
    return 0
  } catch (e) {
    io.err(`erro: ${e.message}`)
    return 1
  }
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal(process.argv.slice(2)).then((codigo) => process.exit(codigo))
}
