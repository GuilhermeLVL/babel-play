/**
 * O RECEPTOR DA EXTENSÃO (openspec `captura-em-um-clique`, tarefas 3.1 a 3.3; flag `captura_da_extensao`).
 *
 * A extensão do Frasy (`extensao/`) captura o som da aba com `chrome.tabCapture` e o entrega à página por
 * `window.postMessage`, por uma ponte (content script) restrita às origens do app. Este módulo é o lado da página:
 * pede o áudio, confere cada mensagem e entrega Float32 mono 16 kHz a quem consome.
 *
 * O QUE NÃO SE CONFIA. O `postMessage` pode vir de qualquer script da página, de um iframe ou de outra aba que
 * obteve a janela. Por isso, antes de qualquer coisa:
 *   - `event.source === janela` (só a própria janela, que é de onde a ponte posta) e `event.origin` IGUAL à origem da
 *     janela (comparação estrita; nunca `*`, nunca "termina com", nunca `null`);
 *   - a forma da mensagem pelo contrato (`validarDaExtensao`: fonte, versão, tipo, `seq`, taxa, tamanho do quadro);
 *   - o conteúdo vira SÓ número: o base64 é decodificado em Int16 com tamanho limitado. Nada de `eval`, `Function`,
 *     `innerHTML`: nenhum campo da mensagem vira código nem marcação. Quadro malformado é descartado e contado.
 *
 * PRIVACIDADE. O áudio fica na memória do aparelho, no quadro em trânsito: o receptor NÃO tem rede (nenhum `fetch`,
 * `WebSocket` ou `sendBeacon`; um teste procura), NÃO guarda quadro (sem consumidor, o quadro é descartado) e entrega ao
 * pipeline de hoje, com as mesmas regras de motor local e de nuvem com consentimento. Sem `?fonte=extensao` (e sem a
 * flag) este módulo nem é carregado: não existe listener nem custo.
 *
 * ESTADOS: `aguardando` (pediu, sem resposta ainda) → `conectada` (a extensão disse `pronta`) | `ausente` (nenhuma
 * resposta no prazo, ou a ponte avisou que não há captura) → a tela cai no seletor do navegador (`getDisplayMedia`).
 * `parada` é a extensão que encerrou depois de ter conectado; `erro`, a que reportou falha.
 */
import {
  AMOSTRAS_POR_QUADRO,
  decodificarPcm,
  mensagemDoApp,
  paraFloat32,
  TAXA_DE_AMOSTRAS,
  validarDaExtensao,
} from '../../../extensao/contrato.js';

export type EstadoDaExtensao = 'aguardando' | 'conectada' | 'ausente' | 'parada' | 'erro';

/** Quanto esperar a extensão responder ao `pedir`. Sem extensão (ou sem captura ativa) nada responde. */
export const ESPERA_DA_EXTENSAO_MS = 2000;
/** Teto de amostras por quadro aceito, com folga sobre as 1.600 do contrato (100 ms a 16 kHz). */
export const MAX_AMOSTRAS_POR_QUADRO = AMOSTRAS_POR_QUADRO * 2;

/** Só a janela e o que o receptor usa dela: o teste põe uma simulada. */
export interface JanelaDoReceptor {
  location: { origin: string };
  addEventListener(tipo: 'message', ouvinte: (e: MensagemRecebida) => void): void;
  removeEventListener(tipo: 'message', ouvinte: (e: MensagemRecebida) => void): void;
  postMessage(mensagem: unknown, origemAlvo: string): void;
}
export interface MensagemRecebida {
  data: unknown;
  origin: string;
  source: unknown;
}

export interface QuadroDaExtensao {
  /** Float32 mono em [-1, 1), 16 kHz. */
  pcm: Float32Array;
  seq: number;
  /** ms desde o início da captura, como a extensão contou. */
  t: number;
}

export interface OpcoesDoReceptor {
  janela: JanelaDoReceptor;
  aoMudarEstado?: (estado: EstadoDaExtensao) => void;
  /** Prazo para a extensão responder ao pedido (ms). */
  esperaMs?: number;
  /** Relógio injetável (testes). */
  agendar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
}

export interface ReceptorDaExtensao {
  /** Registra o ouvinte, pede o áudio e começa a contar o prazo. Idempotente. */
  conectar(): void;
  /** Quem recebe os quadros (a captura ao abrir); `null` solta. Sem consumidor o quadro é descartado. */
  consumir(consumidor: ((q: QuadroDaExtensao, perdidos: number) => void) | null): void;
  estado(): EstadoDaExtensao;
  /** Mensagens recusadas pela conferência (origem não conta: essas nem chegam a ser vistas). */
  recusadas(): number;
  /** Quadros que faltaram pela `seq` desde a conexão. */
  perdidos(): number;
  /** Avisa a extensão, tira o ouvinte e para o relógio. */
  parar(): void;
}

export function criarReceptor(opcoes: OpcoesDoReceptor): ReceptorDaExtensao {
  const { janela, aoMudarEstado } = opcoes;
  const espera = opcoes.esperaMs ?? ESPERA_DA_EXTENSAO_MS;
  const agendar = opcoes.agendar ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelar = opcoes.cancelar ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let estado: EstadoDaExtensao = 'aguardando';
  let registrado = false;
  let prazo: unknown = null;
  let consumidor: ((q: QuadroDaExtensao, perdidos: number) => void) | null = null;
  let ultimaSeq = 0;
  let nRecusadas = 0;
  let nPerdidos = 0;

  const mudar = (novo: EstadoDaExtensao) => {
    if (novo === estado) return;
    estado = novo;
    aoMudarEstado?.(novo);
  };
  const soltarPrazo = () => {
    if (prazo !== null) cancelar(prazo);
    prazo = null;
  };

  const aoReceber = (e: MensagemRecebida) => {
    /* 1. QUEM: só a própria janela, com a origem EXATAMENTE igual à da página. Sem exceção e sem log do conteúdo. */
    if (e.source !== janela) return;
    if (typeof e.origin !== 'string' || e.origin !== janela.location.origin) return;
    /* 2. O QUE: a forma pelo contrato. Recusa o que não é da extensão (a página também posta o próprio `pedir`). */
    const v = validarDaExtensao(e.data);
    if (!v.ok) {
      const m = e.data as { fonte?: unknown } | null;
      if (m && typeof m === 'object' && m.fonte === 'frasy-extensao') nRecusadas++;
      return;
    }
    const m = e.data as {
      tipo: string;
      seq?: number;
      t?: unknown;
      pcm?: string;
      sr?: number;
      amostrasPorQuadro?: number;
    };
    switch (m.tipo) {
      case 'pronta':
        if (m.sr !== TAXA_DE_AMOSTRAS || m.amostrasPorQuadro !== AMOSTRAS_POR_QUADRO) {
          nRecusadas++;
          return;
        }
        soltarPrazo();
        ultimaSeq = 0;
        mudar('conectada');
        return;
      case 'pcm': {
        /* Quadro só vale depois do `pronta` e com alguém consumindo: o resto é descartado na hora (retenção zero). */
        if (estado !== 'conectada' || !consumidor) return;
        const seq = m.seq as number;
        if (ultimaSeq > 0 && seq <= ultimaSeq) return; // repetido ou fora de ordem: descarta
        let amostras: Int16Array;
        try {
          amostras = decodificarPcm(m.pcm as string);
        } catch {
          nRecusadas++;
          return;
        }
        if (amostras.length === 0 || amostras.length > MAX_AMOSTRAS_POR_QUADRO) {
          nRecusadas++;
          return;
        }
        const perdidos = ultimaSeq > 0 ? seq - ultimaSeq - 1 : 0;
        ultimaSeq = seq;
        nPerdidos += perdidos;
        const t = typeof m.t === 'number' && Number.isFinite(m.t) ? m.t : 0;
        try {
          consumidor({ pcm: paraFloat32(amostras), seq, t }, perdidos);
        } catch {
          /* uma falha de quem consome não pode derrubar o ouvinte nem soltar a extensão */
        }
        return;
      }
      case 'parou':
        soltarPrazo();
        /* Antes do `pronta`, "parou" é a ponte dizendo que não há captura a entregar: para a tela é o mesmo que ausente. */
        mudar(estado === 'conectada' ? 'parada' : 'ausente');
        return;
      case 'erro':
        soltarPrazo();
        mudar(estado === 'conectada' ? 'erro' : 'ausente');
        return;
    }
  };

  return {
    conectar() {
      if (registrado) return;
      registrado = true;
      janela.addEventListener('message', aoReceber);
      prazo = agendar(() => {
        prazo = null;
        if (estado === 'aguardando') mudar('ausente');
      }, espera);
      /* O pedido vai SÓ para a origem da própria página: nunca '*'. */
      janela.postMessage(mensagemDoApp('pedir'), janela.location.origin);
    },
    consumir(c) {
      consumidor = c;
    },
    estado: () => estado,
    recusadas: () => nRecusadas,
    perdidos: () => nPerdidos,
    parar() {
      if (!registrado) return;
      registrado = false;
      consumidor = null;
      soltarPrazo();
      janela.removeEventListener('message', aoReceber);
      janela.postMessage(mensagemDoApp('parar'), janela.location.origin);
    },
  };
}
