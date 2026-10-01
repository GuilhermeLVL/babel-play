/**
 * A MÁQUINA DE ESTADOS DO MODO INTÉRPRETE (E2 da Fase E) — pura: não abre microfone, não fala, não
 * desenha. A tela (E3, `captura/interprete/ModoInterprete.tsx`, carregada por `import()`) manda os
 * EVENTOS e executa os EFEITOS que a transição devolve.
 *
 * A TELA QUE ELA SERVE (a maquete do dono): o aparelho dividido frente a frente, a metade de cima
 * virada 180° para a outra pessoa, um botão grande de falar em cada metade. Quem fala toca a SUA
 * metade; a tradução aparece na metade do outro e é lida em voz alta (`lib/voz/filaDeFala.ts`), com
 * "Repetir" e "Parar voz"; a faixa do meio troca os lados, mostra a voz em uso e sai.
 *
 * O CICLO DE UMA FALA:
 *
 *   parado ──tocar(lado)──▶ ouvindo(lado) ──fimDaFala──▶ traduzindo ──traduziu──▶ falando ──fimDaVoz──▶ parado
 *
 *   - O MICROFONE FECHA NO FIM DA FALA (`fecharMicrofone` no `fimDaFala`): a voz que lê a tradução
 *     vem depois, com o microfone fechado, e o guarda de eco (`isTtsActive`) cobre a cauda.
 *   - BARGE-IN: tocar qualquer lado enquanto a voz fala (ou a tradução está a caminho) corta a voz
 *     (`interromperVoz`) e abre o microfone de quem tocou. A tradução que chegar depois dele não é
 *     lida — fica só na tela.
 *   - TROCA DE LADO: tocar o OUTRO lado enquanto um ouve reabre o microfone no idioma do outro
 *     (a Web Speech religa, o Whisper só troca a dica — `trocaDoMicrofone`). Tocar o MESMO lado
 *     enquanto ele ouve é "terminei": o microfone fecha, e o final que ainda chegar é traduzido e lido.
 *   - "TROCAR OS LADOS" (a faixa do meio) inverte os idiomas entre as metades — para quando a outra
 *     pessoa é quem segura o aparelho. Para tudo antes.
 *
 * A DIREÇÃO é do LADO, não da configuração: `meu` fala o "Eu falo" da captura e traduz para o idioma
 * do outro; `outro`, o contrário (`direcaoDoLado`). O pipeline e as fontes leem a mesma direção
 * (`DirecaoDaFala`, `direcaoDoMicrofone` nas deps de `pipelineDeFala.ts` e `fontesDeAudio.ts`).
 *
 * O ANDROID (`webSpeechBipaAoReligar`, `motorDoMicrofone.ts`): a Web Speech apita a cada religada, e
 * por isso lá o motor do microfone é o Whisper ("Privado", abre o microfone uma vez e não apita) a
 * menos que a pessoa escolha o "Rápido". O intérprete não muda essa decisão. Com o "Rápido", a Web
 * Speech só abre no TOQUE e fecha no fim da fala — um bipe por vez que alguém fala, e nunca o laço de
 * religar a cada 3 s de silêncio da captura contínua.
 */
import { baseLang } from '@core/texto/idioma';

import { toBcp47 } from '../languages';
import type { DirecaoDaFala, LadoDoInterprete } from './tiposDaFala';

export type FaseDoInterprete = 'parado' | 'ouvindo' | 'traduzindo' | 'falando';

export interface EstadoDoInterprete {
  fase: FaseDoInterprete;
  /** Quem fala (ouvindo) ou quem falou por último; `null` antes da primeira fala. */
  lado: LadoDoInterprete | null;
  /** As falas deste turno que esperam a tradução para serem lidas (ids dos balões), na ordem. */
  pendentes: readonly string[];
  /** Os idiomas trocaram de metade ("trocar os lados"). */
  trocados: boolean;
}

export type EventoDoInterprete =
  /** Alguém tocou o botão de falar da sua metade. */
  | { tipo: 'tocar'; lado: LadoDoInterprete }
  /** O microfone ouviu o fim da fala (o VAD fechou, ou a Web Speech comprometeu o final). */
  | { tipo: 'fimDaFala'; segId: string }
  /** A tradução do final chegou (`aoTraduzirFinal`, resultado `traduzida`). */
  | { tipo: 'traduziu'; segId: string }
  /** Não haverá tradução a ler: mesmo idioma, falhou ou ficou sob demanda (`aoTraduzirFinal`). */
  | { tipo: 'semTraducao'; segId: string }
  /** A fila de fala ficou vazia (`filaDeFala.ts`, `aoMudar` sem nada falando nem esperando). */
  | { tipo: 'fimDaVoz' }
  | { tipo: 'repetir' }
  | { tipo: 'pararVoz' }
  | { tipo: 'trocarLados' }
  | { tipo: 'sair' };

export type EfeitoDoInterprete =
  /** Abrir (ou reabrir, noutro idioma) o microfone na direção do lado. */
  | { tipo: 'abrirMicrofone'; direcao: DirecaoDaFala }
  | { tipo: 'fecharMicrofone' }
  /** Barge-in: `fila.interromper()`. */
  | { tipo: 'interromperVoz' }
  /** Pôr a tradução desta fala na fila (`fila.enfileirar`). */
  | { tipo: 'falar'; segId: string }
  /** `fila.repetir()`. */
  | { tipo: 'repetirVoz' }
  /** `fila.parar()`. */
  | { tipo: 'pararVoz' };

/** Os dois idiomas da conversa: o da pessoa que segura o aparelho e o da outra (BCP-47 ou a base). */
export interface IdiomasDoInterprete {
  meu: string;
  outro: string;
}

export interface Transicao {
  estado: EstadoDoInterprete;
  efeitos: EfeitoDoInterprete[];
}

export const ESTADO_INICIAL: EstadoDoInterprete = Object.freeze({
  fase: 'parado',
  lado: null,
  pendentes: Object.freeze([]) as readonly string[],
  trocados: false,
});

/** O BCP-47 que o reconhecedor recebe: `pt` → `pt-BR`; código com região fica como veio. */
const bcp47 = (idioma: string): string => {
  const l = (idioma || '').trim().replace('_', '-');
  return l.includes('-') ? l : toBcp47(l) || l;
};

/** A direção de quem fala num lado: o idioma dele (com os lados trocados, o da outra metade). */
export function direcaoDoLado(lado: LadoDoInterprete, idiomas: IdiomasDoInterprete, trocados = false): DirecaoDaFala {
  const doMeuLado = (lado === 'meu') !== trocados;
  const fala = doMeuLado ? idiomas.meu : idiomas.outro;
  const ouve = doMeuLado ? idiomas.outro : idiomas.meu;
  return { lado, fala: bcp47(fala), de: baseLang(fala), para: baseLang(ouve) };
}

/**
 * Os dois idiomas da conversa como o reconhecedor os recebe (BCP-47), na ordem meu → outro: os mesmos
 * `fala` que `direcaoDoLado` dá a cada lado. É para eles que o motor do microfone é decidido.
 */
export function idiomasDaConversa(idiomas: IdiomasDoInterprete): string[] {
  return [bcp47(idiomas.meu), bcp47(idiomas.outro)];
}

/** A direção do microfone AGORA: a do lado ativo, ou a do último que falou; `null` antes da primeira fala. */
export function direcaoAtual(estado: EstadoDoInterprete, idiomas: IdiomasDoInterprete): DirecaoDaFala | null {
  return estado.lado ? direcaoDoLado(estado.lado, idiomas, estado.trocados) : null;
}

/**
 * O que trocar de lado custa ao microfone aberto: a Web Speech abre num idioma só e precisa religar
 * (no Android, um bipe — a pessoa escolheu o "Rápido" sabendo disso); o Whisper recebe a dica a cada
 * fala, e basta a próxima fala levar a do lado novo.
 */
export function trocaDoMicrofone(motor: 'web-speech' | 'whisper'): 'religar' | 'so-a-dica' {
  return motor === 'web-speech' ? 'religar' : 'so-a-dica';
}

const sem = (lista: readonly string[], id: string) => lista.filter((x) => x !== id);

/** A transição, pura. Evento que não se aplica à fase devolve o MESMO estado e nenhum efeito. */
export function transicao(
  estado: EstadoDoInterprete,
  evento: EventoDoInterprete,
  idiomas: IdiomasDoInterprete,
): Transicao {
  const nada: Transicao = { estado, efeitos: [] };
  const ouvir = (lado: LadoDoInterprete, antes: EfeitoDoInterprete[] = []): Transicao => ({
    estado: { ...estado, fase: 'ouvindo', lado, pendentes: [] },
    efeitos: [...antes, { tipo: 'abrirMicrofone', direcao: direcaoDoLado(lado, idiomas, estado.trocados) }],
  });

  switch (evento.tipo) {
    case 'sair':
      return {
        estado: { ...estado, fase: 'parado', pendentes: [] },
        efeitos: [{ tipo: 'fecharMicrofone' }, { tipo: 'pararVoz' }],
      };

    case 'trocarLados':
      return {
        estado: { ...estado, fase: 'parado', pendentes: [], trocados: !estado.trocados },
        efeitos: estado.fase === 'parado' ? [] : [{ tipo: 'fecharMicrofone' }, { tipo: 'pararVoz' }],
      };

    case 'tocar':
      if (estado.fase === 'parado') return ouvir(evento.lado);
      if (estado.fase === 'ouvindo') {
        /* O mesmo lado: "terminei". O outro: a troca de lado (o microfone reabre no idioma dele). */
        if (evento.lado === estado.lado)
          return { estado: { ...estado, fase: 'parado' }, efeitos: [{ tipo: 'fecharMicrofone' }] };
        return ouvir(evento.lado);
      }
      /* Traduzindo ou falando: barge-in. A voz para já; a tradução que chegar depois fica na tela. */
      return ouvir(evento.lado, [{ tipo: 'interromperVoz' }]);

    case 'fimDaFala': {
      if (estado.pendentes.includes(evento.segId)) return nada;
      const pendentes = [...estado.pendentes, evento.segId];
      if (estado.fase === 'ouvindo')
        return { estado: { ...estado, fase: 'traduzindo', pendentes }, efeitos: [{ tipo: 'fecharMicrofone' }] };
      /* Parado depois do "terminei" (o final chega depois do toque), ou mais uma fala no mesmo turno. */
      return {
        estado: { ...estado, fase: estado.fase === 'falando' ? 'falando' : 'traduzindo', pendentes },
        efeitos: [],
      };
    }

    case 'traduziu':
      if (!estado.pendentes.includes(evento.segId)) return nada;
      return {
        estado: { ...estado, fase: 'falando', pendentes: sem(estado.pendentes, evento.segId) },
        efeitos: [{ tipo: 'falar', segId: evento.segId }],
      };

    case 'semTraducao': {
      if (!estado.pendentes.includes(evento.segId)) return nada;
      const pendentes = sem(estado.pendentes, evento.segId);
      const fase = estado.fase === 'traduzindo' && pendentes.length === 0 ? 'parado' : estado.fase;
      return { estado: { ...estado, fase, pendentes }, efeitos: [] };
    }

    case 'fimDaVoz':
      if (estado.fase !== 'falando') return nada;
      return { estado: { ...estado, fase: estado.pendentes.length ? 'traduzindo' : 'parado' }, efeitos: [] };

    case 'repetir':
      /* Com o microfone aberto, a voz seria o eco da própria tradução — e cortaria quem fala. */
      if (estado.fase === 'ouvindo') return nada;
      return { estado: { ...estado, fase: 'falando' }, efeitos: [{ tipo: 'repetirVoz' }] };

    case 'pararVoz':
      if (estado.fase === 'ouvindo') return { estado, efeitos: [{ tipo: 'pararVoz' }] };
      return { estado: { ...estado, fase: 'parado', pendentes: [] }, efeitos: [{ tipo: 'pararVoz' }] };
  }
}

export interface MaquinaDoInterprete {
  /** Aplica um evento: muda o estado e SÓ DEPOIS executa os efeitos (o microfone lê a direção nova). */
  enviar(evento: EventoDoInterprete): Transicao;
  estado(): EstadoDoInterprete;
  /** A direção do microfone agora — o que a tela passa como `direcaoDoMicrofone` ao pipeline e às fontes. */
  direcao(): DirecaoDaFala | null;
}

/** A máquina com estado, para a tela: `executar` roda cada efeito; `aoMudar` avisa só quando o estado muda. */
export function criarInterprete(o: {
  idiomas: () => IdiomasDoInterprete;
  executar: (efeito: EfeitoDoInterprete) => void;
  aoMudar?: (estado: EstadoDoInterprete) => void;
}): MaquinaDoInterprete {
  let atual: EstadoDoInterprete = ESTADO_INICIAL;
  return {
    enviar(evento) {
      const r = transicao(atual, evento, o.idiomas());
      const mudou = r.estado !== atual;
      atual = r.estado;
      for (const e of r.efeitos) o.executar(e);
      if (mudou) o.aoMudar?.(atual);
      return r;
    },
    estado: () => atual,
    direcao: () => direcaoAtual(atual, o.idiomas()),
  };
}
