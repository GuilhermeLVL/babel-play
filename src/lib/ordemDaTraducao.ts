/**
 * ORDEM DE CHEGADA ≠ ORDEM DE PEDIDO.
 *
 * Um mesmo balão de legenda recebe VÁRIOS pedidos de tradução: um por parcial (o texto refina
 * enquanto a pessoa fala — "Hola", "Hola qué", "Hola qué tal") e um do decode final, que é o
 * autoritativo. Todos escrevem no MESMO segmento, e cada um leva um tempo diferente para voltar.
 *
 * O defeito: nada garantia que o último a CHEGAR fosse o último a ter sido PEDIDO. Uma tradução
 * de parcial que demorasse mais que a do final sobrescrevia o texto bom pelo texto pela metade —
 * e ficava assim, porque nada mais escreve naquele balão depois. Quanto mais lento o tradutor,
 * mais provável a inversão: justamente o cenário em que o usuário mais precisa da legenda certa.
 *
 * A regra aqui é uma só: cada pedido recebe um selo crescente, e um resultado só pode escrever na
 * tela se o seu selo ainda for o mais recente daquele segmento. Resultado atrasado é descartado —
 * não perdido em silêncio, apenas irrelevante, porque um pedido mais novo já está a caminho.
 *
 * `ocupado()` serve a um segundo propósito: EVITAR O PEDIDO. Traduzir todo parcial gasta uma
 * chamada por refinamento e joga fora todas menos a última. Quando já há uma tradução em voo para
 * o segmento, o parcial seguinte pode simplesmente não ser pedido — o final sempre traduz, então
 * nada fica sem legenda.
 */
export class OrdemDasTraducoes {
  /** Último selo emitido por segmento — quem não bate com ele perdeu a vez. */
  private ultimoSelo = new Map<string, number>()
  /** Quantos pedidos ainda estão em voo por segmento. */
  private abertos = new Map<string, number>()

  /** Registra um novo pedido e devolve o selo que o identifica. */
  abrir(segId: string): number {
    const selo = (this.ultimoSelo.get(segId) ?? 0) + 1
    this.ultimoSelo.set(segId, selo)
    this.abertos.set(segId, (this.abertos.get(segId) ?? 0) + 1)
    return selo
  }

  /**
   * Encerra o pedido e responde à única pergunta que importa: **este resultado ainda pode
   * escrever na tela?** `false` = um pedido mais novo já foi feito para este segmento.
   *
   * Chame UMA vez por `abrir` — inclusive nos caminhos que nem chegam a pedir tradução (cache,
   * "não há para onde traduzir"), senão o segmento fica marcado como ocupado para sempre e todo
   * parcial seguinte é descartado.
   */
  encerrar(segId: string, selo: number): boolean {
    const restantes = (this.abertos.get(segId) ?? 1) - 1
    if (restantes > 0) this.abertos.set(segId, restantes)
    else this.abertos.delete(segId)
    return this.ultimoSelo.get(segId) === selo
  }

  /** Há tradução em voo para este segmento? */
  ocupado(segId: string): boolean {
    return (this.abertos.get(segId) ?? 0) > 0
  }

  /** Esquece o segmento (ele saiu da tela). */
  esquecer(segId: string): void {
    this.ultimoSelo.delete(segId)
    this.abertos.delete(segId)
  }

  /** Sessão nova não herda a anterior. */
  limpar(): void {
    this.ultimoSelo.clear()
    this.abertos.clear()
  }

  /** Segmentos rastreados — só para teste/diagnóstico de vazamento. */
  get tamanho(): number {
    return this.ultimoSelo.size
  }
}
