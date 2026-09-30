/**
 * O MOMENTO DA DECISÃO — o gancho que mantém a ordem de antes da Fase F.
 *
 * Antes da Fase F a rota respondia NO PONTO em que decidia, e só depois fazia a limpeza (devolver a
 * cota, soltar a vaga da admissão) e o trabalho que não muda a resposta (gravar a tradução no L2):
 * quem pediu não esperava o disco nem o estorno. Com o núcleo devolvendo o resultado, esse trabalho
 * aconteceria ANTES da resposta. O gancho `aoDecidir` devolve a ordem: o núcleo o chama no instante
 * em que o resultado fica decidido — dentro do `try`, antes do `finally` —, e o adaptador HTTP
 * responde ali.
 *
 * Quem não passa o gancho (a API, o MCP, um teste) usa o retorno, que é o MESMO objeto. E o gancho é
 * chamado UMA vez em todo caminho: o `decisor` é idempotente, e a função pública o chama de novo no
 * retorno — um caminho que esquecesse de decidir ainda responderia, só que depois da limpeza.
 */
export interface GanchosDoNucleo<R> {
  aoDecidir?: (resultado: R) => void
}

/** A função que marca a decisão: chama o gancho na primeira vez e devolve o próprio resultado. */
export function decisor<R>(ganchos: GanchosDoNucleo<R> | undefined): (resultado: R) => R {
  let decidido = false
  return (resultado) => {
    if (!decidido) {
      decidido = true
      ganchos?.aoDecidir?.(resultado)
    }
    return resultado
  }
}
