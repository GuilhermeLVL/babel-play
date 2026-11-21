#!/usr/bin/env node
/**
 * AVALIAÇÃO DO ROTEADOR ADAPTATIVO EM SOMBRA (E-005; openspec `roteador-adaptativo-em-sombra`, design §5 e "Como medir").
 * O critério está escrito ANTES da coleta em `docs/auditoria/2026-11-21-criterio-do-roteador-adaptativo.md`; este script só o
 * aplica aos dados que a bancada produzir. SEM DADO NÃO HÁ VEREDITO: com menos falas ou sessões que o mínimo, o resultado é
 * `dados insuficientes`, nunca "seguir".
 *
 *   node scripts/perf/latencia-legenda/avaliar-roteador.mjs --entrada dados.json [--json saida.json] [--md saida.md]
 *
 * ENTRADA (JSON; montada a partir das rodadas da bancada por rota e do `window.__roteadorSombra()` da sombra):
 *   { "usdPorHoraDeNuvem": 0.058,            // preço de 1 h de legenda na nuvem (custo-de-ia: transcrição + tradução)
 *     "sessoes": [ {
 *        "perfil": "adulto-consentiu" | "convidado" | "menor-sem-consentimento" | "adulto-sem-consentimento" | ...,
 *        "minutos": 12.5,                      // duração da sessão (para trocas por minuto)
 *        "falas": [ {
 *           "decisao": "manter" | "modelo-menor" | "nativo" | "nuvem",   // o que a SOMBRA tomaria nesta fala
 *           "efetiva": "modelo-no-aparelho",                              // degrau que a rota real usou
 *           "falaS": 4.2,                                                 // segundos de fala (para o custo)
 *           "latenciaPorRota": { "manter": 910, "modelo-menor": 740, "nuvem": 1300 }  // fimDaFalaAteLegendaMs, mesma fala, por rota
 *        } ] } ] }
 * `latenciaPorRota` só traz as rotas que a GUARDA permitiria (a melhor a posteriori sai desse conjunto).
 *
 * MÉTRICAS (design §5):
 *   - precisão: fração das falas em que a decisão coincide com a rota de menor latência, ou tem latência dentro de 10% dela;
 *   - trocas/min: mudanças de decisão entre falas consecutivas de uma sessão ÷ minutos (total e pior sessão);
 *   - custo/h: segundos de fala em que a decisão foi `nuvem` ÷ horas de sessão × `usdPorHoraDeNuvem`; vem ao lado o custo da
 *     rota efetiva e a diferença (o que a sombra ACRESCENTARIA);
 *   - rede indevida: decisões `nuvem` em sessão de convidado, de menor ou sem consentimento (precisa ser ZERO).
 * VEREDITO: `seguir` só com precisão ≥ 80%, ≤ 2 trocas/min, custo simulado ≤ US$ 0,058/h e zero rede indevida;
 * qualquer um falhar = `não sair da sombra`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CRITERIO = Object.freeze({
  precisaoMinima: 0.8,
  tolerancia: 0.1,
  trocasPorMinutoMaximas: 2,
  usdPorHoraMaximo: 0.058,
  minFalas: 200,
  minSessoes: 5,
})
export const DECISOES = ['manter', 'modelo-menor', 'nativo', 'nuvem']
const PERFIS_SEM_REDE = /^(convidado|menor|.*sem-consentimento.*)/

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

/** A melhor rota a posteriori entre as que a guarda permitiria: `{ rota, ms }`, ou `null` sem latência válida. */
export function melhorRotaAPosteriori(latenciaPorRota) {
  let melhor = null
  for (const [rota, ms] of Object.entries(latenciaPorRota ?? {})) {
    if (!finito(ms) || ms < 0) continue
    if (!melhor || ms < melhor.ms) melhor = { rota, ms }
  }
  return melhor
}

/** A decisão acertou? Mesma rota que a melhor, ou latência dentro da tolerância dela. `null` = fala sem como julgar. */
export function acertou(fala, tolerancia = CRITERIO.tolerancia) {
  const melhor = melhorRotaAPosteriori(fala.latenciaPorRota)
  if (!melhor) return null
  if (fala.decisao === melhor.rota) return true
  const ms = fala.latenciaPorRota?.[fala.decisao]
  if (!finito(ms)) return false // a decisão não tem medição: não acertou (e a falta fica visível em `semMedicao`)
  return ms <= melhor.ms * (1 + tolerancia)
}

/** Aplica o critério. Puro: a mesma entrada dá o mesmo resultado. */
export function avaliar(entrada, criterio = CRITERIO) {
  const preco = entrada.usdPorHoraDeNuvem
  if (!finito(preco) || preco <= 0) throw new Error('entrada: `usdPorHoraDeNuvem` obrigatório (preço do custo-de-ia)')
  const sessoes = Array.isArray(entrada.sessoes) ? entrada.sessoes : []
  let julgadas = 0
  let acertos = 0
  let semMedicao = 0
  let falas = 0
  let minutos = 0
  let trocas = 0
  let piorTrocasPorMin = 0
  let segNuvemSombra = 0
  let segNuvemEfetiva = 0
  let redeIndevida = 0
  const porDecisao = Object.fromEntries(DECISOES.map((d) => [d, 0]))
  for (const s of sessoes) {
    const fs = Array.isArray(s.falas) ? s.falas : []
    const min = finito(s.minutos) && s.minutos > 0 ? s.minutos : 0
    minutos += min
    let trocasDaSessao = 0
    let anterior = null
    for (const f of fs) {
      falas++
      if (f.decisao in porDecisao) porDecisao[f.decisao]++
      const r = acertou(f, criterio.tolerancia)
      if (r === null) semMedicao++
      else {
        julgadas++
        if (r) acertos++
      }
      if (anterior !== null && f.decisao !== anterior) trocasDaSessao++
      anterior = f.decisao
      const seg = finito(f.falaS) ? f.falaS : 0
      if (f.decisao === 'nuvem') {
        segNuvemSombra += seg
        if (PERFIS_SEM_REDE.test(String(s.perfil ?? ''))) redeIndevida++
      }
      if (String(f.efetiva ?? '').startsWith('nuvem')) segNuvemEfetiva += seg
    }
    trocas += trocasDaSessao
    if (min > 0) piorTrocasPorMin = Math.max(piorTrocasPorMin, trocasDaSessao / min)
  }
  const horas = minutos / 60
  const precisao = julgadas ? acertos / julgadas : null
  const trocasPorMin = minutos > 0 ? trocas / minutos : null
  const custoSimulado = horas > 0 ? (segNuvemSombra / 3600 / horas) * preco : null
  const custoEfetivo = horas > 0 ? (segNuvemEfetiva / 3600 / horas) * preco : null
  const insuficiente = julgadas < criterio.minFalas || sessoes.length < criterio.minSessoes || minutos <= 0
  const falhas = []
  if (precisao !== null && precisao < criterio.precisaoMinima) falhas.push('precisão')
  if (trocasPorMin !== null && trocasPorMin > criterio.trocasPorMinutoMaximas) falhas.push('trocas/min')
  if (custoSimulado !== null && custoSimulado > criterio.usdPorHoraMaximo) falhas.push('custo/h')
  if (redeIndevida > 0) falhas.push('rede indevida')
  const veredito = falhas.length
    ? 'não sair da sombra' // uma falha basta, mesmo com poucos dados
    : insuficiente
      ? 'dados insuficientes'
      : 'seguir'
  return {
    falas,
    falasJulgadas: julgadas,
    semMedicao,
    sessoes: sessoes.length,
    minutos,
    porDecisao,
    precisao,
    trocasPorMinuto: trocasPorMin,
    piorSessaoTrocasPorMinuto: piorTrocasPorMin,
    custoSimuladoUsdPorHora: custoSimulado,
    custoDaRotaEfetivaUsdPorHora: custoEfetivo,
    custoAdicionalUsdPorHora: custoSimulado !== null && custoEfetivo !== null ? custoSimulado - custoEfetivo : null,
    redeIndevida,
    falhas,
    veredito,
    criterio,
  }
}

const pct = (x) => (x === null ? 'n/d' : `${(x * 100).toFixed(1)}%`)
const num = (x, d = 3) => (x === null ? 'n/d' : x.toFixed(d))

/** O relatório em Markdown para `docs/auditoria/`. */
export function relatorio(r, { fonte = 'entrada' } = {}) {
  const c = r.criterio
  const ok = (cond) => (cond === null ? 'sem dado' : cond ? 'ok' : 'FALHA')
  return [
    `# Roteador adaptativo em sombra — avaliação (E-005)`,
    '',
    `Fonte: ${fonte}. Critério: \`docs/auditoria/2026-11-21-criterio-do-roteador-adaptativo.md\`.`,
    '',
    `**Veredito: ${r.veredito}**${r.falhas.length ? ` (falhou: ${r.falhas.join(', ')})` : ''}.`,
    '',
    `Amostra: ${r.falas} falas (${r.falasJulgadas} julgadas, ${r.semMedicao} sem medição), ${r.sessoes} sessões, ${num(r.minutos, 1)} min.` +
      (r.falasJulgadas < c.minFalas || r.sessoes < c.minSessoes
        ? ` Abaixo do mínimo (${c.minFalas} falas, ${c.minSessoes} sessões): sem veredito "seguir".`
        : ''),
    '',
    '| Métrica | Medido | Critério | |',
    '| --- | --- | --- | --- |',
    `| Precisão contra a melhor rota a posteriori | ${pct(r.precisao)} | ≥ ${pct(c.precisaoMinima)} | ${ok(r.precisao === null ? null : r.precisao >= c.precisaoMinima)} |`,
    `| Trocas por minuto (total; pior sessão ${num(r.piorSessaoTrocasPorMinuto, 2)}) | ${num(r.trocasPorMinuto, 2)} | ≤ ${c.trocasPorMinutoMaximas} | ${ok(r.trocasPorMinuto === null ? null : r.trocasPorMinuto <= c.trocasPorMinutoMaximas)} |`,
    `| Custo simulado (US$/h) | ${num(r.custoSimuladoUsdPorHora)} | ≤ ${c.usdPorHoraMaximo} | ${ok(r.custoSimuladoUsdPorHora === null ? null : r.custoSimuladoUsdPorHora <= c.usdPorHoraMaximo)} |`,
    `| Decisões de rede para convidado/menor/sem consentimento | ${r.redeIndevida} | 0 | ${ok(r.redeIndevida === 0)} |`,
    '',
    `Custo da rota efetiva: US$ ${num(r.custoDaRotaEfetivaUsdPorHora)}/h; acréscimo da sombra: US$ ${num(r.custoAdicionalUsdPorHora)}/h (informativo: o critério é sobre o custo simulado).`,
    '',
    `Decisões: ${Object.entries(r.porDecisao)
      .map(([d, n]) => `${d} ${n}`)
      .join(', ')}.`,
    '',
  ].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined)
  const arq = opt('entrada')
  if (!arq) {
    console.error('uso: avaliar-roteador.mjs --entrada dados.json [--json saida.json] [--md saida.md]')
    process.exit(2)
  }
  const r = avaliar(JSON.parse(readFileSync(arq, 'utf8')))
  const md = relatorio(r, { fonte: path.basename(arq) })
  console.log(md)
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(r, null, 2) + '\n')
  if (opt('md')) writeFileSync(opt('md'), md)
  process.exit(r.veredito === 'seguir' ? 0 : 1)
}
