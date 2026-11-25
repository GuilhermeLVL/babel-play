/**
 * GRAVAÇÃO DAS HIPÓTESES DO PARCIAL (laboratório, ciclo 3; opt-in, só com `parciais_vivos` na rota do Parakeet).
 *
 * Com a chave de laboratório `babel.lab.gravarHipoteses=1` no localStorage, o pipeline registra, por fala, cada hipótese que o worker
 * devolve (token do `onUpdate` e decode completo), o instante em que a fala fechou e o texto final, todos com `performance.now()`.
 * Fica SÓ em memória (`window.__hipoteses`): a sonda da bancada lê dali, como lê `window.__lat`. Nada sai do navegador, nada vai à
 * telemetria. Serve a `scripts/perf/latencia-legenda/simular-exibicao.mjs`, que reproduz a tela sob outras políticas.
 *
 * CADÊNCIA DA GRAVAÇÃO: a mais rápida que o orçamento permite. Com a chave ligada, a cadência usa `CADENCIA_DE_GRAVACAO` (o piso de 500 ms
 * e o teto de CPU de produção; a fração do intervalo que o decode pode custar sobe de 0,5 para 1, de modo que o intervalo vira
 * `max(500 ms, custo do decode)`). O parcial continua sem enfileirar (worker ocupado não pede). Assim a subamostragem x1/x2/x3 do simulador
 * cobre as cadências de produção e as mais lentas. A gravação NÃO representa a carga de produção; a validação do simulador compara a tela
 * simulada com a tela real da MESMA rodada.
 */
import { CADENCIA_PADRAO, type ConfigDaCadencia } from '../../core/legendas/cadenciaDoParcial';
import type { EventoDeHipotese } from '../../core/legendas/exibicaoDoParcial';

export const CHAVE_DE_GRAVAR_HIPOTESES = 'babel.lab.gravarHipoteses';
/** Teto de eventos guardados (uma bancada de ~10 falas usa poucas centenas); passado dele, para de gravar. */
export const MAX_EVENTOS_GRAVADOS = 50_000;
export const CADENCIA_DE_GRAVACAO: ConfigDaCadencia = { ...CADENCIA_PADRAO, fracao: 1 };

/** O valor do localStorage liga a gravação só quando é exatamente `1`. */
export const gravarHipotesesLigado = (valor: string | null | undefined): boolean => String(valor ?? '').trim() === '1';

export interface DecodeGravado {
  token(texto: string): void;
  fim(texto: string): void;
}

export interface GravadorDeHipoteses {
  /** Começa o registro de um decode parcial desta fala (`null` com a gravação desligada). */
  decode(seq: number, audioMs: number): DecodeGravado | null;
  fechada(seq: number): void;
  final(seq: number, texto: string): void;
  readonly ligado: boolean;
}

/** `lerChave` lê a chave de laboratório; `agora` é `performance.now()`; `saida` é a lista (a `window.__hipoteses`). */
export function criarGravadorDeHipoteses(
  lerChave: () => string | null,
  agora: () => number,
  saida: EventoDeHipotese[],
): GravadorDeHipoteses {
  const decodes = new Map<number, number>();
  const cheio = (): boolean => saida.length >= MAX_EVENTOS_GRAVADOS;
  const ligadoAgora = (): boolean => gravarHipotesesLigado(lerChave());
  return {
    get ligado() {
      return ligadoAgora();
    },
    decode(seq, audioMs) {
      if (!ligadoAgora()) return null;
      const indice = decodes.get(seq) ?? 0;
      decodes.set(seq, indice + 1);
      const tIni = agora();
      return {
        token(texto) {
          if (!cheio()) saida.push({ tipo: 'token', t: agora(), seq, decode: indice, texto });
        },
        fim(texto) {
          if (!cheio()) saida.push({ tipo: 'decode', t: agora(), seq, decode: indice, tIni, audioMs, texto });
        },
      };
    },
    fechada(seq) {
      if (decodes.has(seq) && !cheio()) saida.push({ tipo: 'fechada', t: agora(), seq });
    },
    final(seq, texto) {
      if (!decodes.has(seq)) return;
      decodes.delete(seq);
      if (!cheio()) saida.push({ tipo: 'final', t: agora(), seq, texto });
    },
  };
}

const lerChaveDoStorage = (): string | null => {
  try {
    return localStorage.getItem(CHAVE_DE_GRAVAR_HIPOTESES);
  } catch {
    return null;
  }
};

let doApp: GravadorDeHipoteses | null = null;
/** O gravador do app: escreve em `window.__hipoteses` (criada na 1ª vez). */
export function gravadorDeHipoteses(): GravadorDeHipoteses {
  if (doApp) return doApp;
  const w = globalThis as { __hipoteses?: EventoDeHipotese[] };
  const lista = (w.__hipoteses ??= []);
  doApp = criarGravadorDeHipoteses(lerChaveDoStorage, () => performance.now(), lista);
  return doApp;
}
