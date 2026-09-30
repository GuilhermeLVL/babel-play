/**
 * A MEMÓRIA DOS MODELOS LOCAIS (Whisper + opus-mt) — quando carregar junto e quando soltar.
 *
 * Plano "Grátis sem travar", A7. Dois excessos travavam a camada gratuita:
 *
 *  1. STT e tradutor carregavam JUNTOS em todo aparelho que não fosse "pouca memória" (só móvel e
 *     Quest). No desktop sem GPU os dois abrem sessão no MESMO CPU (o Whisper também vai ao WASM), e
 *     num aparelho de 4 GB o pico soma os dois modelos (67–589 MB de pesos do Whisper, conforme a rota,
 *     e ~113 MB do tradutor — mais o heap de cada sessão; tamanhos em `sttRouter.ts`). Juntos, agora,
 *     só no desktop COM GPU e com 8 GB ou mais.
 *  2. Só o aparelho de pouca memória soltava os workers ao sair da captura; no desktop o modelo ficava
 *     preso na aba enquanto a pessoa lia o histórico ou jogava. O heap do WASM só volta ao sistema com
 *     o `terminate()` do worker — é o que `liberarModelo`/`liberarModelos` do gateway fazem.
 */
import type { PerfilDoDispositivo } from '../dispositivo/perfil';

/**
 * Carregar o STT e o tradutor UM DE CADA VEZ (o tradutor espera o Whisper ficar pronto)? Sim, a não
 * ser no desktop com GPU e ≥ 8 GB. `deviceMemory` ausente (Firefox, Safari) conta como 8: o Chromium
 * informa no máximo 8, e sem o sinal não há por que presumir o pior num desktop com GPU.
 */
export function umModeloDeCadaVez(perfil: Pick<PerfilDoDispositivo, 'poucaMemoria' | 'tipo' | 'sinais'>): boolean {
  return perfil.poucaMemoria || perfil.tipo !== 'desktop-com-gpu' || (perfil.sinais.memoriaGb ?? 8) < 8;
}

/**
 * Quanto a captura espera, depois que a pessoa sai dela, para soltar os modelos (fora do aparelho de
 * pouca memória, que solta na hora). Sair para conferir o histórico e voltar não paga a recarga; ficar
 * fora devolve os pesos do Whisper e dos tradutores, e o heap das sessões.
 */
export const LIBERAR_MODELOS_APOS_MS = 90_000;

/* Fica no MÓDULO, não no componente: a tela da captura desmonta ao sair, e é a próxima montagem
   (a pessoa voltou) que precisa encontrar e cancelar o agendamento. */
let relogio: ReturnType<typeof setTimeout> | null = null;

/** Agenda a liberação para daqui a `ms`. Uma nova saída troca o agendamento anterior. */
export function liberarModelosDepois(liberar: () => void, ms = LIBERAR_MODELOS_APOS_MS): void {
  cancelarLiberacaoDosModelos();
  relogio = setTimeout(() => {
    relogio = null;
    liberar();
  }, ms);
}

/** A pessoa voltou antes do prazo: os modelos continuam quentes. `true` se havia uma liberação agendada. */
export function cancelarLiberacaoDosModelos(): boolean {
  if (!relogio) return false;
  clearTimeout(relogio);
  relogio = null;
  return true;
}
