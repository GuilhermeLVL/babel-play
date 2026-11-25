/**
 * GRAVAÇÃO DAS HIPÓTESES POR FALA (ciclo 3): liga os eventos que o app guarda em `window.__hipoteses`
 * (`src/lib/captura/gravadorDeHipoteses.ts`) às falas do roteiro e monta o arquivo que o simulador lê.
 *
 * Formato (`hipoteses/<rotulo>.json`, versão 1):
 *   { versao, rotulo, politicaGravada: { modo, mascara, intervaloMs, subamostra }, ancoraMs, bipeS,
 *     falas: [{ k, iniS, fimS, referencia, palavras: [{ t, fimS }], alinhamento, seq, eventos: [...], reais: [{ t, tf, o, tr }] }] }
 * `eventos` são os do app (tempos em `performance.now()` da página); `reais` são os quadros do balão como a sonda os viu na MESMA rodada
 * (a tela real: serve à validação do simulador). O relógio do arquivo de áudio é `ancoraMs + (s − bipeS) × 1000`.
 *
 * O que cada fala leva é só números e o texto da fala de TESTE da bancada (fixture FLEURS), que já estava nas rodadas brutas.
 */
import {
  CHAVE_DA_MASCARA_DE_PARCIAIS,
  CHAVE_DO_MODO_DE_PARCIAIS,
  lerMascaraDeParciais,
  lerModoDeParciais,
} from '../../../src/core/legendas/modoDeParciais.ts'
import { fracaoCasada, tokenizar } from '../../../src/core/legendas/medidasDeParcial.ts'
import { acharAncoraDoBipe } from './analisar.mjs'
import { balaoDeCadaFala } from './palavras-da-fala.mjs'

export const VERSAO_DA_GRAVACAO = 1

/** A política que estava ligada no app durante a gravação (a do A/B da V7: modo padrão, máscara 2, limitador de 125 ms, todos os decodes). */
export const POLITICA_GRAVADA_PADRAO = { modo: 'acrescenta-decode', mascara: 2, intervaloMs: 125, subamostra: 1 }

/** A política que o app usou, a partir das chaves de laboratório do alvo (`--armazenamento-do-alvo`); ausentes valem os padrões do código. */
export function politicaDasChaves(chaves = {}) {
  return {
    ...POLITICA_GRAVADA_PADRAO,
    modo: lerModoDeParciais(chaves[CHAVE_DO_MODO_DE_PARCIAIS]),
    mascara: lerMascaraDeParciais(chaves[CHAVE_DA_MASCARA_DE_PARCIAIS]),
  }
}

/** Os eventos de uma fala por `seq`, em ordem de tempo (só os seqs que têm algum decode ou token). */
export function eventosPorSeq(eventos) {
  const porSeq = new Map()
  for (const e of eventos ?? []) {
    if (!porSeq.has(e.seq)) porSeq.set(e.seq, [])
    porSeq.get(e.seq).push(e)
  }
  for (const l of porSeq.values()) l.sort((a, b) => a.t - b.t)
  return porSeq
}

/**
 * Qual `seq` é de qual fala do roteiro: entre os seqs cuja 1ª hipótese cai na janela da fala [início da voz − 400 ms, início da próxima − 400 ms)
 * (a mesma janela de `balaoDeCadaFala`), o que tem texto final mais parecido com a referência. Só entram seqs com texto final.
 * @returns {Map<number, any[]>} k → eventos do seq
 */
export function eventosDeCadaFala(eventos, falas, tDoArquivo) {
  const seqs = [...eventosPorSeq(eventos).entries()]
    .map(([seq, lista]) => ({ seq, lista, t0: lista[0].t, final: lista.find((e) => e.tipo === 'final') }))
    .filter((x) => x.final)
  const saida = new Map()
  const usados = new Set()
  falas.forEach((f, idx) => {
    const de = tDoArquivo(f.iniS) - 400
    const ate = idx + 1 < falas.length ? tDoArquivo(falas[idx + 1].iniS) - 400 : Infinity
    const ref = tokenizar(f.referencia ?? '')
    let melhor = null
    let nota = -1
    for (const c of seqs) {
      if (usados.has(c.seq) || c.t0 < de || c.t0 >= ate) continue
      const n = fracaoCasada(ref, tokenizar(c.final.texto ?? ''))
      if (n > nota) {
        nota = n
        melhor = c
      }
    }
    if (melhor) {
      usados.add(melhor.seq)
      saida.set(f.k, melhor)
    }
  })
  return saida
}

/**
 * Monta a gravação de uma rodada bruta (`rodadas/<rotulo>.json`, com `hipoteses`).
 * @returns {{ valida: true, gravacao: object } | { valida: false, motivo: string }}
 */
export function montarGravacao(d, politicaGravada = POLITICA_GRAVADA_PADRAO) {
  if (!d.hipoteses?.length)
    return {
      valida: false,
      motivo:
        'sem hipóteses (chave babel.lab.gravarHipoteses ou parciais_vivos desligada, ou a rota não é a do Parakeet)',
    }
  const achada = acharAncoraDoBipe(d)
  if (!('ancoraMs' in achada)) return { valida: false, motivo: `${achada.motivo}: ${achada.detalhe}` }
  const bipeS = d.roteiro.bipeS
  const tDoArquivo = (s) => achada.ancoraMs + (s - bipeS) * 1000
  const falas = d.roteiro.falas
  const porFala = eventosDeCadaFala(d.hipoteses, falas, tDoArquivo)
  const baloes = balaoDeCadaFala(d.lat?.dom ?? [], falas, tDoArquivo)
  return {
    valida: true,
    gravacao: {
      versao: VERSAO_DA_GRAVACAO,
      rotulo: d.rotulo,
      politicaGravada,
      ancoraMs: achada.ancoraMs,
      bipeS,
      falas: falas
        .filter((f) => porFala.has(f.k))
        .map((f) => ({
          k: f.k,
          iniS: f.iniS,
          fimS: f.fimS,
          referencia: f.referencia,
          palavras: (f.palavras ?? []).map((p) => ({ t: p.t, fimS: p.fimS })),
          alinhamento: f.alinhamento ? { foraDoCalculo: !!f.alinhamento.foraDoCalculo } : undefined,
          seq: porFala.get(f.k).seq,
          eventos: porFala.get(f.k).lista,
          reais: (baloes.get(f.k) ?? []).map((r) => ({ t: r.t, tf: r.tf, o: r.o, tr: r.tr })),
        })),
    },
  }
}
