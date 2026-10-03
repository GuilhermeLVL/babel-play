/**
 * A FILA DE FALA DO MODO INTÉRPRETE (E1 da Fase E) — a tradução de cada fala lida em voz alta, uma de
 * cada vez, para a pessoa do outro lado.
 *
 * FORA DO JS INICIAL: só o intérprete a usa, e ele chega por `import()`. Não importa React nem a tela;
 * o motor da voz entra por parâmetro (`motor`), então a MESMA fila serve à voz do aparelho
 * (`nativeTts`, todos os planos) e à voz natural da nuvem (`vozDaNuvem.ts`, Premium). O motor é lido a
 * CADA item: trocar a voz no meio da conversa vale para a próxima fala.
 *
 * AS REGRAS, e o porquê de cada uma — numa conversa frente a frente, voz atrasada atrapalha mais do
 * que ajuda:
 *   - FIFO, no máximo `capacidade` itens (3) contando o que fala. O que chega com a fila cheia derruba
 *     o MAIS VELHO da espera (nunca o que está falando): entre duas traduções atrasadas, a mais nova é
 *     a que a conversa ainda precisa;
 *   - item com mais de `idadeMaximaMs` (20 s) desde o fim da fala original (`criadoEm`) não é lido,
 *     nem na chegada nem na vez dele. A tradução continua na tela;
 *   - BARGE-IN (`interromper`): alguém tocou para falar por cima. A voz para NA HORA, a espera esvazia
 *     (o que ela dizia ficou para trás) e a cauda do guarda de eco encurta (`cortarCaudaDoEco`) — sem
 *     isso, a fala de quem tocou, começando logo depois, seria descartada como eco do próprio app;
 *   - REPETIR lê o último de novo, mesmo passado o limite de idade (é pedido explícito); PARAR corta e
 *     esvazia, e guarda o último para o Repetir;
 *   - o motor NÃO trava a fila: erro passa ao próximo; fala que não começa em `prazoParaComecarMs`, ou
 *     que começa e nunca avisa o fim (o `speechSynthesis` do Chrome às vezes cala o `onend`), é
 *     encerrada pelo prazo.
 *
 * O GUARDA DE ECO é do motor: o nativo marca o `isTtsActive` pelo `onstart`/`onend` da própria fala;
 * a voz da nuvem, por `marcarFalaExterna` (`src/lib/tts.ts`). A fila só encurta a cauda no barge-in.
 *
 * A MÉTRICA `tts_inicio` (a meta do E6: do fim da fala à voz em ≤ 2,5 s p50 no Premium): `aoIniciar`
 * recebe, por item, a espera do `criadoEm` até o `onStart` do motor. O Repetir não conta.
 */
import type { LadoDoInterprete } from '../captura/tiposDaFala';
import { cortarCaudaDoEco, type SpeakOptions, type TtsEngine } from '../tts';

/** Um texto a ler. */
export interface ItemDeFala {
  /** Quem é (o id do balão da fala original): o Repetir e o registro usam. */
  id: string;
  texto: string;
  /** BCP-47 do texto — o idioma da TRADUÇÃO, não o da fala original. */
  lang: string;
  /** Fim da fala original, no relógio de `agora` (ms). Ausente = a chegada na fila. Conta para a idade. */
  criadoEm?: number;
  /** De que lado veio a fala original (o intérprete mostra a voz na metade do outro). */
  lado?: LadoDoInterprete;
  /**
   * TOQUE NO TEXTO (Intérprete v3): uma palavra ou frase que a pessoa tocou para ouvir. Não é a tradução
   * de uma fala: não vira o "último" do Repetir e não entra na métrica `tts_inicio`.
   */
  manual?: boolean;
  /** Velocidade só deste item (o modo lento do toque); vence a da fila. */
  velocidade?: number;
}

export type MotivoDoDescarte =
  /** A fila estava cheia e este era o mais velho da espera. */
  | 'cheia'
  /** Passou do limite de idade. */
  | 'velha'
  /** Barge-in: alguém tocou para falar. */
  | 'interrompida'
  /** A pessoa tocou em "Parar voz". */
  | 'parada'
  /** O motor não começou a falar no prazo. */
  | 'falhou';

export interface EstadoDaFila {
  falando: ItemDeFala | null;
  espera: readonly ItemDeFala[];
  /** O último que começou a ser lido — o que o Repetir lê. */
  ultimo: ItemDeFala | null;
}

export interface OpcoesDaFila {
  /** O motor desta fala (lido a cada item). */
  motor: () => TtsEngine;
  /** O relógio (ms). Padrão: `performance.now()`. */
  agora?: () => number;
  /** Itens no máximo, contando o que fala. Padrão 3. */
  capacidade?: number;
  /** Idade máxima de um item (ms). Padrão 20 s. */
  idadeMaximaMs?: number;
  /** Quanto o motor tem para começar (ms). Padrão 8 s: a voz da nuvem tem prazo e reserva próprios. */
  prazoParaComecarMs?: number;
  /** Velocidade, tom e voz escolhida, repassados ao motor. */
  opcoesDeFala?: Pick<SpeakOptions, 'rate' | 'pitch' | 'voiceName'>;
  aoMudar?: (estado: EstadoDaFila) => void;
  /** A voz de um item começou; `esperaMs` = do fim da fala original até aqui (`tts_inicio`). */
  aoIniciar?: (item: ItemDeFala, esperaMs: number) => void;
  aoDescartar?: (item: ItemDeFala, motivo: MotivoDoDescarte) => void;
}

export interface FilaDeFala {
  /** Põe um item na fila. `false` = não entrou (velho demais, ou fila destruída). */
  enfileirar(item: ItemDeFala): boolean;
  /** Barge-in: corta a voz agora, esvazia a espera e encurta a cauda do eco. */
  interromper(): void;
  /** Lê o último de novo (recomeça, se ele ainda está falando). `false` = nada a repetir. */
  repetir(): boolean;
  /** "Parar voz": corta e esvazia; o último fica para o Repetir. */
  parar(): void;
  estado(): EstadoDaFila;
  /** Há voz falando ou esperando? */
  ocupada(): boolean;
  /** Para tudo e desliga a fila (a tela saiu do intérprete). */
  destruir(): void;
}

export const CAPACIDADE_DA_FILA = 3;
export const IDADE_MAXIMA_DA_FALA_MS = 20_000;
export const PRAZO_PARA_COMECAR_MS = 8_000;

/**
 * Quanto uma fala pode durar antes de ser dada por encerrada: folga fixa mais ~120 ms por caractere
 * (a leitura lenta é ~10 caracteres por segundo; a voz padrão lê perto de 15).
 */
export const prazoDaFalaMs = (texto: string): number => 10_000 + texto.length * 120;

const relogioPadrao = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function criarFilaDeFala(o: OpcoesDaFila): FilaDeFala {
  const agora = o.agora ?? relogioPadrao;
  const capacidade = Math.max(1, o.capacidade ?? CAPACIDADE_DA_FILA);
  const idadeMaxima = o.idadeMaximaMs ?? IDADE_MAXIMA_DA_FALA_MS;
  const prazoParaComecar = o.prazoParaComecarMs ?? PRAZO_PARA_COMECAR_MS;

  /** Quando cada item entrou (o `criadoEm` que ele não trouxe). */
  const chegada = new WeakMap<ItemDeFala, number>();
  let espera: ItemDeFala[] = [];
  let falando: ItemDeFala | null = null;
  let ultimo: ItemDeFala | null = null;
  let destruida = false;
  /** A vez em curso: callbacks de uma vez anterior (cancelada) são ignorados. */
  let vez = 0;
  let relogioDaVez: ReturnType<typeof setTimeout> | undefined;

  const estado = (): EstadoDaFila => ({ falando, espera: [...espera], ultimo });
  const avisar = () => {
    if (!destruida) o.aoMudar?.(estado());
  };
  const idade = (i: ItemDeFala) => agora() - (i.criadoEm ?? chegada.get(i) ?? agora());
  const velha = (i: ItemDeFala) => idade(i) > idadeMaxima;
  const descartar = (i: ItemDeFala, motivo: MotivoDoDescarte) => o.aoDescartar?.(i, motivo);

  const pararRelogio = () => {
    clearTimeout(relogioDaVez);
    relogioDaVez = undefined;
  };

  /** Corta a voz em curso (se houver) sem puxar o próximo. */
  const cortar = () => {
    vez++;
    pararRelogio();
    if (falando) {
      try {
        o.motor().cancel();
      } catch {
        /* o motor já parou */
      }
    }
    falando = null;
  };

  const esvaziar = (motivo: MotivoDoDescarte) => {
    const saem = espera;
    espera = [];
    for (const i of saem) descartar(i, motivo);
  };

  /** A vez acabou (fim, erro ou prazo): o próximo item, se houver. */
  const encerrarVez = (minhaVez: number) => {
    if (minhaVez !== vez || destruida) return;
    pararRelogio();
    falando = null;
    proximo();
  };

  /** Lê `item` agora. `repeticao`: não entra na métrica. */
  const falar = (item: ItemDeFala, repeticao: boolean) => {
    const minhaVez = ++vez;
    falando = item;
    if (!item.manual) ultimo = item;
    let comecou = false;
    pararRelogio();
    relogioDaVez = setTimeout(() => {
      if (minhaVez !== vez || comecou) return;
      /* O motor não começou: corta o pedido dele (se começar depois, é outra vez) e segue. */
      vez++;
      try {
        o.motor().cancel();
      } catch {
        /* o motor já parou */
      }
      descartar(item, 'falhou');
      falando = null;
      proximo();
    }, prazoParaComecar);
    avisar();
    const aoComecar = () => {
      if (minhaVez !== vez || comecou) return;
      comecou = true;
      pararRelogio();
      /* Começou: o prazo agora é o da fala inteira — um `onend` que nunca vem não prende a fila. */
      relogioDaVez = setTimeout(() => encerrarVez(minhaVez), prazoDaFalaMs(item.texto));
      if (!repeticao && !item.manual) o.aoIniciar?.(item, Math.max(0, idade(item)));
    };
    try {
      o.motor().speak(item.texto, {
        ...o.opcoesDeFala,
        ...(item.velocidade ? { rate: item.velocidade } : {}),
        lang: item.lang,
        onStart: aoComecar,
        onEnd: () => encerrarVez(minhaVez),
        onError: () => encerrarVez(minhaVez),
      });
    } catch {
      encerrarVez(minhaVez);
    }
  };

  /** O próximo item que ainda vale; os velhos saem sem ser lidos. */
  function proximo(): void {
    if (destruida) return;
    while (espera.length) {
      const i = espera.shift()!;
      if (velha(i)) {
        descartar(i, 'velha');
        continue;
      }
      falar(i, false);
      return;
    }
    avisar();
  }

  return {
    enfileirar(item) {
      if (destruida || !item.texto?.trim()) return false;
      if (!chegada.has(item)) chegada.set(item, agora());
      if (velha(item)) {
        descartar(item, 'velha');
        return false;
      }
      espera.push(item);
      while ((falando ? 1 : 0) + espera.length > capacidade && espera.length > 0) {
        descartar(espera.shift()!, 'cheia');
      }
      if (!falando) proximo();
      else avisar();
      return true;
    },
    interromper() {
      if (destruida) return;
      cortar();
      esvaziar('interrompida');
      cortarCaudaDoEco();
      avisar();
    },
    repetir() {
      if (destruida || !ultimo) return false;
      const alvo = ultimo;
      cortar();
      falar(alvo, true);
      return true;
    },
    parar() {
      if (destruida) return;
      cortar();
      esvaziar('parada');
      avisar();
    },
    estado,
    ocupada: () => falando !== null || espera.length > 0,
    destruir() {
      if (destruida) return;
      cortar();
      espera = [];
      destruida = true;
    },
  };
}
