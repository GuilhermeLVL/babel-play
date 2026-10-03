/**
 * PISO DO SILÊNCIO — a partir de quanto silêncio o app pergunta ao modelo de turno se a frase acabou.
 *
 * Um piso fixo (300 ms) cortaria quem fala devagar: pausa de 500 ms para escolher a palavra viraria "silêncio
 * candidato" o tempo todo e o modelo seria consultado à toa (e, se errasse, a frase sairia em dois pedaços).
 * Por isso o piso acompanha as pausas DENTRO das falas da própria pessoa — as que terminaram com ela voltando
 * a falar — por média móvel exponencial (alfa 0,9: cada pausa pesa 10%, então um soluço não muda o piso).
 *
 * Sempre entre 250 e 600 ms: abaixo de 250 ms qualquer respiração é candidata; acima de 600 ms o ganho sobre o
 * silêncio fixo de 800 ms some. Recomeça em 300 ms a cada sessão: a pessoa do próximo vídeo não é a mesma.
 * Pura e sem relógio: quem usa mede a pausa e a entrega pronta.
 */

export const PISO_INICIAL_MS = 300;
export const PISO_MINIMO_MS = 250;
export const PISO_MAXIMO_MS = 600;
/** Peso da média antiga: 0,9 → a pausa nova entra com 0,1. */
const ALFA = 0.9;

export interface PisoDoSilencio {
  /** O piso de agora, em ms, sempre dentro de [250, 600]. */
  valor(): number;
  /** Uma pausa que terminou com a pessoa voltando a falar (ms). Valor inválido é ignorado. */
  registrarPausa(ms: number): void;
  /** Nova sessão: volta a 300 ms. */
  reiniciar(): void;
}

const limitar = (v: number): number => Math.min(PISO_MAXIMO_MS, Math.max(PISO_MINIMO_MS, v));

export function criarPisoDoSilencio(): PisoDoSilencio {
  // A média já fica limitada: sem isso, uma sequência de pausas enormes a levaria longe do teto e ela
  // demoraria dezenas de pausas para voltar quando a pessoa passasse a falar rápido.
  let media = PISO_INICIAL_MS;
  return {
    valor: () => media,
    registrarPausa(ms: number): void {
      if (!Number.isFinite(ms) || ms <= 0) return;
      media = limitar(ALFA * media + (1 - ALFA) * ms);
    },
    reiniciar(): void {
      media = PISO_INICIAL_MS;
    },
  };
}
