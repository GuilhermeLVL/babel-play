/**
 * A FAIXA AUTODECLARADA de quem usa sem conta (openspec `acesso-sem-conta-v2`): "tenho 18 anos ou
 * mais" ou "sou menor". Fica SÓ neste aparelho (`localStorage`) e NUNCA vai ao servidor. É conversão,
 * não verificação de idade: ao criar conta, a `PerguntaDeIdade` continua sendo a fonte da verdade.
 * Todo acesso ao armazenamento é protegido: navegação privada pode recusá-lo, e aí a pergunta só
 * se repete.
 */

import type { FaixaDeclarada } from '../core/acessoSemConta';

export const CHAVE_DA_FAIXA_SEM_CONTA = 'babel.faixa_sem_conta';

export function lerFaixaSemConta(): FaixaDeclarada {
  try {
    const v = localStorage.getItem(CHAVE_DA_FAIXA_SEM_CONTA);
    return v === 'adulto' || v === 'menor' ? v : null;
  } catch {
    return null;
  }
}

export function gravarFaixaSemConta(faixa: 'adulto' | 'menor'): void {
  try {
    localStorage.setItem(CHAVE_DA_FAIXA_SEM_CONTA, faixa);
  } catch {
    /* sem armazenamento: a pergunta volta na próxima visita, nada mais se perde */
  }
}
