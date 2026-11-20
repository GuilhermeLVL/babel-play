/**
 * JUIZ DO ELENCO (M5): LLM-as-judge de "quem fala e com que emoção, por frase", SEM créditos de API.
 *
 * Só usa as CLIs locais já logadas: `claude -p` e `agy -p` (no máximo 3 chamadas ao mesmo tempo, com alarme e
 * retentativa). SÓ o conjunto de ouro ORIGINAL (`tests/fixtures/elenco/ouro.json`) vai aos modelos: nunca texto de
 * livro protegido nem dado de usuário. As respostas ficam em cache em `$CLAUDE_JOB_DIR/tmp/juiz-elenco/` (não versionar).
 *
 * Modos (rode com `npx tsx scripts/avatar/juiz-elenco.mjs <modo> [opções]`):
 *   heuristica                 métricas da heurística contra o ouro (sem LLM)
 *   rotular --por claude|agy   o modelo marca o ouro (candidato "IA"); saída validada por `validarMarcacaoDaIa`
 *   julgar  --ia claude|agy --juizes claude,agy
 *                              métricas heurística × IA × ouro e rubrica fixa dos juízes (candidatos EMBARALHADOS e
 *                              SEM o ouro); tabela, divergência entre juízes e lista de tarefas
 *   tudo                       rotular (claude e agy) + julgar
 *
 * O JUIZ NUNCA APROVA SOZINHO: passar nos limiares é "necessário, não suficiente". Cada falha vira uma tarefa na lista
 * de saída e o código de saída é 1. A aprovação para ligar a IA continua sendo do dono, com o teste e a revisão.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { validarMarcacaoDaIa } from '../../src/core/avatar/elenco/index.ts'
import {
  calcularMetricas,
  carregarOuro,
  efetiva,
  fmt,
  marcarPassagem,
  nomeDoFalante,
} from '../../tests/harness/metricasDoElenco.ts'

/* ── Argumentos e pastas ── */

const [modo = 'ajuda', ...resto] = process.argv.slice(2)
const arg = (nome, padrao) => {
  const i = resto.indexOf(`--${nome}`)
  return i >= 0 && resto[i + 1] ? resto[i + 1] : padrao
}
const pasta = join(process.env.CLAUDE_JOB_DIR ?? tmpdir(), 'tmp', 'juiz-elenco')
mkdirSync(pasta, { recursive: true })

/** Quem rotula e quem julga: famílias DIFERENTES do candidato, para o juiz não preferir o próprio estilo. */
const MODELOS = {
  claude: { cli: 'claude', rotulador: 'sonnet', juiz: 'opus' },
  agy: { cli: 'agy', rotulador: 'gemini-3.8-flash-medium', juiz: 'gemini-4-argon-medium' },
}
const CONCORRENCIA = 3
const ALARME_MS = 240_000
const TENTATIVAS = 2

/**
 * Limiares para CONSIDERAR ligar a IA (necessários, não suficientes). Justificativa em
 * `docs/pesquisa/2026-10-28-avatar-elenco-juiz.md`.
 */
export const LIMIARES = {
  falanteExplicito: 0.95,
  falanteGeral: 0.88,
  emocaoPrecisao: 0.8,
  emocaoGeral: 0.8,
  inventadas: 0,
  narradorViradoPersonagem: 0,
  /**
   * A IA tem de ganhar da heurística ONDE ELA É FRACA (frases sem pista explícita: alternância, pronome, epíteto,
   * emoção só sugerida); senão não vale o custo. O ganho na média geral é só informativo: o ouro é dominado por
   * frases fáceis para a heurística e dilui o ganho.
   */
  ganhoNoDificil: 0.1,
  /** Média da rubrica (0..2) por juiz. */
  rubrica: 1.6,
  concordanciaEntreJuizes: 0.7,
}

/* ── Fila de no máximo 3 chamadas ── */

let ativos = 0
const fila = []
async function vez() {
  if (ativos < CONCORRENCIA) {
    ativos++
    return
  }
  await new Promise((r) => fila.push(r))
  ativos++
}
function liberar() {
  ativos--
  fila.shift()?.()
}

function rodar(comando, argumentos, entrada) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, argumentos, { cwd: pasta, stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
    let saida = ''
    let erro = ''
    const alarme = setTimeout(() => {
      p.kill('SIGKILL')
      reject(new Error(`${comando}: alarme de ${ALARME_MS / 1000} s`))
    }, ALARME_MS)
    p.stdout.on('data', (d) => (saida += d))
    p.stderr.on('data', (d) => (erro += d))
    p.on('error', (e) => {
      clearTimeout(alarme)
      reject(e)
    })
    p.on('close', (codigo) => {
      clearTimeout(alarme)
      if (codigo === 0) resolve(saida)
      else reject(new Error(`${comando} saiu com ${codigo}: ${erro.slice(0, 300)}`))
    })
    if (entrada !== null) p.stdin.end(entrada)
    else p.stdin.end()
  })
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24)

function jsonDaResposta(texto) {
  const ini = texto.indexOf('{')
  const fim = texto.lastIndexOf('}')
  if (ini < 0 || fim <= ini) throw new Error('resposta sem JSON')
  return JSON.parse(texto.slice(ini, fim + 1))
}

/** Chama o modelo (com cache em disco, fila de 3, alarme e retentativa) e devolve o JSON da resposta. */
async function perguntar(quem, papel, prompt, valida) {
  const m = MODELOS[quem]
  const modelo = m[papel]
  const arquivo = join(pasta, `${quem}-${papel}-${sha(`${modelo}\n${prompt}`)}.json`)
  if (existsSync(arquivo)) {
    try {
      const guardado = JSON.parse(readFileSync(arquivo, 'utf8'))
      if (!valida || valida(guardado)) return guardado
    } catch {
      /* cache ilegível: refaz */
    }
  }
  let ultima
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    await vez()
    try {
      const bruto =
        m.cli === 'claude'
          ? await rodar(
              'claude',
              ['-p', '--safe-mode', '--tools', '', '--no-session-persistence', '--model', modelo],
              prompt,
            )
          : await rodar('agy', ['-p', prompt, '--model', modelo, '--print-timeout', `${ALARME_MS / 1000 - 10}s`], null)
      const json = jsonDaResposta(bruto)
      if (valida && !valida(json)) throw new Error('JSON fora do formato esperado')
      writeFileSync(arquivo, JSON.stringify(json))
      return json
    } catch (e) {
      ultima = e
      console.warn(`  · ${quem}/${papel} falhou (tentativa ${tentativa}): ${String(e.message).slice(0, 140)}`)
    } finally {
      liberar()
    }
  }
  throw ultima
}

/* ── O ouro e a trava de privacidade ── */

const ouro = carregarOuro()
if (ouro.passagens.some((p) => p.frases.some((f) => !f.nota && f.nota !== ''))) throw new Error('ouro malformado')
const NOME_DO_IDIOMA = { pt: 'português', en: 'inglês', es: 'espanhol' }

const EMOCOES = 'neutro, feliz, triste, bravo, surpreso, relaxado'

/** O que o modelo vê de uma passagem: o texto numerado e a lista de personagens. NUNCA o ouro. */
const passagemParaOModelo = (p) =>
  `Idioma: ${NOME_DO_IDIOMA[p.idioma]}\nPersonagens da ficha: ${JSON.stringify(p.personagens)}\nFrases:\n` +
  p.frases.map((f, i) => `${i}: ${f.texto}`).join('\n')

/* ── Rotular ── */

const promptDeRotular = (
  p,
) => `Você marca, frase a frase, QUEM FALA e COM QUE EMOÇÃO num trecho de livro, para uma voz sintética dar vozes diferentes às personagens.

Regras:
- "narrador": a frase é narração (inclui fala indireta: "ele disse que viria").
- "personagem": a frase é fala direta (aspas, travessão) de uma personagem. "nome" TEM de ser EXATAMENTE um nome da lista de personagens. NUNCA invente nome nem use outro fora da lista.
- "desconhecido": é fala direta, mas você não consegue dizer quem fala com razoável segurança. Na dúvida, use "desconhecido".
- Um nome DENTRO da fala ("— Ana, venha") é quem ouve, não quem fala.
- "emocao": uma de ${EMOCOES}. Use "neutro" sempre que não houver pista clara no texto (palavra, pontuação, verbo de fala, advérbio); errar para "neutro" é melhor que dramatizar. Narração é "neutro".
- "confianca": 0 a 1 (quão segura é a marcação).
Responda SOMENTE com JSON, sem comentário, no formato:
{"frases":[{"indice":0,"falante":"narrador|personagem|desconhecido","nome":null,"emocao":"neutro","confianca":0.9}]}
Uma entrada por frase, na mesma ordem e com o mesmo índice.

${passagemParaOModelo(p)}`

const formatoDeRotulos = (json) => Array.isArray(json?.frases) && json.frases.length > 0

async function rotular(quem) {
  const saida = []
  let inventadas = 0
  let faltantes = 0
  await Promise.all(
    ouro.passagens.map(async (p) => {
      const textos = p.frases.map((f) => f.texto)
      let json
      try {
        json = await perguntar(quem, 'rotulador', promptDeRotular(p), formatoDeRotulos)
      } catch (e) {
        console.warn(`  ✗ ${p.id}: sem rótulos (${String(e.message).slice(0, 80)})`)
        json = { frases: [] }
      }
      const r = validarMarcacaoDaIa(json, textos, p.personagens)
      inventadas += r.inventadas
      faltantes += r.faltantes
      saida[ouro.passagens.indexOf(p)] = { id: p.id, marcadas: r.marcadas, frasesDaIa: json.frases }
    }),
  )
  const arquivo = join(pasta, `rotulos-${quem}.json`)
  writeFileSync(arquivo, JSON.stringify({ quem, modelo: MODELOS[quem].rotulador, passagens: saida }, null, 1))
  console.log(
    `rótulos de ${quem} (${MODELOS[quem].rotulador}): ${arquivo} | citou fora da lista: ${inventadas} | frases sem rótulo: ${faltantes}`,
  )
  return arquivo
}

function carregarRotulos(quem) {
  const arquivo = join(pasta, `rotulos-${quem}.json`)
  if (!existsSync(arquivo)) throw new Error(`rode "rotular --por ${quem}" antes (${arquivo})`)
  return JSON.parse(readFileSync(arquivo, 'utf8'))
}

/** Frase sem rótulo da IA vale como narrador/neutro de confiança 0 (o que o app faria: voz do narrador). */
function marcadasDaIa(rotulos) {
  return ouro.passagens.map((p, pi) =>
    p.frases.map(
      (f, fi) =>
        rotulos.passagens[pi]?.marcadas?.[fi] ?? {
          indice: fi,
          texto: f.texto,
          falante: { tipo: 'narrador' },
          emocao: 'neutro',
          confianca: 0,
          semRotulo: true,
        },
    ),
  )
}

/* ── Julgar ── */

/** Deterministicamente embaralha quem é X e quem é Y por passagem, para o juiz não ter pista de posição. */
const heuristicaEhX = (id) => parseInt(sha(id).slice(0, 2), 16) % 2 === 0

const rotuloCurto = (m) => `${m.falante.tipo === 'personagem' ? m.falante.nome : m.falante.tipo}/${m.emocao}`

const promptDeJulgar = (
  p,
  X,
  Y,
) => `Você é um revisor rigoroso de marcação de elenco para audiolivro. Dois sistemas (X e Y) marcaram, frase a frase, QUEM FALA e COM QUE EMOÇÃO. Você NÃO sabe qual é humano nem qual é IA. Julgue cada marcação SOZINHA, lendo o texto.

Rubrica (nota 0, 1 ou 2 por item):
- "falante": 2 = correto (narração marcada "narrador"; fala direta com a personagem certa, ou "desconhecido" quando de fato não dá para saber); 1 = defensável/ambíguo; 0 = errado (personagem errada, narração tratada como fala, ou fala marcada "narrador").
- "emocao": 2 = plausível para o texto, ou "neutro" quando não há pista; 1 = discutível; 0 = implausível (emoção que o texto não sustenta, ou dramatização sem pista).
Por passagem, também:
- "inventou": true se o sistema usou como falante um nome que NÃO está na lista de personagens.
- "consistencia" (0 a 2): a mesma personagem recebe o mesmo tratamento ao longo da passagem e alternâncias de diálogo fazem sentido.

Responda SOMENTE com JSON, sem comentário fora dele:
{"frases":[{"indice":0,"x":{"falante":2,"emocao":2},"y":{"falante":2,"emocao":2}}],"passagem":{"x":{"inventou":false,"consistencia":2},"y":{"inventou":false,"consistencia":2}},"obs":"uma frase curta"}

Idioma: ${NOME_DO_IDIOMA[p.idioma]}
Personagens da ficha: ${JSON.stringify(p.personagens)}
Frases, com a marcação de cada sistema no formato falante/emoção:
${p.frases.map((f, i) => `${i}: ${f.texto}\n    X=${rotuloCurto(X[i])}   Y=${rotuloCurto(Y[i])}`).join('\n')}`

const formatoDeJulgamento = (n) => (json) =>
  Array.isArray(json?.frases) &&
  json.frases.length === n &&
  json.frases.every((f) =>
    [f?.x?.falante, f?.x?.emocao, f?.y?.falante, f?.y?.emocao].every((v) => [0, 1, 2].includes(v)),
  ) &&
  typeof json?.passagem?.x?.consistencia === 'number'

/** Só as frases SEM pista explícita: o que a heurística não promete. `falante` usa o que a pessoa ouviria. */
function subconjuntoDificil(marcadas) {
  let fa = 0
  let ft = 0
  let ea = 0
  let et = 0
  ouro.passagens.forEach((p, pi) =>
    p.frases.forEach((g, fi) => {
      const m = marcadas[pi][fi]
      if (g.pistaFalante !== 'explicita') {
        ft++
        if (efetiva(m).falante === g.falante) fa++
      }
      if (g.pistaEmocao !== 'explicita') {
        et++
        if (m.emocao === g.emocao) ea++
      }
    }),
  )
  return {
    falante: { acertos: fa, total: ft, taxa: ft ? fa / ft : 1 },
    emocao: { acertos: ea, total: et, taxa: et ? ea / et : 1 },
  }
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

async function julgar(ia, juizes) {
  const heuristica = ouro.passagens.map(marcarPassagem)
  const deIa = marcadasDaIa(carregarRotulos(ia))
  const mH = calcularMetricas(ouro, heuristica)
  const mI = calcularMetricas(ouro, deIa)

  /* Notas dos juízes: nota[juiz][passagem] = { h: [{falante, emocao}], i: [...], consH, consI, invH, invI } */
  const notas = {}
  for (const juiz of juizes) {
    notas[juiz] = await Promise.all(
      ouro.passagens.map(async (p, pi) => {
        const hX = heuristicaEhX(p.id)
        const X = hX ? heuristica[pi] : deIa[pi]
        const Y = hX ? deIa[pi] : heuristica[pi]
        let json
        try {
          json = await perguntar(juiz, 'juiz', promptDeJulgar(p, X, Y), formatoDeJulgamento(p.frases.length))
        } catch (e) {
          console.warn(`  ✗ ${juiz} não julgou ${p.id}: ${String(e.message).slice(0, 80)}`)
          return null
        }
        const porIndice = (lado) =>
          p.frases.map((_, i) => json.frases.find((f) => f.indice === i)?.[lado] ?? json.frases[i][lado])
        const h = porIndice(hX ? 'x' : 'y')
        const i = porIndice(hX ? 'y' : 'x')
        const pass = json.passagem
        return {
          h,
          i,
          consH: pass[hX ? 'x' : 'y'].consistencia,
          consI: pass[hX ? 'y' : 'x'].consistencia,
          invH: !!pass[hX ? 'x' : 'y'].inventou,
          invI: !!pass[hX ? 'y' : 'x'].inventou,
          obs: json.passagem.obs ?? json.obs ?? '',
        }
      }),
    )
  }

  const resumoDoJuiz = (juiz) => {
    const ok = notas[juiz].filter(Boolean)
    const frases = (lado, campo) => ok.flatMap((n) => n[lado].map((x) => x[campo]))
    return {
      passagensJulgadas: ok.length,
      falanteH: media(frases('h', 'falante')),
      falanteI: media(frases('i', 'falante')),
      emocaoH: media(frases('h', 'emocao')),
      emocaoI: media(frases('i', 'emocao')),
      consistenciaH: media(ok.map((n) => n.consH)),
      consistenciaI: media(ok.map((n) => n.consI)),
      inventouH: ok.filter((n) => n.invH).length,
      inventouI: ok.filter((n) => n.invI).length,
    }
  }
  const porJuiz = Object.fromEntries(juizes.map((j) => [j, resumoDoJuiz(j)]))

  /* Concordância entre os dois primeiros juízes: mesma nota em falante e emoção, por candidato e frase. */
  let concordancia = null
  if (juizes.length >= 2) {
    let iguais = 0
    let total = 0
    const [a, b] = juizes
    notas[a].forEach((na, pi) => {
      const nb = notas[b][pi]
      if (!na || !nb) return
      for (const lado of ['h', 'i']) {
        na[lado].forEach((x, fi) => {
          for (const c of ['falante', 'emocao']) {
            total++
            if (x[c] === nb[lado][fi][c]) iguais++
          }
        })
      }
    })
    concordancia = { entre: [a, b], taxa: total ? iguais / total : 0, iguais, total }
  }

  /* Onde a IA e a heurística erram contra o ouro (para o relatório). */
  const erros = (marcadas) => {
    const out = []
    ouro.passagens.forEach((p, pi) =>
      p.frases.forEach((g, fi) => {
        const m = marcadas[pi][fi]
        if (nomeDoFalante(m) !== g.falante || m.emocao !== g.emocao)
          out.push(
            `${p.id}#${fi} esperado ${g.falante}/${g.emocao} [${g.pistaFalante}/${g.pistaEmocao}] dado ${nomeDoFalante(m)}/${m.emocao} (${m.confianca}) "${g.texto.slice(0, 50)}"`,
          )
      }),
    )
    return out
  }

  /* Limiares: cada falha vira tarefa. */
  const tarefas = []
  const exige = (ok, texto) => {
    if (!ok) tarefas.push(texto)
  }
  exige(
    mI.falanteExplicito.taxa >= LIMIARES.falanteExplicito,
    `IA: falante com pista explícita ${fmt(mI.falanteExplicito)} < ${LIMIARES.falanteExplicito}`,
  )
  exige(mI.falante.taxa >= LIMIARES.falanteGeral, `IA: falante geral ${fmt(mI.falante)} < ${LIMIARES.falanteGeral}`)
  exige(
    mI.emocaoPrecisao.taxa >= LIMIARES.emocaoPrecisao,
    `IA: precisão da emoção ${fmt(mI.emocaoPrecisao)} < ${LIMIARES.emocaoPrecisao}`,
  )
  exige(mI.emocao.taxa >= LIMIARES.emocaoGeral, `IA: emoção geral ${fmt(mI.emocao)} < ${LIMIARES.emocaoGeral}`)
  exige(mI.inventadas <= LIMIARES.inventadas, `IA: ${mI.inventadas} personagem(ns) fora da ficha`)
  exige(
    mI.narradorViradoPersonagem <= LIMIARES.narradorViradoPersonagem,
    `IA: ${mI.narradorViradoPersonagem} narração(ões) marcada(s) como fala`,
  )
  const dH = subconjuntoDificil(heuristica)
  const dI = subconjuntoDificil(deIa)
  const ganhoMedio = (mI.falante.taxa + mI.emocao.taxa - mH.falante.taxa - mH.emocao.taxa) / 2
  const ganhoDificil = (dI.falante.taxa + dI.emocao.taxa - dH.falante.taxa - dH.emocao.taxa) / 2
  exige(
    ganhoDificil >= LIMIARES.ganhoNoDificil,
    `IA ganha só ${(ganhoDificil * 100).toFixed(1)} p.p. da heurística nas frases sem pista explícita (mínimo ${LIMIARES.ganhoNoDificil * 100})`,
  )
  for (const j of juizes) {
    const r = porJuiz[j]
    exige(
      (r.falanteI + r.emocaoI) / 2 >= LIMIARES.rubrica,
      `juiz ${j}: rubrica média da IA ${((r.falanteI + r.emocaoI) / 2).toFixed(2)} < ${LIMIARES.rubrica}`,
    )
    exige(r.inventouI === 0, `juiz ${j}: apontou invenção de personagem em ${r.inventouI} passagem(ns) da IA`)
  }
  if (concordancia)
    exige(
      concordancia.taxa >= LIMIARES.concordanciaEntreJuizes,
      `juízes divergem: concordância ${(concordancia.taxa * 100).toFixed(1)}% < ${LIMIARES.concordanciaEntreJuizes * 100}%`,
    )

  /* Relatório. */
  const linhas = []
  linhas.push(`# Juiz do elenco: heurística × IA (${ia}) × ouro`, '')
  linhas.push('| métrica (contra o ouro) | heurística | IA |', '|---|---|---|')
  for (const [rot, k] of [
    ['falante, pista explícita', 'falanteExplicito'],
    ['falante, todas', 'falante'],
    ['falante, só frases de personagem', 'falanteDePersonagem'],
    ['falante audível (confiança ≥ 0,5)', 'falanteAudivel'],
    ['emoção, pista explícita', 'emocaoExplicita'],
    ['emoção, todas', 'emocao'],
    ['emoção, precisão (quando marca)', 'emocaoPrecisao'],
    ['emoção, revocação (não neutras)', 'emocaoRevocacao'],
  ])
    linhas.push(`| ${rot} | ${fmt(mH[k])} | ${fmt(mI[k])} |`)
  linhas.push(`| SEM pista explícita: falante audível | ${fmt(dH.falante)} | ${fmt(dI.falante)} |`)
  linhas.push(`| SEM pista explícita: emoção | ${fmt(dH.emocao)} | ${fmt(dI.emocao)} |`)
  linhas.push(`| ganho médio geral (informativo) | | ${(ganhoMedio * 100).toFixed(1)} p.p. |`)
  linhas.push(`| ganho médio nas frases sem pista explícita | | ${(ganhoDificil * 100).toFixed(1)} p.p. |`)
  linhas.push(`| personagem fora da ficha | ${mH.inventadas} | ${mI.inventadas} |`)
  linhas.push(`| narração marcada como fala | ${mH.narradorViradoPersonagem} | ${mI.narradorViradoPersonagem} |`, '')
  linhas.push(
    '| rubrica (0 a 2, juiz cego ao ouro) | falante H | falante IA | emoção H | emoção IA | consistência H | consistência IA | inventou H | inventou IA |',
    '|---|---|---|---|---|---|---|---|---|',
  )
  for (const j of juizes) {
    const r = porJuiz[j]
    linhas.push(
      `| ${j} (${MODELOS[j].juiz}, ${r.passagensJulgadas}/${ouro.passagens.length} passagens) | ${r.falanteH.toFixed(2)} | ${r.falanteI.toFixed(2)} | ${r.emocaoH.toFixed(2)} | ${r.emocaoI.toFixed(2)} | ${r.consistenciaH.toFixed(2)} | ${r.consistenciaI.toFixed(2)} | ${r.inventouH} | ${r.inventouI} |`,
    )
  }
  if (concordancia)
    linhas.push(
      '',
      `Concordância entre ${concordancia.entre.join(' e ')}: ${(concordancia.taxa * 100).toFixed(1)}% (${concordancia.iguais}/${concordancia.total} notas iguais)`,
    )
  linhas.push('', '## Onde a heurística erra', ...erros(heuristica).map((e) => `- ${e}`))
  linhas.push('', `## Onde a IA (${ia}) erra`, ...erros(deIa).map((e) => `- ${e}`))
  for (const j of juizes) {
    linhas.push('', `## Observações do juiz ${j}`)
    notas[j].forEach((n, pi) => n?.obs && linhas.push(`- ${ouro.passagens[pi].id}: ${n.obs}`))
  }
  linhas.push(
    '',
    '## Tarefas (falhas dos limiares)',
    ...(tarefas.length
      ? tarefas.map((t) => `- [ ] ${t}`)
      : ['- (nenhuma falha de limiar; isso NÃO é aprovação: falta teste em staging e a decisão do dono)']),
  )
  const texto = linhas.join('\n') + '\n'
  const arquivo = join(pasta, `relatorio-${ia}.md`)
  writeFileSync(arquivo, texto)
  writeFileSync(
    join(pasta, `relatorio-${ia}.json`),
    JSON.stringify({ mH, mI, porJuiz, concordancia, tarefas, limiares: LIMIARES }, null, 1),
  )
  console.log(texto)
  console.log(`relatório salvo em ${arquivo}`)
  console.log(
    tarefas.length
      ? `${tarefas.length} tarefa(s) abertas; NÃO ligar a IA.`
      : 'Limiares atingidos (necessário, não suficiente): o dono decide.',
  )
  process.exitCode = tarefas.length ? 1 : 0
}

/* ── Execução ── */

function heuristica() {
  const m = calcularMetricas(ouro, ouro.passagens.map(marcarPassagem))
  for (const [k, v] of Object.entries(m)) console.log(k.padEnd(24), typeof v === 'number' ? v : fmt(v))
}

if (modo === 'heuristica') heuristica()
else if (modo === 'rotular') await rotular(arg('por', 'claude'))
else if (modo === 'julgar') await julgar(arg('ia', 'claude'), arg('juizes', 'claude,agy').split(','))
else if (modo === 'tudo') {
  await Promise.all([rotular('claude'), rotular('agy')])
  await julgar(arg('ia', 'claude'), arg('juizes', 'claude,agy').split(','))
} else {
  console.log(
    'Uso: npx tsx scripts/avatar/juiz-elenco.mjs heuristica | rotular --por claude|agy | julgar --ia claude --juizes claude,agy | tudo',
  )
}
