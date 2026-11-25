#!/usr/bin/env node
/**
 * SIMULADOR OFFLINE DAS REGRAS DE EXIBIÇÃO DO PARCIAL VIVO (ciclo 3, método rápido do laboratório).
 *
 * Lê as gravações da bancada (`bancada-captura.mjs --gravar-hipoteses` → `<saida>/hipoteses/<rotulo>.json`) e, para cada POLÍTICA
 *   modo (cauda-token | cauda-decode | sem-cauda | acrescenta-decode | acrescenta-token)
 *   × máscara k (0..3; só conta nos modos `acrescenta-*`)
 *   × intervalo do limitador (0 = sem | 125 | 250 ms)
 *   × subamostragem da cadência (x1 = todos os decodes | x2 | x3 = 1 a cada 2 ou 3),
 * reproduz a sequência de quadros da tela com as MESMAS funções puras de `src/core` (`simularExibicao`: localAgreement, modoDeParciais,
 * limitadorDeParcial) e mede com as MESMAS de `medidasDeParcial` (via `medidasDaFala`, a conta da bancada real):
 *   atraso por palavra p50 e p90 · erasure (Σ apagadas ÷ Σ palavras finais) · quadros por segundo de fala (proxy de renders) ·
 *   hora do texto final (fim da voz → texto final na tela) · fim da voz → 1ª vez que o texto final aparece (p75, a guarda do final).
 *
 *   node scripts/perf/latencia-legenda/simular-exibicao.mjs --gravacoes DIR [--grupo TEXTO] [--modos a,b] [--mascaras 0,1,2,3]
 *        [--intervalos 0,125,250] [--subamostras 1,2,3] [--erasure-max 0.5] [--top 15] [--json saida.json] [--md saida.md] [--validar]
 *
 * PLACAR (regras do dono): entram na disputa só as políticas com erasure média ≤ `--erasure-max` (0,5); entre elas, a primária é o
 * atraso p50 (menor é melhor), depois o p90 e a erasure. As que passam do limite vêm depois, marcadas `acima da erasure`.
 *
 * O FINAL NÃO DEPENDE DA POLÍTICA: ele escreve direto na tela e cancela o limitador (`simularExibicao`). A saída confere isso: a coluna
 * `final` é a mesma em toda linha e o aviso `final idêntico em todas as políticas` falha alto se algum dia não for.
 *
 * `--validar`: simula a política que estava LIGADA na gravação (`politicaGravada`) e compara com a tela real da mesma rodada.
 * Ver `docs/auditoria/2026-11-24-simulador-de-exibicao.md`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { simularExibicao } from '../../../src/core/legendas/exibicaoDoParcial.ts'
import { tokenizar } from '../../../src/core/legendas/medidasDeParcial.ts'
import { medidasDaFala, percentilDe, resumirPalavras } from './palavras-da-fala.mjs'

export const MODOS = ['cauda-token', 'cauda-decode', 'sem-cauda', 'acrescenta-decode', 'acrescenta-token']
const ACRESCENTA = new Set(['acrescenta-decode', 'acrescenta-token'])
export const ERASURE_MAXIMA_PADRAO = 0.5

const finito = (x) => typeof x === 'number' && Number.isFinite(x)
const arredonda = (x, casas = 0) => (finito(x) ? Number(x.toFixed(casas)) : null)

/** Todas as políticas do produto cartesiano; a máscara só varia nos modos `acrescenta-*` (nos outros vale 0 e não tem efeito). */
export function politicasDe({
  modos = MODOS,
  mascaras = [0, 1, 2, 3],
  intervalos = [0, 125, 250],
  subamostras = [1, 2, 3],
} = {}) {
  const saida = []
  for (const modo of modos)
    for (const mascara of ACRESCENTA.has(modo) ? mascaras : [0])
      for (const intervaloMs of intervalos)
        for (const subamostra of subamostras) saida.push({ modo, mascara, intervaloMs, subamostra })
  return saida
}

export const nomeDaPolitica = (p) =>
  `${p.modo}${ACRESCENTA.has(p.modo) ? ` k${p.mascara}` : ''} · lim ${p.intervaloMs ? `${p.intervaloMs} ms` : 'sem'} · x${p.subamostra}`

/** O relógio do arquivo de áudio → `performance.now()` da página. */
const relogioDe = (g) => (s) => g.ancoraMs + (s - g.bipeS) * 1000

/** Os quadros simulados no formato que a bancada lê (`{ t, o, tr }`); o original visível é `o`. */
const quadrosDaBancada = (quadros) => quadros.map((q) => ({ t: q.t, o: q.texto, tr: '' }))

/**
 * Simula UMA política sobre todas as falas das gravações.
 * @returns {{ medidas: any[], finais: Map<string, string>, quadros: number, segundosDeFala: number, finalMs: number[] }}
 */
export function simularPolitica(gravacoes, politica) {
  const medidas = []
  const finais = new Map()
  const finalMs = []
  let quadros = 0
  let segundosDeFala = 0
  for (const g of gravacoes) {
    const tDoArquivo = relogioDe(g)
    for (const f of g.falas) {
      const sim = simularExibicao(f.eventos, politica)
      medidas.push(medidasDaFala(f, quadrosDaBancada(sim.quadros), tDoArquivo))
      quadros += sim.quadros.length
      segundosDeFala += Math.max(0, f.fimS - f.iniS)
      finais.set(
        `${g.rotulo}#${f.k}`,
        `${sim.finalEm === null ? 'nunca' : Math.round(sim.finalEm)}|${sim.textoFinal ?? ''}`,
      )
      if (sim.finalEm !== null) finalMs.push(Math.round(sim.finalEm - tDoArquivo(f.fimS)))
    }
  }
  return { medidas, finais, quadros, segundosDeFala, finalMs }
}

/** Um resumo (uma linha da tabela) a partir do que `simularPolitica` devolveu. */
export function resumirPolitica(politica, r) {
  const palavras = resumirPalavras(r.medidas.map((m) => ({ palavras: m })))
  const fimAteOriginal = r.medidas.map((m) => m.fimDaFalaAteOriginal).filter(finito)
  return {
    politica,
    nome: nomeDaPolitica(politica),
    atrasoP50Ms: arredonda(palavras.atrasoDePalavraMs.original.p50),
    atrasoP90Ms: arredonda(palavras.atrasoDePalavraMs.original.p90),
    palavrasNoCalculo: palavras.atrasoDePalavraMs.original.n,
    erasure: arredonda(palavras.erasureOriginal.ne, 3),
    quadrosPorSDeFala: r.segundosDeFala ? arredonda(r.quadros / r.segundosDeFala, 1) : null,
    finalP50Ms: arredonda(percentilDe(r.finalMs, 50)),
    fimAteOriginalP75Ms: arredonda(percentilDe(fimAteOriginal, 75)),
  }
}

/**
 * Ordena pelo placar do dono: com erasure ≤ máx entram primeiro, por atraso p50 (depois p90, erasure); as demais depois, por erasure.
 * Política sem atraso medido (nenhuma palavra no cálculo) vai ao fim do seu bloco.
 */
export function ordenarPeloPlacar(linhas, erasureMax = ERASURE_MAXIMA_PADRAO) {
  const dentro = (l) => finito(l.erasure) && l.erasure <= erasureMax
  const ou = (x) => (finito(x) ? x : Infinity)
  const ordenadas = [...linhas].sort((a, b) => {
    if (dentro(a) !== dentro(b)) return dentro(a) ? -1 : 1
    if (dentro(a))
      return (
        ou(a.atrasoP50Ms) - ou(b.atrasoP50Ms) || ou(a.atrasoP90Ms) - ou(b.atrasoP90Ms) || ou(a.erasure) - ou(b.erasure)
      )
    return ou(a.erasure) - ou(b.erasure) || ou(a.atrasoP50Ms) - ou(b.atrasoP50Ms)
  })
  return ordenadas.map((l, i) => ({ ...l, posicao: i + 1, estado: dentro(l) ? 'ok' : 'acima da erasure' }))
}

/** Roda todas as políticas sobre um conjunto de gravações (as de um mesmo grupo) e devolve a tabela ordenada + a confirmação do final. */
export function simularGrupo(gravacoes, politicas, erasureMax = ERASURE_MAXIMA_PADRAO) {
  let referencia = null
  let finalIdentico = true
  const linhas = []
  for (const politica of politicas) {
    const r = simularPolitica(gravacoes, politica)
    if (!referencia) referencia = r.finais
    else for (const [chave, v] of r.finais) if (referencia.get(chave) !== v) finalIdentico = false
    linhas.push(resumirPolitica(politica, r))
  }
  return {
    rodadas: gravacoes.length,
    falas: gravacoes.reduce((s, g) => s + g.falas.length, 0),
    finalIdentico,
    linhas: ordenarPeloPlacar(linhas, erasureMax),
  }
}

// ───────────────────────────── validação contra a tela real da MESMA rodada ─────────────────────────────

const chaveDoTexto = (s) => tokenizar(s ?? '').join(' ')
/** A sequência de textos distintos (consecutivos iguais viram um) de uma série de quadros `{ o, tr }`. */
export function sequenciaDeTextos(quadros) {
  const saida = []
  for (const q of quadros) {
    const c = chaveDoTexto(/[\p{L}\p{N}]/u.test(q.o ?? '') ? q.o : q.tr)
    if (c && saida[saida.length - 1] !== c) saida.push(c)
  }
  return saida
}

const medianaDe = (xs) => percentilDe(xs, 50)

/**
 * Compara, por fala, a tela simulada (política gravada) com a tela real da rodada.
 *   - `sequenciaIgual`: os textos distintos, na ordem, são os mesmos;
 *   - `deslocamentoMs`: nos quadros alinhados (mesma posição na sequência), tela real (`tf ?? t`) − tela simulada; a mediana mostra o
 *     atraso fixo do navegador (timer + quadro), o p90 do módulo mostra o jitter;
 *   - atraso p50 e erasure de cada lado, e a diferença.
 * Limiares sugeridos (a etapa de validação os confirma): sequência igual em ≥ 90% das falas, |Δ erasure| ≤ 0,05, |Δ atraso p50| ≤ 100 ms
 * (a resolução da bancada) e mediana do deslocamento entre 0 e 100 ms.
 */
export function validarContraAReal(gravacoes) {
  let falas = 0
  let iguais = 0
  const deslocamentos = []
  const divergentes = []
  const sims = []
  const reais = []
  for (const g of gravacoes) {
    const tDoArquivo = relogioDe(g)
    for (const f of g.falas) {
      if (!f.reais?.length) continue
      falas++
      const sim = simularExibicao(f.eventos, g.politicaGravada)
      const quadrosSim = quadrosDaBancada(sim.quadros)
      const seqSim = sequenciaDeTextos(quadrosSim)
      const seqReal = sequenciaDeTextos(f.reais)
      const igual = seqSim.length === seqReal.length && seqSim.every((c, i) => c === seqReal[i])
      if (igual) {
        iguais++
        // quadros alinhados: o 1º quadro de cada texto distinto, nas duas telas
        const primeiros = (qs) => {
          const vistos = []
          let ultimo = ''
          for (const q of qs) {
            const c = chaveDoTexto(/[\p{L}\p{N}]/u.test(q.o ?? '') ? q.o : q.tr)
            if (c && c !== ultimo) vistos.push(q.tf ?? q.t)
            if (c) ultimo = c
          }
          return vistos
        }
        const a = primeiros(f.reais)
        const b = primeiros(quadrosSim)
        a.forEach((t, i) => deslocamentos.push(t - b[i]))
      } else divergentes.push({ rotulo: g.rotulo, k: f.k, real: seqReal.length, simulada: seqSim.length })
      reais.push(medidasDaFala(f, f.reais, tDoArquivo))
      sims.push(medidasDaFala(f, quadrosSim, tDoArquivo))
    }
  }
  const r = resumirPalavras(reais.map((m) => ({ palavras: m })))
  const s = resumirPalavras(sims.map((m) => ({ palavras: m })))
  const dErasure =
    finito(s.erasureOriginal.ne) && finito(r.erasureOriginal.ne) ? s.erasureOriginal.ne - r.erasureOriginal.ne : null
  const dAtraso =
    finito(s.atrasoDePalavraMs.original.p50) && finito(r.atrasoDePalavraMs.original.p50)
      ? s.atrasoDePalavraMs.original.p50 - r.atrasoDePalavraMs.original.p50
      : null
  const fracaoIgual = falas ? iguais / falas : null
  const medDesloc = medianaDe(deslocamentos)
  return {
    falas,
    sequenciaIgual: iguais,
    fracaoIgual: arredonda(fracaoIgual, 3),
    deslocamentoMedianoMs: arredonda(medDesloc),
    deslocamentoP90Ms: arredonda(percentilDe(deslocamentos.map(Math.abs), 90)),
    atrasoP50Ms: {
      real: arredonda(r.atrasoDePalavraMs.original.p50),
      simulado: arredonda(s.atrasoDePalavraMs.original.p50),
      diferenca: arredonda(dAtraso),
    },
    erasure: {
      real: arredonda(r.erasureOriginal.ne, 3),
      simulada: arredonda(s.erasureOriginal.ne, 3),
      diferenca: arredonda(dErasure, 3),
    },
    divergentes: divergentes.slice(0, 20),
    ok:
      falas > 0 &&
      fracaoIgual >= 0.9 &&
      finito(dErasure) &&
      Math.abs(dErasure) <= 0.05 &&
      finito(dAtraso) &&
      Math.abs(dAtraso) <= 100 &&
      finito(medDesloc) &&
      medDesloc >= 0 &&
      medDesloc <= 100,
  }
}

// ───────────────────────────── entrada e saída ─────────────────────────────

/** Lê as gravações (`*.json`) de uma pasta e as agrupa pelo rótulo sem o `.rN` (ex.: `v7-pt.desktop`). */
export function lerGravacoes(dir) {
  if (!existsSync(dir)) throw new Error(`pasta de gravações não existe: ${dir}`)
  const grupos = new Map()
  for (const nome of readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const g = JSON.parse(readFileSync(path.join(dir, nome), 'utf8'))
    if (g.versao !== 1) throw new Error(`${nome}: versão de gravação desconhecida (${g.versao})`)
    const grupo = String(g.rotulo).replace(/\.r\d+$/, '')
    if (!grupos.has(grupo)) grupos.set(grupo, [])
    grupos.get(grupo).push(g)
  }
  return grupos
}

const fmt = (x, sufixo = '') => (finito(x) ? `${x}${sufixo}` : '—')

export function tabelaMarkdown(res, top = 15) {
  const cab =
    '| # | política | atraso p50 (ms) | atraso p90 (ms) | erasure | quadros/s de fala | final p50 (ms após o fim da voz) | fim da voz → texto final visto, p75 (ms) | estado |\n|---|---|---|---|---|---|---|---|---|'
  const linhas = res.linhas
    .slice(0, top)
    .map(
      (l) =>
        `| ${l.posicao} | ${l.nome} | ${fmt(l.atrasoP50Ms)} | ${fmt(l.atrasoP90Ms)} | ${fmt(l.erasure)} | ${fmt(l.quadrosPorSDeFala)} | ${fmt(l.finalP50Ms)} | ${fmt(l.fimAteOriginalP75Ms)} | ${l.estado} |`,
    )
  return [cab, ...linhas].join('\n')
}

function lerArgs(argv) {
  const opt = (n, d) => {
    const i = argv.indexOf(`--${n}`)
    return i > -1 && argv[i + 1] !== undefined ? argv[i + 1] : d
  }
  const lista = (n, d) =>
    String(opt(n, d))
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  const numeros = (n, d) => lista(n, d).map(Number)
  const modos = lista('modos', MODOS.join(','))
  for (const m of modos) if (!MODOS.includes(m)) throw new Error(`--modos: "${m}" desconhecido (${MODOS.join(', ')})`)
  return {
    dir: opt('gravacoes', ''),
    grupo: opt('grupo', ''),
    politicas: politicasDe({
      modos,
      mascaras: numeros('mascaras', '0,1,2,3'),
      intervalos: numeros('intervalos', '0,125,250'),
      subamostras: numeros('subamostras', '1,2,3'),
    }),
    erasureMax: Number(opt('erasure-max', ERASURE_MAXIMA_PADRAO)),
    top: Number(opt('top', 15)),
    json: opt('json', ''),
    md: opt('md', ''),
    validar: argv.includes('--validar'),
  }
}

function principal() {
  const a = lerArgs(process.argv.slice(2))
  if (!a.dir)
    throw new Error(
      'uso: simular-exibicao.mjs --gravacoes DIR [--grupo TEXTO] [--validar] (ver o cabeçalho do arquivo)',
    )
  const grupos = [...lerGravacoes(path.resolve(a.dir)).entries()].filter(([nome]) => nome.includes(a.grupo))
  if (!grupos.length) throw new Error(`nenhuma gravação em ${a.dir}${a.grupo ? ` para o grupo "${a.grupo}"` : ''}`)
  const saida = { parametros: { politicas: a.politicas.length, erasureMax: a.erasureMax }, grupos: {} }
  const md = []
  const escrever = (t) => {
    console.log(t)
    md.push(t)
  }
  for (const [nome, gravacoes] of grupos) {
    const res = simularGrupo(gravacoes, a.politicas, a.erasureMax)
    saida.grupos[nome] = { ...res }
    escrever(
      `\n### ${nome}: ${res.rodadas} rodadas, ${res.falas} falas, ${a.politicas.length} políticas (erasure máxima ${a.erasureMax})\n`,
    )
    escrever(
      res.finalIdentico
        ? 'Final idêntico em todas as políticas (mesmo texto, mesma hora): o placar não mexe no final.\n'
        : 'ATENÇÃO: o final DIFERE entre políticas (não deveria; confira `simularExibicao`).\n',
    )
    escrever(tabelaMarkdown(res, a.top))
    if (a.validar) {
      const v = validarContraAReal(gravacoes)
      saida.grupos[nome].validacao = v
      escrever(
        `\nValidação contra a tela real (política gravada): sequência de textos igual em ${v.sequenciaIgual}/${v.falas} falas; deslocamento mediano ${fmt(v.deslocamentoMedianoMs, ' ms')} (|p90| ${fmt(v.deslocamentoP90Ms, ' ms')}); atraso p50 real ${fmt(v.atrasoP50Ms.real)} × simulado ${fmt(v.atrasoP50Ms.simulado)} ms; erasure real ${fmt(v.erasure.real)} × simulada ${fmt(v.erasure.simulada)}; ${v.ok ? 'DENTRO' : 'FORA'} dos limiares.`,
      )
    }
  }
  if (a.json) writeFileSync(a.json, JSON.stringify(saida, null, 1))
  if (a.md) writeFileSync(a.md, md.join('\n') + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    principal()
  } catch (e) {
    console.error(`simular-exibicao: ${e.message}`)
    process.exit(1)
  }
}
