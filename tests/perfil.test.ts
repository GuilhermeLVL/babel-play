/**
 * O PERFIL, e as duas coisas que ele não pode deixar acontecer.
 *
 * 1. ESCALADA DE PRIVILÉGIO. `PATCH /api/me` grava campos que o próprio usuário controla. Se
 *    `role` ou `status` atravessassem o corpo do request até o repositório, qualquer conta se
 *    promoveria a admin com uma linha de curl. É a mesma classe do A01 que fez `entitlements`
 *    ignorar `settings.ui.plan` — e a defesa é a mesma: um esquema FECHADO, não uma lista de
 *    campos proibidos que alguém precisa lembrar de manter.
 *
 * 2. INTERESSE INVENTADO. O vocabulário é fechado justamente para o dado servir a alguma coisa.
 *    Um slug livre vindo do cliente viraria "games", "jogos" e "video-game" como três interesses
 *    distintos, e nenhuma recomendação construída sobre isso funcionaria.
 */
import { describe, it, expect } from 'vitest'
import { perfilPatchSchema } from '../server/validation'
import {
  INTERESSES, saneiaInteresses, interessePorSlug, MAX_INTERESSES,
} from '../src/core/learning/interesses'
import { iniciaisDe } from '../src/lib/usePerfil'

describe('PATCH /api/me — o esquema é a fronteira de confiança', () => {
  it('remove role e status do corpo, em vez de confiar em quem chama', () => {
    const r = perfilPatchSchema.parse({ displayName: 'Guilherme', role: 'admin', status: 'active' })

    expect(r).not.toHaveProperty('role')
    expect(r).not.toHaveProperty('status')
    expect(r.displayName).toBe('Guilherme')
  })

  it('remove qualquer campo desconhecido — incluindo os que ainda não existem', () => {
    const r = perfilPatchSchema.parse({ plan: 'pro', id: 'outro-usuario', email: 'x@y.z', xp: 999999 })
    expect(Object.keys(r)).toEqual([])
  })

  it('aceita apagar o próprio nome — null é distinto de ausente', () => {
    expect(perfilPatchSchema.parse({ displayName: null }).displayName).toBeNull()
    expect(perfilPatchSchema.parse({}).displayName).toBeUndefined()
  })

  it('recusa texto acima do teto em vez de truncar em silêncio', () => {
    expect(perfilPatchSchema.safeParse({ displayName: 'x'.repeat(61) }).success).toBe(false)
    expect(perfilPatchSchema.safeParse({ bio: 'x'.repeat(281) }).success).toBe(false)
    expect(perfilPatchSchema.safeParse({ displayName: 'x'.repeat(60) }).success).toBe(true)
  })

  it('recusa uma avalanche de interesses', () => {
    const muitos = Array.from({ length: 33 }, (_, i) => `i${i}`)
    expect(perfilPatchSchema.safeParse({ interests: muitos }).success).toBe(false)
  })
})

describe('vocabulário fechado de interesses', () => {
  it('todo slug é único e estável', () => {
    const slugs = INTERESSES.map(i => i.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s, `${s} precisa ser um slug simples`).toMatch(/^[a-z][a-z-]*$/)
  })

  it('descarta o que não está na lista, em vez de gravar', () => {
    expect(saneiaInteresses(['musica', 'games', 'vídeo-game', 'jogos'])).toEqual(['musica', 'jogos'])
  })

  it('de-duplica', () => {
    expect(saneiaInteresses(['musica', 'musica', 'musica'])).toEqual(['musica'])
  })

  it('devolve sempre na ordem canônica, não na de entrada', () => {
    // Sem isto, dois clientes com as mesmas escolhas produziriam listas diferentes e comparar
    // "mudou alguma coisa?" exigiria ordenar dos dois lados.
    expect(saneiaInteresses(['jogos', 'musica'])).toEqual(saneiaInteresses(['musica', 'jogos']))
  })

  it('lista vazia continua vazia — ninguém é obrigado a ter interesses', () => {
    expect(saneiaInteresses([])).toEqual([])
  })

  it('o teto de escolhas mantém o dado significando alguma coisa', () => {
    // Marcar tudo não é um perfil; é a ausência de um.
    expect(MAX_INTERESSES).toBeLessThan(INTERESSES.length)
  })

  it('todo interesse tem rótulo e grupo para a tela poder agrupar', () => {
    for (const i of INTERESSES) {
      expect(i.rotulo.trim(), i.slug).not.toBe('')
      expect(interessePorSlug(i.slug)).toBe(i)
    }
  })
})

describe('iniciais do avatar', () => {
  it('usa a primeira e a ÚLTIMA palavra do nome', () => {
    // "Ana Maria Cruz" → AC, não AM: quem identifica é o sobrenome.
    expect(iniciaisDe('Ana Maria Cruz')).toBe('AC')
    expect(iniciaisDe('Guilherme Cruz')).toBe('GC')
  })

  it('nome de uma palavra dá uma letra', () => {
    expect(iniciaisDe('Guilherme')).toBe('G')
  })

  it('sem nome, cai para o e-mail', () => {
    expect(iniciaisDe(null, 'guigui@exemplo.com')).toBe('G')
    expect(iniciaisDe('   ', 'guigui@exemplo.com')).toBe('G')
  })

  it('sem nada, devolve vazio — para a tela decidir, em vez de desenhar um boneco genérico', () => {
    expect(iniciaisDe(null, null)).toBe('')
    expect(iniciaisDe(undefined)).toBe('')
  })

  it('aguenta espaços sobrando sem produzir letra em branco', () => {
    expect(iniciaisDe('  Guilherme   Cruz  ')).toBe('GC')
  })
})
