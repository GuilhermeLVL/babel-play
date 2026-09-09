/**
 * O IDIOMA CHEGA AO SERVIDOR (auditoria de 2026-09-07, achados A38 e A39).
 *
 * Duas provas num arquivo só, porque são a mesma história contada nas duas pontas do dado:
 *
 * 1. **Nível por idioma.** `nivelCefr` só responde por idioma cuja lista foi REGISTRADA, e quem
 *    registrava era `precarregarNiveis`, que usa `import.meta.glob` — API do Vite, inexistente no
 *    servidor. Resultado: no navegador as dezesseis listas entravam sob demanda e no servidor
 *    NENHUMA entrava. Todo cartão não inglês era gravado com procedência `ausente`, para sempre, e
 *    nada na tela dizia por quê. `server/lib/niveisDaTrilha.ts` passa a registrar a lista do
 *    idioma do cartão antes de perguntar.
 *
 * 2. **Um campo só para o idioma-alvo.** A migração `0023` consolida `settings.target_language`,
 *    `ui.captureTargetLang` e `ui.praticaLang` num campo. O desempate quando os dois discordam é o
 *    caso encontrado no banco real: alvo igual ao idioma da própria pessoa (resíduo de gravação
 *    automática) contra um idioma estrangeiro escolhido na tela de jogos.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
const U = asUserId('idioma-u1')

beforeAll(async () => { h = await setupEphemeralDb() })
afterAll(async () => { await h?.cleanup?.() })

describe('nível CEFR no servidor, por idioma do cartão', () => {
  it('cartão em inglês recebe nível da wordlist; em espanhol, a faixa de frequência', async () => {
    const { vocabRepo } = (await h.load('../../server/db/repositories/vocab')) as any

    /* Palavras de CONTEÚDO e com tradução diferente da grafia: `bulkAdd` aplica a régua de
       qualidade (`avaliarCartao`) antes de gravar, e recusa palavra gramatical ("about") e
       tradução igual à palavra ("qué" → "que"). O assunto aqui é o NÍVEL, não a régua de entrada. */
    await vocabRepo.bulkAdd(U, [
      { word: 'water', back: 'água', sentence: 'The water is cold.', srcLang: 'en', tgtLang: 'pt' },
      { word: 'ciudad', back: 'cidade', sentence: 'La ciudad es grande.', srcLang: 'es', tgtLang: 'pt' },
    ])

    const cartoes = await vocabRepo.list(U)
    const en = cartoes.find((c: any) => c.word === 'water')
    const es = cartoes.find((c: any) => c.word === 'ciudad')

    // Inglês já funcionava (a lista é importada estaticamente pelo núcleo) — fica como controle.
    expect(en.cefrSource).toBe('wordlist')
    expect(en.cefrLevel).not.toBeNull()

    /* O QUE MUDOU. Antes: `ausente`, porque a lista espanhola nunca era registrada no servidor.
       Agora: `frequencia` — a trilha do espanhol é ordenada por corpus, não por CEFR, então o
       nível continua nulo de propósito (faixa de frequência não é banda CEFR) e a PROCEDÊNCIA
       passa a dizer a verdade: a palavra foi encontrada, na escala que aquele idioma tem. */
    expect(es.cefrSource).toBe('frequencia')
    expect(es.cefrLevel).toBeNull()
  })

  it('idioma sem lista continua `ausente` — ausência é resposta, não falha', async () => {
    const { vocabRepo } = (await h.load('../../server/db/repositories/vocab')) as any
    await vocabRepo.bulkAdd(U, [
      { word: 'kalabashi', back: 'cabaça', sentence: 'Kalabashi ni kubwa.', srcLang: 'sw', tgtLang: 'pt' },
    ])
    const c = (await vocabRepo.list(U)).find((x: any) => x.word === 'kalabashi')
    expect(c.cefrSource).toBe('ausente')
    expect(c.cefrLevel).toBeNull()
  })
})

describe('migração 0023 — um campo só para o idioma-alvo', () => {
  /** Aplica o SQL da migração numa cópia isolada, sobre linhas montadas à mão. */
  async function aplicar(linhas: Array<{ id: string; target: string | null; ui: unknown }>) {
    const { client } = (await h.load('../../server/db/db')) as any
    const { readFileSync } = await import('node:fs')
    const sqlBruto = readFileSync('./server/db/migrations/0023_um_idioma_alvo_so.sql', 'utf8')

    for (const l of linhas) {
      await client.execute({
        sql: 'INSERT INTO settings (id, created_at, updated_at, user_id, target_language, ui) VALUES (?, ?, ?, ?, ?, ?)',
        args: [l.id, 1, 1, `u-${l.id}`, l.target, l.ui === null ? null : JSON.stringify(l.ui)],
      })
    }
    for (const stmt of sqlBruto.split('--> statement-breakpoint')) {
      const limpo = stmt.split('\n').filter((x) => !x.trim().startsWith('--')).join('\n').trim()
      if (limpo) await client.execute(limpo.replace(/;\s*$/, ''))
    }
    const lidas = await client.execute(
      "SELECT id, target_language, json_extract(ui,'$.captureTargetLang') capt, json_extract(ui,'$.praticaLang') prat FROM settings WHERE id LIKE 'mig-%'",
    )
    return new Map<string, any>(lidas.rows.map((r: any) => [String(r.id), r]))
  }

  it('consolida os três campos, com o desempate do banco real', async () => {
    const fora = await aplicar([
      // O caso REAL medido: alvo = idioma da própria pessoa, prática = francês.
      { id: 'mig-a', target: 'pt-BR', ui: { captureSourceLang: 'pt-BR', praticaLang: 'fr' } },
      // Sem alvo: herda o espelho, senão a escolha se perderia ao apagar o blob.
      { id: 'mig-b', target: null, ui: { captureSourceLang: 'pt-BR', captureTargetLang: 'ja-JP' } },
      // Dois estrangeiros: o campo explícito de Ajustes manda, a tela de jogos não sobrepõe.
      { id: 'mig-c', target: 'de-DE', ui: { captureSourceLang: 'pt-BR', praticaLang: 'it' } },
    ])

    expect(fora.get('mig-a')?.target_language).toBe('fr')
    expect(fora.get('mig-b')?.target_language).toBe('ja-JP')
    expect(fora.get('mig-c')?.target_language).toBe('de-DE')

    // E os espelhos saem do blob: a partir daqui existe UM campo.
    for (const id of ['mig-a', 'mig-b', 'mig-c']) {
      expect(fora.get(id)?.capt).toBeNull()
      expect(fora.get(id)?.prat).toBeNull()
    }
  })
})
