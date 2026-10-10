/**
 * MEMÓRIA DE UMA FUNÇÃO PURA DE TEXTO — a resposta guardada pela própria entrada.
 *
 * POR QUE EXISTE (auditoria de desempenho de 10/10/2026, gargalos 2 e 8). O saguão do Jogar pergunta
 * a mesma coisa sobre a mesma palavra dezenas de vezes por entrada: a chave sem acento de cada
 * palavra e de cada tradução, uma vez por jogo (são 18), e tudo de novo quando a composição do
 * servidor chega, quando a rodada termina e a cada volta à tela. Medido no build de produção, CPU 4×:
 * `chaveDaPalavra` sozinha custava de 178 a 292 ms de tempo próprio por passada.
 *
 * A CHAVE É O TEXTO, e por isso a memória nunca fica velha: a função é pura (mesma entrada, mesma
 * saída, sem relógio e sem estado), então não há o que invalidar. Baralho novo traz palavras novas, que
 * simplesmente ainda não estão no mapa.
 *
 * O TETO evita que uma sessão longa guarde tudo o que já viu: ao enchê-lo, o mapa é esvaziado e
 * recomeça (uma passada volta a pagar o preço de antes, e só ela). Sem fila de uso recente de
 * propósito: a fila custaria mais por leitura do que a conta que ela protege.
 *
 * O valor guardado é devolvido como está. Só serve para resultado imutável (texto, número, booleano)
 * ou objeto que ninguém altera; quem devolve objeto diz isso no ponto de uso.
 */
export function memoDeTexto<R>(calcular: (texto: string) => R, teto = 30_000): (texto: string) => R {
  const guardado = new Map<string, R>()
  return (texto) => {
    const tem = guardado.get(texto)
    if (tem !== undefined || guardado.has(texto)) return tem as R
    const valor = calcular(texto)
    if (guardado.size >= teto) guardado.clear()
    guardado.set(texto, valor)
    return valor
  }
}
