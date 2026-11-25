/**
 * O MOTOR MOONSHINE DA LEITURA EM VOZ ALTA (openspec `leitura-ativa-com-moonshine`, tarefa 2.2; flag
 * `leitura_voz_local`). Um `MotorLocal` como o da Web Speech local, para onde ela não existe (Firefox, Safari, Quest):
 * a tela, o alinhador e a spec de privacidade não mudam.
 *
 * COMO OUVE: a captura entrega PCM (`capturarDoMicrofone`, a mesma da sombra local); o segmentador abre e fecha
 * "trechos de fala" por energia. Dentro de um trecho, a cada `cadenciaMs` de áudio, se o worker estiver ocioso, o trecho
 * INTEIRO até agora é decodificado (`transcribeIfIdle`) e vira `onPartial`; ao fechar (pausa de ~400 ms), a decodificação
 * final vira `onFinal`. O trecho tem teto de 30 s. O alinhador só avança e nunca recua, então um parcial que reescreve a
 * cauda não faz o cursor pular (por isso não há estabilizador de texto aqui).
 *
 * FALHA FECHADA: erro da captura ou do modelo vira `onError` fatal (a tela mostra "O microfone parou"). Este módulo não
 * recebe fábrica de nuvem: não existe caminho de rede. O ÁUDIO MORRE A CADA FRASE: `descartar()` solta o trecho e o
 * buffer, mas mantém o microfone aberto (reabri-lo perderia as primeiras palavras da frase seguinte).
 */
import { analisarFala, juntarBlocos, reamostrarPara16k, TAXA_DO_MODELO, TETO_DE_SEGUNDOS } from '../../core/fala/pcm';
import { criarSegmentadorDeFala, type SegmentadorDeFala } from '../../core/fala/segmentadorDeFala';
import { filtrarAlucinacao } from '../../gateway/alucinacao';
import type { SttCallbacks, SttSession } from '../../gateway/capabilities';
import { type Captura, capturarDoMicrofone } from '../fala/ouvirFraseNoAparelho';
import type { MotorLocal } from './ouvinteLocal';

/** A cadência do parcial, em ms de áudio (a régua 1.2 compara 0,5, 0,7 e 1,0 s). */
export const CADENCIA_DO_PARCIAL_MS = 700;
/** Folga guardada antes da abertura do trecho: o começo de uma palavra é fraco e o VAD demora 60 ms. */
const PRE_ROLL_MS = 300;

export interface DepsDoMoonshine {
  capturar(aoBloco: (bloco: Float32Array) => void): Promise<Captura>;
  /** Parcial: `null` quando o worker está ocupado. */
  parcial(pcm16k: Float32Array, lang: string): Promise<string | null>;
  /** Final: decodifica de verdade (espera a vez). */
  final(pcm16k: Float32Array, lang: string): Promise<string>;
}

export interface OpcoesDoMoonshine {
  id?: string;
  disponivel: () => boolean;
  deps?: Partial<DepsDoMoonshine>;
  cadenciaMs?: number;
  /** Modo "por pausa" (design 5): sem parcial vivo, só o final de cada trecho. */
  soPorPausa?: boolean;
}

/** `SttSession` com o `descartar` que só este motor tem: solta o trecho sem fechar o microfone. */
export type SessaoMoonshine = SttSession & { descartar(): void };

const erroFatal = (e: unknown): Error => {
  const nome = (e as { name?: string } | null)?.name;
  const codigo =
    nome === 'NotAllowedError' || nome === 'SecurityError'
      ? 'not-allowed'
      : nome === 'NotFoundError' || nome === 'NotReadableError'
        ? 'audio-capture'
        : 'parou';
  return Object.assign(e instanceof Error ? e : new Error('o motor local parou'), { codigo, fatal: true });
};

export function criarMotorMoonshineLocal(o: OpcoesDoMoonshine): MotorLocal {
  const cadenciaMs = o.cadenciaMs ?? CADENCIA_DO_PARCIAL_MS;
  return {
    id: o.id ?? 'moonshine-local',
    disponivel: o.disponivel,
    iniciar(lang: string, cb: SttCallbacks): SessaoMoonshine {
      const deps = depsPadrao(o.deps);
      let vivo = true;
      let captura: Captura | null = null;
      let segmentador: SegmentadorDeFala | null = null;
      /* Blocos do trecho aberto (ou o pré-rolo, enquanto ninguém fala) e quanto áudio já têm. */
      let blocos: Float32Array[] = [];
      let amostras = 0;
      let desdeOParcial = 0;
      let falando = false;
      /* Cada trecho tem um número (um parcial que chega depois de o trecho fechar é ignorado) e a época só muda quando a
         frase é descartada ou a sessão para (um resultado de antes disso também é ignorado). */
      let trecho = 0;
      let epoca = 0;
      let parcialEmVoo = false;

      const falhar = (e: unknown) => {
        if (!vivo) return;
        vivo = false;
        soltarTudo();
        cb.onError?.(erroFatal(e));
      };
      const soltarBuffers = () => {
        blocos = [];
        amostras = 0;
        desdeOParcial = 0;
      };
      const soltarTudo = () => {
        soltarBuffers();
        falando = false;
        trecho++;
        epoca++;
        segmentador = null;
        const c = captura;
        captura = null;
        if (c) void c.encerrar().catch(() => {});
      };
      const taxa = () => captura?.taxa ?? TAXA_DO_MODELO;
      const pcm16k = () => reamostrarPara16k(juntarBlocos(blocos), taxa());

      const emitirParcial = (meu: number) => {
        if (parcialEmVoo) return;
        const minhaEpoca = epoca;
        const pcm = pcm16k();
        parcialEmVoo = true;
        deps
          .parcial(pcm, lang)
          .then((texto) => {
            if (!vivo || meu !== trecho || minhaEpoca !== epoca || !texto) return;
            const limpo = filtrarAlucinacao(texto, pcm.length / TAXA_DO_MODELO, lang);
            if (limpo) cb.onPartial(limpo);
          })
          .catch(falhar)
          .finally(() => {
            parcialEmVoo = false;
          });
      };

      const fecharTrecho = () => {
        const minhaEpoca = epoca;
        const analise = analisarFala(pcm16k());
        soltarBuffers();
        falando = false;
        trecho++;
        if (analise.semFala) return;
        deps
          .final(analise.aparado, lang)
          .then((texto) => {
            if (!vivo || minhaEpoca !== epoca) return;
            const limpo = filtrarAlucinacao(texto, analise.duracaoMs / 1000, lang);
            if (limpo) cb.onFinal({ text: limpo });
          })
          .catch(falhar);
      };

      const aoBloco = (bloco: Float32Array) => {
        if (!vivo || !captura) return;
        segmentador ??= criarSegmentadorDeFala(captura.taxa);
        const ev = segmentador.alimentar(bloco);
        blocos.push(bloco);
        amostras += bloco.length;
        if (!falando && !ev.abriu) {
          /* Ninguém fala: guarda só o pré-rolo. */
          const teto = (PRE_ROLL_MS / 1000) * captura.taxa;
          while (blocos.length > 1 && amostras - blocos[0]!.length >= teto) amostras -= blocos.shift()!.length;
          return;
        }
        if (ev.abriu) {
          falando = true;
          desdeOParcial = 0;
        }
        desdeOParcial += bloco.length;
        if (ev.fechou) return fecharTrecho();
        if (amostras >= TETO_DE_SEGUNDOS * captura.taxa) return fecharTrecho();
        if (!o.soPorPausa && desdeOParcial >= (cadenciaMs / 1000) * captura.taxa) {
          desdeOParcial = 0;
          emitirParcial(trecho);
        }
      };

      deps
        .capturar(aoBloco)
        .then((c) => {
          if (!vivo) return void c.encerrar().catch(() => {});
          captura = c;
        })
        .catch(falhar);

      return {
        stop() {
          vivo = false;
          soltarTudo();
        },
        descartar() {
          if (!vivo) return;
          soltarBuffers();
          falando = false;
          trecho++;
          epoca++; /* resultados em voo da frase que acabou não valem */
          segmentador?.reiniciar();
        },
      };
    },
  };
}

function depsPadrao(d?: Partial<DepsDoMoonshine>): DepsDoMoonshine {
  return {
    capturar: d?.capturar ?? capturarDoMicrofone,
    parcial:
      d?.parcial ??
      (async (pcm, lang) => {
        const { transcreverParcial } = await import('../fala/transcritorDaSombra');
        return transcreverParcial(pcm, lang);
      }),
    final:
      d?.final ??
      (async (pcm, lang) => {
        const { transcreverFrase } = await import('../fala/transcritorDaSombra');
        return transcreverFrase(pcm, lang);
      }),
  };
}
