/**
 * Escuta humana CEGA da bancada de voz (spec §7.1 item 7 e §7.3).
 *
 * Uso (node puro, sem tsx):
 *   node scripts/eval-voz/gerar-formulario.mjs gerar   --amostras <amostras.json> [--semente 1] [--saida <dir>]
 *   node scripts/eval-voz/gerar-formulario.mjs resumir --csv <respostas.csv> --chave <chave.json> [--saida <dir>]
 *
 * `amostras.json`: lista de `{ motor, voz, arquivo, frase_id?, idioma?, ancora? }` (WAV por frase e voz).
 *
 * CEGUEIRA é o ponto: cada WAV é COPIADO para a pasta de escuta com nome anônimo (`a07.wav`, derivado só da
 * `voz_cega`) e sem chunks de metadado (só `fmt ` e `data`); o HTML e o CSV-modelo não trazem motor, voz, caminho
 * de origem nem nome de arquivo original. A chave `voz_cega -> motor/voz` vai para OUTRA pasta (`<saida>-chave/`),
 * que o ouvinte nunca recebe. A pasta de escuta nunca fica dentro do repositório (`pastaDeSaida`).
 *
 * Retenção zero: o formulário não guarda nada no servidor; o CSV é baixado no navegador de quem ouve e só traz
 * apelido, nota e comentário.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { pastaDeSaida, pegarOpcao } from './comum.mjs'

/** Cabeçalho EXATO do CSV de escuta (a coluna chama-se literalmente `erros[]`; lista separada por `|`). */
export const CABECALHO_DO_CSV = 'ouvinte,idioma,frase_id,voz_cega,naturalidade,clareza,erros[],comentario'
const COLUNAS = CABECALHO_DO_CSV.split(',')

/** Marca de ordem de bytes (BOM) que alguns editores põem no início do CSV. */
const BOM = String.fromCharCode(0xfeff)

/** Marcas na chave para o que não é voz candidata. */
const MARCA_ANCORA = '__ancora__'
const MARCA_REPETIDA = '__repetida__:'

/**
 * Categorias de erro oferecidas ao ouvinte (spec §7.3). As quatro primeiras são GRAVES: a spec só diz "nenhum
 * erro grave repetido em ≥ 2 ouvintes" sem listar quais; adotamos as classes que o juiz de texto também usa
 * (nome, número, omissão, repetição), pois mudam o sentido do que o aluno ouve.
 */
const ERROS_GRAVES = ['nome_errado', 'numero_errado', 'omissao', 'repeticao']
const ERROS_LEVES = ['pronuncia_estranha', 'pausa_estranha', 'voz_robotica', 'corte_brusco']

/* ── Sorteio cego ── */

/** PRNG determinístico pequeno (mulberry32): mesma semente, mesma sequência. Nunca `Math.random`. */
function mulberry32(semente) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates determinístico (não altera a entrada). */
function embaralhar(lista, aleatorio) {
  const r = [...lista]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/**
 * Ordem cega da escuta: as amostras, 1 âncora ruim e 2 frases repetidas (mesmo áudio sob outra `voz_cega`, para
 * checar a consistência do ouvinte), tudo embaralhado pela semente.
 *
 * Sem amostra `ancora: true`, o item da âncora aponta para a primeira amostra com `degradar: true`: quem copia o
 * áudio (`gerarFormulario`) o degrada. `chave`: `voz_cega -> "motor/voz"`, `"__ancora__"` ou `"__repetida__:<voz_cega original>"`.
 * @param {{ motor: string, voz: string, arquivo: string, ancora?: true, frase_id?: string, idioma?: string }[]} amostras
 * @param {number} semente
 * @returns {{ itens: { voz_cega: string, arquivo: string, ancora?: true, repetida?: true, degradar?: true, frase_id?: string, idioma?: string }[], chave: Record<string, string> }}
 */
export function sortearCega(amostras, semente) {
  if (!Number.isInteger(semente)) throw new Error('semente deve ser um inteiro')
  const reais = amostras.filter((a) => !a.ancora)
  if (reais.length === 0) throw new Error('sem amostras para sortear')
  const aleatorio = mulberry32(semente)

  const brutos = reais.map((a) => ({
    arquivo: a.arquivo,
    frase_id: a.frase_id,
    idioma: a.idioma,
    rotulo: `${a.motor}/${a.voz}`,
  }))
  const dadaPeloChamador = amostras.find((a) => a.ancora)
  const ancora = dadaPeloChamador
    ? {
        arquivo: dadaPeloChamador.arquivo,
        frase_id: dadaPeloChamador.frase_id,
        idioma: dadaPeloChamador.idioma,
        ancora: true,
      }
    : { arquivo: reais[0].arquivo, frase_id: reais[0].frase_id, idioma: reais[0].idioma, ancora: true, degradar: true }
  const repetidas = embaralhar(brutos, aleatorio)
    .slice(0, Math.min(2, brutos.length))
    .map((b) => ({ ...b, repetida: true, de: b.arquivo }))

  const todos = embaralhar([...brutos, ancora, ...repetidas], aleatorio)
  const largura = Math.max(2, String(todos.length).length)
  const itens = []
  const chave = {}
  const cegaDoOriginal = new Map()
  todos.forEach((t, i) => {
    const voz_cega = `a${String(i + 1).padStart(largura, '0')}`
    const { rotulo, de, ...item } = t
    itens.push({ voz_cega, ...item })
    if (t.ancora) chave[voz_cega] = MARCA_ANCORA
    else if (t.repetida) chave[voz_cega] = `${MARCA_REPETIDA}?${de}`
    else {
      chave[voz_cega] = rotulo
      cegaDoOriginal.set(t.arquivo, voz_cega)
    }
  })
  for (const [cega, v] of Object.entries(chave)) {
    if (v.startsWith(`${MARCA_REPETIDA}?`))
      chave[cega] = MARCA_REPETIDA + cegaDoOriginal.get(v.slice(MARCA_REPETIDA.length + 1))
  }
  return { itens, chave }
}

/* ── WAV: copiar sem metadado e degradar a âncora ── */

/** Extrai `fmt ` e `data` de um WAV RIFF; o resto (LIST, ID3, etc.) é descartado. */
function lerWav(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE')
    throw new Error('arquivo não é um WAV RIFF/WAVE válido')
  let fmt = null
  let dados = null
  for (let p = 12; p + 8 <= buf.length; ) {
    const id = buf.toString('latin1', p, p + 4)
    const tam = buf.readUInt32LE(p + 4)
    const corpo = buf.subarray(p + 8, Math.min(p + 8 + tam, buf.length))
    if (id === 'fmt ') fmt = corpo
    else if (id === 'data') dados = corpo
    p += 8 + tam + (tam % 2)
  }
  if (!fmt || !dados) throw new Error('WAV sem chunk fmt ou data')
  return { fmt, dados }
}

function montarWav(fmt, dados) {
  const pad = dados.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
  const cab = Buffer.alloc(20)
  cab.write('RIFF', 0, 'latin1')
  cab.writeUInt32LE(4 + 8 + fmt.length + (fmt.length % 2) + 8 + dados.length + pad.length, 4)
  cab.write('WAVE', 8, 'latin1')
  cab.write('fmt ', 12, 'latin1')
  cab.writeUInt32LE(fmt.length, 16)
  const fmtPad = fmt.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
  const cabData = Buffer.alloc(8)
  cabData.write('data', 0, 'latin1')
  cabData.writeUInt32LE(dados.length, 4)
  return Buffer.concat([cab, fmt, fmtPad, cabData, dados, pad])
}

/** Copia um WAV mantendo só `fmt ` e `data` (nenhum metadado que revele o motor). */
function limparWav(buf) {
  const { fmt, dados } = lerWav(buf)
  return montarWav(fmt, dados)
}

/**
 * Âncora ruim: PCM16 com taxa efetiva de ~4 kHz (amostra mantida por blocos, mesma duração) e quantização em
 * 6 bits. Soa abafado e granulado; um ouvinte atento dá nota baixa.
 * @param {Buffer} buf
 * @returns {Buffer}
 */
export function degradarWav(buf) {
  const { fmt, dados } = lerWav(buf)
  const canais = fmt.readUInt16LE(2)
  const taxa = fmt.readUInt32LE(4)
  const bits = fmt.readUInt16LE(14)
  if (fmt.readUInt16LE(0) !== 1 || bits !== 16) throw new Error('degradarWav exige WAV PCM de 16 bits')
  const passo = Math.max(1, Math.round(taxa / 4000))
  const quadros = Math.floor(dados.length / (2 * canais))
  const saida = Buffer.from(dados)
  for (let q = 0; q < quadros; q++) {
    const origem = Math.floor(q / passo) * passo
    for (let c = 0; c < canais; c++) {
      const v = dados.readInt16LE((origem * canais + c) * 2)
      saida.writeInt16LE((v >> 10) << 10, (q * canais + c) * 2)
    }
  }
  return montarWav(fmt, saida)
}

/* ── Formulário ── */

const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function htmlDoFormulario(itens) {
  const erros = [...ERROS_GRAVES, ...ERROS_LEVES]
  const blocos = itens
    .map(
      (it, i) => `<section class="item" data-voz="${escapar(it.voz_cega)}" data-frase="${escapar(it.frase_id ?? '')}">
<h2>Amostra ${i + 1}</h2>
<audio controls preload="none" src="${escapar(it.voz_cega)}.wav"></audio>
<label>Naturalidade (1-5) <select name="naturalidade"><option value="">-</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}</select></label>
<label>Clareza (1-5) <select name="clareza"><option value="">-</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}</select></label>
<fieldset><legend>Erros ouvidos</legend>${erros.map((e) => `<label><input type="checkbox" name="erros" value="${e}"> ${e}</label>`).join(' ')}</fieldset>
<label>Comentário <input type="text" name="comentario"></label>
</section>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Escuta cega</title>
<style>
body{font-family:system-ui,sans-serif;max-width:46rem;margin:1rem auto;padding:0 1rem;line-height:1.4}
.item{border:1px solid #8886;border-radius:.5rem;padding:.75rem;margin:1rem 0}
label{display:block;margin:.4rem 0} audio{width:100%}
fieldset{border:0;padding:0;margin:.4rem 0} fieldset label{display:inline-block;margin-right:.6rem}
</style>
</head>
<body>
<h1>Escuta cega</h1>
<p>Ouça cada amostra sem saber qual voz é. Dê notas de 1 a 5 e marque os erros que ouvir. Nada é enviado: o arquivo CSV é baixado no seu aparelho.</p>
<label>Seu apelido <input id="ouvinte" type="text" autocomplete="off"></label>
<label>Idioma que você fala <input id="idioma" type="text" value="pt" size="4"></label>
${blocos}
<button id="baixar" type="button">Baixar CSV</button>
<script>
var CABECALHO=${JSON.stringify(CABECALHO_DO_CSV)};
function campo(v){v=String(v);return /[",\\r\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
document.getElementById('baixar').onclick=function(){
  var ouvinte=document.getElementById('ouvinte').value.trim(),idioma=document.getElementById('idioma').value.trim();
  if(!ouvinte){alert('Informe um apelido.');return}
  var linhas=[CABECALHO],pendente=0;
  document.querySelectorAll('.item').forEach(function(s){
    var n=s.querySelector('[name=naturalidade]').value,c=s.querySelector('[name=clareza]').value;
    if(!n||!c){pendente++;return}
    var erros=[].map.call(s.querySelectorAll('[name=erros]:checked'),function(e){return e.value}).join('|');
    linhas.push([ouvinte,idioma,s.dataset.frase,s.dataset.voz,n,c,erros,s.querySelector('[name=comentario]').value].map(campo).join(','));
  });
  if(pendente&&!confirm(pendente+' amostra(s) sem nota. Baixar assim mesmo?'))return;
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([linhas.join('\\r\\n')+'\\r\\n'],{type:'text/csv'}));
  a.download='escuta-'+ouvinte+'.csv';a.click();
};
</script>
</body>
</html>
`
}

/**
 * Gera a pasta de escuta (HTML, CSV-modelo, WAVs anônimos) e a chave em pasta separada.
 * @param {{ amostras: { motor: string, voz: string, arquivo: string, ancora?: true, frase_id?: string, idioma?: string }[], semente?: number, saida?: string, env?: Record<string,string|undefined> }} p
 * @returns {{ itens: ReturnType<typeof sortearCega>['itens'], pastaDeEscuta: string, arquivoDaChave: string }}
 */
export function gerarFormulario({ amostras, semente = 1, saida, env = process.env }) {
  const { itens, chave } = sortearCega(amostras, semente)
  const pastaDeEscuta = pastaDeSaida({ motor: 'escuta', saida, env })
  const pastaDaChave = pastaDeSaida({
    motor: 'escuta-chave',
    saida: saida ? `${path.resolve(saida)}-chave` : undefined,
    env,
  })
  mkdirSync(pastaDeEscuta, { recursive: true })
  mkdirSync(pastaDaChave, { recursive: true })
  for (const it of itens) {
    if (!existsSync(it.arquivo)) throw new Error(`áudio não encontrado: ${it.arquivo}`)
    const bruto = readFileSync(it.arquivo)
    writeFileSync(path.join(pastaDeEscuta, `${it.voz_cega}.wav`), it.degradar ? degradarWav(bruto) : limparWav(bruto))
  }
  writeFileSync(path.join(pastaDeEscuta, 'formulario.html'), htmlDoFormulario(itens))
  const modelo = [CABECALHO_DO_CSV, ...itens.map((it) => `,${it.idioma ?? ''},${it.frase_id ?? ''},${it.voz_cega},,,,`)]
  writeFileSync(path.join(pastaDeEscuta, 'modelo.csv'), `${modelo.join('\n')}\n`)
  const arquivoDaChave = path.join(pastaDaChave, 'chave.json')
  writeFileSync(arquivoDaChave, `${JSON.stringify(chave, null, 2)}\n`)
  return { itens, pastaDeEscuta, arquivoDaChave }
}

/* ── CSV de respostas ── */

/** RFC 4180: campos entre aspas (vírgula, aspas duplicadas e quebra de linha dentro), CRLF ou LF, BOM. */
function registrosDoCsv(texto) {
  const s = texto.startsWith(BOM) ? texto.slice(1) : texto
  const registros = []
  let campos = []
  let atual = ''
  let entreAspas = false
  let linha = 1
  let linhaDoRegistro = 1
  let temConteudo = false
  const fechar = () => {
    campos.push(atual)
    if (temConteudo || campos.length > 1 || campos[0] !== '') registros.push({ linha: linhaDoRegistro, campos })
    campos = []
    atual = ''
    temConteudo = false
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (entreAspas) {
      if (c === '"' && s[i + 1] === '"') {
        atual += '"'
        i++
      } else if (c === '"') entreAspas = false
      else {
        if (c === '\n') linha++
        atual += c
      }
    } else if (c === '"') {
      entreAspas = true
      temConteudo = true
    } else if (c === ',') {
      campos.push(atual)
      atual = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      fechar()
      linha++
      linhaDoRegistro = linha
    } else {
      atual += c
      temConteudo = true
    }
  }
  if (entreAspas) throw new Error(`CSV: aspas não fechadas no registro da linha ${linhaDoRegistro}`)
  if (atual !== '' || campos.length > 0) fechar()
  return registros
}

/**
 * Lê o CSV de escuta. O cabeçalho é fixo (`CABECALHO_DO_CSV`): coluna faltando, extra, renomeada ou fora de ordem
 * é erro que cita a coluna. `naturalidade` e `clareza` são inteiros 1..5 (erro com o número da linha). `erros[]`
 * vazio vira `[]`.
 * @param {string} csv
 * @returns {{ ouvinte: string, idioma: string, frase_id: string, voz_cega: string, naturalidade: number, clareza: number, erros: string[], comentario: string }[]}
 */
export function lerCsvDeEscuta(csv) {
  const [cab, ...corpo] = registrosDoCsv(csv)
  if (!cab) throw new Error('CSV vazio: faltam as colunas ' + COLUNAS.join(', '))
  const cabecalho = cab.campos.map((c) => c.trim())
  const faltando = COLUNAS.filter((c) => !cabecalho.includes(c))
  if (faltando.length) throw new Error(`CSV: coluna ausente ou renomeada: ${faltando.join(', ')}`)
  const extras = cabecalho.filter((c) => !COLUNAS.includes(c))
  if (extras.length || cabecalho.length !== COLUNAS.length)
    throw new Error(`CSV: coluna extra ou repetida: ${(extras.length ? extras : cabecalho).join(', ')}`)
  if (cabecalho.some((c, i) => c !== COLUNAS[i]))
    throw new Error(`CSV: colunas fora de ordem (esperado ${CABECALHO_DO_CSV})`)

  return corpo.map(({ linha, campos }) => {
    if (campos.length !== COLUNAS.length)
      throw new Error(`CSV linha ${linha}: ${campos.length} campos, esperado ${COLUNAS.length}`)
    const [ouvinte, idioma, frase_id, voz_cega, nat, cla, erros, comentario] = campos
    for (const [nome, valor] of [
      ['ouvinte', ouvinte],
      ['frase_id', frase_id],
      ['voz_cega', voz_cega],
    ]) {
      if (!valor.trim()) throw new Error(`CSV linha ${linha}: coluna ${nome} vazia`)
    }
    const nota = (nome, v) => {
      if (!/^[1-5]$/.test(v.trim()))
        throw new Error(`CSV linha ${linha}: ${nome} deve ser inteiro de 1 a 5 (veio "${v}")`)
      return Number(v)
    }
    return {
      ouvinte: ouvinte.trim(),
      idioma: idioma.trim(),
      frase_id: frase_id.trim(),
      voz_cega: voz_cega.trim(),
      naturalidade: nota('naturalidade', nat),
      clareza: nota('clareza', cla),
      erros: erros
        .split('|')
        .map((e) => e.trim())
        .filter(Boolean),
      comentario,
    }
  })
}

/* ── Resumo ── */

function tipoDaChave(chave, voz_cega) {
  const v = chave[voz_cega]
  if (v === undefined) throw new Error(`voz_cega "${voz_cega}" não existe na chave`)
  if (v === MARCA_ANCORA) return { tipo: 'ancora' }
  if (v.startsWith(MARCA_REPETIDA)) return { tipo: 'repetida', de: v.slice(MARCA_REPETIDA.length) }
  return { tipo: 'voz', rotulo: v }
}

/**
 * Resumo por motor/voz. Âncora e repetidas ficam FORA das médias.
 *
 * - `naturalidade`: média das notas.
 * - `ouvintes`: ouvintes distintos que avaliaram a voz.
 * - `aguenta30`: a spec §7.3 pede "aguentaria 30 min" ≥ 60% de sim, mas é uma pergunta que NÃO está nas colunas do
 *   CSV (cabeçalho fixo) e a spec não diz como mapeá-la. DERIVAÇÃO ADOTADA: fração das avaliações com naturalidade
 *   ≥ 4 E clareza ≥ 4 (quem dá 4+ nos dois, aguentaria). É proxy; a pergunta direta pode entrar numa rodada futura.
 * - `errosGravesRepetidos`: nº de tipos DISTINTOS de erro grave (`ERROS_GRAVES`) citados por ≥ 2 ouvintes distintos
 *   para a mesma voz. O mesmo ouvinte repetindo o erro não soma.
 * @param {ReturnType<typeof lerCsvDeEscuta>} linhas
 * @param {Record<string, string>} chave
 * @returns {Record<string, { naturalidade: number, aguenta30: number, errosGravesRepetidos: number, ouvintes: number }>}
 */
export function resumirEscuta(linhas, chave) {
  const grupos = new Map()
  for (const l of linhas) {
    const t = tipoDaChave(chave, l.voz_cega)
    if (t.tipo !== 'voz') continue
    if (!grupos.has(t.rotulo)) grupos.set(t.rotulo, [])
    grupos.get(t.rotulo).push(l)
  }
  const resumo = {}
  for (const [rotulo, ls] of grupos) {
    const porErro = new Map()
    for (const l of ls)
      for (const e of l.erros) {
        if (!ERROS_GRAVES.includes(e)) continue
        if (!porErro.has(e)) porErro.set(e, new Set())
        porErro.get(e).add(l.ouvinte)
      }
    resumo[rotulo] = {
      naturalidade: ls.reduce((a, l) => a + l.naturalidade, 0) / ls.length,
      aguenta30: ls.filter((l) => l.naturalidade >= 4 && l.clareza >= 4).length / ls.length,
      errosGravesRepetidos: [...porErro.values()].filter((o) => o.size >= 2).length,
      ouvintes: new Set(ls.map((l) => l.ouvinte)).size,
    }
  }
  return resumo
}

/**
 * Qualidade do ouvinte: suspeito quem dá naturalidade ≥ 4 à âncora ruim ou cujas notas de naturalidade na frase
 * repetida diferem em ≥ 2 do original. Não descarta ninguém: só sinaliza (`ouvintesSuspeitos` no resumo).
 * @param {ReturnType<typeof lerCsvDeEscuta>} linhas
 * @param {Record<string, string>} chave
 * @returns {{ ouvinte: string, motivos: string[] }[]}
 */
export function avaliarOuvintes(linhas, chave) {
  const motivos = new Map()
  const marcar = (o, m) => motivos.set(o, [...(motivos.get(o) ?? []), m])
  const nota = new Map(linhas.map((l) => [`${l.ouvinte}|${l.voz_cega}`, l.naturalidade]))
  for (const l of linhas) {
    const t = tipoDaChave(chave, l.voz_cega)
    if (t.tipo === 'ancora' && l.naturalidade >= 4)
      marcar(l.ouvinte, `deu naturalidade ${l.naturalidade} à âncora ruim`)
    if (t.tipo === 'repetida') {
      const original = nota.get(`${l.ouvinte}|${t.de}`)
      if (original !== undefined && Math.abs(original - l.naturalidade) >= 2)
        marcar(l.ouvinte, `frase repetida com notas ${original} e ${l.naturalidade} (diferença >= 2)`)
    }
  }
  return [...motivos].map(([ouvinte, m]) => ({ ouvinte, motivos: m }))
}

/** CSV do resumo (uma linha por motor/voz). */
function csvDoResumo(resumo) {
  const linhas = Object.entries(resumo).map(
    ([k, r]) => `${k},${r.naturalidade.toFixed(2)},${r.aguenta30.toFixed(2)},${r.errosGravesRepetidos},${r.ouvintes}`,
  )
  return `motor_voz,naturalidade,aguenta30,erros_graves_repetidos,ouvintes\n${linhas.join('\n')}\n`
}

/* ── CLI ── */

async function principal(argv) {
  const [modo, ...resto] = argv
  if (modo === 'gerar') {
    const arquivo = pegarOpcao(resto, 'amostras')
    if (!arquivo) throw new Error('--amostras <arquivo.json> é obrigatório')
    const semente = Number(pegarOpcao(resto, 'semente') ?? 1)
    const r = gerarFormulario({
      amostras: JSON.parse(readFileSync(arquivo, 'utf8')),
      semente,
      saida: pegarOpcao(resto, 'saida'),
    })
    console.log(
      `formulário: ${path.join(r.pastaDeEscuta, 'formulario.html')}\nchave (NÃO entregar a ouvintes): ${r.arquivoDaChave}`,
    )
  } else if (modo === 'resumir') {
    const csv = pegarOpcao(resto, 'csv')
    const chaveArq = pegarOpcao(resto, 'chave')
    if (!csv || !chaveArq) throw new Error('--csv e --chave são obrigatórios')
    const linhas = lerCsvDeEscuta(readFileSync(csv, 'utf8'))
    const chave = JSON.parse(readFileSync(chaveArq, 'utf8'))
    const resumo = resumirEscuta(linhas, chave)
    const ouvintesSuspeitos = avaliarOuvintes(linhas, chave)
    const pasta = pastaDeSaida({ motor: 'resumo-escuta', saida: pegarOpcao(resto, 'saida') })
    mkdirSync(pasta, { recursive: true })
    writeFileSync(path.join(pasta, 'resumo.json'), `${JSON.stringify({ vozes: resumo, ouvintesSuspeitos }, null, 2)}\n`)
    writeFileSync(path.join(pasta, 'resumo.csv'), csvDoResumo(resumo))
    console.log(
      `resumo em ${pasta}; ouvintes suspeitos: ${ouvintesSuspeitos.map((o) => o.ouvinte).join(', ') || 'nenhum'}`,
    )
  } else {
    throw new Error('uso: gerar-formulario.mjs gerar|resumir (veja o cabeçalho do arquivo)')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal(process.argv.slice(2)).catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
