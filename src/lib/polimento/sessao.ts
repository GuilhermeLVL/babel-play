/**
 * A SESSÃO ABERTA DO DESENHO NOVO — o movimento de `telas3.js:16-62` (o player que marca palavra por
 * palavra) e de `repintar()` de `telas2.js:10-25` (a troca de aba), com os mesmos números. Itens D50 a
 * D52 de `fidelidade/casca-e-telas.md`.
 *
 * O QUE MUDA DO PROTÓTIPO: lá o player é um relógio de mentira (210 ms por palavra, 520 ms entre as
 * linhas). Aqui quem manda é o som de verdade, na linha E na palavra:
 *   · áudio gravado: a tela lê o tempo do `<audio>` e diz quantas palavras já passaram (`ate`);
 *   · voz do navegador: o aviso de palavra da própria fala (`boundary`) diz qual está sendo dita;
 *   · voz que não avisa (muitas não avisam): uma cadência estimada pelo tamanho de cada palavra e
 *     pela velocidade da fala (`cadencia`), que pausa e retoma junto com ela.
 * O relógio fixo de 210 ms (`linha`) fica para onde não há som nenhum; o intervalo de 520 ms só vale
 * com `sozinho`. Ele marcava 285 palavras por minuto, quase o dobro de uma voz de leitura, e ninguém
 * o pausava: daí "pausei e o texto continuou sendo marcado até o fim".
 */
import { anima, MOLA_SUAVE, polido, reduz } from './base';
import { sentir } from './sentidos';

/** `telas3.js:54`: uma palavra a cada 210 ms. */
export const PASSO_DA_PALAVRA_MS = 210;
/** `telas3.js:57`: a pausa entre uma linha e a seguinte. */
export const ENTRE_LINHAS_MS = 520;
/**
 * Quanto uma voz de leitura leva por caractere, na velocidade 1 (cerca de 160 palavras por minuto em
 * inglês e português). Só vale para a voz que não avisa a palavra que está dizendo.
 */
export const MS_POR_CARACTERE = 62;
/** A voz que avisa a palavra faz isso logo no começo: sem aviso neste prazo, vale a cadência estimada. */
export const ESPERA_DO_AVISO_MS = 400;

/** `repintar()` de `telas2.js:17-24`: o que vem depois das abas entra pelo lado da aba escolhida. */
export function repintarSessao(palco: ParentNode | null, dir: number, deOnde = '.px-abas-sessao'): void {
  sentir('aba'); /* todo `repintar`, `sentidos.js:159` */
  if (!palco || !polido() || reduz()) return;
  let topo = palco.querySelector(deOnde);
  while (topo?.parentElement && !topo.parentElement.matches('.q-palco')) topo = topo.parentElement;
  let i = 0;
  for (let n = topo?.nextElementSibling; n; n = n.nextElementSibling) {
    anima(
      n,
      [
        { opacity: 0, transform: `translateX(${56 * dir}px)`, filter: 'blur(6px)' },
        { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
      ],
      { d: 520, atraso: Math.min(i++, 5) * 55 },
    );
  }
}

export interface Marcador {
  /**
   * A linha `i` começou a tocar: ela rola para o meio, encolhe e volta na mola, e as palavras vão
   * sendo marcadas (`passo()` de `telas3.js:38-59`). As linhas de antes ficam marcadas, como no
   * protótipo. Com `sozinho`, ao fim da linha ele espera 520 ms e o chama (a linha seguinte).
   */
  linha: (i: number, sozinho?: () => void) => void;
  /** `pararPlayer()` de `telas3.js:16-26`: solta o relógio e desmarca todas as palavras. */
  parar: () => void;
  /** O som pausou: o relógio para e as palavras já marcadas FICAM. */
  pausar: () => void;
  /** O som voltou: o relógio continua da palavra em que parou. */
  retomar: () => void;
  /**
   * A linha `i` fica com exatamente as `k` primeiras palavras marcadas. Quem chama passa a mandar: o
   * relógio próprio é desligado. Se a linha é nova, ela entra como em `linha` (rola, encolhe e volta,
   * e a anterior termina marcada).
   */
  ate: (i: number, k: number) => void;
  /**
   * A cadência ESTIMADA da linha `i`: `passos[k]` é quanto a palavra `k` leva para ser dita. Com
   * `espera`, a primeira palavra acende já e o relógio só começa depois dela (o prazo para a voz
   * avisar; se ela avisar, quem chama usa `ate` e a cadência não chega a andar).
   */
  cadencia: (i: number, passos: readonly number[], espera?: number) => void;
}

/**
 * O marcador de uma lista de linhas (`.qs-fala` na Transcrição). `raiz` devolve a tela na hora do
 * uso: o React pode ter trocado o nó entre uma linha e outra.
 */
export function criarMarcador(raiz: () => ParentNode | null, seletor = '.qs-fala'): Marcador {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  let vez = 0;
  let ultima = -1;
  /* O próximo passo do relógio. Fica guardado para a pausa: pausar não o perde, retomar o reagenda. */
  let proximo: { faz: () => void; em: number } | null = null;
  let pausado = false;

  const linhas = () => [...(raiz()?.querySelectorAll<HTMLElement>(seletor) ?? [])];
  const palavras = (linha: Element | undefined) => [...(linha?.querySelectorAll('.w') ?? [])];

  const dispara = () => {
    const p = proximo;
    proximo = null;
    p?.faz();
  };
  const agenda = (faz: () => void, em: number) => {
    proximo = { faz, em };
    if (!pausado) relogio = setTimeout(dispara, em);
  };
  /** Desliga o relógio que estiver andando (o de `linha` ou o de `cadencia`). */
  const solta = () => {
    clearTimeout(relogio);
    proximo = null;
    return ++vez;
  };

  const parar = () => {
    solta();
    pausado = false;
    ultima = -1;
    raiz()
      ?.querySelectorAll('.w.dita')
      .forEach((x) => x.classList.remove('dita'));
  };

  /** A linha `i` passa a ser a que toca (`telas3.js:45, 49`). Devolve as palavras dela. */
  const entra = (i: number): Element[] | null => {
    const todas = linhas();
    const el = todas[i];
    if (!el) return null;
    /* O som passou para a linha seguinte antes de a marcação da anterior acabar: ela termina marcada
       (no protótipo o relógio é da própria marcação e isso não acontece). */
    if (ultima >= 0 && ultima < i && todas[ultima]) palavras(todas[ultima]).forEach((w) => w.classList.add('dita'));
    ultima = i;
    const anda = polido() && !reduz();
    el.scrollIntoView?.({ block: 'center', behavior: anda ? 'smooth' : 'auto' });
    if (anda) anima(el, [{ transform: 'scale(0.985)' }, { transform: 'scale(1)' }], { d: 420, e: MOLA_SUAVE });
    return palavras(el);
  };

  const linha = (i: number, sozinho?: () => void) => {
    const minha = solta();
    pausado = false;
    const ws = entra(i);
    if (!ws) return;
    const passo = (k: number) => {
      if (minha !== vez) return;
      if (k < ws.length) {
        ws[k].classList.add('dita');
        agenda(() => passo(k + 1), PASSO_DA_PALAVRA_MS);
      } else if (sozinho) {
        agenda(() => minha === vez && sozinho(), ENTRE_LINHAS_MS);
      }
    };
    passo(0);
  };

  const ate = (i: number, k: number) => {
    solta();
    const ws = i === ultima ? palavras(linhas()[i]) : entra(i);
    ws?.forEach((w, n) => w.classList.toggle('dita', n < k));
  };

  const cadencia = (i: number, passos: readonly number[], espera = 0) => {
    ate(i, 0);
    pausado = false; // uma cadência nova é som novo: a pausa de antes acabou
    const minha = vez;
    const ws = palavras(linhas()[i]);
    const passo = (k: number) => {
      if (minha !== vez || k >= ws.length) return;
      ws[k].classList.add('dita');
      agenda(() => passo(k + 1), passos[k] ?? PASSO_DA_PALAVRA_MS);
    };
    if (espera <= 0) {
      passo(0);
      return;
    }
    /* A primeira palavra acende com o começo da fala. Passado o prazo sem aviso, a cadência entra já
       na palavra em que a fala deve estar, e não atrasada pelo prazo. */
    ws[0]?.classList.add('dita');
    agenda(() => {
      if (minha !== vez) return;
      let k = 0;
      let passou = passos[0] ?? PASSO_DA_PALAVRA_MS;
      while (passou <= espera && k < ws.length - 1) passou += passos[++k] ?? PASSO_DA_PALAVRA_MS;
      for (let n = 0; n < k; n++) ws[n].classList.add('dita');
      passo(k);
    }, espera);
  };

  const pausar = () => {
    if (pausado) return;
    pausado = true;
    clearTimeout(relogio);
  };
  const retomar = () => {
    if (!pausado) return;
    pausado = false;
    if (proximo) relogio = setTimeout(dispara, proximo.em);
  };

  return { linha, parar, pausar, retomar, ate, cadencia };
}

/** `palavrasDe()` de `telas3.js:15`: a frase partida nos espaços, uma `span.w` por pedaço. */
export const pedacosDaFrase = (frase: string): string[] => frase.split(' ').filter(Boolean);

/** Quem acompanha UM trecho falado por voz (uma frase, ou a tradução dela). */
export interface GuiaDaFala {
  /** A fala começou a soar. `espera` é o prazo para o aviso de palavra (0 = esta voz nunca avisa). */
  comecou: (espera?: number) => void;
  /** A voz avisou (`boundary`) que está no caractere `charIndex` do texto falado. */
  palavra: (charIndex: number) => void;
}

/**
 * Liga a marcação de uma linha à fala dela. `palavras` são as da TELA (uma por `span.w`) e `texto` é
 * o que a voz diz. Quando são o mesmo texto, o caractere avisado cai numa palavra exata; quando a voz
 * lê outra coisa (a tradução, com o original na tela), a marcação anda na mesma proporção.
 */
export function seguirFala(
  marcador: Marcador,
  o: { linha: number; texto: string; palavras: readonly string[]; velocidade?: number },
): GuiaDaFala {
  const { linha, texto, palavras } = o;
  const velocidade = o.velocidade && o.velocidade > 0 ? o.velocidade : 1;
  const n = palavras.length;
  /* Onde cada palavra da tela começa no texto falado. */
  const inicios: number[] = [];
  let pos = 0;
  let naTela = n > 0;
  for (const p of palavras) {
    const em = p ? texto.indexOf(p, pos) : pos;
    if (em < 0) {
      naTela = false;
      break;
    }
    inicios.push(em);
    pos = em + p.length;
  }
  const porCaractere = MS_POR_CARACTERE / velocidade;
  const passos = naTela
    ? palavras.map((p) => Math.max(60, (p.length + 1) * porCaractere))
    : palavras.map(() => Math.max(60, (Math.max(1, texto.length) * porCaractere) / Math.max(1, n)));
  return {
    comecou: (espera = ESPERA_DO_AVISO_MS) => marcador.cadencia(linha, passos, espera),
    palavra: (charIndex) => {
      const c = Math.max(0, charIndex || 0);
      const k = naTela
        ? inicios.filter((em) => em <= c).length
        : Math.min(n, Math.ceil(((c + 1) / Math.max(1, texto.length)) * n));
      marcador.ate(linha, Math.max(1, k));
    },
  };
}
