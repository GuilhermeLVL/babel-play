/**
 * Peças comuns da bancada de voz (`scripts/eval-voz/`).
 *
 * Aqui mora só o que mais de um script precisa. As métricas (round-trip, itens difíceis,
 * estabilidade) entram nesta pasta nas tarefas seguintes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ_DO_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Mínimo de clipes COM áudio e duração, por idioma, para calcular a mediana e os outliers de
 * duração/caractere. Com 1 ou 2 clipes a "mediana" é o próprio clipe (ou a média de dois) e o
 * ±30% não diz nada; abaixo disso `foraDaMediana` fica ausente ("não medida").
 */
export const MIN_CLIPES_PARA_MEDIANA = 3

/**
 * Valor de `--<nome> <valor>` em `argv`, ou `undefined` se a flag não aparece. Flag sem valor (fim da
 * lista ou valor começando com `--`) e flag repetida são ERRO: nunca cair em silêncio num padrão.
 * @param {string[]} argv
 * @param {string} nome
 * @returns {string|undefined}
 */
export function pegarOpcao(argv, nome) {
  const flag = `--${nome}`
  const i = argv.indexOf(flag)
  if (i < 0) return undefined
  if (argv.indexOf(flag, i + 1) >= 0) throw new Error(`${flag} repetida: informe uma vez só`)
  const valor = argv[i + 1]
  if (!valor || valor.startsWith('--')) throw new Error(`${flag} exige um valor`)
  return valor
}

/**
 * Id seguro para virar nome de arquivo ou pasta (letras, números, "_", "-", "."; não começa com ".").
 * Barra o path traversal.
 * @param {string|undefined} valor
 * @param {string} rotulo  ex.: `--motor`, só para a mensagem
 * @returns {string}
 */
export function nomeSeguro(valor, rotulo) {
  if (!valor || !/^[\w.-]+$/.test(valor) || valor.startsWith('.'))
    throw new Error(`${rotulo} <id> é obrigatório (letras, números, "_", "-", ".")`)
  return valor
}

/**
 * Pasta dos WAVs gerados: `saida`, senão `$CLAUDE_JOB_DIR/tmp/eval-voz/<motor>[/<voz>]`, senão
 * `os.tmpdir()/eval-voz/<motor>[/<voz>]`. Com `voz`, duas vozes do mesmo motor NUNCA dividem a pasta (uma
 * sobrescrevendo a outra e o round-trip medindo a voz errada). NUNCA dentro do repositório (áudio gerado
 * não é versionado).
 * @param {{ motor: string, voz?: string, saida?: string, env?: Record<string, string|undefined> }} p
 * @returns {string}
 */
export function pastaDeSaida({ motor, voz, saida, env = process.env }) {
  const sub = voz ? [motor, voz] : [motor]
  const destino = path.resolve(
    saida ??
      (env.CLAUDE_JOB_DIR
        ? path.join(env.CLAUDE_JOB_DIR, 'tmp', 'eval-voz', ...sub)
        : path.join(tmpdir(), 'eval-voz', ...sub)),
  )
  const rel = path.relative(RAIZ_DO_REPO, destino)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)))
    throw new Error(`a pasta de saída não pode ficar dentro do repositório: ${destino}`)
  return destino
}

/** Nome do marcador que `sintetizar.mjs` grava na pasta dos WAVs. */
export const ARQUIVO_DE_ORIGEM = 'origem.json'

/**
 * Grava o marcador `origem.json` (motor, voz, idioma do `--longo`, versão do pré-processador) na pasta dos
 * WAVs. Se já há um marcador do MESMO motor/voz, preserva os campos dele (ex.: o `idioma` do longo); de
 * outro motor/voz, é sobrescrito.
 * @param {string} pasta
 * @param {{ motor: string, voz: string, idioma?: string, versaoPreprocessador: string|null, preprocessado?: boolean }} origem
 */
export function escreverOrigem(pasta, origem) {
  const anterior = lerOrigem(pasta)
  const base = anterior && anterior.motor === origem.motor && anterior.voz === origem.voz ? anterior : {}
  writeFileSync(path.join(pasta, ARQUIVO_DE_ORIGEM), `${JSON.stringify({ ...base, ...origem }, null, 2)}\n`)
}

/** @param {string} pasta @returns {{ motor?: string, voz?: string, idioma?: string, versaoPreprocessador?: string|null }|null} */
export function lerOrigem(pasta) {
  const arquivo = path.join(pasta, ARQUIVO_DE_ORIGEM)
  if (!existsSync(arquivo)) return null
  try {
    const o = JSON.parse(readFileSync(arquivo, 'utf8'))
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

/**
 * Confere `--motor/--voz` com o marcador da pasta de entrada. Marcador presente e diferente: ERRO (mediria
 * a voz errada em silêncio). Marcador ausente: segue, devolvendo um aviso para o resultado.
 * @param {string} pasta
 * @param {{ motor: string, voz: string }} p
 * @returns {{ avisos: string[] }}
 */
export function conferirOrigem(pasta, { motor, voz }) {
  const o = lerOrigem(pasta)
  if (!o) {
    return {
      avisos: [
        `sem ${ARQUIVO_DE_ORIGEM} em ${pasta}: não dá para conferir que os WAVs são de ${motor}/${voz} (pasta de antes do marcador?)`,
      ],
    }
  }
  if (o.motor !== motor || o.voz !== voz)
    throw new Error(
      `--entrada ${pasta} é de ${o.motor}/${o.voz} (${ARQUIVO_DE_ORIGEM}), mas --motor/--voz dizem ${motor}/${voz}`,
    )
  return { avisos: [] }
}

/**
 * Real-time factor: tempo gasto na síntese ÷ duração do áudio gerado (spec §7.2: ≤ 0,5).
 * @param {number} tempoDeSinteseS
 * @param {number} duracaoS
 * @returns {number}
 */
export function rtf(tempoDeSinteseS, duracaoS) {
  if (!Number.isFinite(duracaoS) || duracaoS <= 0) throw new RangeError(`rtf: duração inválida (${duracaoS})`)
  if (!Number.isFinite(tempoDeSinteseS) || tempoDeSinteseS < 0)
    throw new RangeError(`rtf: tempo de síntese inválido (${tempoDeSinteseS})`)
  return tempoDeSinteseS / duracaoS
}

/**
 * Mediana clássica (média dos dois do meio com número par).
 * @param {number[]} xs
 * @returns {number}
 */
export const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Frases cuja duração POR CARACTERE foge da mediana da própria voz por mais que `tolerancia` (±, spec
 * §7.2; exatamente na borda NÃO é marcada, com folga de ponto flutuante). Itens com `caracteres` <= 0 ou
 * duração não positiva/não finita são ignorados (nem marcados nem contados). `fracao` = marcadas ÷
 * itens considerados; lista vazia (ou toda ignorada) dá `{ ids: [], fracao: 0 }`.
 * O mínimo de clipes (`MIN_CLIPES_PARA_MEDIANA`) é decisão do chamador.
 * @param {{ id: string, duracaoS: number, caracteres: number }[]} frases
 * @param {number} [tolerancia]
 * @returns {{ ids: string[], fracao: number }}
 */
export function foraDaMediana(frases, tolerancia = 0.3) {
  const validas = frases
    .filter((f) => Number.isFinite(f.duracaoS) && f.duracaoS > 0 && Number.isFinite(f.caracteres) && f.caracteres > 0)
    .map((f) => ({ id: f.id, razao: f.duracaoS / f.caracteres }))
  if (validas.length === 0) return { ids: [], fracao: 0 }
  const med = mediana(validas.map((v) => v.razao))
  const ids = validas.filter((v) => Math.abs(v.razao / med - 1) > tolerancia + 1e-9).map((v) => v.id)
  return { ids, fracao: ids.length / validas.length }
}

/**
 * @typedef {object} ItemDificil
 * @property {string} texto  trecho exato que aparece no texto da frase
 * @property {string[]} aceita  grafias aceitas na transcrição (por extenso, em dígitos, variantes
 *   ORTOGRÁFICAS da mesma palavra; nada de respelling fonético nem outra palavra). A métrica
 *   (`acertoDosItens` em `metricas.mjs`) normaliza os dois lados com `normalizarParaComparar`
 *   (minúsculas, sem pontuação, números por extenso em pt) e ainda dobra o acento, então caixa
 *   mista e "Dostoiévski"/"Dostoievski" não importam. O casamento é por sequência de palavras
 *   inteiras (fronteira de palavra): "un", "3", "vinte" não acertam dentro de outra palavra.
 * @property {'nome'|'numero'|'sigla'|'ano'} tipo
 */

/**
 * @typedef {object} CorpusItem
 * @property {string} id
 * @property {'pt'|'en'|'es'} idioma
 * @property {string} texto
 * @property {string} categoria
 * @property {ItemDificil[]} itens  gabarito dos itens difíceis (pode ser vazio)
 */

export const IDIOMAS = ['pt', 'en', 'es']

/**
 * Classes de erro de texto: UMA tabela para os dois lados. A chave é o nome que o JUIZ DE TEXTO
 * (`julgar-texto.mjs`) devolve; o valor é o nome da caixa de erro grave do CSV da escuta
 * (`gerar-formulario.mjs`, coluna `erros[]`). Só o número muda de nome: `numero_lido_errado` -> `numero_errado`.
 */
export const CLASSE_DO_JUIZ_PARA_ERRO_DO_CSV = Object.freeze({
  nome_errado: 'nome_errado',
  numero_lido_errado: 'numero_errado',
  omissao: 'omissao',
  repeticao: 'repeticao',
})

/**
 * O nome no CSV da escuta para uma classe do juiz de texto.
 * @param {string} classe
 * @returns {string}
 */
export function erroDoCsvDaClasse(classe) {
  const erro = CLASSE_DO_JUIZ_PARA_ERRO_DO_CSV[classe]
  if (!erro)
    throw new Error(`classe "${classe}" desconhecida (use ${Object.keys(CLASSE_DO_JUIZ_PARA_ERRO_DO_CSV).join('|')})`)
  return erro
}
export const TIPOS_DE_ITEM = ['nome', 'numero', 'sigla', 'ano']

/**
 * Valida um item do corpus. Devolve a mensagem do primeiro defeito ou `null`.
 * @param {unknown} o
 * @returns {string|null}
 */
export function validarItem(o) {
  if (!o || typeof o !== 'object') return 'não é um objeto'
  for (const campo of ['id', 'texto', 'categoria']) {
    if (typeof o[campo] !== 'string' || !o[campo].trim()) return `campo "${campo}" ausente ou vazio`
  }
  if (!IDIOMAS.includes(o.idioma)) return `idioma "${o.idioma}" inválido (use ${IDIOMAS.join('|')})`
  if (!Array.isArray(o.itens)) return 'campo "itens" ausente (use [] se não houver)'
  for (const [k, d] of o.itens.entries()) {
    if (!d || typeof d.texto !== 'string' || !d.texto) return `itens[${k}].texto ausente`
    if (!Array.isArray(d.aceita) || d.aceita.length === 0 || d.aceita.some((a) => typeof a !== 'string' || !a)) {
      return `itens[${k}].aceita vazio ou inválido`
    }
    if (!TIPOS_DE_ITEM.includes(d.tipo)) return `itens[${k}].tipo "${d.tipo}" inválido (use ${TIPOS_DE_ITEM.join('|')})`
  }
  return null
}

/**
 * Lê um JSONL de corpus de voz e valida cada linha.
 * @param {string} caminho
 * @returns {CorpusItem[]}
 */
export function lerCorpus(caminho) {
  const itens = []
  const linhas = readFileSync(caminho, 'utf8').split('\n')
  for (const [n, linha] of linhas.entries()) {
    if (!linha.trim()) continue
    let o
    try {
      o = JSON.parse(linha)
    } catch (e) {
      throw new Error(`${caminho}: linha ${n + 1}: JSON inválido (${e.message})`)
    }
    const erro = validarItem(o)
    if (erro) throw new Error(`${caminho}: linha ${n + 1}: ${erro}`)
    itens.push(o)
  }
  return itens
}

/**
 * Medidas de uma voz num idioma. Todas as taxas são FRAÇÕES em [0,1] (3,0 % = 0.03).
 * @typedef {object} MedidasDoIdioma
 * @property {number} cer  CER agregado (erros ÷ caracteres da referência)
 * @property {number} wer  WER agregado (erros ÷ palavras da referência)
 * @property {number} itensAcerto  fração dos itens difíceis (nome, número, sigla, ano) corretos; 1 se não há itens
 * @property {number} itensNumerosEAnos  fração só dos itens `numero` e `ano`; 1 se não há
 * @property {number} semAudio  CONTAGEM de frases sem áudio (WAV ausente); fora do WER
 * @property {number} invalidos  CONTAGEM de frases cujo WAV existe mas é inválido (8 bits, truncado,
 *   sem fmt/data, vazio ou só silêncio) ou cuja transcrição falhou; fora do WER, com o erro no registro
 *   da frase. Nota: frases com siglas ("CPF"/"cê pê efe"/"C P F") normalizam diferente e inflam o WER;
 *   para elas vale o acerto do item difícil.
 * @property {number} [estabilidade]  inserções + deleções no texto longo, fração das palavras;
 *   vem de `medir-estabilidade.mjs`, não do round-trip (ausente = não medida)
 * @property {number} [foraDaMediana]  fração das frases com duração/caractere fora de ±30% da
 *   mediana da própria voz; só existe se o chamador informou as durações (ausente = não medida)
 */

/**
 * @typedef {object} Medidas
 * @property {Partial<Record<'pt'|'en'|'es', MedidasDoIdioma>>} porIdioma  só os idiomas presentes no corpus
 */

/**
 * Limiares de um idioma (spec §7.2). Taxas em fração; um campo ausente não é checado.
 * @typedef {object} LimiaresDoIdioma
 * @property {number} cerMax  CER agregado, eliminatório (pt 3,0 % / en 2,0 % / es 3,0 %)
 * @property {number} werMax  WER agregado, eliminatório (pt 8,0 % / en 5,0 % / es 7,0 %)
 * @property {number} itensAcertoMin  itens difíceis corretos (pt 85 % / en 90 % / es 90 %)
 * @property {number} itensNumerosEAnosMin  números e anos corretos (100 % nos três)
 * @property {number} estabilidadeMax  inserções + deleções no texto longo (1,0 %)
 * @property {number} foraDaMedianaMax  frases fora de ±30% da mediana de duração/caractere (3 %)
 * @property {number} semAudioMax  frases sem áudio, em contagem (0)
 * @property {number} invalidosMax  frases com áudio inválido, em contagem (0; "truncada" da spec §7.2)
 */

/**
 * @typedef {Record<'pt'|'en'|'es', LimiaresDoIdioma>} Limiares
 */

/**
 * Todos os limiares da bancada de voz (`limiares.json` é a ÚNICA fonte dos números).
 * @typedef {object} LimiaresDaBancada
 * @property {boolean} provisorio  `true` enquanto a F0 não calibrou e travou os números (Tarefa 13 vira para `false`)
 * @property {Limiares} porIdioma  spec §7.2: CER, WER, itens, estabilidade, ±30 % da mediana, sem áudio/inválidos
 * @property {number} rtfMax  RTF máximo no hardware do lote (spec §6.4 portão 3 e §7.2)
 * @property {number} ttfaP95MaxS  1º áudio p95 em segundos, só se informado e o motor for usado online (spec §6.4 portão 3)
 * @property {{ timbresDistinguiveisMin: number, acertoTimbresMin: number }} t3  só se o T3 for mantido (spec §6.4 portão 4)
 * @property {{ naturalidadeMin: number, aguenta30Min: number, errosGravesRepetidosMax: number, melhorQueAparelhoMin: number, ouvintesMin: number }} escuta
 *   critério de aceite da escuta (spec §7.3); `ouvintesMin` = ouvintes distintos POR IDIOMA (a spec pede 3 a 5)
 */

const CAMPOS_DO_IDIOMA = [
  'cerMax',
  'werMax',
  'itensAcertoMin',
  'itensNumerosEAnosMin',
  'estabilidadeMax',
  'foraDaMedianaMax',
  'semAudioMax',
  'invalidosMax',
]

/**
 * Confere a FORMA do `limiares.json` e devolve o objeto. Qualquer chave faltando (ou não numérica) é erro
 * com o caminho da chave: limiar ausente nunca vira "sem limite" em silêncio.
 * @param {unknown} o
 * @param {string} [origem]  só para a mensagem
 * @returns {LimiaresDaBancada}
 */
export function validarLimiares(o, origem = 'limiares.json') {
  const falta = (chave) => {
    throw new Error(`${origem}: chave "${chave}" ausente ou inválida`)
  }
  const numero = (obj, chave, caminho) => {
    if (typeof obj?.[chave] !== 'number' || !Number.isFinite(obj[chave])) falta(caminho)
  }
  if (!o || typeof o !== 'object') falta('(raiz)')
  if (typeof o.provisorio !== 'boolean') falta('provisorio')
  for (const idioma of IDIOMAS) {
    if (!o.porIdioma || typeof o.porIdioma[idioma] !== 'object' || o.porIdioma[idioma] === null)
      falta(`porIdioma.${idioma}`)
    for (const campo of CAMPOS_DO_IDIOMA) numero(o.porIdioma[idioma], campo, `porIdioma.${idioma}.${campo}`)
  }
  numero(o, 'rtfMax', 'rtfMax')
  numero(o, 'ttfaP95MaxS', 'ttfaP95MaxS')
  for (const c of ['timbresDistinguiveisMin', 'acertoTimbresMin']) numero(o.t3, c, `t3.${c}`)
  for (const c of ['naturalidadeMin', 'aguenta30Min', 'errosGravesRepetidosMax', 'melhorQueAparelhoMin', 'ouvintesMin'])
    numero(o.escuta, c, `escuta.${c}`)
  return o
}

/**
 * Lê e valida um arquivo de limiares. Síncrono e sem dependências: funciona em `node` puro.
 * @param {string|URL} caminho
 * @returns {LimiaresDaBancada}
 */
export function lerLimiares(caminho) {
  let o
  try {
    o = JSON.parse(readFileSync(caminho, 'utf8'))
  } catch (e) {
    throw new Error(`${String(caminho)}: não foi possível ler os limiares (${e.message})`)
  }
  return validarLimiares(o, String(caminho))
}

/** Limiares da bancada, carregados de `limiares.json` (única fonte dos números). */
export const LIMIARES = (() => {
  const arquivo = new URL('./limiares.json', import.meta.url)
  try {
    return lerLimiares(arquivo)
  } catch (e) {
    throw new Error(`scripts/eval-voz/limiares.json está inválido (${fileURLToPath(arquivo)}): ${e.message}`)
  }
})()

/**
 * Limiares por idioma da spec §7.2 (a parte de `LIMIARES` que as medidas automáticas usam). Vem de
 * `limiares.json`; não repita os números em código.
 * @type {Limiares}
 */
export const LIMIARES_DA_SPEC = LIMIARES.porIdioma
