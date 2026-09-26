/**
 * CACHE POR USUÁRIO, VÁLIDO ENQUANTO A VERSÃO DOS DADOS NÃO MUDAR (fix/rotas-caras).
 *
 * Uma entrada por usuário, guardada junto com a versão (`versoes_de_dados`) que estava valendo
 * QUANDO a leitura começou. A leitura seguinte só a aproveita se a versão atual for a mesma; se
 * qualquer escrita aconteceu no meio, o gatilho subiu o número e a entrada simplesmente deixa de
 * casar — não há invalidação a chamar, e por isso não há invalidação a esquecer.
 *
 * A ORDEM que torna isso correto é responsabilidade de quem usa: ler a versão ANTES dos dados.
 * Se uma escrita cair entre as duas leituras, a entrada fica com dado NOVO sob versão VELHA — e
 * versão velha nunca mais volta a ser a atual, então ela nunca é servida. O contrário (dado velho
 * sob versão nova) é o que serviria dado desatualizado, e essa ordem o impede.
 *
 * TETO DUPLO — entradas e "peso" (bytes aproximados, quem guarda informa). Despeja a menos usada
 * recentemente: `Map` guarda ordem de inserção, e reinserir no acesso faz dela uma LRU.
 *
 * VIVE NO PROCESSO. É a topologia aprovada (uma máquina, ADR 0006); com mais de um processo cada
 * um teria o seu cache, e continuaria correto (a versão está no banco, compartilhada) — só menos
 * eficaz.
 */
export class CachePorVersao<V> {
  private readonly entradas = new Map<string, { versao: string; valor: V; peso: number }>()
  private pesoTotal = 0

  constructor(
    private readonly maxEntradas: number,
    private readonly maxPeso = Number.POSITIVE_INFINITY,
  ) {}

  obter(chave: string, versao: string): V | undefined {
    const e = this.entradas.get(chave)
    if (!e || e.versao !== versao) return undefined
    this.entradas.delete(chave)
    this.entradas.set(chave, e)
    return e.valor
  }

  guardar(chave: string, versao: string, valor: V, peso = 1): void {
    const velha = this.entradas.get(chave)
    if (velha) {
      this.entradas.delete(chave)
      this.pesoTotal -= velha.peso
    }
    // Uma entrada maior que o teto inteiro só serviria para despejar todas as outras.
    if (peso > this.maxPeso) return
    this.entradas.set(chave, { versao, valor, peso })
    this.pesoTotal += peso
    for (const [k, e] of this.entradas) {
      if (this.entradas.size <= this.maxEntradas && this.pesoTotal <= this.maxPeso) break
      this.entradas.delete(k)
      this.pesoTotal -= e.peso
    }
  }

  /** Para testes e diagnóstico. */
  get tamanho(): { entradas: number; peso: number } {
    return { entradas: this.entradas.size, peso: this.pesoTotal }
  }
}
