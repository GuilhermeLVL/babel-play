import { t } from '../../../lib/i18n';

/**
 * `salvarNaFolha` devolve uma MENSAGEM, não um estado estruturado. Aqui fica a única comparação de texto: a palavra
 * entrou no caderno agora ("adicionado ao seu deck") ou já estava nele; ambos são sucesso para "Guardar" da lista.
 */
export function palavraFicouNoCaderno(mensagem: string): boolean {
  return mensagem === 'adicionado ao seu deck' || mensagem === t('Esta palavra já está no seu caderno.');
}
