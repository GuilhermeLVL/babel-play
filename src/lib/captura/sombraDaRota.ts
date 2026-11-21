/**
 * A SOMBRA DO ROTEADOR ADAPTATIVO NA CAPTURA (openspec `roteador-adaptativo-em-sombra`, flag
 * `roteador_adaptativo_sombra`). Carregado SÓ por `import()` de `conferenciaDaRota.ts`, com a flag ligada: desligada, este
 * módulo nem entra no bundle da captura.
 *
 * Por fala final: monta a `sessao` (RTF, fila, confiança), pergunta ao `decidirAdaptativo` o degrau que ele escolheria e
 * REGISTRA ao lado do degrau efetivo, em contagens agregadas (`core/rota/sombraDoRoteador.ts`). Nada daqui devolve ao
 * chamador uma rota, e nada na captura lê o resultado: a rota real não depende disto. Erro aqui morre aqui.
 *
 * Um lote só por página, em memória, sem persistência. Quem o drena é a telemetria (`registrarFonteDoRoteador`), que o
 * descarta para o perfil protegido e para quem não consentiu.
 */
import {
  decidirAdaptativo,
  type DegrauAdaptativo,
  type DegrauDaRota,
  ESTADO_INICIAL_DO_ADAPTATIVO,
  type EstadoDoAdaptativo,
  type GuardaDoAdaptativo,
  guardaDoAdaptativo,
  type MotivoDaRota,
  type PedidoDeRota,
} from '../../core/rota/politicaDeRota';
import { baldeDaFila, baldeDoRtf, criarSombraDoRoteador } from '../../core/rota/sombraDoRoteador';
import { registrarFonteDoRoteador } from '../../gateway/capture/telemetriaDeCaptura';

const sombra = criarSombraDoRoteador();
registrarFonteDoRoteador(() => sombra.drenar());

/**
 * O REGISTRO LOCAL fala a fala, para a BANCADA (E-005, `scripts/perf/latencia-legenda/avaliar-roteador.mjs`): as últimas
 * decisões em ordem, só com lista fechada e baldes (nenhum texto, id, hora ou valor bruto), lidas por `window.__roteadorSombra()`.
 * Fica na memória da aba, nunca é enviado nem gravado (a telemetria só leva as contagens agregadas).
 */
interface FalaRegistrada {
  /** Ordem da fala nesta página (0, 1, 2…). */
  i: number;
  tomaria: DegrauAdaptativo;
  efetiva: DegrauDaRota;
  motivo: MotivoDaRota;
  rtf: number;
  fila: number;
}
const LIMITE_DO_REGISTRO_LOCAL = 200;
const registroLocal: FalaRegistrada[] = [];
let contadorDeFalas = 0;
if (typeof window !== 'undefined')
  (window as unknown as { __roteadorSombra?: () => FalaRegistrada[] }).__roteadorSombra = () => registroLocal.slice();

/** O que a captura sabe de uma fala final. */
export interface FalaParaASombra {
  /** O motor que transcreveu de fato (`groq-whisper` = a nuvem). */
  engine?: string;
  /** Decode ÷ duração da fala; só o final LOCAL mede o aparelho. */
  rtf: number | null;
  /** Falas aguardando no decode. */
  fila: number;
  /** Confiança média dos tokens, quando o motor informa. */
  confianca: number | null;
  /** ms da última tradução, quando se sabe. */
  msDeMt?: number | null;
}

export type AlimentadorDaSombra = (fala: FalaParaASombra) => void;

/** O degrau efetivo da fala pelo motor que a transcreveu (o que a rota real FEZ, não o que a política previa). */
const efetivoDaFala = (engine: string | undefined): DegrauDaRota =>
  engine === 'groq-whisper' ? 'nuvem-por-trechos' : 'modelo-no-aparelho';

/**
 * O alimentador desta captura. `pedido` é o da política desta preparação (o mesmo do selo); a guarda é consultada uma vez
 * por degrau efetivo e guardada, e a histerese vive aqui. O que lançar é engolido.
 */
export function criarAlimentadorDaSombra(pedido: PedidoDeRota): AlimentadorDaSombra {
  let estado: EstadoDoAdaptativo = ESTADO_INICIAL_DO_ADAPTATIVO;
  const guardas = new Map<DegrauDaRota, GuardaDoAdaptativo>();
  return (fala) => {
    try {
      const efetivo = efetivoDaFala(fala.engine);
      let guarda = guardas.get(efetivo);
      if (!guarda) {
        guarda = guardaDoAdaptativo(pedido, efetivo);
        guardas.set(efetivo, guarda);
      }
      const r = decidirAdaptativo(
        {
          ...pedido,
          sessao: { rtf: fala.rtf, fila: fala.fila, msDeMt: fala.msDeMt ?? null, confianca: fala.confianca },
        },
        estado,
        { guarda },
      );
      estado = r.estado;
      sombra.registrar({
        tomaria: r.decisao,
        efetiva: guarda.efetivo,
        motivo: guarda.motivo,
        rtf: fala.rtf,
        fila: fala.fila,
        trocou: r.trocou,
      });
      registroLocal.push({
        i: contadorDeFalas++,
        tomaria: r.decisao,
        efetiva: guarda.efetivo,
        motivo: guarda.motivo,
        rtf: baldeDoRtf(fala.rtf),
        fila: baldeDaFila(fala.fila),
      });
      if (registroLocal.length > LIMITE_DO_REGISTRO_LOCAL) registroLocal.shift();
    } catch {
      /* a sombra nunca derruba a captura */
    }
  };
}
