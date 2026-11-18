/**
 * O CONTROLE DO MODO INTÉRPRETE (E3 da Fase E): a cola entre a máquina de estados (`interprete.ts`),
 * a fila de fala (`filaDeFala.ts`) e o microfone da captura. Sem tela: o que se prova aqui é o que a
 * tela executa quando alguém toca, fala e ouve.
 *   - tocar destrava a voz (iPhone) e abre o microfone no idioma do lado;
 *   - o fim da fala fecha o microfone; a tradução do final é lida no idioma de QUEM OUVE;
 *   - a tradução que chega antes do fim da fala (cache) não se perde;
 *   - sem tradução, a conversa volta a "parado" sem voz;
 *   - a fila vazia é o fim da voz; o tempo até a voz é registrado por motor;
 *   - tocar enquanto a voz fala corta a voz (barge-in);
 *   - Repetir lê de novo; sair para tudo e desliga a fila.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { criarControleDoInterprete } from '../src/lib/captura/controleDoInterprete'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'

interface Fala {
  texto: string
  opts: SpeakOptions
}

/** Um motor de voz falso: começa na hora; o fim vem quando o teste manda. */
function motorFalso() {
  const falas: Fala[] = []
  let atual: Fala | null = null
  const motor: TtsEngine = {
    speak(texto, opts) {
      atual = { texto, opts: opts! }
      falas.push(atual)
      opts?.onStart?.()
    },
    cancel: vi.fn(() => {
      atual = null
    }),
    isSpeaking: () => atual !== null,
  }
  const terminar = () => {
    const f = atual
    atual = null
    f?.opts.onEnd?.()
  }
  return { motor, falas, terminar }
}

let relogio = 0
beforeEach(() => {
  relogio = 1000
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

function montar(extra: Partial<Parameters<typeof criarControleDoInterprete>[0]> = {}) {
  const voz = motorFalso()
  const abrir = vi.fn()
  const fechar = vi.fn()
  const destravar = vi.fn()
  const registrar = vi.fn()
  const estados: string[] = []
  const controle = criarControleDoInterprete({
    idiomas: () => ({ meu: 'pt-BR', outro: 'en-US' }),
    microfone: { abrir, fechar },
    motor: () => voz.motor,
    nomeDoMotor: () => 'voz-do-aparelho',
    destravarVoz: destravar,
    registrarTempo: registrar,
    agora: () => relogio,
    aoMudar: (e) => estados.push(e.fase),
    ...extra,
  })
  return { controle, voz, abrir, fechar, destravar, registrar, estados }
}

const traduzida = (segId: string, traducao: string) => ({
  segId,
  original: 'x',
  resultado: 'traduzida' as const,
  traducao,
  de: 'pt',
  para: 'en',
  aproximada: false,
  falada: true,
})

describe('criarControleDoInterprete', () => {
  it('tocar destrava a voz e abre o microfone no idioma do lado', () => {
    const { controle, abrir, destravar } = montar()
    controle.tocar('outro')
    expect(destravar).toHaveBeenCalledTimes(1)
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(controle.direcao()).toEqual({ lado: 'outro', fala: 'en-US', de: 'en', para: 'pt', dono: 'outro', turno: 1 })
    expect(controle.estado().fase).toBe('ouvindo')
  })

  it('o ciclo inteiro: fim da fala fecha o microfone, a tradução é lida no idioma de quem ouve', () => {
    const { controle, voz, fechar, registrar } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's1', source: 'mic', lado: 'meu' })
    expect(fechar).toHaveBeenCalledTimes(1)
    expect(controle.estado().fase).toBe('traduzindo')
    relogio += 1200
    controle.aoTraduzirFinal(traduzida('s1', 'good morning'))
    expect(voz.falas).toHaveLength(1)
    expect(voz.falas[0].texto).toBe('good morning')
    expect(voz.falas[0].opts.lang).toBe('en-US')
    expect(controle.estado().fase).toBe('falando')
    expect(controle.estado().falando).toMatchObject({ id: 's1', lado: 'meu' })
    expect(registrar).toHaveBeenCalledWith(1200, 'voz-do-aparelho')
    voz.terminar()
    expect(controle.estado().fase).toBe('parado')
    expect(controle.estado().falando).toBeNull()
  })

  it('o medidor por etapa recebe VAD, STT, tradução e o início da voz, só números e motor', () => {
    const etapa = vi.fn()
    const { controle } = montar({
      registrarEtapa: etapa,
      etapasDaFala: () => ({
        stt: { ms: 400, motor: 'groq-whisper', audioMs: 3000 },
        mt: { ms: 700, motor: 'server-llm-mt' },
      }),
    })
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's1', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s1', 'good morning'))
    /* Por toque, o turno fecha com 2,5 s de silêncio (conversa-de-verdade, 2.1): é essa a espera nominal. */
    expect(etapa).toHaveBeenCalledWith('s1', 'vad', 2500, 'vad-fixo')
    expect(etapa).toHaveBeenCalledWith('s1', 'stt', 400, 'groq-whisper', 3000)
    expect(etapa).toHaveBeenCalledWith('s1', 'mt', 700, 'server-llm-mt')
    expect(etapa).toHaveBeenCalledWith('s1', 'tts', 0, 'voz-do-aparelho')
    expect(JSON.stringify(etapa.mock.calls)).not.toMatch(/good morning/)
  })

  it('a fala sem tradução não registra etapa nenhuma', () => {
    const etapa = vi.fn()
    const { controle } = montar({ registrarEtapa: etapa })
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's1', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal({ ...traduzida('s1', ''), resultado: 'sem-traducao' })
    expect(etapa).not.toHaveBeenCalled()
  })

  it('a fala do outro lado é lida no meu idioma', () => {
    const { controle, voz } = montar()
    controle.tocar('outro')
    controle.aoFimDaFala({ segId: 's2', source: 'mic', lado: 'outro' })
    controle.aoTraduzirFinal({ ...traduzida('s2', 'bom dia'), de: 'en', para: 'pt' })
    expect(voz.falas[0].opts.lang).toBe('pt-BR')
  })

  it('a tradução que chega ANTES do fim da fala (cache) é lida quando o fim chega', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoTraduzirFinal(traduzida('s3', 'hello'))
    expect(voz.falas).toHaveLength(0)
    controle.aoFimDaFala({ segId: 's3', source: 'mic', lado: 'meu' })
    expect(voz.falas.map((f) => f.texto)).toEqual(['hello'])
  })

  it('sem tradução, volta a parado sem voz', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's4', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal({ ...traduzida('s4', ''), resultado: 'sem-traducao' })
    expect(voz.falas).toHaveLength(0)
    expect(controle.estado().fase).toBe('parado')
  })

  it('ignora finais que não são da fala (o som do computador)', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's5', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal({ ...traduzida('s5', 'hi'), falada: false })
    expect(voz.falas).toHaveLength(0)
  })

  it('barge-in: tocar enquanto a voz fala corta a voz e abre o microfone de quem tocou', () => {
    const { controle, voz, abrir } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's6', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s6', 'good night'))
    expect(controle.estado().fase).toBe('falando')
    controle.tocar('outro')
    expect(voz.motor.cancel).toHaveBeenCalled()
    expect(abrir).toHaveBeenCalledTimes(2)
    expect(controle.estado()).toMatchObject({ fase: 'ouvindo', lado: 'outro' })
  })

  it('Repetir lê de novo; sem nada a repetir, não fica preso em "falando"', async () => {
    const { controle, voz } = montar()
    controle.repetir()
    await Promise.resolve()
    expect(controle.estado().fase).toBe('parado')
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's7', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s7', 'thanks'))
    voz.terminar()
    controle.repetir()
    expect(voz.falas.map((f) => f.texto)).toEqual(['thanks', 'thanks'])
    expect(controle.estado().fase).toBe('falando')
    voz.terminar()
    expect(controle.estado().fase).toBe('parado')
  })

  it('Parar voz corta e volta a parado', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's8', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s8', 'wait'))
    controle.pararVoz()
    expect(voz.motor.cancel).toHaveBeenCalled()
    expect(controle.estado().fase).toBe('parado')
  })

  it('trocar os lados inverte a direção', () => {
    const { controle } = montar()
    controle.trocarLados()
    expect(controle.estado().trocados).toBe(true)
    controle.tocar('meu')
    expect(controle.direcao()).toMatchObject({ lado: 'meu', fala: 'en-US', para: 'pt' })
  })

  it('sair fecha o microfone, para a voz e desliga: nada mais é lido', () => {
    const { controle, voz, fechar } = montar()
    controle.tocar('meu')
    controle.sair()
    expect(fechar).toHaveBeenCalled()
    controle.aoFimDaFala({ segId: 's9', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s9', 'bye'))
    expect(voz.falas).toHaveLength(0)
  })

  it('o microfone que falha ao abrir avisa e volta a parado', async () => {
    const aoFalhar = vi.fn()
    const { controle } = montar({
      microfone: { abrir: () => Promise.reject(new Error('negado')), fechar: vi.fn() },
      aoFalharMicrofone: aoFalhar,
    })
    controle.tocar('meu')
    await vi.runAllTimersAsync()
    expect(aoFalhar).toHaveBeenCalledTimes(1)
    expect(controle.estado().fase).toBe('parado')
  })
})

describe('a falha que chega DEPOIS do toque (o reconhecedor recusou o idioma)', () => {
  it('devolve a conversa a "parado", fecha o microfone e deixa tocar de novo', () => {
    const m = montar()
    m.controle.tocar('outro')
    expect(m.controle.estado().fase).toBe('ouvindo')
    m.controle.microfoneFalhou()
    expect(m.controle.estado().fase).toBe('parado')
    expect(m.fechar).toHaveBeenCalled()
    m.controle.tocar('outro')
    expect(m.controle.estado().fase).toBe('ouvindo')
    expect(m.abrir).toHaveBeenCalledTimes(2)
  })

  it('fora de "ouvindo" (a voz já lê a tradução) não mexe em nada', () => {
    const m = montar()
    m.controle.microfoneFalhou()
    expect(m.controle.estado().fase).toBe('parado')
    expect(m.fechar).not.toHaveBeenCalled()
  })
})

describe('os idiomas da conversa, para o motor do microfone', () => {
  it('são os dois lados em BCP-47, na ordem meu → outro', () => {
    const m = montar({ idiomas: () => ({ meu: 'pt', outro: 'en-US' }) })
    expect(m.controle.idiomasDaConversa()).toEqual(['pt-BR', 'en-US'])
  })
})

/* ───────────────────────────── o modo automático (E7) ───────────────────────────── */

describe('automático: o controle ouve a conversa sem ninguém tocar em lado', () => {
  const pistas = (idiomaDoMotor: string, extra: Record<string, unknown> = {}) => ({
    idiomaDoMotor,
    idiomaDoTexto: '',
    audioMs: 3000,
    ...extra,
  })

  it('"ouvir" destrava a voz, abre o microfone sem direção e marca o automático', () => {
    const m = montar()
    m.controle.ouvir()
    expect(m.destravar).toHaveBeenCalledTimes(1)
    expect(m.abrir).toHaveBeenCalledTimes(1)
    expect(m.controle.direcao()).toBeNull()
    expect(m.controle.automatico()).toBe(true)
    expect(m.controle.estado()).toMatchObject({ fase: 'ouvindo', automatico: true })
  })

  it('o ciclo: o fim da fala (sem lado) fecha o microfone; o idioma medido diz o lado e a voz; o fim da voz reabre', () => {
    const m = montar()
    m.controle.ouvir()
    m.controle.aoFimDaFala({ segId: 'a', source: 'mic' })
    expect(m.fechar).toHaveBeenCalledTimes(1)
    expect(m.controle.estado().fase).toBe('traduzindo')

    const d = m.controle.ladoDaFala('a', pistas('en'))
    expect(d).toMatchObject({ lado: 'outro', de: 'en', para: 'pt' })

    m.controle.aoTraduzirFinal({ ...traduzida('a', 'bom dia'), de: 'en', para: 'pt' })
    expect(m.voz.falas[0].opts.lang).toBe('pt-BR')
    expect(m.controle.estado().falando).toMatchObject({ id: 'a', lado: 'outro' })

    m.voz.terminar()
    expect(m.controle.estado()).toMatchObject({ fase: 'ouvindo', automatico: true })
    expect(m.abrir).toHaveBeenCalledTimes(2)
  })

  it('a minha fala é lida no idioma do outro', () => {
    const m = montar()
    m.controle.ouvir()
    m.controle.aoFimDaFala({ segId: 'b', source: 'mic' })
    m.controle.ladoDaFala('b', pistas('pt'))
    m.controle.aoTraduzirFinal(traduzida('b', 'good morning'))
    expect(m.voz.falas[0].opts.lang).toBe('en-US')
    expect(m.controle.estado().falando).toMatchObject({ lado: 'meu' })
  })

  it('um terceiro idioma: a outra pessoa fala espanhol, e a minha resposta é lida em espanhol', () => {
    const m = montar()
    m.controle.ouvir()
    m.controle.aoFimDaFala({ segId: 'c', source: 'mic' })
    expect(m.controle.ladoDaFala('c', pistas('es', { idiomaDoTexto: 'es' }))).toMatchObject({
      lado: 'outro',
      de: 'es',
      para: 'pt',
      terceiro: true,
    })
    m.controle.aoTraduzirFinal({ ...traduzida('c', 'bom dia'), de: 'es', para: 'pt' })
    m.voz.terminar()

    m.controle.aoFimDaFala({ segId: 'd', source: 'mic' })
    expect(m.controle.ladoDaFala('d', pistas('pt'))).toMatchObject({ lado: 'meu', para: 'es' })
    m.controle.aoTraduzirFinal({ ...traduzida('d', 'buenos días'), de: 'pt', para: 'es' })
    expect(String(m.voz.falas[1].opts.lang).toLowerCase().startsWith('es')).toBe(true)
  })

  it('"Detectar": o idioma da outra pessoa aparece no estado na primeira fala dela e sobrevive ao recomeçar', () => {
    const m = montar({ idiomas: () => ({ meu: 'pt-BR', outro: '' }) })
    m.controle.ouvir()
    expect(m.controle.estado().detectado).toBeNull()
    m.controle.aoFimDaFala({ segId: 'e', source: 'mic' })
    expect(m.controle.ladoDaFala('e', pistas('en'))).toMatchObject({ lado: 'outro', de: 'en', para: 'pt' })
    expect(m.controle.estado().detectado).toBe('en')
    /* Parar → Ouvir não esquece o idioma descoberto: a minha próxima fala já vai para ele. */
    m.controle.parar()
    m.controle.ouvir()
    expect(m.controle.estado().detectado).toBe('en')
    m.controle.aoFimDaFala({ segId: 'f', source: 'mic' })
    expect(m.controle.ladoDaFala('f', pistas('pt'))).toMatchObject({ lado: 'meu', para: 'en' })
  })

  it('"Detectar" com os lados trocados: o meu idioma continua o meu; só a metade troca', () => {
    const m = montar({ idiomas: () => ({ meu: 'pt-BR', outro: '' }) })
    m.controle.trocarLados()
    m.controle.ouvir()
    m.controle.aoFimDaFala({ segId: 'g', source: 'mic' })
    expect(m.controle.ladoDaFala('g', pistas('en'))).toMatchObject({ lado: 'meu', de: 'en', para: 'pt' })
    m.controle.aoFimDaFala({ segId: 'h', source: 'mic' })
    expect(m.controle.ladoDaFala('h', pistas('pt'))).toMatchObject({ lado: 'outro', de: 'pt', para: 'en' })
  })

  it('"parar" fecha o microfone e o fim da voz não o reabre', () => {
    const m = montar()
    m.controle.ouvir()
    m.controle.parar()
    expect(m.controle.estado()).toMatchObject({ fase: 'parado', automatico: false })
    expect(m.fechar).toHaveBeenCalled()
    expect(m.abrir).toHaveBeenCalledTimes(1)
  })

  it('a falha tardia do microfone no automático desliga a escuta (em vez de reabrir em laço)', () => {
    const m = montar()
    m.controle.ouvir()
    m.controle.microfoneFalhou()
    expect(m.controle.estado()).toMatchObject({ fase: 'parado', automatico: false })
  })

  it('fora do automático, o fim da fala sem lado continua ignorado', () => {
    const m = montar()
    m.controle.aoFimDaFala({ segId: 'z', source: 'mic' })
    expect(m.controle.estado().fase).toBe('parado')
    expect(m.controle.automatico()).toBe(false)
  })
})

describe('ouvirTrecho (Intérprete v3, Fase 1)', () => {
  const pistas = (idiomaDoMotor: string) => ({ idiomaDoMotor, idiomaDoTexto: '', audioMs: 3000 })

  it('lê o trecho no idioma pedido, sem mexer na fase da conversa', () => {
    const { controle, voz, destravar, registrar } = montar()
    expect(controle.ouvirTrecho('arroz', 'pt-BR')).toBe('lendo')
    expect(destravar).toHaveBeenCalledTimes(1)
    expect(voz.falas).toHaveLength(1)
    expect(voz.falas[0].texto).toBe('arroz')
    expect(voz.falas[0].opts.lang).toBe('pt-BR')
    expect(controle.estado().fase).toBe('parado')
    expect(registrar).not.toHaveBeenCalled()
    voz.terminar()
    expect(controle.estado().fase).toBe('parado')
  })

  it('com o microfone aberto, ignora o toque e diz por quê', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    expect(controle.ouvirTrecho('arroz', 'pt-BR')).toBe('ouvindo')
    expect(voz.falas).toHaveLength(0)
    expect(controle.estado().fase).toBe('ouvindo')
  })

  it('no automático também ignora enquanto escuta', () => {
    const { controle, voz } = montar()
    controle.ouvir()
    expect(controle.ouvirTrecho('arroz', 'pt-BR')).toBe('ouvindo')
    expect(voz.falas).toHaveLength(0)
  })

  it('corta a leitura da tradução e lê o trecho; o Repetir segue lendo a tradução', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's1', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s1', 'good morning'))
    expect(voz.falas.map((f) => f.texto)).toEqual(['good morning'])
    expect(controle.ouvirTrecho('rice', 'en-US', { lento: true })).toBe('lendo')
    expect(voz.falas.map((f) => f.texto)).toEqual(['good morning', 'rice'])
    expect(voz.falas[1].opts.rate).toBe(0.7)
    voz.terminar()
    expect(controle.estado().fase).toBe('parado')
    controle.repetir()
    expect(voz.falas.at(-1)?.texto).toBe('good morning')
  })

  it('no automático, cortar a tradução para ler o trecho NÃO reabre o microfone no meio da leitura', () => {
    const { controle, voz, abrir } = montar()
    controle.ouvir()
    controle.aoFimDaFala({ segId: 's1', source: 'mic', lado: 'meu' })
    controle.ladoDaFala('s1', pistas('pt'))
    controle.aoTraduzirFinal(traduzida('s1', 'good morning'))
    const aberturas = abrir.mock.calls.length
    controle.ouvirTrecho('rice', 'en-US')
    expect(abrir.mock.calls.length).toBe(aberturas)
    voz.terminar()
    expect(abrir.mock.calls.length).toBe(aberturas + 1)
  })

  it('depois de sair não lê nada', () => {
    const { controle, voz } = montar()
    controle.sair()
    expect(controle.ouvirTrecho('arroz', 'pt-BR')).toBe('ignorado')
    expect(voz.falas).toHaveLength(0)
  })

  it('texto vazio não lê', () => {
    const { controle, voz } = montar()
    expect(controle.ouvirTrecho('   ', 'pt-BR')).toBe('ignorado')
    expect(voz.falas).toHaveLength(0)
  })
})

describe('praticar a conversa: a pessoa fala o idioma da outra (`falaDoMeu`)', () => {
  const pistas = (idiomaDoMotor: string) => ({ idiomaDoMotor, idiomaDoTexto: idiomaDoMotor, audioMs: 3000 })
  const praticando = () => montar({ idiomas: () => ({ meu: 'pt-BR', outro: 'en-US', falaDoMeu: 'en-US' }) })
  const semTraducao = (segId: string) => ({
    segId,
    original: 'I want go to the beach',
    resultado: 'sem-traducao' as const,
    traducao: '',
    de: 'en',
    para: 'en',
    aproximada: false,
    falada: true,
  })

  it('a rede de segurança: todo lado que o automático decide praticando é palpite, nos dois lados', () => {
    const m = praticando()
    m.controle.ouvir()
    m.controle.aoFimDaFala({ segId: 'a', source: 'mic' })
    expect(m.controle.ladoDaFala('a', pistas('en'))).toMatchObject({ lado: 'outro', palpite: true })
    m.controle.aoFimDaFala({ segId: 'b', source: 'mic' })
    expect(m.controle.ladoDaFala('b', pistas('pt'))).toMatchObject({ lado: 'meu', palpite: true })
    /* Sem a prática, o mesmo idioma medido é evidência (não é palpite). */
    const n = montar()
    n.controle.ouvir()
    n.controle.aoFimDaFala({ segId: 'c', source: 'mic' })
    expect(n.controle.ladoDaFala('c', pistas('en'))).toMatchObject({ lado: 'outro', palpite: false })
  })

  it('o "sem tradução" que chega antes do fim da fala é entregue no fim: a conversa volta a parado', () => {
    const m = praticando()
    m.controle.tocar('meu')
    expect(m.controle.direcao()).toMatchObject({ fala: 'en-US', de: 'en', para: 'en' })
    m.controle.aoTraduzirFinal(semTraducao('m1'))
    m.controle.aoFimDaFala({ segId: 'm1', source: 'mic', lado: 'meu' })
    expect(m.controle.estado().fase).toBe('parado')
  })

  it('o aviso guardado de uma fala interrompida (parar, trocar os lados) não vale para depois', () => {
    for (const interromper of ['parar', 'trocarLados'] as const) {
      const m = praticando()
      m.controle.tocar('meu')
      m.controle.aoTraduzirFinal(semTraducao('m1'))
      m.controle[interromper]()
      m.controle.tocar('meu')
      m.controle.aoFimDaFala({ segId: 'm1', source: 'mic', lado: 'meu' })
      /* Sem o aviso velho, a fala espera a tradução dela (como qualquer fala). */
      expect(m.controle.estado().fase).toBe('traduzindo')
    }
  })
})

/* ─────────────── conversa-de-verdade: o turno, a fala guardada e a leitura só com o microfone fechado ─────────────── */

describe('o turno do microfone (conversa-de-verdade, 1.2 e 2)', () => {
  /** O microfone como a captura o vê: aberto ou fechado; e a voz registra se começou com ele aberto. */
  function comMicrofone() {
    let aberto = false
    const lidasComMicAberto: string[] = []
    const m = montar({
      microfone: {
        abrir: () => void (aberto = true),
        fechar: () => void (aberto = false),
      },
    })
    const speak = m.voz.motor.speak.bind(m.voz.motor)
    m.voz.motor.speak = (texto, opts) => {
      if (aberto) lidasComMicAberto.push(texto)
      speak(texto, opts)
    }
    return { ...m, lidasComMicAberto, aberto: () => aberto }
  }

  it('cada abertura do microfone é um turno novo; o "Terminei" não muda o turno', () => {
    const { controle } = montar()
    controle.tocar('meu')
    expect(controle.direcao()).toMatchObject({ lado: 'meu', turno: 1 })
    controle.tocar('meu') // Terminei
    expect(controle.direcao()).toMatchObject({ turno: 1 })
    controle.tocar('outro')
    expect(controle.direcao()).toMatchObject({ lado: 'outro', turno: 2 })
  })

  it('o fim de uma fala de outro turno (guardada no download) não fecha o microfone de quem fala nem é lido', () => {
    const m = comMicrofone()
    m.controle.tocar('meu') // turno 1: pt1, guardada; o turno fecha no silêncio
    m.controle.aoFimDaFala({ segId: 'pt1', source: 'mic', lado: 'meu', turno: 1 })
    expect(m.aberto()).toBe(false)
    m.controle.tocar('outro') // turno 2: a outra pessoa começa a falar
    expect(m.aberto()).toBe(true)
    /* O modelo ficou pronto: pt1 é transcrita e o fim dela chega de novo, no turno 2. */
    m.controle.aoFimDaFala({ segId: 'pt1', source: 'mic', lado: 'meu', turno: 1 })
    m.controle.aoTraduzirFinal(traduzida('pt1', 'Good evening'))
    expect(m.aberto()).toBe(true)
    expect(m.controle.estado()).toMatchObject({ fase: 'ouvindo', lado: 'outro' })
    expect(m.voz.falas).toHaveLength(0)
  })

  it('a fala guardada no MESMO turno é lida quando a tradução chega, com o microfone já fechado', () => {
    const m = comMicrofone()
    m.controle.tocar('meu')
    m.controle.aoFimDaFala({ segId: 'pt1', source: 'mic', lado: 'meu', turno: 1 })
    expect(m.controle.estado().fase).toBe('traduzindo')
    m.controle.aoFimDaFala({ segId: 'pt1', source: 'mic', lado: 'meu', turno: 1 }) // o mesmo fim, na transcrição
    m.controle.aoTraduzirFinal(traduzida('pt1', 'Good evening'))
    expect(m.voz.falas.map((f) => f.texto)).toEqual(['Good evening'])
    expect(m.lidasComMicAberto).toEqual([])
  })

  it('o fim de fala do outro lado, com um microfone aberto, não o fecha (o final atrasado de quem falou antes)', () => {
    const m = comMicrofone()
    m.controle.tocar('meu')
    m.controle.tocar('outro') // troca de lado no meio
    m.controle.aoFimDaFala({ segId: 'a1', source: 'mic', lado: 'meu' })
    expect(m.aberto()).toBe(true)
    expect(m.controle.estado()).toMatchObject({ fase: 'ouvindo', lado: 'outro' })
  })

  it('"Terminei" fecha o microfone na hora, sem esperar o silêncio, e a leitura vem depois', () => {
    const m = comMicrofone()
    m.controle.tocar('meu')
    m.controle.tocar('meu')
    expect(m.aberto()).toBe(false)
    m.controle.aoFimDaFala({ segId: 'a1', source: 'mic', lado: 'meu', turno: 1 })
    m.controle.aoTraduzirFinal(traduzida('a1', 'Hello'))
    expect(m.voz.falas.map((f) => f.texto)).toEqual(['Hello'])
    expect(m.lidasComMicAberto).toEqual([])
  })

  it('a leitura nunca começa com o microfone aberto, em nenhuma ordem de eventos', () => {
    const m = comMicrofone()
    /* A tradução chega antes do fim (cache), o fim chega, outra pessoa toca, um final atrasado chega... */
    m.controle.tocar('meu')
    m.controle.aoTraduzirFinal(traduzida('a1', 'One'))
    m.controle.aoFimDaFala({ segId: 'a1', source: 'mic', lado: 'meu', turno: 1 })
    m.controle.tocar('outro')
    m.controle.aoTraduzirFinal(traduzida('b0', 'Zero'))
    m.controle.aoFimDaFala({ segId: 'b0', source: 'mic', lado: 'meu', turno: 1 })
    m.controle.aoFimDaFala({ segId: 'b1', source: 'mic', lado: 'outro', turno: 2 })
    m.controle.aoTraduzirFinal(traduzida('b1', 'Two'))
    m.controle.repetir()
    m.voz.terminar()
    m.controle.ouvir()
    m.controle.aoFimDaFala({ segId: 'c1', source: 'mic' })
    m.controle.ladoDaFala('c1', { idiomaDoMotor: 'pt', confianca: 0.99, idiomaDoTexto: '', audioMs: 3000 })
    m.controle.aoTraduzirFinal(traduzida('c1', 'Three'))
    expect(m.voz.falas.length).toBeGreaterThan(0)
    expect(m.lidasComMicAberto).toEqual([])
  })
})

describe('a conferência da transcrição antes de ler (conversa-de-verdade, 5.4)', () => {
  const conferindo = () => montar({ conferirAntesDeLer: (idioma) => idioma !== 'en' })
  const turno = (m: ReturnType<typeof montar>, id: string, traducao: string) => {
    m.controle.tocar('meu')
    m.controle.aoFimDaFala({ segId: id, source: 'mic', lado: 'meu', turno: 1 })
    m.controle.aoTraduzirFinal(traduzida(id, traducao))
  }

  it('a tradução espera o "Ler a tradução": nada é lido antes, e a vez volta', async () => {
    const m = conferindo()
    turno(m, 'a1', 'My grandmother taught me')
    await Promise.resolve()
    expect(m.voz.falas).toHaveLength(0)
    expect(m.controle.estado()).toMatchObject({ conferindo: 'a1', fase: 'parado' })
    m.controle.confirmarLeitura('a1')
    expect(m.voz.falas.map((f) => f.texto)).toEqual(['My grandmother taught me'])
    expect(m.controle.estado().conferindo).toBeNull()
  })

  it('"Descartar" não lê nada; "Corrigir" lê a tradução da correção quando ela chega', () => {
    const m = conferindo()
    turno(m, 'a1', 'My vomiting taught')
    m.controle.descartarLeitura('a1')
    expect(m.voz.falas).toHaveLength(0)
    const n = conferindo()
    turno(n, 'b1', 'My vomiting taught')
    n.controle.corrigirAntesDeLer('b1')
    n.controle.aoTraduzirFinal(traduzida('b1', 'My grandmother taught me'))
    expect(n.voz.falas.map((f) => ({ texto: f.texto, lang: f.opts.lang }))).toEqual([
      { texto: 'My grandmother taught me', lang: 'en-US' },
    ])
  })

  it('o idioma que não pede conferência é lido direto; falar de novo deixa a conferência para trás', () => {
    const m = montar({ conferirAntesDeLer: (idioma) => idioma === 'pt' })
    m.controle.tocar('outro')
    m.controle.aoFimDaFala({ segId: 'e1', source: 'mic', lado: 'outro', turno: 1 })
    m.controle.aoTraduzirFinal({ ...traduzida('e1', 'Obrigado'), de: 'en', para: 'pt' })
    expect(m.voz.falas.map((f) => f.texto)).toEqual(['Obrigado'])
    const n = conferindo()
    turno(n, 'a1', 'Hi')
    n.controle.tocar('outro')
    expect(n.controle.estado().conferindo).toBeNull()
    n.controle.confirmarLeitura('a1')
    expect(n.voz.falas).toHaveLength(0)
  })
})
