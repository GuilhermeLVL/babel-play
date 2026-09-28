/**
 * AS FALAS EM VOO E OS PRAZOS DO FIM DA CAPTURA (relato do dono, 2026-09-28).
 *
 * Ao apertar "Salvar", a frase que acabou de terminar ainda está sendo transcrita: o balão já está
 * na tela (`isPartial`) e o texto final chega em seguida. O salvamento pegava a lista daquele
 * instante e a frase ficava de fora. Agora ele espera as finais em voo por um prazo curto e segue
 * com o que houver: parcial com texto entra como está, balão vazio não vira fala.
 */
import type { SpeechSegment } from './tiposDaFala';

/** Quanto o salvamento espera as falas que ainda estão sendo transcritas. */
export const PRAZO_DAS_FINAIS_MS = 3000;

/** As falas que vão para a sessão: tudo que tem texto (balão vazio é um trecho que não deu fala). */
export function falasParaSalvar(segs: ReadonlyArray<SpeechSegment>): SpeechSegment[] {
  return segs.filter((s) => (s.originalText ?? '').trim().length > 0);
}

/** Espera até não haver fala em voo (ou o prazo) e devolve a lista final para salvar. */
export async function aguardarFinaisEmVoo(
  ler: () => ReadonlyArray<SpeechSegment>,
  prazoMs = PRAZO_DAS_FINAIS_MS,
  passoMs = 100,
): Promise<SpeechSegment[]> {
  const inicio = Date.now();
  while (ler().some((s) => s.isPartial) && Date.now() - inicio < prazoMs) {
    await new Promise((r) => setTimeout(r, passoMs));
  }
  return falasParaSalvar(ler());
}

/**
 * O PRAZO DA MISTURA das duas fontes (decodificar, renderizar, codificar): proporcional à duração,
 * com teto. Passou dele, a sessão fica com o áudio do sistema — a mistura não segura o salvamento.
 */
export function prazoDaMistura(duracaoSegundos: number): number {
  return Math.min(30_000, 5000 + Math.max(0, duracaoSegundos) * 50);
}
