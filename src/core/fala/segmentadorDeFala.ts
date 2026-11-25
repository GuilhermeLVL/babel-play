/**
 * O SEGMENTADOR DA LEITURA EM VOZ ALTA (openspec `leitura-ativa-com-moonshine`, tarefa 2.2). Puro: recebe os blocos de
 * PCM da captura (taxa nativa, do AudioWorklet) e diz quando um "trecho de fala" abre e fecha. É o VAD por energia da
 * sombra local (`pcm.ts`), só que contínuo: quadros de 20 ms, ruído de fundo adaptativo, abre com poucos quadros
 * seguidos de fala e fecha depois de uma pausa (~400 ms). Sem modelo, sem DOM, sem relógio: o tempo é o do áudio.
 */

const QUADRO_MS = 20;
/** Piso absoluto de energia (~ -44 dBFS): abaixo disso é sala, não voz. */
const PISO_RMS = 0.006;
const FATOR_SOBRE_O_RUIDO = 3;
/** Quadros seguidos de fala para abrir um trecho (60 ms): descarta estalos. */
const QUADROS_PARA_ABRIR = 3;
export const PAUSA_QUE_FECHA_MS = 400;
/** Quão rápido o ruído de fundo acompanha o que é silêncio. */
const PASSO_DO_RUIDO = 0.05;

export interface EventoDoSegmento {
  /** Há um trecho de fala aberto agora (depois deste bloco). */
  falando: boolean;
  /** Este bloco abriu o trecho. */
  abriu: boolean;
  /** Este bloco fechou o trecho (a pausa passou). */
  fechou: boolean;
}

export interface SegmentadorDeFala {
  alimentar(bloco: Float32Array): EventoDoSegmento;
  /** Esquece o estado (o trecho aberto, os quadros pendentes); mantém o ruído de fundo aprendido. */
  reiniciar(): void;
}

export function criarSegmentadorDeFala(taxa: number): SegmentadorDeFala {
  const quadro = Math.max(1, Math.round((taxa * QUADRO_MS) / 1000));
  const quadrosDePausa = Math.round(PAUSA_QUE_FECHA_MS / QUADRO_MS);
  let soma = 0;
  let n = 0;
  let ruido = PISO_RMS / FATOR_SOBRE_O_RUIDO;
  let falando = false;
  let seguidosDeFala = 0;
  let seguidosDeSilencio = 0;

  const quadroPronto = (rms: number, e: { abriu: boolean; fechou: boolean }) => {
    const fala = rms >= Math.max(PISO_RMS, ruido * FATOR_SOBRE_O_RUIDO);
    if (!fala && !falando) ruido += (rms - ruido) * PASSO_DO_RUIDO;
    if (fala) {
      seguidosDeSilencio = 0;
      seguidosDeFala++;
      if (!falando && seguidosDeFala >= QUADROS_PARA_ABRIR) {
        falando = true;
        e.abriu = true;
      }
      return;
    }
    seguidosDeFala = 0;
    if (!falando) return;
    seguidosDeSilencio++;
    if (seguidosDeSilencio >= quadrosDePausa) {
      falando = false;
      seguidosDeSilencio = 0;
      e.fechou = true;
    }
  };

  return {
    alimentar(bloco) {
      const e = { abriu: false, fechou: false };
      for (let i = 0; i < bloco.length; i++) {
        soma += bloco[i]! * bloco[i]!;
        if (++n >= quadro) {
          quadroPronto(Math.sqrt(soma / n), e);
          soma = 0;
          n = 0;
        }
      }
      return { falando, ...e };
    },
    reiniciar() {
      soma = 0;
      n = 0;
      falando = false;
      seguidosDeFala = 0;
      seguidosDeSilencio = 0;
    },
  };
}
