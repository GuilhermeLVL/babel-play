/**
 * PERFIL ADAPTATIVO DE IDIOMA — o que está sendo falado DE VERDADE, aprendido durante a sessão.
 *
 * O PROBLEMA. Com "detectar automaticamente" ligado, cada fala era analisada isoladamente e a
 * decisão de para onde traduzir era refeita do zero, toda vez. Numa sessão real de 40 falas isso
 * produzia 40 deduções idênticas, 40 linhas de log iguais — e, pior, a interface continuava
 * exibindo o idioma CONFIGURADO enquanto o conteúdo era outro. O sistema sabia a resposta e não
 * a guardava.
 *
 * A EXIGÊNCIA: o usuário não deve precisar configurar o idioma a cada sessão. Escolheu
 * "automático", o aplicativo tem de descobrir e ASSUMIR a descoberta.
 *
 * POR QUE NÃO BASTA "A MAIS RECENTE VENCE". Detecção por fala erra, e erra justamente nas falas
 * curtas. Numa sessão real em português, o detector devolveu russo para um trecho ruidoso e
 * inglês para um "Thank you." isolado. Com regra ingênua, a interface trocaria de idioma —
 * e voltaria — a cada tropeço. Piscar é pior que estar fixo no idioma errado.
 *
 * A SOLUÇÃO É HISTERESE. Converge com maioria simples numa janela, mas, DEPOIS de convergido,
 * exige uma maioria MAIOR para trocar. Assim uma fala solta não derruba a conclusão, e uma
 * mudança real de idioma (a conversa virou para inglês e ficou) é acompanhada em poucas falas.
 *
 * O perfil NÃO decide sozinho o que mostrar: ele informa o que observou e com que confiança.
 * Quem consome decide — e, pela doutrina do produto, avisa o usuário UMA vez em vez de mudar o
 * comportamento em silêncio.
 */

export type EstadoDoPerfil = 'ouvindo' | 'convergido'

export interface LeituraDoPerfil {
  /** Idioma observado (ISO-639-1). Vazio enquanto não há evidência suficiente. */
  idioma: string
  /** Fração da janela que sustenta o idioma observado — 0..1. */
  confianca: number
  estado: EstadoDoPerfil
  /** Quantas falas entraram na conta. */
  amostras: number
}

export interface OpcoesDoPerfil {
  /** Tamanho da janela deslizante de falas consideradas. */
  janela?: number
  /** Falas mínimas antes de qualquer conclusão. Abaixo disso, `estado` é sempre 'ouvindo'. */
  minimoParaConvergir?: number
  /** Fração necessária para convergir da primeira vez. */
  limiarInicial?: number
  /** Fração necessária para DERRUBAR um idioma já convergido. Maior = mais estável. */
  limiarDeTroca?: number
}

export class PerfilAdaptativoDeIdioma {
  private janela: string[] = []
  private convergido = ''
  private readonly opts: Required<OpcoesDoPerfil>

  constructor(opts: OpcoesDoPerfil = {}) {
    this.opts = {
      janela: opts.janela ?? 12,
      minimoParaConvergir: opts.minimoParaConvergir ?? 3,
      limiarInicial: opts.limiarInicial ?? 0.6,
      limiarDeTroca: opts.limiarDeTroca ?? 0.75,
    }
  }

  /**
   * Registra o idioma detectado de UMA fala. Vazio/desconhecido é ignorado, não conta contra.
   *
   * `peso` existe para uma evidência que vale menos que as outras. O caso concreto: o Whisper
   * LOCAL, quando roda sem dica de idioma, às vezes TRADUZ para inglês em vez de transcrever —
   * e o texto inglês resultante alimentaria o perfil com "en" num vídeo em espanhol, poluindo
   * justamente a conclusão que corrigiria o problema. Uma fala assim entra com peso menor: não
   * é descartada (pode ser inglês de verdade), mas não decide sozinha.
   */
  observar(lang: string, peso: 1 | 0.5 = 1): void {
    const l = (lang || '').trim().toLowerCase().split('-')[0]
    if (!l) return
    // Peso fracionário é implementado como "conta menos vezes na janela": simples, sem
    // aritmética de ponto flutuante espalhada pela contagem, e o efeito é o pretendido.
    if (peso < 1 && this.janela.length && this.janela[this.janela.length - 1] === l) {
      // Evidência fraca REPETIDA não empilha: duas transcrições duvidosas seguidas continuam
      // valendo por uma. Sem isto, um motor com defeito constante venceria pela insistência.
      return
    }
    this.janela.push(l)
    if (this.janela.length > this.opts.janela) this.janela.shift()

    const { lider, fracao } = this.lider()
    if (!this.convergido) {
      if (this.janela.length >= this.opts.minimoParaConvergir && fracao >= this.opts.limiarInicial) {
        this.convergido = lider
      }
      return
    }
    // Já convergido: só troca com maioria MAIOR — é a histerese que impede o pisca-pisca.
    if (lider !== this.convergido && fracao >= this.opts.limiarDeTroca) {
      this.convergido = lider
    }
  }

  private lider(): { lider: string; fracao: number } {
    if (!this.janela.length) return { lider: '', fracao: 0 }
    const contagem = new Map<string, number>()
    for (const l of this.janela) contagem.set(l, (contagem.get(l) ?? 0) + 1)
    let lider = ''
    let melhor = 0
    // Da mais ANTIGA para a mais recente com `>=`: no empate vence a mais recente, porque a
    // conversa provavelmente acabou de mudar de língua.
    for (const l of this.janela) {
      const c = contagem.get(l)!
      if (c >= melhor) { lider = l; melhor = c }
    }
    return { lider, fracao: melhor / this.janela.length }
  }

  ler(): LeituraDoPerfil {
    const { lider, fracao } = this.lider()
    return {
      idioma: this.convergido,
      // A confiança reportada é a do IDIOMA CONVERGIDO, não a do líder do momento: enquanto a
      // histerese segura a conclusão, dizer a fração do desafiante seria descrever outra coisa.
      confianca: this.convergido
        ? this.janela.filter((l) => l === this.convergido).length / this.janela.length
        : fracao,
      estado: this.convergido ? 'convergido' : 'ouvindo',
      amostras: this.janela.length,
    }
  }

  /** Atalho: o idioma observado, ou '' enquanto ainda não há conclusão. */
  observado(): string {
    return this.convergido
  }

  reset(): void {
    this.janela = []
    this.convergido = ''
  }
}

/**
 * DECIDE O DESTINO DA TRADUÇÃO, uma vez, a partir do que foi observado.
 *
 * Antes esta decisão era refeita a cada fala dentro de `translateSegment`, comparando o idioma
 * daquela fala com o alvo configurado. Aqui ela é função do PERFIL — estável enquanto o perfil
 * estiver estável — e o chamador sabe dizer quando mudou.
 *
 * @param observado  idioma que de fato está sendo falado ('' = ainda ouvindo)
 * @param meu        idioma do usuário (config)
 * @param estudado   idioma que o usuário estuda (config)
 */
export function destinoDaTraducao(observado: string, meu: string, estudado: string): {
  destino: string
  motivo: 'padrao' | 'redirecionado' | 'sem-destino'
} {
  const obs = (observado || '').split('-')[0]
  const m = (meu || '').split('-')[0]
  const e = (estudado || '').split('-')[0]

  // Sem observação ainda: o padrão do produto — o que os outros falam vai para o SEU idioma.
  if (!obs) return { destino: m, motivo: 'padrao' }

  // O conteúdo já está no seu idioma: traduzir para ele devolveria a mesma frase. Vai para o
  // outro lado do par — é o caso de quem consome conteúdo na própria língua para praticar a outra.
  if (obs === m) {
    return e && e !== obs
      ? { destino: e, motivo: 'redirecionado' }
      : { destino: '', motivo: 'sem-destino' }
  }
  return { destino: m, motivo: 'padrao' }
}
