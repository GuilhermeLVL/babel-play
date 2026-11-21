import type { MedicoesDeStt } from '../../src/core/rota/medicoesDeStt'

/**
 * Medição hipotética em que a nuvem normalizada VENCE o Moonshine base com IC 95% pareado. Os testes que congelam a rota
 * "de antes" (inglês de quem tem nuvem vai à nuvem primeiro) a injetam, com `sttNuvemNormalizar: true`, para que o padrão
 * novo (inglês no aparelho, REQ-015) não os confunda com regressão. NÃO é uma medição real.
 */
export const MEDICOES_QUE_FAVORECEM_A_NUVEM: MedicoesDeStt = {
  en: {
    nuvemPadrao: { wer: 27.8, ic95: [22.1, 33.9], n: 100, data: '2026-10-09', fonte: 'fixture' },
    nuvemNormalizada: { wer: 6.1, ic95: [4.8, 7.5], n: 100, data: '2026-11-21', fonte: 'fixture' },
    locais: {
      'moonshine-base': { wer: 13.6, ic95: [10.5, 17.2], n: 100, data: '2026-10-09', fonte: 'fixture' },
      'parakeet-v3': { wer: 7.1, ic95: [5.6, 8.5], n: 100, data: '2026-10-09', fonte: 'fixture' },
    },
    nuvemNormalizadaContraLocal: {
      'moonshine-base': { valor: -7.4, ic95: [-10.5, -4.6], n: 100, data: '2026-11-21', fonte: 'fixture' },
      'parakeet-v3': { valor: -0.9, ic95: [-2.2, 0.3], n: 100, data: '2026-11-21', fonte: 'fixture' },
    },
  },
}

/** O trecho da entrada do `routeStt` que faz a nuvem normalizada valer. */
export const ENTRADA_COM_NUVEM_NORMALIZADA_VENCENDO = {
  sttNuvemNormalizar: true,
  medicoesDeStt: MEDICOES_QUE_FAVORECEM_A_NUVEM,
}
