/**
 * A SESSÃO ABERTA DO DESENHO NOVO — o movimento de `telas3.js:16-62` (o player que marca palavra por
 * palavra) e de `repintar()` de `telas2.js:10-25` (a troca de aba), com os mesmos números. Itens D50 a
 * D52 de `fidelidade/casca-e-telas.md`.
 *
 * O QUE MUDA DO PROTÓTIPO: lá o player é um relógio de mentira (210 ms por palavra, 520 ms entre as
 * linhas). Aqui quem manda na LINHA é o áudio de verdade (ou a narração): a tela avisa qual fala está
 * tocando e este módulo acende a linha e marca as palavras dela na cadência do protótipo. As gravações
 * não guardam o tempo de cada palavra, então a marcação por palavra é a cadência fixa de 210 ms, e não
 * o instante em que a palavra foi dita. O intervalo de 520 ms só vale onde não há relógio (`sozinho`).
 */
import { anima, MOLA_SUAVE, polido, reduz } from './base';
import { sentir } from './sentidos';

/** `telas3.js:54`: uma palavra a cada 210 ms. */
export const PASSO_DA_PALAVRA_MS = 210;
/** `telas3.js:57`: a pausa entre uma linha e a seguinte. */
export const ENTRE_LINHAS_MS = 520;

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
}

/**
 * O marcador de uma lista de linhas (`.qs-fala` na Transcrição). `raiz` devolve a tela na hora do
 * uso: o React pode ter trocado o nó entre uma linha e outra.
 */
export function criarMarcador(raiz: () => ParentNode | null, seletor = '.qs-fala'): Marcador {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  let vez = 0;
  let ultima = -1;

  const linhas = () => [...(raiz()?.querySelectorAll<HTMLElement>(seletor) ?? [])];
  const palavras = (linha: Element) => [...linha.querySelectorAll('.w')];

  const parar = () => {
    clearTimeout(relogio);
    vez++;
    ultima = -1;
    raiz()
      ?.querySelectorAll('.w.dita')
      .forEach((x) => x.classList.remove('dita'));
  };

  const linha = (i: number, sozinho?: () => void) => {
    clearTimeout(relogio);
    const minha = ++vez;
    const todas = linhas();
    const el = todas[i];
    if (!el) return;
    /* O áudio passou para a linha seguinte antes de a marcação da anterior acabar: ela termina marcada
       (no protótipo o relógio é da própria marcação e isso não acontece). */
    if (ultima >= 0 && ultima < i && todas[ultima]) palavras(todas[ultima]).forEach((w) => w.classList.add('dita'));
    ultima = i;
    /* `telas3.js:45, 49`. */
    const anda = polido() && !reduz();
    el.scrollIntoView?.({ block: 'center', behavior: anda ? 'smooth' : 'auto' });
    if (anda) anima(el, [{ transform: 'scale(0.985)' }, { transform: 'scale(1)' }], { d: 420, e: MOLA_SUAVE });
    const ws = palavras(el);
    const passo = (k: number) => {
      if (minha !== vez) return;
      if (k < ws.length) {
        ws[k].classList.add('dita');
        relogio = setTimeout(() => passo(k + 1), PASSO_DA_PALAVRA_MS);
      } else if (sozinho) {
        relogio = setTimeout(() => minha === vez && sozinho(), ENTRE_LINHAS_MS);
      }
    };
    passo(0);
  };

  return { linha, parar };
}

/** `palavrasDe()` de `telas3.js:15`: a frase partida nos espaços, uma `span.w` por pedaço. */
export const pedacosDaFrase = (frase: string): string[] => frase.split(' ').filter(Boolean);
