/**
 * A FERRAMENTA DO TESTE CEGO pt-BR (openspec `traducao-local-por-direcao`, D4, tarefa 4.3): gera o material e apura. NENHUM
 * teste usa pessoas: as respostas são sintéticas. O que se prende:
 *   - a planilha do avaliador não revela o sistema, o corpus nem a ordem do gabarito; o sorteio é determinístico;
 *   - as frases repetidas vão a todos (base do kappa) e as demais a um só, com todas as saídas de uma frase no mesmo avaliador;
 *   - protocolo alterado depois de gerar, ou planilha de outro lote, invalida a rodada;
 *   - kappa < 0,4 invalida; o veredito segue os limiares do spec (pt-PT < 10%, faixa 8–12% inconclusiva, qualidade sem piora).
 */
import { describe, expect, it } from 'vitest'

import { apurar, qualidadeChrf } from '../scripts/eval-fala/teste-cego-ptbr/apurar.mjs'
import { formularioHtml } from '../scripts/eval-fala/teste-cego-ptbr/gerar.mjs'
import {
  conferirLote,
  embaralhar,
  escolherFrases,
  escreverCsv,
  frasesElegiveis,
  hashDoProtocolo,
  kappaDeCohen,
  lerCsv,
  lerRespostas,
  loteDoProtocolo,
  montarLote,
  planilhaDoAvaliador,
  PROTOCOLO_PADRAO,
  veredito,
  wilson,
} from '../scripts/eval-fala/teste-cego-ptbr/nucleo.mjs'

const CONTROLE = 'local:opus-mt'
const CANDIDATO = 'bergamot:en-pt'

/** Brutos sintéticos no formato da bancada: gold (conversa) e fleurs (texto limpo), dois sistemas. */
function brutosFalsos(nConversa = 60, nLimpo = 60, mesmaSaida = true) {
  const caso = (
    id: string,
    sis: string,
    tipo: string,
  ): { id: string; origem: string; referencia: string; hipotese: string; erro?: string } => ({
    id,
    origem: `Source sentence ${tipo} ${id}`,
    referencia: `Referência em português ${tipo} ${id}.`,
    hipotese:
      mesmaSaida || sis === CONTROLE ? `Tradução em português ${tipo} ${id}.` : `Traducao portuguesa ${tipo} ${id}!`,
  })
  const res = (sis: string) => [
    {
      sistema: sis,
      corpus: 'gold:en-pt',
      casos: Array.from({ length: nConversa }, (_, i) => caso(`g${i}`, sis, 'gold')),
    },
    {
      sistema: sis,
      corpus: 'fleurs:en-pt',
      casos: Array.from({ length: nLimpo }, (_, i) => caso(`f${i}`, sis, 'fleurs')),
    },
  ]
  return [{ resultados: [...res(CONTROLE), ...res(CANDIDATO)] }]
}

const protocoloDe = (extra = {}) => ({ ...PROTOCOLO_PADRAO, sistemas: [CONTROLE, CANDIDATO], ...extra })

// Os `.mjs` da ferramenta não têm tipos: no modo estrito, o resultado é tratado como dado solto.
function gerar(protocolo = protocoloDe(), brutos = brutosFalsos()): any {
  const frases = escolherFrases(frasesElegiveis(brutos, protocolo.sistemas), protocolo)
  const lote = montarLote(frases, protocolo.sistemas, protocolo)
  const gabarito = {
    protocolo,
    protocoloSha256: hashDoProtocolo(protocolo),
    itens: lote.itens,
    avaliadores: lote.avaliadores,
    frasesRepetidas: lote.repetidas,
  }
  return { frases, lote, gabarito, brutos }
}

/** Preenche a planilha de um avaliador com a função `resposta(item) → [variante, nota]`. */
function preencher(csv: string, resposta: (item: string) => [string, number]) {
  const [cab, ...linhas] = lerCsv(csv)
  return escreverCsv([
    cab,
    ...linhas.map((l) => {
      const [v, n] = resposta(l[1])
      return [l[0], l[1], l[2], l[3], v, String(n)]
    }),
  ])
}

const planilhasPreenchidas = (
  g: ReturnType<typeof gerar>,
  resposta: (avaliador: string, item: string) => [string, number],
) =>
  g.gabarito.avaliadores.map((a: { id: string; itens: string[] }) => ({
    avaliador: a.id,
    texto: preencher(planilhaDoAvaliador(loteDoProtocolo(g.gabarito.protocolo), a, g.lote.itens), (item) =>
      resposta(a.id, item),
    ),
  }))

describe('sorteio e distribuição', () => {
  it('é determinístico: mesma semente, mesmo lote; semente diferente, lote diferente', () => {
    const a = gerar()
    const b = gerar()
    expect(JSON.stringify(a.gabarito)).toBe(JSON.stringify(b.gabarito))
    expect(JSON.stringify(gerar(protocoloDe({ semente: 7 })).gabarito.itens)).not.toBe(JSON.stringify(a.gabarito.itens))
  })

  it('50 frases de conversa e 50 de texto limpo, só as que todos os sistemas traduziram sem erro', () => {
    const { frases } = gerar()
    expect(frases.filter((f: { tipo: string }) => f.tipo === 'conversa')).toHaveLength(50)
    expect(frases.filter((f: { tipo: string }) => f.tipo === 'limpo')).toHaveLength(50)
    const brutos = brutosFalsos()
    brutos[0].resultados[0].casos[0].erro = 'falhou'
    brutos[0].resultados[1].casos[1].hipotese = '  '
    const chaves = frasesElegiveis(brutos, [CONTROLE, CANDIDATO]).map((f: { chave: string }) => f.chave)
    expect(chaves).not.toContain('gold:en-pt|g0')
    expect(chaves).not.toContain('fleurs:en-pt|f1')
    expect(chaves).toHaveLength(118)
  })

  it('faltando frases o erro é claro (nunca gera um teste menor em silêncio)', () => {
    expect(() => gerar(protocoloDe(), brutosFalsos(10, 60))).toThrow(/faltam frases de conversa/)
  })

  it('as frases repetidas vão a TODOS; as demais a um só; as saídas de uma frase ficam no mesmo avaliador', () => {
    const { gabarito, lote } = gerar(protocoloDe({ avaliadores: 3 }))
    expect(lote.repetidas).toHaveLength(20)
    const donoDe = new Map<string, Set<string>>()
    for (const a of gabarito.avaliadores)
      for (const id of a.itens) {
        const frase = gabarito.itens[id].frase
        donoDe.set(frase, (donoDe.get(frase) ?? new Set()).add(a.id))
      }
    expect(donoDe.size).toBe(100)
    for (const [frase, donos] of donoDe) expect(donos.size, frase).toBe(lote.repetidas.includes(frase) ? 3 : 1)
    // Todos os itens existem e cada item de frase não repetida aparece uma vez só.
    const todos = gabarito.avaliadores.flatMap((a: { itens: string[] }) => a.itens)
    expect(new Set(todos).size).toBe(200)
    expect(Object.keys(gabarito.itens)).toHaveLength(200)
  })

  it('cada avaliador vê numa ordem própria', () => {
    const { gabarito } = gerar()
    const [a1, a2] = gabarito.avaliadores.map((a: { itens: string[] }) =>
      a.itens.filter(
        (i: string) => gabarito.avaliadores[0].itens.includes(i) && gabarito.avaliadores[1].itens.includes(i),
      ),
    )
    expect(a1).toHaveLength(40)
    expect(a1).not.toEqual(a2)
  })

  it('a planilha e o formulário não vazam o sistema, o corpus nem o controle', () => {
    const g = gerar()
    for (const a of g.gabarito.avaliadores) {
      const csv = planilhaDoAvaliador(loteDoProtocolo(g.gabarito.protocolo), a, g.lote.itens)
      const html = formularioHtml(
        loteDoProtocolo(g.gabarito.protocolo),
        a.id,
        a.itens.map((id: string) => ({
          item: id,
          origem: g.lote.itens[id].origem,
          traducao: g.lote.itens[id].traducao,
        })),
      )
      for (const texto of [csv, html]) {
        expect(texto).not.toMatch(/opus|bergamot|gold:|fleurs:|wmt:|conversa|limpo|local:/i)
      }
      // Só o item opaco e o lote, nada de nome ou e-mail.
      expect(csv.split('\n')[0]).toBe('lote,item,frase_em_ingles,traducao,variante,naturalidade_1a5')
    }
  })

  it('o formulário não vira HTML com o texto da frase (</script> e aspas)', () => {
    const html = formularioHtml('abc', 'A1', [{ item: 'i1', origem: 'a </script><b>x</b> "q"', traducao: 'b' }])
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain('\\u003c/script>')
  })

  it('embaralhar não perde nem repete elementos', () => {
    const r = embaralhar([1, 2, 3, 4, 5, 6], () => 0.3)
    expect([...r].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('CSV', () => {
  it('ida e volta com aspas, vírgulas e quebras de linha', () => {
    const linhas = [
      ['a', 'b,c', 'd "e"'],
      ['x\ny', '', 'z'],
    ]
    expect(lerCsv(escreverCsv(linhas))).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['x\ny', '', 'z'],
    ])
  })
})

describe('estatística', () => {
  it('kappa: concordância total = 1; sem concordância além do acaso ≈ 0; negativa < 0', () => {
    const iguais = [
      ['brasileiro', 'brasileiro'],
      ['portugal', 'portugal'],
      ['indeterminado', 'indeterminado'],
      ['brasileiro', 'brasileiro'],
    ]
    expect(kappaDeCohen(iguais)).toBe(1)
    const meioAMeio = [
      ['brasileiro', 'brasileiro'],
      ['brasileiro', 'portugal'],
      ['portugal', 'brasileiro'],
      ['portugal', 'portugal'],
    ]
    expect(kappaDeCohen(meioAMeio)).toBeCloseTo(0, 10)
    const opostos = [
      ['brasileiro', 'portugal'],
      ['portugal', 'brasileiro'],
    ]
    expect(kappaDeCohen(opostos)).toBeLessThan(0)
    // Exemplo de manual: 20 itens, 14 concordâncias (10 br/br, 4 pt/pt) e 6 discordâncias: po 0,7, pe 0,545.
    const manual = [
      ...Array(10).fill(['brasileiro', 'brasileiro']),
      ...Array(4).fill(['portugal', 'portugal']),
      ...Array(3).fill(['brasileiro', 'portugal']),
      ...Array(3).fill(['portugal', 'brasileiro']),
    ]
    expect(kappaDeCohen(manual)).toBeCloseTo((0.7 - 0.545) / (1 - 0.545), 5)
  })

  it('Wilson: 10/100 → [5,5%; 17,4%] e 0/100 não passa de ~3,7%', () => {
    const w = wilson(10, 100)
    expect(w.ic95[0]).toBeCloseTo(0.055, 2)
    expect(w.ic95[1]).toBeCloseTo(0.174, 2)
    expect(wilson(0, 100).ic95[1]).toBeLessThan(0.04)
  })
})

describe('veredito (limiares do spec)', () => {
  const folgado = {
    chrf: { 'fleurs:en-pt': { ic95: [-1, 1] }, 'gold:en-pt': { ic95: [-1, 1] } },
    comet: { 'fleurs:en-pt': { ic95: [-0.01, 0.01] }, 'gold:en-pt': { ic95: [-0.01, 0.01] } },
  }
  const nat = { contraOControle: { diferenca: 0, ic95: [-0.2, 0.2] } }
  const base = { kappa: 0.7, naturalidade: nat, qualidade: folgado }
  const ptPt = (
    k: number,
    n = 100,
    porAvaliador = { A1: { k: Math.floor(k / 2), n: n / 2 }, A2: { k: Math.ceil(k / 2), n: n / 2 } },
  ) => ({ uniao: { k, n }, porAvaliador })

  it('kappa < 0,4 invalida a rodada, mesmo com tudo o mais perfeito', () => {
    expect(veredito({ ...base, kappa: 0.39, ptPt: ptPt(0) }).veredito).toBe('invalida')
    expect(veredito({ ...base, kappa: Number.NaN, ptPt: ptPt(0) }).veredito).toBe('invalida')
  })

  it('pt-PT 3% com a qualidade sem piora = aprovado', () => {
    expect(veredito({ ...base, ptPt: ptPt(3) }).veredito).toBe('aprovado')
  })

  it('pt-PT 20% = reprovado; 13% = reprovado', () => {
    expect(veredito({ ...base, ptPt: ptPt(20) }).veredito).toBe('reprovado')
    expect(veredito({ ...base, ptPt: ptPt(13) }).veredito).toBe('reprovado')
  })

  it('pt-PT entre 8% e 12% (IC cruza o limite) = inconclusivo', () => {
    for (const k of [8, 10, 12]) expect(veredito({ ...base, ptPt: ptPt(k) }).veredito, `${k}%`).toBe('inconclusivo')
  })

  it('só um avaliador ≥ 10% e a união baixa = inconclusivo', () => {
    expect(
      veredito({
        ...base,
        ptPt: { uniao: { k: 6, n: 100 }, porAvaliador: { A1: { k: 6, n: 40 }, A2: { k: 0, n: 60 } } },
      }).veredito,
    ).toBe('inconclusivo')
  })

  it('qualquer métrica pior no IC 95% reprova, ainda que o pt-PT esteja baixo', () => {
    const q = { ...folgado, chrf: { ...folgado.chrf, 'gold:en-pt': { ic95: [-3, -0.4] } } }
    const v = veredito({ ...base, ptPt: ptPt(1), qualidade: q })
    expect(v.veredito).toBe('reprovado')
    expect(v.motivos.join(' ')).toMatch(/chrf em gold:en-pt/)
    const n = veredito({ ...base, ptPt: ptPt(1), naturalidade: { contraOControle: { ic95: [-0.9, -0.1] } } })
    expect(n.veredito).toBe('reprovado')
  })

  it('COMET não informado = inconclusivo (não se aprova no escuro)', () => {
    const v = veredito({ ...base, ptPt: ptPt(1), qualidade: { chrf: folgado.chrf, comet: {} } })
    expect(v.veredito).toBe('inconclusivo')
    expect(v.motivos.join(' ')).toMatch(/COMET não informado/)
  })
})

describe('protocolo e lote', () => {
  it('protocolo alterado depois de gerar: o gabarito não bate com o próprio hash e a rodada não vale', () => {
    const { gabarito } = gerar()
    const mexido = {
      ...gabarito,
      protocolo: { ...gabarito.protocolo, limiares: { ...gabarito.protocolo.limiares, ptPtMaximo: 0.3 } },
    }
    expect(() => conferirLote(mexido, loteDoProtocolo(gabarito.protocolo))).toThrow(/mudou depois de gerado/)
    expect(() => apurar({ gabarito: mexido, planilhas: [] })).toThrow(/mudou depois de gerado/)
  })

  it('planilha de OUTRO lote (gerada com outro protocolo) não vale', () => {
    const g = gerar()
    const outro = gerar(protocoloDe({ semente: 99 }))
    const planilhas = planilhasPreenchidas(outro, () => ['brasileiro', 4])
    expect(() => apurar({ gabarito: g.gabarito, planilhas })).toThrow(/protocolo alterado/)
  })

  it('resposta faltando, variante inválida e item que não é do avaliador são apontados', () => {
    const g = gerar()
    const a = g.gabarito.avaliadores[0]
    const csv = planilhaDoAvaliador(loteDoProtocolo(g.gabarito.protocolo), a, g.lote.itens)
    const { respostas, problemas } = lerRespostas(csv, a, g.gabarito)
    expect(respostas).toHaveLength(0)
    expect(problemas.length).toBeGreaterThan(0)
    const preenchida = preencher(csv, () => ['ingles', 9])
    expect(lerRespostas(preenchida, a, g.gabarito).problemas[0]).toMatch(/sem resposta válida/)
  })
})

describe('apuração de ponta a ponta (respostas sintéticas)', () => {
  /** Respostas determinísticas: o candidato recebe `taxaPt` de "portugal" (item a item, pela razão áurea). */
  function rodar(taxaPt: number, concordam = true): any {
    const g = gerar(protocoloDe(), brutosFalsos(60, 60, true))
    const planilhas = planilhasPreenchidas(g, (avaliador, item) => {
      const sistema = g.gabarito.itens[item].sistema
      if (sistema === CONTROLE) return ['brasileiro', 4]
      // Determinístico POR ITEM (os dois avaliadores marcam o mesmo item igual, exceto quando `concordam` é falso).
      const pt = (Number(item.slice(1)) * 0.6180339887) % 1 < taxaPt
      return [pt && (concordam || avaliador === 'A1') ? 'portugal' : 'brasileiro', 4]
    })
    const comet = {
      'fleurs:en-pt': { [CANDIDATO]: { ic95: [-0.01, 0.01] } },
      'gold:en-pt': { [CANDIDATO]: { ic95: [-0.01, 0.01] } },
    }
    return apurar({ gabarito: g.gabarito, planilhas, brutos: g.brutos, comet })
  }

  it('candidato só com "brasileiro" e saídas iguais às do controle: aprovado, kappa 1, chrF++ sem piora', () => {
    const r = rodar(0)
    expect(r.invalida).toBe(false)
    expect(r.kappa).toBe(1)
    expect(r.porSistema[CANDIDATO].veredito.veredito).toBe('aprovado')
    expect(r.porSistema[CANDIDATO].qualidade.chrf['fleurs:en-pt'].diferenca).toBeCloseTo(0, 10)
    expect(r.porSistema[CANDIDATO].ptPt.uniao).toEqual({ k: 0, n: 120 })
    // O controle também é apurado, mas não recebe veredito.
    expect(r.porSistema[CONTROLE].veredito).toBeUndefined()
  })

  it('candidato marcado como pt-PT em 40% dos itens: reprovado', () => {
    expect(rodar(0.4).porSistema[CANDIDATO].veredito.veredito).toBe('reprovado')
  })

  it('avaliadores que discordam do que é pt-PT: a rodada é inválida (kappa baixo)', () => {
    const r = rodar(0.5, false)
    // A1 marca pt-PT em metade; A2 nunca: nas frases repetidas, a concordância não passa do acaso.
    expect(r.kappa).toBeLessThan(0.4)
    expect(r.porSistema[CANDIDATO].veredito.veredito).toBe('invalida')
  })

  it('qualidadeChrf: candidato pior que o controle no chrF++ aparece com IC abaixo de 0', () => {
    const brutos = brutosFalsos(60, 60, false)
    const q: any = qualidadeChrf(brutos, CANDIDATO, CONTROLE)
    expect(q['gold:en-pt'].ic95[1]).toBeLessThan(0)
    expect(q['fleurs:en-pt'].n).toBe(60)
  })
})
