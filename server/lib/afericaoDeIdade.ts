/**
 * AFERIÇÃO DE IDADE ALÉM DA AUTODECLARAÇÃO — o ponto de encaixe (Fase 4). PENDENTE.
 *
 * O ECA Digital (Lei 15.211/2025) pede mecanismos de verificação de idade "confiáveis", e veda a
 * autodeclaração como único meio para certos conteúdos. O COMO ainda depende de regulamentação da
 * ANPD e de parecer jurídico: verificação por documento, estimativa facial, confirmação pelo
 * responsável, serviço de terceiro (cada um com o seu custo e o seu risco de privacidade).
 *
 * Até lá o app usa a DATA DECLARADA (`users.nascimento`), imutável pelo próprio titular, e trata a
 * idade desconhecida como MENOR (perfil protegido por padrão). Esta interface é onde um aferidor de
 * verdade entra, sem mudar quem consulta: hoje `aferidorAtual()` devolve a autodeclaração com
 * `confianca: 'autodeclarada'`, e é isso que o relatório de conformidade deve mostrar.
 */
import type { UserId } from './authContext'

export type ConfiancaDaIdade = 'autodeclarada' | 'confirmada-pelo-responsavel' | 'verificada'

export interface ResultadoDaAfericao {
  /** `AAAA-MM-DD`, ou `null` se não há dado. */
  nascimento: string | null
  confianca: ConfiancaDaIdade
}

export interface AferidorDeIdade {
  /** Quem implementa decide a fonte; quem consulta só lê o resultado e a confiança. */
  aferir(userId: UserId, declarada: string | null): Promise<ResultadoDaAfericao>
}

/** O único aferidor que existe hoje: devolve o que foi declarado. PENDENTE de regulamentação. */
export const aferidorPorAutodeclaracao: AferidorDeIdade = {
  async aferir(_userId, declarada) {
    return { nascimento: declarada, confianca: 'autodeclarada' }
  },
}

export function aferidorAtual(): AferidorDeIdade {
  return aferidorPorAutodeclaracao
}
