/**
 * A SOMBRA DO ROTEADOR ADAPTATIVO — agregação PURA do que ele decidiria ao lado do que a rota efetiva fez (openspec
 * `roteador-adaptativo-em-sombra`, design §3).
 *
 * O QUE SE GUARDA, e só isso: contagens por (decisão que tomaria, degrau efetivo, motivo da rota efetiva, balde do RTF,
 * balde da fila) e o número de trocas de decisão. Tudo de LISTA FECHADA ou balde: nunca texto, áudio, id de conta, sessão
 * ou fala, hora, nem o valor bruto de um sinal. O servidor valida as mesmas listas (`server/routes/metricasCaptura.ts`) e
 * um teste de contrato cobra que as duas pontas concordem.
 *
 * LIMITES: no máximo `MAX_LINHAS_DO_ROTEADOR` combinações distintas por lote e `MAX_CONTAGEM_DO_ROTEADOR` por contagem
 * (o mesmo teto do `v: 2`); o que passa disso é descartado, nunca acumulado sem fim. Em memória, sem persistência: o lote
 * é drenado a cada envio, e para o perfil protegido a drenagem só descarta.
 *
 * PURO: sem relógio, sem DOM, sem rede.
 */
import {
  type DegrauAdaptativo,
  type DegrauDaRota,
  DEGRAUS_ADAPTATIVOS,
  type MotivoDaRota,
  MOTIVOS_DA_ROTA,
} from './politicaDeRota';

/** Combinações por lote: um lote é de ~1 minuto (dezenas de falas) e o corpo da rota tem teto de 8 KB, então poucas bastam. */
export const MAX_LINHAS_DO_ROTEADOR = 24;
export const MAX_CONTAGEM_DO_ROTEADOR = 200;

/** Os degraus efetivos possíveis; o `Record` faz o compilador acusar se `DegrauDaRota` mudar. */
const DEGRAUS_EFETIVOS_MAPA: Record<DegrauDaRota, true> = {
  'modelo-no-aparelho': true,
  'navegador-no-aparelho': true,
  'navegador-na-nuvem': true,
  'nuvem-por-trechos': true,
  'nuvem-ao-vivo': true,
  'nuvem-do-site': true,
};
export const DEGRAUS_EFETIVOS = Object.keys(DEGRAUS_EFETIVOS_MAPA) as DegrauDaRota[];

/** RTF em 4 baldes: 0 até 0,5 (folga), 1 até 0,8, 2 acima de 0,8 (pressão), 3 = não medido. */
export const BALDES_DE_RTF = 4;
/** Fila em 3 baldes: 0, 1, 2 ou mais. */
export const BALDES_DE_FILA = 3;

export const baldeDoRtf = (rtf: number | null): number =>
  rtf === null || !Number.isFinite(rtf) ? 3 : rtf <= 0.5 ? 0 : rtf <= 0.8 ? 1 : 2;
export const baldeDaFila = (fila: number): number => (!(fila >= 1) ? 0 : fila < 2 ? 1 : 2);

export interface LinhaDoRoteador {
  tomaria: DegrauAdaptativo;
  efetiva: DegrauDaRota;
  motivo: MotivoDaRota;
  rtf: number;
  fila: number;
  n: number;
}

/** O que vai no campo `roteador` do lote `v: 2` (o idioma-base é acrescentado por quem monta o lote). */
export interface CampoDoRoteador {
  linhas: LinhaDoRoteador[];
  /** Trocas de decisão no lote (o lote é de ~1 minuto: serve para contar trocas por minuto). */
  trocas: number;
}

export interface FalaDaSombra {
  tomaria: DegrauAdaptativo;
  efetiva: DegrauDaRota;
  motivo: MotivoDaRota;
  rtf: number | null;
  fila: number;
  trocou: boolean;
}

export interface SombraDoRoteador {
  registrar(fala: FalaDaSombra): void;
  /** Devolve o que acumulou e zera; `null` = nada. */
  drenar(): CampoDoRoteador | null;
}

const MOTIVOS: ReadonlySet<string> = new Set(MOTIVOS_DA_ROTA);
const DECISOES: ReadonlySet<string> = new Set(DEGRAUS_ADAPTATIVOS);
const EFETIVOS: ReadonlySet<string> = new Set(DEGRAUS_EFETIVOS);
const teto = (n: number): number => Math.min(MAX_CONTAGEM_DO_ROTEADOR, n);

export function criarSombraDoRoteador(): SombraDoRoteador {
  let linhas = new Map<string, LinhaDoRoteador>();
  let trocas = 0;
  return {
    registrar(f) {
      // Defesa em profundidade: o que não é de lista fechada não entra (o tipo já garante; o dado de fora, não).
      if (!DECISOES.has(f.tomaria) || !EFETIVOS.has(f.efetiva) || !MOTIVOS.has(f.motivo)) return;
      if (f.trocou) trocas = teto(trocas + 1);
      const rtf = baldeDoRtf(f.rtf);
      const fila = baldeDaFila(f.fila);
      const chave = `${f.tomaria}|${f.efetiva}|${f.motivo}|${rtf}|${fila}`;
      const atual = linhas.get(chave);
      if (atual) atual.n = teto(atual.n + 1);
      else if (linhas.size < MAX_LINHAS_DO_ROTEADOR)
        linhas.set(chave, { tomaria: f.tomaria, efetiva: f.efetiva, motivo: f.motivo, rtf, fila, n: 1 });
    },
    drenar() {
      if (!linhas.size && !trocas) return null;
      const campo: CampoDoRoteador = { linhas: [...linhas.values()], trocas };
      linhas = new Map();
      trocas = 0;
      return campo;
    },
  };
}
