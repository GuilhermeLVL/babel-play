/**
 * "PERGUNTAR AO TUTOR" a partir da folha da palavra (openspec `cartoes` 6.3; flag `estudo_palavras_v2`): a situação de quem
 * está na tela e o pedido que abre a janela do tutor já com a pergunta no campo. A pessoa lê e envia; nada sai sozinho. A
 * resposta do tutor para perfil protegido passa pelo filtro de saída do servidor, como em qualquer conversa.
 */
import {
  type DetalheDoPedidoAoTutor,
  EVENTO_PERGUNTAR_AO_TUTOR,
  perguntaSobreAPalavra,
  podePerguntarAoTutor,
  type SituacaoDoTutor,
} from '../../core/palavras/perguntaAoTutor';
import { edicaoEstatica } from '../edicaoEstatica';
import { estadoDeIdentidade } from '../identidade';
import { estadoDaProtecao, perfilProtegido } from '../protecaoDoMenor';

export function situacaoDoTutor(): SituacaoDoTutor {
  const identidade = estadoDeIdentidade();
  return {
    edicaoEstatica: edicaoEstatica(),
    temConta: identidade === 'conta' || identidade === 'selfhost',
    perfilProtegido: perfilProtegido(),
    contaRestrita: estadoDaProtecao()?.restrita === true,
  };
}

export const tutorDisponivelParaAPalavra = (): boolean => podePerguntarAoTutor(situacaoDoTutor());

/** Abre o tutor com a pergunta sobre a palavra no campo de texto. */
export function perguntarAoTutorSobre(palavra: string, frase?: string | null): void {
  if (typeof window === 'undefined') return;
  const detalhe: DetalheDoPedidoAoTutor = { texto: perguntaSobreAPalavra(palavra, frase) };
  window.dispatchEvent(new CustomEvent<DetalheDoPedidoAoTutor>(EVENTO_PERGUNTAR_AO_TUTOR, { detail: detalhe }));
}
