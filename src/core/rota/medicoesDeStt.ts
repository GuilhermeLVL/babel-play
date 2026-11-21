/**
 * MEDIÇÕES VERSIONADAS DO STT (openspec `stt-ingles-volume-e-rota`, REQ-015): a rota do inglês decide por estes números,
 * não por um valor escrito em comentário. Cada medição leva WER (em %), IC 95% por bootstrap, n de falas, data e fonte.
 *
 * REGRA: a nuvem só é "primeiro" no inglês se a nuvem NORMALIZADA vencer o motor local de inglês com IC 95% PAREADO
 * (limite superior da diferença de WER abaixo de zero). Empate não basta. Sem medição normalizada registrada, o inglês
 * fica no aparelho. Atualizar este arquivo é parte de repetir a medição (`docs/auditoria/2026-11-21-stt-ingles-volume.md`).
 *
 * Puro: sem DOM, sem rede.
 */

export interface MedicaoDeStt {
  /** WER em pontos percentuais. */
  wer: number;
  ic95: readonly [number, number];
  /** Falas medidas. */
  n: number;
  /** AAAA-MM-DD. */
  data: string;
  fonte: string;
}

/** Diferença PAREADA de WER (nuvem − aparelho), em pontos percentuais, fala a fala sobre as mesmas falas. */
export interface DiferencaPareada {
  valor: number;
  ic95: readonly [number, number];
  n: number;
  data: string;
  fonte: string;
}

export type MotorLocalDeIngles = 'moonshine-base' | 'parakeet-v3';

export interface MedicoesDoIngles {
  /** A rota padrão do OpenRouter com o áudio como veio (o que o app faz com a flag desligada). */
  nuvemPadrao: MedicaoDeStt;
  /**
   * A nuvem com o volume normalizado PELA FUNÇÃO ENTREGUE (`normalizarVolume`), medida nas mesmas falas. `null` até haver
   * medição: sem ela o inglês fica no aparelho.
   */
  nuvemNormalizada: MedicaoDeStt | null;
  locais: Record<MotorLocalDeIngles, MedicaoDeStt>;
  /** Nuvem normalizada − motor local, pareada. `null` = não medida. */
  nuvemNormalizadaContraLocal: Record<MotorLocalDeIngles, DiferencaPareada | null>;
}

export interface MedicoesDeStt {
  en: MedicoesDoIngles;
}

const FONTE_DE_OUTUBRO = 'docs/auditoria/2026-10-09-medicoes-de-nuvem.md (100 falas FLEURS en)';

export const MEDICOES_DE_STT: MedicoesDeStt = {
  en: {
    nuvemPadrao: { wer: 27.8, ic95: [22.1, 33.9], n: 100, data: '2026-10-09', fonte: FONTE_DE_OUTUBRO },
    nuvemNormalizada: null,
    locais: {
      'moonshine-base': { wer: 13.6, ic95: [10.5, 17.2], n: 100, data: '2026-10-09', fonte: FONTE_DE_OUTUBRO },
      'parakeet-v3': { wer: 7.1, ic95: [5.6, 8.5], n: 100, data: '2026-10-09', fonte: FONTE_DE_OUTUBRO },
    },
    nuvemNormalizadaContraLocal: { 'moonshine-base': null, 'parakeet-v3': null },
  },
};

/**
 * A nuvem normalizada vence o motor local de inglês da rota `auto` (o Moonshine base)? Só com diferença pareada medida e
 * limite superior do IC 95% abaixo de zero. Sem medição, ou com empate, é `false`: o inglês fica no aparelho.
 */
export function inglesNuvemVenceAparelho(
  medicoes: MedicoesDeStt = MEDICOES_DE_STT,
  motor: MotorLocalDeIngles = 'moonshine-base',
): boolean {
  const en = medicoes.en;
  if (!en.nuvemNormalizada) return false;
  const d = en.nuvemNormalizadaContraLocal[motor];
  return d != null && Number.isFinite(d.ic95[1]) && d.ic95[1] < 0;
}
