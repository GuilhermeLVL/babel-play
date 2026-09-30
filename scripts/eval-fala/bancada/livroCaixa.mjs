/**
 * LIVRO-CAIXA DA BANCADA — o teto de gasto vale ANTES da chamada (B5, 29/09/2026).
 *
 * O livro anterior (em `comum.mjs`) somava o custo DEPOIS da resposta e lançava quando o total já
 * tinha passado do teto: a última chamada — e as que estavam em voo com a concorrência 4 — iam
 * além. Rodando no Actions com as chaves do dono, "passou um pouco" é dinheiro de verdade. Aqui:
 *
 *   1. RESERVAR antes de sair: quem chama passa o PIOR CASO da chamada (saída = `max_tokens`
 *      inteiro, entrada ≤ 1 token por caractere, STT com o mínimo faturado do provedor — ver
 *      `nuvem.mjs`). Se gasto + reservas em voo + esta reserva passaria do teto, a reserva é
 *      RECUSADA com `TetoDeGasto` e a chamada não acontece.
 *   2. ACERTAR com o custo real quando a resposta chega (o `usage` × a tabela de preço), ou
 *      CANCELAR quando o provedor recusou (4xx/5xx não são cobrados). Custo real desconhecido cobra
 *      o reservado — o lado seguro.
 *
 * Como a reserva é o pior caso, o real não passa dela; se passar (tabela de preço errada), o gasto
 * fica registrado do mesmo jeito e a bancada PARA ali — o erro diz que a estimativa falhou.
 *
 * O armazém é injetado: `comum.mjs` usa o arquivo `BANCADA_DIR/gasto.json` (as etapas do workflow
 * são processos separados e somam no mesmo arquivo); os testes usam memória.
 */

/** Tolerância de ponto flutuante: 2,9 + 0,05 não pode virar "acima de 3". */
const EPS = 1e-12

export class TetoDeGasto extends Error {
  constructor(mensagem) {
    super(mensagem)
    this.name = 'TetoDeGasto'
  }
}

const usd = (x) => `US$ ${x.toFixed(4)}`

/** Armazém em memória (testes e sondas que não persistem). */
export function armazemEmMemoria(inicial = { totalUsd: 0, porSistema: {} }) {
  const estado = { totalUsd: inicial.totalUsd ?? 0, porSistema: { ...(inicial.porSistema ?? {}) } }
  return {
    ler: () => ({ totalUsd: estado.totalUsd, porSistema: { ...estado.porSistema } }),
    somar: (sistema, valor) => {
      estado.totalUsd += valor
      estado.porSistema[sistema] = (estado.porSistema[sistema] ?? 0) + valor
    },
  }
}

export class LivroCaixa {
  #teto
  #armazem
  #reservado = 0

  /** @param {{ tetoUsd: number, armazem: { ler(): {totalUsd: number, porSistema: Record<string, number>}, somar(sistema: string, usd: number): void } }} p */
  constructor({ tetoUsd, armazem }) {
    if (!Number.isFinite(tetoUsd) || tetoUsd < 0) throw new Error(`teto de gasto inválido: ${tetoUsd}`)
    this.#teto = tetoUsd
    this.#armazem = armazem
  }

  get tetoUsd() {
    return this.#teto
  }
  get totalUsd() {
    return this.#armazem.ler().totalUsd
  }
  get reservadoUsd() {
    return this.#reservado
  }
  get disponivelUsd() {
    return Math.max(0, this.#teto - this.totalUsd - this.#reservado)
  }
  porSistema() {
    return this.#armazem.ler().porSistema
  }

  /**
   * Reserva o pior caso de UMA chamada. Devolve `{ acertar(usdReal), cancelar() }`; qualquer um dos
   * dois encerra a reserva, e o segundo uso é ignorado (uma retentativa não cobra duas vezes).
   */
  reservar(sistema, estimativaUsd) {
    if (!Number.isFinite(estimativaUsd) || estimativaUsd < 0) {
      throw new Error(`${sistema}: estimativa de custo inválida (${estimativaUsd}) — sem ela o teto não é garantido`)
    }
    const gasto = this.totalUsd
    if (gasto + this.#reservado + estimativaUsd > this.#teto + EPS) {
      throw new TetoDeGasto(
        `teto de gasto da bancada: ${usd(gasto)} gastos + ${usd(this.#reservado)} em voo + ${usd(estimativaUsd)} desta chamada passariam de US$ ${this.#teto} — parado ANTES de chamar`,
      )
    }
    this.#reservado += estimativaUsd
    let aberta = true
    const fechar = () => {
      if (!aberta) return false
      aberta = false
      this.#reservado = Math.max(0, this.#reservado - estimativaUsd)
      return true
    }
    return {
      acertar: (usdReal) => {
        if (!fechar()) return
        const real = Number.isFinite(usdReal) && usdReal >= 0 ? usdReal : estimativaUsd
        if (real > 0) this.#armazem.somar(sistema, real)
        const total = this.totalUsd
        if (total > this.#teto + EPS) {
          throw new TetoDeGasto(
            `teto de gasto da bancada: ${usd(total)} > US$ ${this.#teto} — o custo real de ${sistema} (${usd(real)}) passou da reserva (${usd(estimativaUsd)}); confira a tabela de preço`,
          )
        }
      },
      cancelar: () => {
        fechar()
      },
    }
  }

  /** O jeito antigo, DEPOIS da chamada (a sonda de latência). Soma e para acima do teto. */
  registrar(sistema, usdReal) {
    if (!Number.isFinite(usdReal) || usdReal <= 0) return
    this.#armazem.somar(sistema, usdReal)
    const total = this.totalUsd
    if (total > this.#teto + EPS)
      throw new TetoDeGasto(`teto de gasto da bancada atingido: ${usd(total)} > US$ ${this.#teto}`)
  }
}
