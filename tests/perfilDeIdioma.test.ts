/**
 * O IDIOMA TEM DE SER DESCOBERTO, NÃO CONFIGURADO.
 *
 * Bug relatado em uso real: com "detectar automaticamente" ligado, cada fala era analisada
 * isolada e a decisão de destino refeita do zero — 40 falas, 40 deduções idênticas, 40 linhas
 * de log iguais — enquanto a interface continuava exibindo o idioma CONFIGURADO. O sistema
 * sabia a resposta e não a guardava.
 *
 * E o caso de teste mais importante vem do log daquela sessão: uma conversa inteiramente em
 * português na qual o detector devolveu RUSSO para um trecho ruidoso ("definил уизлоган.") e
 * INGLÊS para um "Thank you." solto. Qualquer regra do tipo "a mais recente vence" faria a
 * interface trocar de idioma e voltar a cada tropeço — e piscar é pior que estar fixo no
 * idioma errado.
 *
 * Daí a histerese: converge com maioria simples, mas exige maioria MAIOR para ser derrubado.
 */
import { describe, it, expect } from 'vitest'
import { PerfilAdaptativoDeIdioma, destinoDaTraducao } from '../src/lib/perfilDeIdioma'

const ouvir = (p: PerfilAdaptativoDeIdioma, ...langs: string[]) => langs.forEach((l) => p.observar(l))

describe('convergir', () => {
  it('não conclui nada com uma fala só — uma andorinha não faz verão', () => {
    const p = new PerfilAdaptativoDeIdioma()
    p.observar('pt')
    expect(p.ler().estado).toBe('ouvindo')
    expect(p.observado()).toBe('')
  })

  it('converge depois de evidência suficiente', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'pt', 'pt', 'pt')
    expect(p.ler().estado).toBe('convergido')
    expect(p.observado()).toBe('pt')
    expect(p.ler().confianca).toBe(1)
  })

  it('ignora detecção vazia sem contar contra ninguém', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'pt', '', 'pt', '   ', 'pt')
    expect(p.observado()).toBe('pt')
    expect(p.ler().amostras).toBe(3)
  })

  it('normaliza a variante regional — pt-BR e pt são a mesma língua aqui', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'pt-BR', 'pt', 'PT-pt')
    expect(p.observado()).toBe('pt')
  })
})

describe('histerese — o caso que veio do log real', () => {
  it('UMA detecção errada no meio de português NÃO derruba a conclusão', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'pt', 'pt', 'pt', 'pt', 'pt')
    expect(p.observado()).toBe('pt')

    // O trecho ruidoso que o Whisper devolveu como russo, e o "Thank you." solto.
    p.observar('ru')
    expect(p.observado()).toBe('pt')
    p.observar('en')
    expect(p.observado()).toBe('pt')
    p.observar('pt')
    expect(p.observado()).toBe('pt')
  })

  it('a confiança CAI com o ruído, mesmo sem trocar — é o número honesto', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'pt', 'pt', 'pt', 'pt')
    expect(p.ler().confianca).toBe(1)
    ouvir(p, 'ru', 'en')
    expect(p.ler().confianca).toBeLessThan(1)
    expect(p.ler().idioma).toBe('pt')
  })

  it('mas uma mudança REAL de idioma é acompanhada', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'pt', 'pt', 'pt')
    expect(p.observado()).toBe('pt')
    // A conversa virou para inglês e FICOU: enche a janela e a conclusão acompanha.
    ouvir(p, 'en', 'en', 'en', 'en', 'en', 'en', 'en', 'en', 'en', 'en')
    expect(p.observado()).toBe('en')
  })

  it('trocar exige MAIS evidência do que convergir — é essa a assimetria', () => {
    const converge = new PerfilAdaptativoDeIdioma()
    ouvir(converge, 'pt', 'pt', 'pt')
    expect(converge.observado()).toBe('pt')

    // A mesma proporção que bastou para convergir NÃO basta para derrubar.
    const troca = new PerfilAdaptativoDeIdioma()
    ouvir(troca, 'pt', 'pt', 'pt')
    ouvir(troca, 'en', 'en', 'en', 'en')  // 4 de 7 = 57%, acima do inicial, abaixo do de troca
    expect(troca.observado()).toBe('pt')
  })

  it('a janela é deslizante: conversa longa não fica presa ao começo', () => {
    const p = new PerfilAdaptativoDeIdioma({ janela: 4 })
    ouvir(p, 'pt', 'pt', 'pt', 'pt')
    ouvir(p, 'en', 'en', 'en', 'en')
    expect(p.observado()).toBe('en')
  })

  it('reset limpa tudo — sessão nova não herda a anterior', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'pt', 'pt', 'pt')
    p.reset()
    expect(p.observado()).toBe('')
    expect(p.ler().estado).toBe('ouvindo')
    expect(p.ler().amostras).toBe(0)
  })
})

describe('destino da tradução', () => {
  it('sem observação ainda, mantém o padrão: o que eles falam vem para o SEU idioma', () => {
    expect(destinoDaTraducao('', 'pt', 'en')).toEqual({ destino: 'pt', motivo: 'padrao' })
  })

  it('conteúdo em idioma estrangeiro vai para o seu', () => {
    expect(destinoDaTraducao('en', 'pt', 'en')).toEqual({ destino: 'pt', motivo: 'padrao' })
  })

  it('conteúdo JÁ no seu idioma é redirecionado para o que você estuda', () => {
    // O caso do log: vídeo em português, usuário nativo em português, estudando inglês.
    expect(destinoDaTraducao('pt', 'pt', 'en')).toEqual({ destino: 'en', motivo: 'redirecionado' })
  })

  it('quando os dois lados do par são a mesma língua, não há para onde traduzir', () => {
    // Honesto: melhor não exibir tradução do que repetir a frase fingindo que traduziu.
    expect(destinoDaTraducao('pt', 'pt', 'pt')).toEqual({ destino: '', motivo: 'sem-destino' })
  })

  it('tolera variantes regionais nos dois lados', () => {
    expect(destinoDaTraducao('pt-BR', 'pt-PT', 'en-US').destino).toBe('en')
  })

  it('a decisão é ESTÁVEL: mesma entrada, mesma saída — é o que tira as 40 deduções do log', () => {
    const a = destinoDaTraducao('pt', 'pt', 'en')
    const b = destinoDaTraducao('pt', 'pt', 'en')
    expect(a).toEqual(b)
  })
})

describe('evidência fraca — o motor que traduz em vez de transcrever', () => {
  it('transcrição suspeita repetida NÃO empilha: um motor com defeito constante não vence pela insistência', () => {
    const p = new PerfilAdaptativoDeIdioma()
    // Vídeo em espanhol; o Whisper local sem dica devolve inglês seguidamente.
    ouvir(p, 'es', 'es')
    for (let i = 0; i < 8; i++) p.observar('en', 0.5)
    expect(p.observado()).toBe('es')
  })

  it('mas inglês DE VERDADE, vindo do motor confiável, converge normalmente', () => {
    const p = new PerfilAdaptativoDeIdioma()
    ouvir(p, 'en', 'en', 'en')
    expect(p.observado()).toBe('en')
  })

  it('evidência fraca alternada ainda conta — não é descarte, é desconto', () => {
    const p = new PerfilAdaptativoDeIdioma()
    p.observar('en', 0.5); p.observar('es'); p.observar('en', 0.5); p.observar('es')
    expect(p.ler().amostras).toBe(4)
  })
})
