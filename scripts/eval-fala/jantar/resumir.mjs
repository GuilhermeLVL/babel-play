// Resume uma rodada do jantar.mjs: por turno e medianas. Uso: node resumir.mjs rodadas/<x> [...]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const med = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2)
}
for (const dir of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(path.join(dir, 'resultado.json'), 'utf8'))
  const tela = JSON.parse(readFileSync(path.join(dir, 'tela.json'), 'utf8'))
  const avisos = [...new Set(tela.map((x) => x.aviso.replace(/\d+%/, 'N%')).filter(Boolean))]
  const turnos = r.turnos.map((t) => {
    const lida = (t.tts || []).find((x) => !x.cancel)
    return {
      i: t.i,
      fala: t.fala,
      lado: t.lado,
      toques: t.toques,
      toqueAteMicProntoMs: t.toqueAteMicMs ?? null,
      falaDurMs: t.falaDurMs ?? null,
      fimDaFalaAteMicFecharMs: t.fimDaFalaAteMicFecharMs ?? null,
      fimDaFalaAteTraducaoMs: t.fimDaFalaAteTraducaoMs ?? null,
      fimDaFalaAteVozMs: t.fimDaFalaAteVozMs ?? null,
      toqueAteVozTerminarMs: t.toqueAteVozTerminarMs ?? null,
      vozDurMs: t.vozDurMs ?? null,
      traducaoNaTela: (t.traducaoPrimeira || '').split('\n')[0],
      lidoEmVoz: lida?.texto ?? null,
      vozUsada: lida?.voz ?? null,
      langDaVoz: lida?.lang ?? null,
      erroDaVoz: lida?.erro ?? null,
      falhou: t.falhou ?? null,
      /* conversa-de-verdade: a voz por cima de quem fala, o que a tela disse antes do fim da fala e o layout. */
      vozAntesDoMicFechar: t.vozAntesDoMicFechar ?? null,
      statusAntesDoFimDaFala: t.statusAntesDoPronto ?? null,
      fraseFinalLado: (t.fraseFinalLado || '').split('\n')[0],
      fraseFinalOutro: (t.fraseFinalOutro || '').split('\n')[0],
      layout: t.layout ?? null,
    }
  })
  const ok = turnos.filter((t) => !t.falhou)
  const resumo = {
    rodada: path.basename(dir),
    opcoes: r.opcoes,
    cargaAteBotaoMs: r.cargaAteBotaoMs,
    toquesTotais: r.toquesTotais,
    turnos: turnos.length,
    toquesPorTurno: +(r.toquesTotais / Math.max(1, turnos.length)).toFixed(2),
    toquesExtras: r.toquesExtras,
    troca: r.troca ?? null,
    mediana: {
      toqueAteMicProntoMs: med(ok.map((t) => t.toqueAteMicProntoMs)),
      fimDaFalaAteMicFecharMs: med(ok.map((t) => t.fimDaFalaAteMicFecharMs)),
      fimDaFalaAteTraducaoMs: med(ok.map((t) => t.fimDaFalaAteTraducaoMs)),
      fimDaFalaAteVozMs: med(ok.map((t) => t.fimDaFalaAteVozMs)),
      toqueAteVozTerminarMs: med(ok.map((t) => t.toqueAteVozTerminarMs)),
    },
    avisosVistos: avisos,
    /* CONV-09: "Ouvindo…" enquanto o reconhecimento ainda baixa (a tela diz que ouve sem poder ouvir). */
    ouvindoAntesDoPronto: (() => {
      const st = (x) => `${x.meu?.status || ''} ${x.outro?.status || ''}`
      const preparando = tela.filter((x) => /Preparando|Baixando o reconhecimento|guardada/.test(`${st(x)} ${x.aviso}`))
      const ultimoPreparo = preparando.length ? preparando[preparando.length - 1].t : null
      const ouvindo = tela.find((x) => /Ouvindo/.test(st(x)))
      return {
        ultimoPreparoMs: ultimoPreparo,
        primeiroOuvindoMs: ouvindo?.t ?? null,
        ouvindoComPreparo: tela.some(
          (x) => /Ouvindo/.test(st(x)) && /Baixando o reconhecimento|Preparando|guardada/.test(`${st(x)} ${x.aviso}`),
        ),
      }
    })(),
    lista: r.lista ?? null,
    vozesUsadas: [...new Set((r.ttsTodas || []).filter((x) => x.voz).map((x) => x.voz))],
    vozesPadraoDoSistema: (r.vozesDoSistema || []).filter((v) => v.padrao),
    gum: r.gum,
    turnosDetalhe: turnos,
  }
  writeFileSync(path.join(dir, 'resumo.json'), JSON.stringify(resumo, null, 1))
  console.log(
    JSON.stringify({
      rodada: resumo.rodada,
      toques: resumo.toquesTotais,
      turnos: resumo.turnos,
      mediana: resumo.mediana,
      avisos,
      vozes: resumo.vozesUsadas,
    }),
  )
}
