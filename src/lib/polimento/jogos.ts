/**
 * O MOTOR COMUM DOS JOGOS — porte de `jogos.js:196-222` (o retorno de acerto e erro) e de
 * `prototipo.js:230-252` (a saída de tela), com os mesmos números. Cada função diz a linha de onde veio.
 *
 * QUEM CHAMA. A casca da rodada (`components/minigames/casca/HudDaRodada.tsx`) ouve o aviso que todo
 * jogo já dá a cada jogada (`EVENTO_DA_JOGADA`) e dispara o retorno comum: vinheta, "+N" que sobe,
 * tremida e, quando o multiplicador sobe de degrau, o selo "Combo ×N". O tabuleiro só precisa destas
 * funções quando quer dizer algo a mais, como o protótipo faz: `flutuar(el, 'achei as pontas')`,
 * `flutuar(el, 'Ordem incorreta', 'erro')`, `tremer(linha)`.
 *
 * O CSS é o de produção (`styles/prototipo.css`: `.ganho`, `.fx-vinheta`, `.selo-combo`, `treme`) com
 * os acertos da camada (`styles/polimento/jogos.css`, `jogos4.css`). Aqui não há estilo.
 */
import { t } from '../i18n';
import { anima, limpar, polido, reduz } from './base';
import { anunciarChegada } from './telas';

/** Tom do texto que sobe: verde, vermelho ou o da marca (`.ganho`, `.ganho.good`, `.ganho.erro`). */
export type TomDoGanho = 'good' | 'erro' | '';
export type TipoDeVinheta = 'acerto' | 'erro' | 'combo';

/** Quanto cada peça fica na tela, em ms (`jogos.js:200, 207, 214, 221`; `jogos4.js:135`). */
export const VIDA_DO_GANHO = 1200;
export const VIDA_DA_VINHETA = 650;
export const VIDA_DA_TREMIDA = 450;
export const VIDA_DO_SELO = 1050;
export const VIDA_DO_PULSO = 3600;
/** No segundo erro seguido, e só nele, o jogo aponta uma ajuda (`jogos4.js:128`). */
export const ERROS_ATE_O_PULSO = 2;

const noDocumento = () => typeof document !== 'undefined';

/** `centro()` de `prototipo.js:897-900`. */
export function centro(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

/** O palco da rodada em curso (`palco()` de `jogos.js:120`). */
export const palcoDaRodada = (): HTMLElement | null =>
  noDocumento() ? document.querySelector<HTMLElement>('#palco.palco-jogo, .palco-jogo') : null;

/**
 * `flutuar()` de `jogos.js:196-201`: o texto nasce 8 px acima do centro do elemento (ou do palco, se
 * o elemento já saiu da tela), sobe e some em 1,2 s.
 */
export function flutuar(el: Element | null | undefined, texto: string, tom: TomDoGanho = 'good'): void {
  if (!noDocumento()) return;
  const alvo = el?.isConnected ? el : palcoDaRodada();
  if (!alvo) return;
  const [x, y] = centro(alvo);
  const g = document.createElement('span');
  g.className = `ganho ${tom}`.trim();
  g.style.left = `${x}px`;
  g.style.top = `${y - 8}px`;
  g.textContent = texto;
  document.body.append(g);
  window.setTimeout(() => g.remove(), VIDA_DO_GANHO);
}

/** `vinheta()` de `jogos.js:203-208`: um clarão na borda da tela, que some em 0,6 s e sempre sai. */
export function vinheta(tipo: TipoDeVinheta): void {
  if (!noDocumento() || reduz()) return;
  const v = document.createElement('div');
  v.className = `fx-vinheta ${tipo}`;
  v.setAttribute('aria-hidden', 'true');
  document.body.append(v);
  window.setTimeout(() => v.remove(), VIDA_DA_VINHETA);
}

/** `tremer()` de `jogos.js:209-215`: `.pj-treme` (0,4 s), recomeçando se já estava tremendo. */
export function tremer(el: Element | null | undefined): void {
  if (!(el instanceof HTMLElement) || reduz()) return;
  el.classList.remove('pj-treme');
  void el.offsetWidth;
  el.classList.add('pj-treme');
  window.setTimeout(() => el.classList.remove('pj-treme'), VIDA_DA_TREMIDA);
}

/** `selo()` de `jogos.js:216-222`: o letreiro que estoura no meio do palco ("Combo ×3"). */
export function selo(texto: string, classe = '', palco: Element | null = palcoDaRodada()): void {
  if (!palco || reduz()) return;
  const s = document.createElement('div');
  s.className = `selo-combo ${classe}`.trim();
  s.setAttribute('aria-hidden', 'true');
  s.textContent = texto;
  palco.append(s);
  window.setTimeout(() => s.remove(), VIDA_DO_SELO);
}

/** O texto do ganho (`jogos.js:236`): "+20 ×2", ou só "+10" sem multiplicador. */
export const textoDoGanho = (ganho: number, mult: number): string => `+${ganho}${mult > 1 ? ` ×${mult}` : ''}`;

/**
 * O retorno visual de um ACERTO (`pjAcerto`, `jogos.js:236-237`): o ganho que sobe e a vinheta verde.
 * O som, a vibração e as partículas continuam com o motor de comemoração do app, que o jogo já chamou.
 */
export function retornoDeAcerto(el: Element | null | undefined, ganho: number, mult: number): void {
  if (ganho > 0) flutuar(el, textoDoGanho(ganho, mult), 'good');
  vinheta('acerto');
}

/** O retorno visual de um ERRO (`pjErro`, `jogos.js:247-249`): vinheta vermelha, tremida e a mensagem. */
export function retornoDeErro(el: Element | null | undefined, msg?: string | null): void {
  vinheta('erro');
  tremer(el);
  if (msg) flutuar(el, msg, 'erro');
}

/** O multiplicador subiu de degrau (`pjHud`, `jogos.js:189-193`): selo, vinheta e o salto do combo. */
export function retornoDeCombo(mult: number, combo: Element | null, mola: string): void {
  selo(`Combo ×${mult}`, '', combo?.closest('.palco-jogo') ?? palcoDaRodada());
  vinheta('combo');
  if (combo && polido() && !reduz())
    anima(combo, [{ transform: 'scale(1)' }, { transform: 'scale(1.5) rotate(-8deg)' }, { transform: 'scale(1)' }], {
      d: 640,
      e: mola,
    });
}

/**
 * O PULSO DA AJUDA depois de dois erros seguidos (`jogos4.js:129-136`). O protótipo escreveu `$` onde
 * queria `$$` e quebra no segundo erro; aqui vale a intenção: entre as ajudas ainda habilitadas, menos
 * o "+10 s", pulsa primeiro a dica do próprio jogo (a que custa e não é "Ver resposta"); sem ela, a
 * primeira que houver. Devolve o botão que pulsou.
 */
export function chamarAjuda(ajudas: Element | null): HTMLElement | null {
  if (!ajudas) return null;
  const livres = [...ajudas.querySelectorAll<HTMLButtonElement>('.ajuda-jogo:not(:disabled)')].filter(
    (x) => x.dataset.ajuda !== 'tempo',
  );
  const b = livres.find((x) => x.title.startsWith('Conta') && x.dataset.ajuda !== 'resposta') ?? livres[0];
  if (!b) return null;
  b.classList.add('pj-chama');
  window.setTimeout(() => b.classList.remove('pj-chama'), VIDA_DO_PULSO);
  flutuar(b, t('quer uma ajuda?'), '');
  return b;
}

/** Ao sair da rodada nada fica pendurado na tela (`encerrarPartida`, `jogos.js:157`). */
export function limparRetorno(): void {
  if (!noDocumento()) return;
  document.querySelectorAll('.fx-vinheta, .ganho').forEach((x) => x.remove());
}

/* ---- As telas de dentro do Jogar saem como as outras (`prototipo.js:230-252`) -------------------- */

/**
 * A ordem das telas (`prototipo.js:232`): a partida vale −1 (não está nas rotas) e o Jogar, 3. Quem
 * vai para uma tela de ordem menor sai para baixo. A antessala é do app e fica entre as duas.
 */
export const ORDEM_NO_JOGAR = { partida: -1, antessala: -0.5, jogar: 3 } as const;
export type TelaDoJogar = keyof typeof ORDEM_NO_JOGAR;

let vezDaTela = 0;

/**
 * Troca uma tela de dentro do Jogar por outra, com a SAÍDA do protótipo: a de agora some para o lado do
 * destino (150 ms, `ease-out`, 18 px, 0,985, desfoque 5) e só então `trocar` roda. É o `mostrar()` de
 * `prototipo.js:233-252`; a entrada da tela nova continua com `lib/polimento/telas.ts`, que a vê montar.
 *
 * Como lá: mesma tela não sai (recomeçar, próximo jogo), e só a última troca pedida vale. Como em
 * `trocarDeTela`, um relógio de 400 ms garante a troca se o navegador congelar a animação.
 */
export function sairDaTelaDoJogar(de: TelaDoJogar, para: TelaDoJogar, trocar: () => void): void {
  const tela = noDocumento() ? document.querySelector<HTMLElement>('.px-tela') : null;
  const vez = ++vezDaTela;
  if (!tela || !tela.firstElementChild || !polido() || reduz() || de === para) return trocar();
  const dir = ORDEM_NO_JOGAR[para] < ORDEM_NO_JOGAR[de] ? -1 : 1;
  limpar(tela);
  let feito = false;
  const saida = anima(
    tela,
    [{ opacity: 0, transform: `translateY(${-18 * dir}px) scale(0.985)`, filter: 'blur(5px)' }],
    { d: 150, e: 'ease-out', fill: 'forwards' },
  );
  const fim = () => {
    if (feito || vez !== vezDaTela) return;
    feito = true;
    anunciarChegada(dir);
    trocar();
    /* Quem solta a tela é a entrada da nova (`telas.ts` cancela esta saída ao vê-la montar). Se nenhuma
       tela nova montar em `.px-tela` (jogo embutido, erro), a de agora reaparece em vez de ficar sumida. */
    window.setTimeout(() => {
      saida.finished.catch(() => undefined);
      saida.cancel();
    }, 600);
  };
  window.setTimeout(fim, 400);
  saida.finished.then(fim, fim);
}
