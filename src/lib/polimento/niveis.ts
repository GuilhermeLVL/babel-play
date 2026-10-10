/**
 * O NÍVEL DE SERVIÇO NA CAPTURA — o único movimento que o protótipo dos planos acrescenta à tela
 * pronta (`planos4.js:292-298`): a fileira nova e a nota sobem em cascata, depois do topo.
 */
import { anima, polido, reduz } from './base';

/**
 * A posição de cada peça na cascata do protótipo, onde a fileira tem SEMPRE as quatro (`.pl-linha > *`:
 * seletor, marca, espaço, medidor) e a nota vem depois. No app a marca chega um instante mais tarde (o
 * selo da fala é lido da rota); com a posição fixa, as outras peças sobem no tempo do protótipo com ou
 * sem ela.
 */
const POSICAO: readonly [seletor: string, posicao: number][] = [
  ['.pl-niveis', 0],
  ['.pl-onde', 1],
  ['.q-espaco', 2],
  ['.pl-vaga', 3],
  ['.pl-nota, .pl-sem', 4],
];

/** `prepararVivo` de `planos4.js:297`, com os mesmos números (480 ms, 260 ms + 60 ms por peça). */
export function entrarNivel(v: HTMLElement): void {
  if (!polido() || reduz()) return;
  v.querySelectorAll('.pl-linha > *, .pl-nota, .pl-sem').forEach((x, ordem) => {
    const i = POSICAO.find(([seletor]) => x.matches(seletor))?.[1] ?? ordem;
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 480, atraso: 260 + i * 60 },
    );
  });
}
