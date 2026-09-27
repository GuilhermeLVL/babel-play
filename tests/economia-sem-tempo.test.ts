/**
 * NENHUMA SEED OU XP POR TEMPO OU POR ABRIR O APP (recompensas v2, Task 2.1).
 *
 * Decreto 12.880/2026, art. 9º: prêmio por tempo de uso é incentivo compulsivo. Até a v2 a
 * economia pagava presença (abrir o app no dia) e minutos de captura. Este arquivo varre a
 * tabela dita (`REGRAS`) e os pesos do cálculo (`PESOS_SEEDS`, `PESOS_XP`) e fixa as fontes
 * novas, todas de resultado: palavra salva da captura (teto diário), meta do dia cumprida e
 * nível de maestria.
 */
import { describe, expect, it } from 'vitest'

import { valorDoCredito } from '../src/core/economiaAutoridade'
import {
  acertosNoDia,
  diaNoFuso,
  FUSO_PADRAO,
  fusoOuPadrao,
  palavrasPremiadas,
  REGRAS,
  TETO_PALAVRAS_SALVAS_POR_DIA,
} from '../src/core/learning/economia'
import { PESOS_SEEDS, PESOS_XP, seedsGanhasDeEventos, xpDeEventos } from '../src/core/learning/xp'

describe('economia v2 — só resultado paga', () => {
  it('nenhuma regra paga por tempo ou presença', () => {
    const proibidos = /presen|minuto|min\b|tempo|abrir/i
    for (const r of REGRAS) expect(`${r.id} ${r.como} ${r.unidade}`).not.toMatch(proibidos)
    expect(Object.keys(PESOS_SEEDS)).not.toContain('presenca')
    expect(Object.keys(PESOS_SEEDS)).not.toContain('capturaPor5Min')
    expect(Object.keys(PESOS_XP)).not.toContain('capturaPor5Min')
    expect(Object.keys(PESOS_XP)).not.toContain('presenca')
  })

  it('palavra TRANSCRITA não rende XP: é volume de mídia, não esforço (325 palavras importadas = 0 XP)', () => {
    expect(Object.keys(PESOS_XP)).not.toContain('palavraCapturada')
    expect(xpDeEventos({ sessoes: 0, palavrasCapturadas: 325, revisoes: 0, revisoesCertas: 0 })).toBe(0)
  })

  it('as fontes novas existem com os valores da especificação', () => {
    expect(PESOS_SEEDS.palavraSalva).toBe(1)
    expect(TETO_PALAVRAS_SALVAS_POR_DIA).toBe(30)
    expect(PESOS_SEEDS.metaDiaria).toBe(15)
    expect(PESOS_SEEDS.nivelDeMaestria).toBe(20)
    const ids = REGRAS.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['palavraSalva', 'metaDiaria', 'nivelDeMaestria']))
    expect(ids).not.toContain('presenca')
    expect(ids).not.toContain('captura')
  })

  it('palavra salva: teto por dia — 80 num dia premiam 30; dois dias de 20 premiam 40', () => {
    expect(palavrasPremiadas([80])).toBe(30)
    expect(palavrasPremiadas([20, 20])).toBe(40)
    expect(palavrasPremiadas([])).toBe(0)
    expect(seedsGanhasDeEventos({ revisoesCertas: 0, palavrasSalvasPremiadas: 30 })).toBe(30 * PESOS_SEEDS.palavraSalva)
  })

  it('o cálculo não tem mais entrada de tempo nem de presença', () => {
    const base = { sessoes: 0, palavrasCapturadas: 0, revisoes: 0, revisoesCertas: 0 }
    // Campos antigos, se chegarem de um servidor velho, não rendem nada.
    const velho = { ...base, presencas: 5, capturaMinutosPremiados: 30 } as Parameters<typeof xpDeEventos>[0]
    expect(xpDeEventos(velho)).toBe(0)
    expect(seedsGanhasDeEventos(velho)).toBe(0)
  })
})

describe('meta do dia — `meta:<AAAA-MM-DD>`', () => {
  it('o crédito vale o peso da regra e carrega o dia a conferir', () => {
    const c = valorDoCredito('meta:2026-09-27')
    expect('erro' in c).toBe(false)
    if ('erro' in c) return
    expect(c.seeds).toBe(PESOS_SEEDS.metaDiaria)
    expect(c.xp).toBe(PESOS_XP.metaDiaria)
    expect(c.reason).toBe('meta:2026-09-27')
    expect(c.metaDoDia).toBe('2026-09-27')
  })

  it('dia malformado é recusado', () => {
    expect('erro' in valorDoCredito('meta:2026-9-27')).toBe(true)
    expect('erro' in valorDoCredito('meta:ontem-mesmo')).toBe(true)
  })

  /* A CONDIÇÃO da meta (as três missões do dia, onda 5) é de `tests/missoes.test.ts`; aqui fica
     o dia, que é o do fuso do usuário. */
  it('o dia da meta é o do fuso do usuário', () => {
    // 23:59 e 00:01 em São Paulo são dias diferentes, mesmo estando no mesmo dia UTC.
    const antes = Date.UTC(2026, 8, 28, 2, 59) // 27/09 23:59 em -03
    const depois = Date.UTC(2026, 8, 28, 3, 1) // 28/09 00:01 em -03
    expect(diaNoFuso(antes, 'America/Sao_Paulo')).toBe('2026-09-27')
    expect(diaNoFuso(depois, 'America/Sao_Paulo')).toBe('2026-09-28')
    expect(acertosNoDia([antes, depois, depois], '2026-09-28', 'America/Sao_Paulo')).toBe(2)
  })

  it('fuso inválido ou ausente cai no padrão', () => {
    expect(fusoOuPadrao(undefined)).toBe(FUSO_PADRAO)
    expect(fusoOuPadrao('Marte/Olimpo')).toBe(FUSO_PADRAO)
    expect(fusoOuPadrao('Europe/Lisbon')).toBe('Europe/Lisbon')
  })
})
