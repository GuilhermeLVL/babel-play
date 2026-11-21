/**
 * O ACESSO SEM CONTA v2 (openspec `acesso-sem-conta-v2`): experimentar UMA vez, depois entrar.
 *
 * Regra pura, sem React, sem rede, sem armazenamento. Quem chama passa o que sabe (sessões gravadas
 * neste aparelho, a faixa que a pessoa declarou, a flag, a conta, a edição) e recebe o que mostrar.
 *
 * NÃO É SEGURANÇA, é conversão (`docs/flags.md`: "flag nunca é cota nem segurança"): o uso sem conta
 * roda só com motores do aparelho, sem custo de servidor, e a faixa é autodeclarada e fica só no
 * aparelho. Um adulto que se declarar menor segue local; isso é aceito de propósito.
 *
 * ESTADOS:
 * - `livre`: nada a pedir agora (flag desligada, já tem conta, edição fora da regra ou ainda sem
 *   nenhuma sessão gravada: a 1ª sessão é livre).
 * - `porta`: a porta de entrada obrigatória (pergunta de faixa; adulto entra com login). Vale para
 *   quem já usou uma vez e é adulto OU ainda não respondeu a faixa.
 * - `convite`: menor de 18 no modo local como hoje. Só convida (sem urgência, dispensável) quando o
 *   acervo local chega perto do teto de `TETO_ANONIMO`; antes disso fica `livre`.
 */

import { estadoDoTeto } from './tetoAnonimo';

/** O que a pessoa declarou neste aparelho; `null` = ainda não respondeu. Nunca vai ao servidor. */
export type FaixaDeclarada = 'adulto' | 'menor' | null;

/**
 * Onde o app roda. Só `web` (o app público com conta) entra na regra; a edição estática (sem
 * servidor, sem conta) e o self-host (`authRequired` protege tudo) ficam de fora.
 */
export type EdicaoDoApp = 'web' | 'estatica' | 'selfhost';

export type EstadoDoAcesso = 'livre' | 'convite' | 'porta';

export interface EntradaDoAcesso {
  /** Sessões gravadas só neste aparelho (as do IndexedDB efêmero). */
  sessoesLocais: number;
  faixaDeclarada: FaixaDeclarada;
  /** A flag `acesso_restrito_sem_conta` para esta pessoa. */
  flagLigada: boolean;
  temConta: boolean;
  edicao: EdicaoDoApp;
}

/** A regra vale para esta pessoa agora? (flag ligada, sem conta, edição `web`). */
function regraAplica(e: Pick<EntradaDoAcesso, 'flagLigada' | 'temConta' | 'edicao'>): boolean {
  return e.flagLigada && !e.temConta && e.edicao === 'web';
}

export function estadoDoAcesso(e: EntradaDoAcesso): EstadoDoAcesso {
  if (!regraAplica(e)) return 'livre';
  if (e.sessoesLocais < 1) return 'livre';
  if (e.faixaDeclarada === 'menor') {
    return estadoDoTeto('sessoes', e.sessoesLocais).perto ? 'convite' : 'livre';
  }
  return 'porta';
}

/**
 * Pode ler livros agora? O catálogo é livre; LER pede conta para adulto. Quem ainda não declarou a
 * faixa não lê: a porta pergunta primeiro. Menor segue livre, como hoje.
 */
export function podeLer(e: Pick<EntradaDoAcesso, 'faixaDeclarada' | 'flagLigada' | 'temConta' | 'edicao'>): boolean {
  if (!regraAplica(e)) return true;
  return e.faixaDeclarada === 'menor';
}
