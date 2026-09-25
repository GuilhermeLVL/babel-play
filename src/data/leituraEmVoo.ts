/**
 * UMA LEITURA EM VOO, COMPARTILHADA POR QUEM PEDE AO MESMO TEMPO (fix/rotas-caras).
 *
 * `fetchDeck` é chamado de 16 módulos e `fetchSettings` de 11, quase todos ao montar a tela: abrir
 * uma rota disparava várias vezes o mesmo GET em paralelo — e `GET /api/vocab` era a rota mais
 * cara do servidor (133 ms de CPU com 3.000 cartões). Aqui, quem pede enquanto a mesma leitura já
 * está em voo recebe a MESMA promessa; quando ela termina, o próximo pedido vai à rede de novo.
 *
 * NÃO É CACHE: nada é guardado depois que a resposta chega. E não pega carona numa leitura que
 * começou ANTES de uma escrita (`geracaoDeEscritas`, contada no funil): quem pede depois de
 * revisar um cartão ou salvar uma preferência recebe uma resposta que já inclui a escrita, como
 * antes.
 */
import { geracaoDeEscritas } from './funil'

export function compartilharEmVoo<T>(ler: () => Promise<T>): () => Promise<T> {
  let emVoo: { geracao: number; promessa: Promise<T> } | null = null
  return () => {
    const geracao = geracaoDeEscritas()
    if (emVoo && emVoo.geracao === geracao) return emVoo.promessa
    const atual = { geracao, promessa: ler() }
    emVoo = atual
    const soltar = () => {
      if (emVoo === atual) emVoo = null
    }
    atual.promessa.then(soltar, soltar)
    return atual.promessa
  }
}
