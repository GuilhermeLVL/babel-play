/**
 * A TRADUÇÃO SAIU NO IDIOMA PEDIDO?
 *
 * Caso real, visto na tela de um usuário assistindo um vídeo em espanhol:
 *
 *     original:  ¿Dónde estoy? Espérate, vamos a abrir.
 *     pedido:    português
 *     exibido:   Kde jsem? Počkej, půjdeme otevřít.        ← TCHECO
 *
 * O que torna o caso instrutivo é que a frase tcheca está CERTA: o tradutor entendeu o espanhol
 * perfeitamente e respondeu no idioma errado. Nenhum erro foi lançado, nenhum disjuntor abriu,
 * e o texto foi para a tela como se fosse a resposta. O sistema não tinha como saber, porque
 * ninguém perguntava.
 */
import { describe, it, expect } from 'vitest'
import { validarTraducao, explicarRejeicao, precisaConferir, MINIMO_DE_CARACTERES } from '../src/lib/validaTraducao'

const longo = (s: string) => s.padEnd(MINIMO_DE_CARACTERES + 6, ' ').trim().padEnd(MINIMO_DE_CARACTERES + 6, 'x')
const confiante = (lang: string) => ({ lang, confidence: 0.95 })

describe('o caso do tcheco', () => {
  it('rejeita resposta em terceiro idioma', () => {
    const v = validarTraducao('Kde jsem? Počkej, půjdeme otevřít.', 'pt', 'es', confiante('cs'))
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.motivo).toBe('idioma-errado')
      expect(v.detectado).toBe('cs')
      expect(v.esperado).toBe('pt')
    }
  })

  it('a mensagem diz o suficiente para depurar pelo log', () => {
    const v = validarTraducao('Kde jsem? Počkej, půjdeme otevřít.', 'pt', 'es', confiante('cs'))
    if (v.ok) throw new Error('deveria rejeitar')
    expect(explicarRejeicao(v, 'server-llm-mt')).toContain('respondeu em cs quando pedimos pt')
  })

  it('aceita a tradução CORRETA da mesma frase', () => {
    const v = validarTraducao('Onde estou? Espere, vamos abrir.', 'pt', 'es', confiante('pt'))
    expect(v.ok).toBe(true)
  })
})

describe('o tradutor que devolve o texto sem traduzir', () => {
  it('rejeita saída no idioma de ENTRADA, e diz que é outro problema', () => {
    const v = validarTraducao(longo('Solo tenemos tres balas.'), 'pt', 'es', confiante('es'))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo).toBe('nao-traduziu')
  })

  it('a distinção importa: "não traduziu" e "idioma errado" têm causas diferentes', () => {
    const naoTraduziu = validarTraducao(longo('Solo tenemos tres balas.'), 'pt', 'es', confiante('es'))
    const idiomaErrado = validarTraducao(longo('Kde jsem? Počkej, otevřít.'), 'pt', 'es', confiante('cs'))
    if (naoTraduziu.ok || idiomaErrado.ok) throw new Error('deveriam rejeitar')
    expect(naoTraduziu.motivo).not.toBe(idiomaErrado.motivo)
  })

  it('sem origem conhecida, saída estrangeira ainda é rejeitada — só não sabemos classificar', () => {
    const v = validarTraducao(longo('Kde jsem? Počkej, otevřít.'), 'pt', null, confiante('cs'))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo).toBe('idioma-errado')
  })
})

describe('prudência — derrubar tradução boa é pior que deixar passar uma ruim', () => {
  it('texto CURTO passa: "Vale", "Yeah.", "好" não sustentam detecção', () => {
    for (const t of ['Vale', 'Yeah.', '好', 'Tchau.']) {
      expect(validarTraducao(t, 'pt', 'es', confiante('en')).ok).toBe(true)
    }
  })

  it('detecção INSEGURA passa — só rejeitamos com o detector confiante', () => {
    const v = validarTraducao(longo('Kde jsem? Počkej, otevřít.'), 'pt', 'es', { lang: 'cs', confidence: 0.4 })
    expect(v.ok).toBe(true)
  })

  it('sem detecção nenhuma, aceita: não sabemos, e não inventamos', () => {
    expect(validarTraducao(longo('qualquer coisa aqui'), 'pt', 'es', null).ok).toBe(true)
  })

  it('sem alvo declarado não há o que conferir', () => {
    expect(validarTraducao(longo('qualquer coisa'), '', 'es', confiante('cs')).ok).toBe(true)
  })

  it('variante regional não é idioma diferente — pt-BR satisfaz pt', () => {
    expect(validarTraducao(longo('Onde estou? Espere um pouco.'), 'pt-BR', 'es', confiante('pt')).ok).toBe(true)
    expect(validarTraducao(longo('Onde estou? Espere um pouco.'), 'pt', 'es', confiante('pt-PT')).ok).toBe(true)
  })

  it('texto vazio passa — não é trabalho desta função reclamar de vazio', () => {
    expect(validarTraducao('', 'pt', 'es', confiante('cs')).ok).toBe(true)
  })
})

/**
 * A detecção de idioma custa uma chamada dentro do caminho que o usuário está esperando ver na
 * tela. O gateway a pagava em TODA tradução — inclusive nas que `validarTraducao` aprovaria de
 * saída, sem nem olhar o resultado. Numa legenda ao vivo a maioria das falas é curta, então era
 * desperdício na maioria das vezes.
 *
 * `precisaConferir` responde antes, e tem de concordar com `validarTraducao` em cada caso: se ela
 * disser "não precisa" onde a validação REJEITARIA, o tcheco volta a passar.
 */
describe('precisaConferir — só detecta quando a detecção pode mudar o veredicto', () => {
  it('texto curto: não precisa', () => {
    for (const t of ['Vale', 'Yeah.', '好', 'Tchau.']) expect(precisaConferir(t, 'pt')).toBe(false)
  })

  it('sem alvo declarado: não precisa', () => {
    expect(precisaConferir(longo('qualquer coisa'), '')).toBe(false)
  })

  it('texto longo com alvo: precisa — é onde mora o caso do tcheco', () => {
    expect(precisaConferir('Kde jsem? Počkej, půjdeme otevřít.', 'pt')).toBe(true)
  })

  it('NUNCA dispensa a conferência num caso que a validação rejeitaria', () => {
    // A invariante que amarra as duas: se a validação rejeita, é porque a detecção importava.
    const casos: Array<[string, string, string | null, string]> = [
      ['Kde jsem? Počkej, půjdeme otevřít.', 'pt', 'es', 'cs'],
      [longo('Solo tenemos tres balas.'), 'pt', 'es', 'es'],
      [longo('Kde jsem? Počkej, otevřít.'), 'pt', null, 'cs'],
    ]
    for (const [texto, alvo, origem, detectado] of casos) {
      expect(validarTraducao(texto, alvo, origem, confiante(detectado)).ok).toBe(false)
      expect(precisaConferir(texto, alvo)).toBe(true)
    }
  })
})
