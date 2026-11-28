/**
 * "PERGUNTAR AO TUTOR" NA FOLHA DA PALAVRA (openspec `cartoes` 6.3; flag `estudo_palavras_v2`).
 *
 * O botão só existe quando o tutor pode responder a quem está na tela. A resposta do tutor para perfil protegido passa SEMPRE
 * pelo filtro de saída do servidor (change `filtro-tutor-menores`, `moderarSaidaDoTutor`); aqui o cliente não decide nada de
 * segurança, só não oferece o botão onde o tutor não responderia:
 *   - edição estática (sem servidor, o tutor nem monta);
 *   - sem conta (o tutor é IA de nuvem e exige conta);
 *   - perfil protegido com conta RESTRITA (o responsável ainda não liberou) ou sem idade declarada sem conta.
 * Perfil protegido com conta liberada vê o botão: a resposta chega pelo filtro.
 */
export interface SituacaoDoTutor {
  edicaoEstatica: boolean;
  temConta: boolean;
  perfilProtegido: boolean;
  /** Conta restrita pelo responsável (`estadoDaProtecao().restrita`). */
  contaRestrita: boolean;
}

export function podePerguntarAoTutor(s: SituacaoDoTutor): boolean {
  if (s.edicaoEstatica || !s.temConta) return false;
  if (s.perfilProtegido && s.contaRestrita) return false;
  return true;
}

/**
 * A pergunta que vai para o campo do tutor (a pessoa ainda lê e envia): a palavra e, se houver, a frase de onde ela veio.
 * A frase é conteúdo capturado (não confiável): vai entre aspas, aparada e com teto, e o tutor a recebe como mensagem da
 * pessoa, como qualquer outra, pelo mesmo caminho de contenção do chat.
 */
export function perguntaSobreAPalavra(palavra: string, frase?: string | null): string {
  const p = palavra.replace(/\s+/g, ' ').trim().slice(0, 80);
  const f = (frase ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const pergunta = f
    ? `Pode me explicar a palavra “${p}” desta frase, em linguagem simples? “${f}”`
    : `Pode me explicar a palavra “${p}”, em linguagem simples, com um exemplo?`;
  return pergunta;
}

/** O nome do evento que a janela do tutor escuta para abrir já com a pergunta no campo. */
export const EVENTO_PERGUNTAR_AO_TUTOR = 'babel:perguntar-ao-tutor';

export interface DetalheDoPedidoAoTutor {
  texto: string;
}
