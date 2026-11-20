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
 * LIMITE CONHECIDO: a taxa de amostragem e a duração dos WAVs continuam como canal lateral FRACO (motores
 * diferentes podem entregar taxas ou durações diferentes). Não reamostramos; para escuta séria, sintetize todos
 * na mesma taxa. A pasta de saída tem de estar vazia (nada é sobrescrito). Texto livre do CSV (apelido,
 * comentário) é protegido contra injeção de fórmula (prefixo `'`, desfeito na leitura).
 *
 * Retenção zero: o formulário não guarda nada no servidor; o CSV é baixado no navegador de quem ouve e só traz
 * apelido, nota e comentário.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { CLASSE_DO_JUIZ_PARA_ERRO_DO_CSV, IDIOMAS, pastaDeSaida, pegarOpcao } from './comum.mjs'

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
/** Caixas de erro grave do CSV: os valores da tabela única que o juiz de texto também usa (`comum.mjs`). */
const ERROS_GRAVES = Object.values(CLASSE_DO_JUIZ_PARA_ERRO_DO_CSV)
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
 * @returns {{ avisos: string[], itens: { voz_cega: string, arquivo: string, ancora?: true, repetida?: true, degradar?: true, frase_id?: string, idioma?: string }[], chave: Record<string, string> }}
 */
export function sortearCega(amostras, semente) {
  if (!Number.isInteger(semente) || semente < 0 || semente > 0xffffffff)
    throw new Error('semente deve ser um inteiro entre 0 e 4294967295')
  amostras.forEach((a, i) => {
    if (typeof a?.frase_id !== 'string' || !a.frase_id.trim())
      throw new Error(`amostras[${i}]: frase_id é obrigatório (identifica a frase no CSV)`)
  })
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
  const avisos = []
  if (brutos.length < 2)
    avisos.push(
      `só ${brutos.length} amostra(s): não há como incluir 2 frases repetidas (a checagem de consistência fica reduzida)`,
    )
  const repetidas = embaralhar(brutos, aleatorio)
    .slice(0, Math.min(2, brutos.length))
    .map((b) => ({ ...b, repetida: true, de: b.arquivo }))

  const todos = espalhar(embaralhar([...brutos, ancora, ...repetidas], aleatorio), aleatorio)
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
  return { itens, chave, avisos }
}

/**
 * Reparo determinístico da ordem: cada repetida fica a pelo menos `min(4, ⌊n/3⌋)` posições do original e a âncora
 * fora das 2 primeiras posições (o ouvinte ainda está se acostumando). Troca itens por posições sorteadas do MESMO
 * PRNG, até valer; com limite de tentativas (ordem quase impossível só em listas minúsculas).
 */
function espalhar(ordem, aleatorio) {
  const n = ordem.length
  const dmin = Math.max(1, Math.min(4, Math.floor(n / 3)))
  const ok = () => {
    const posAncora = ordem.findIndex((t) => t.ancora)
    if (n >= 3 && posAncora < 2) return false
    return ordem.every((t, i) => {
      if (!t.repetida) return true
      const o = ordem.findIndex((x) => !x.repetida && !x.ancora && x.arquivo === t.de)
      return Math.abs(i - o) >= dmin
    })
  }
  for (let tentativa = 0; tentativa < 20000 && !ok(); tentativa++) {
    const i = Math.floor(aleatorio() * n)
    const j = Math.floor(aleatorio() * n)
    ;[ordem[i], ordem[j]] = [ordem[j], ordem[i]]
  }
  return ordem
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
  const formato = fmt.readUInt16LE(0)
  if (formato !== 1 || bits !== 16)
    throw new Error(
      `degradarWav exige WAV PCM inteiro de 16 bits (veio formato ${formato === 3 ? '3 float' : formato === 0xfffe ? 'EXTENSIBLE' : formato}, ${bits} bits)`,
    )
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

/* ── Células do CSV: proteção contra injeção de fórmula ── */

/**
 * Texto livre (apelido, comentário) que começa com `=`, `+`, `-`, `@`, TAB ou CR vira fórmula ao abrir o CSV numa
 * planilha. Prefixamos um `'` (também quando o texto já começa com `'` + caractere perigoso, para a volta ser
 * exata). Roda no navegador (embutida no HTML via `toString`), por isso é autocontida.
 */
function protegerCelula(v) {
  v = String(v)
  return /^'*[=+\-@\t\r]/.test(v) ? "'" + v : v
}

/** Célula CSV (RFC 4180) já protegida. Autocontida pelo mesmo motivo. */
function campoCsv(v) {
  v = protegerCelula(v)
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}

/** Inverso de `protegerCelula`: tira UM `'` inicial só se vier seguido de caractere perigoso. */
function desprotegerCelula(v) {
  return /^'+[=+\-@\t\r]/.test(v) ? v.slice(1) : v
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
${protegerCelula.toString()}
${campoCsv.toString()}
function montarCsv(ouvinte,idioma,respostas){
  var linhas=[CABECALHO];
  respostas.forEach(function(r){
    linhas.push([ouvinte,idioma,r.frase,r.voz,r.n,r.c,r.erros,r.comentario].map(campoCsv).join(','));
  });
  return linhas.join('\\r\\n')+'\\r\\n';
}
if(typeof document!=='undefined'){document.getElementById('baixar').onclick=function(){
  var ouvinte=document.getElementById('ouvinte').value.trim(),idioma=document.getElementById('idioma').value.trim();
  if(!ouvinte){alert('Informe um apelido.');return}
  var respostas=[],pendente=0;
  document.querySelectorAll('.item').forEach(function(s){
    var n=s.querySelector('[name=naturalidade]').value,c=s.querySelector('[name=clareza]').value;
    if(!n||!c){pendente++;return}
    var erros=[].map.call(s.querySelectorAll('[name=erros]:checked'),function(e){return e.value}).join('|');
    respostas.push({frase:s.dataset.frase,voz:s.dataset.voz,n:n,c:c,erros:erros,comentario:s.querySelector('[name=comentario]').value});
  });
  if(pendente&&!confirm(pendente+' amostra(s) sem nota. Baixar assim mesmo?'))return;
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\\uFEFF'+montarCsv(ouvinte,idioma,respostas)],{type:'text/csv;charset=utf-8'}));
  a.download='escuta-'+ouvinte+'.csv';a.click();
};}
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
  const { itens, chave, avisos } = sortearCega(amostras, semente)
  for (const a of avisos) console.warn(`aviso: ${a}`)
  const pastaDeEscuta = pastaDeSaida({ motor: 'escuta', saida, env })
  const pastaDaChave = pastaDeSaida({
    motor: 'escuta-chave',
    saida: saida ? `${path.resolve(saida)}-chave` : undefined,
    env,
  })
  for (const pasta of [pastaDeEscuta, pastaDaChave]) {
    if (existsSync(pasta) && readdirSync(pasta).length > 0)
      throw new Error(`a pasta de saída não está vazia: ${pasta} (use outra --saida; nada foi sobrescrito)`)
  }
  // Tudo é lido, validado e convertido ANTES de gravar: falha não deixa pasta pela metade.
  const wavs = itens.map((it) => {
    if (!existsSync(it.arquivo)) throw new Error(`áudio não encontrado: ${it.arquivo}`)
    const bruto = readFileSync(it.arquivo)
    return [`${it.voz_cega}.wav`, it.degradar ? degradarWav(bruto) : limparWav(bruto)]
  })
  mkdirSync(pastaDeEscuta, { recursive: true })
  mkdirSync(pastaDaChave, { recursive: true })
  for (const [nome, conteudo] of wavs) writeFileSync(path.join(pastaDeEscuta, nome), conteudo)
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

  const vistas = new Map()
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
    const resultado = {
      ouvinte: desprotegerCelula(ouvinte.trim()),
      idioma: desprotegerCelula(idioma.trim()),
      frase_id: desprotegerCelula(frase_id.trim()),
      voz_cega: voz_cega.trim(),
      naturalidade: nota('naturalidade', nat),
      clareza: nota('clareza', cla),
      erros: erros
        .split('|')
        .map((e) => e.trim())
        .filter(Boolean),
      comentario: desprotegerCelula(comentario),
    }
    const id = `${idDoOuvinte(resultado.ouvinte)}|${resultado.frase_id}|${resultado.voz_cega}`
    if (vistas.has(id))
      throw new Error(
        `CSV: linhas ${vistas.get(id)} e ${linha} repetem ouvinte + frase_id + voz_cega (${resultado.ouvinte}, ${resultado.frase_id}, ${resultado.voz_cega})`,
      )
    vistas.set(id, linha)
    return resultado
  })
}

/* ── Resumo ── */

/** Identidade do ouvinte: sem espaços nas pontas e sem diferença de caixa ("Ana" e "ana " são a mesma pessoa). */
const idDoOuvinte = (nome) => nome.trim().normalize('NFC').toLowerCase()

function tipoDaChave(chave, voz_cega) {
  const v = chave[voz_cega]
  if (v === undefined) throw new Error(`voz_cega "${voz_cega}" não existe na chave`)
  if (v === MARCA_ANCORA) return { tipo: 'ancora' }
  if (v.startsWith(MARCA_REPETIDA)) return { tipo: 'repetida', de: v.slice(MARCA_REPETIDA.length) }
  return { tipo: 'voz', rotulo: v }
}

/**
 * Resume a escuta por motor/voz (chave `<motor>/<voz>` do `chave.json`), mais POR IDIOMA: a decisão do
 * motor é por idioma (spec §6.4) e uma voz pode ir bem em pt e mal em en.
 * - `naturalidade`: média das notas (1 a 5) de cada voz, `null` sem nota.
 * - `aguenta30`: fração das notas com naturalidade >= 4 e clareza >= 4 ("aguentaria 30 min").
 * - `errosGravesRepetidos`: nº de tipos DISTINTOS de erro grave (`ERROS_GRAVES`) citados por ≥ 2 ouvintes distintos
 *   para a mesma voz. O mesmo ouvinte repetindo o erro não soma.
 * - `porIdioma[pt|en|es]`: as mesmas quatro medidas só com as linhas daquele idioma, que é o PREFIXO do
 *   `frase_id` (`^(pt|en|es)-`). Linha cujo `frase_id` não tem prefixo reconhecido entra só nos totais (e
 *   `avisosDaEscuta` a lista). Idioma sem nota não aparece; voz sem nenhuma linha de idioma fica SEM a chave
 *   `porIdioma` (o `relatorio` lê ausente como "sem escuta").
 * Âncora e frases repetidas ficam fora de tudo.
 * @param {ReturnType<typeof lerCsvDeEscuta>} linhas
 * @param {Record<string, string>} chave
 *
 * Ouvintes são contados sem distinguir caixa/espaços. Voz da chave sem nenhuma nota sai com `ouvintes: 0` e
 * `naturalidade`/`aguenta30` `null` (nunca NaN).
 * @returns {Record<string, Medidas & { porIdioma?: Partial<Record<'pt'|'en'|'es', Medidas>> }>}
 *   com `Medidas = { naturalidade: number|null, aguenta30: number|null, errosGravesRepetidos: number, ouvintes: number }`
 */
export function resumirEscuta(linhas, chave) {
  const grupos = new Map()
  for (const v of Object.values(chave)) {
    if (v !== MARCA_ANCORA && !v.startsWith(MARCA_REPETIDA)) grupos.set(v, [])
  }
  for (const l of linhas) {
    const t = tipoDaChave(chave, l.voz_cega)
    if (t.tipo !== 'voz') continue
    if (!grupos.has(t.rotulo)) grupos.set(t.rotulo, [])
    grupos.get(t.rotulo).push(l)
  }
  const resumo = {}
  for (const [rotulo, ls] of grupos) {
    const porIdioma = {}
    for (const idioma of IDIOMAS) {
      const doIdioma = ls.filter((l) => idiomaDaFrase(l.frase_id) === idioma)
      if (doIdioma.length > 0) porIdioma[idioma] = medidasDaEscuta(doIdioma)
    }
    resumo[rotulo] = { ...medidasDaEscuta(ls), ...(Object.keys(porIdioma).length > 0 ? { porIdioma } : {}) }
  }
  return resumo
}

/** Idioma de uma linha da escuta: o prefixo do `frase_id` (`pt-dialogo` -> `pt`); `null` sem prefixo reconhecido. */
function idiomaDaFrase(fraseId) {
  const m = /^(pt|en|es)-/.exec(String(fraseId ?? ''))
  return m ? m[1] : null
}

/** As quatro medidas de um conjunto de linhas de UMA voz. */
function medidasDaEscuta(ls) {
  const porErro = new Map()
  for (const l of ls)
    for (const e of l.erros) {
      if (!ERROS_GRAVES.includes(e)) continue
      if (!porErro.has(e)) porErro.set(e, new Set())
      porErro.get(e).add(idDoOuvinte(l.ouvinte))
    }
  return {
    naturalidade: ls.length ? ls.reduce((a, l) => a + l.naturalidade, 0) / ls.length : null,
    aguenta30: ls.length ? ls.filter((l) => l.naturalidade >= 4 && l.clareza >= 4).length / ls.length : null,
    errosGravesRepetidos: [...porErro.values()].filter((o) => o.size >= 2).length,
    ouvintes: new Set(ls.map((l) => idDoOuvinte(l.ouvinte))).size,
  }
}

/**
 * Avisos da escuta: linhas de voz cujo `frase_id` não começa por `pt-`, `en-` ou `es-` (contam nos totais, mas
 * em nenhum idioma). Uma entrada por `frase_id` distinto.
 * @param {ReturnType<typeof lerCsvDeEscuta>} linhas
 * @param {Record<string, string>} chave
 * @returns {string[]}
 */
export function avisosDaEscuta(linhas, chave) {
  const ids = new Set()
  for (const l of linhas)
    if (tipoDaChave(chave, l.voz_cega).tipo === 'voz' && idiomaDaFrase(l.frase_id) === null) ids.add(l.frase_id)
  return [...ids].map(
    (id) => `frase_id "${id}" sem prefixo de idioma (pt-, en-, es-): conta só nos totais, em nenhum idioma`,
  )
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
  const nomes = new Map()
  const marcar = (o, m) => {
    const id = idDoOuvinte(o)
    if (!nomes.has(id)) nomes.set(id, o)
    motivos.set(id, [...(motivos.get(id) ?? []), m])
  }
  const nota = new Map(linhas.map((l) => [`${idDoOuvinte(l.ouvinte)}|${l.voz_cega}`, l.naturalidade]))
  for (const l of linhas) {
    const t = tipoDaChave(chave, l.voz_cega)
    if (t.tipo === 'ancora' && l.naturalidade >= 4)
      marcar(l.ouvinte, `deu naturalidade ${l.naturalidade} à âncora ruim`)
    if (t.tipo === 'repetida') {
      const original = nota.get(`${idDoOuvinte(l.ouvinte)}|${t.de}`)
      if (original !== undefined && Math.abs(original - l.naturalidade) >= 2)
        marcar(l.ouvinte, `frase repetida com notas ${original} e ${l.naturalidade} (diferença >= 2)`)
    }
  }
  return [...motivos].map(([id, m]) => ({ ouvinte: nomes.get(id), motivos: m }))
}

/** CSV do resumo (uma linha por motor/voz), com as células protegidas contra fórmula. Nota ausente sai vazia. */
export function csvDoResumo(resumo) {
  const num = (x) => (x === null ? '' : x.toFixed(2))
  const linhas = Object.entries(resumo).map(([k, r]) =>
    [k, num(r.naturalidade), num(r.aguenta30), r.errosGravesRepetidos, r.ouvintes].map(campoCsv).join(','),
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
    const avisos = avisosDaEscuta(linhas, chave)
    for (const a of avisos) console.warn(`aviso: ${a}`)
    const ouvintesSuspeitos = avaliarOuvintes(linhas, chave)
    const pasta = pastaDeSaida({ motor: 'resumo-escuta', saida: pegarOpcao(resto, 'saida') })
    mkdirSync(pasta, { recursive: true })
    writeFileSync(
      path.join(pasta, 'resumo.json'),
      `${JSON.stringify({ vozes: resumo, ouvintesSuspeitos, avisos }, null, 2)}\n`,
    )
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
