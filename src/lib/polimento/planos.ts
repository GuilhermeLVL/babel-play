/**
 * PLANOS E OFERTA — porte de `telas2.js:9-25, 108-117, 622-634`, `telas.js:484-519`,
 * `prototipo.js:816-834` e `planos4.js:685-704` (os quatro planos), com os mesmos números.
 *
 * O MODO DE PROVA, SÓ EM DESENVOLVIMENTO (`provaDosPlanos`, no fim do arquivo, com a explicação). As
 * chaves do `localStorage`:
 *   babel.px.planoDeProva         free | essencial | premium | aovivo   (o plano que a tela trata como seu)
 *   babel.px.testeDeProva         1                                      (em teste de 14 dias do Premium)
 *   babel.px.planosAVendaDeProva  premium | essencial,premium | essencial,premium,aovivo
 *   babel.px.aparelhoDeProva      pc | fraco | celular | quest
 *   babel.px.anunciosDeProva      1                                      (como se a flag `anuncios` existisse)
 *
 * No protótipo a tela de Planos é um `innerHTML` que ele mesmo troca (`repintar`); no app quem troca o
 * miolo é o React, e estas funções rodam logo depois, sobre o que ele desenhou.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: D54–D59.
 */
import { ehPlanoPago, type PlanoPago, PLANOS_PAGOS } from '../../core/planos';
import { anima, EG, MOLA, MOLA_SUAVE, polido, reduz } from './base';
import { sentir, vibrar } from './sentidos';

const comMovimento = () => polido() && !reduz();

/* ---- A troca de aba (`repintar`, `telas2.js:10-25`) -------------------------------------------- */

/**
 * O que vem depois das abas entra pelo lado: 56 px, desfoque de 6, 520 ms, 55 ms um do outro (até o
 * quinto). `dir` é 1 quando se avança e −1 quando um botão de dentro devolve à primeira aba.
 */
export function repintarPlanos(abas: HTMLElement | null, dir: number): void {
  sentir('aba'); /* todo `repintar`, `sentidos.js:159` */
  if (!abas || !comMovimento()) return;
  let topo: HTMLElement = abas;
  while (topo.parentElement && !topo.parentElement.matches('.q-palco')) topo = topo.parentElement;
  let i = 0;
  for (let n = topo.nextElementSibling; n; n = n.nextElementSibling) {
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

/* ---- Perguntas frequentes (`telas2.js:622-634`) ------------------------------------------------- */

/** A pergunta abre e fecha com a altura animada (420 ms na mola suave), não num salto. */
export function alternarPergunta(e: { target: EventTarget | null; preventDefault: () => void }): void {
  const s = e.target instanceof Element ? e.target.closest('.px-faq summary') : null;
  const d = s?.parentElement;
  if (!(d instanceof HTMLDetailsElement) || !comMovimento()) return;
  e.preventDefault();
  const h0 = d.offsetHeight;
  d.open = !d.open;
  const h1 = d.offsetHeight;
  d.style.overflow = 'hidden';
  const solta = () => {
    d.style.overflow = '';
  };
  anima(d, [{ height: h0 + 'px' }, { height: h1 + 'px' }], { d: 420, e: MOLA_SUAVE, fill: 'none' }).finished.then(
    solta,
    solta,
  );
  const p = d.querySelector('p');
  if (d.open && p)
    anima(
      p,
      [
        { opacity: 0, transform: 'translateY(-8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 360, atraso: 80 },
    );
}

/* ---- O confete (`prototipo.js:816-834`, desenhado como em `prototipo.js:867-886`) --------------- */

const CORES = ['#f04e23', '#ffb347', '#3f9b56', '#5b6ee1', '#f6d55c', '#ff7aa2'];

interface Papel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  r: number;
  g: number;
  q: number;
  cor: string;
  giro: number;
  vg: number;
}

/**
 * `confete()` do protótipo. Lá os papéis entram na tela de partículas que já existe; aqui o confete
 * traz a própria tela, por cima de tudo, e a tira quando o último papel cai (como a `rajada` de
 * `captura.ts`).
 */
export function confete(n = 170): void {
  sentir('festa'); /* todo `confete`, `sentidos.js:148` */
  if (reduz() || typeof document === 'undefined') return;
  const cv = document.createElement('canvas');
  const cx = cv.getContext?.('2d');
  if (!cx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647';
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.body.append(cv);
  let raj: Papel[] = [];
  for (let i = 0; i < n; i++) {
    raj.push({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 160,
      vy: 120 + Math.random() * 260,
      vida: 1,
      r: 4 + Math.random() * 5,
      g: 160,
      q: 0.3,
      cor: CORES[i % CORES.length],
      giro: Math.random() * 6,
      vg: (Math.random() - 0.5) * 14,
    });
  }
  let tAnt = performance.now();
  const quadro = (t: number) => {
    const real = (t - tAnt) / 1000;
    const dt = Math.min(0.05, real);
    tAnt = t;
    cx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of raj) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= real * p.q;
      cx.globalAlpha = Math.max(0, Math.min(1, p.vida * 2));
      cx.fillStyle = p.cor;
      p.giro += p.vg * dt;
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.giro);
      cx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      cx.restore();
    }
    raj = raj.filter((p) => p.vida > 0 && p.y < innerHeight + 40);
    if (raj.length && cv.isConnected) requestAnimationFrame(quadro);
    else cv.remove();
  };
  requestAnimationFrame(quadro);
}

/** O teste começou (`ativarTeste`, `telas2.js:113-116`): o aparelho vibra e cai o confete. */
export function festejarTeste(): void {
  sentir('sucesso'); /* `ativarTeste`, `sentidos.js:151` */
  if (!comMovimento()) return;
  vibrar([12, 60, 12]);
  confete(120);
}

/* ---- A oferta (`telas.js:484-519`) --------------------------------------------------------------- */

/** A oferta sobe de baixo (680 ms na mola suave), o ícone gira para o lugar e os textos vêm em fila. */
export function entrarOferta(o: HTMLElement): void {
  sentir('chega'); /* `oferta`, `sentidos.js:147` */
  if (!comMovimento()) return;
  anima(
    o,
    [
      { opacity: 0, translate: '0 120%' },
      { opacity: 1, translate: '0 0' },
    ],
    { d: 680, e: MOLA_SUAVE },
  );
  const icone = o.querySelector('.q-ic');
  if (icone)
    anima(icone, [{ transform: 'scale(0.4) rotate(-20deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
      d: 700,
      atraso: 180,
      e: MOLA,
    });
  o.querySelectorAll('.qc-oferta-texto > *, .q-acoes > *').forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 420, atraso: 200 + i * 55 },
    ),
  );
}

/** `fecharOferta()`: desce em 280 ms e só então `depois` roda (é ele que a tira da tela). */
export function sairOferta(o: HTMLElement | null, depois: () => void): void {
  if (!o || !comMovimento()) return depois();
  let feito = false;
  const fim = () => {
    if (feito) return;
    feito = true;
    depois();
  };
  /* Numa aba em segundo plano o navegador congela a animação: o relógio garante a saída. */
  window.setTimeout(fim, 600);
  anima(o, [{ opacity: 0, translate: '0 120%' }], { d: 280, e: EG, fill: 'forwards' }).finished.then(fim, fim);
}

/* ---- Os cartões no lugar (`arrumarPlanos`, `planos4.js:685-704`) -------------------------------- */

/** `celular()` do protótipo (`prototipo.js:406-407`). */
const noTamanhoDeCelular = (): boolean => typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches;

/**
 * Depois de pintar a aba Planos: no tamanho de celular o carrossel para no cartão `alvo` (o recomendado
 * para o aparelho), centralizado. Com `destaque` (um cadeado ou a oferta pediu este plano), a tela rola
 * até o cartão e ele pulsa por 2,6 s (`.ad-aqui`), 700 ms depois de a tela entrar (60 ms sem movimento).
 */
export function arrumarPlanos(palco: HTMLElement | null, alvo: string | null, destaque = false): void {
  const grade = palco?.querySelector<HTMLElement>('.pl-planos-grade');
  if (!grade || !alvo) return;
  const cartao = grade.querySelector<HTMLElement>(`[data-pl-plano="${alvo}"]`);
  if (!cartao) return;
  if (noTamanhoDeCelular()) grade.scrollLeft = cartao.offsetLeft - (grade.clientWidth - cartao.offsetWidth) / 2;
  if (!destaque) return;
  window.setTimeout(
    () => {
      if (!cartao.isConnected) return;
      cartao.scrollIntoView?.({ block: 'center', inline: 'center', behavior: reduz() ? 'auto' : 'smooth' });
      cartao.classList.add('ad-aqui');
      window.setTimeout(() => cartao.classList.remove('ad-aqui'), 2600);
    },
    comMovimento() ? 700 : 60,
  );
}

/* ---- A bancada ------------------------------------------------------------------------------------ */

/**
 * O MODO DE PROVA — SÓ EM DESENVOLVIMENTO (`import.meta.env.DEV`, como `liberacaoDev.ts`): num build de
 * produção `provaDosPlanos()` devolve tudo vazio ANTES de olhar o armazenamento.
 *
 * Existe porque o servidor local é `selfhost` (tudo liberado) e a venda dos planos novos nasce
 * fechada: sem isto ninguém vê a tela de quem está no Grátis, nem os quatro cartões. Muda só o que a
 * tela DESENHA; quem concede plano e quem vende continua sendo o servidor.
 *
 * As chaves do `localStorage` (apague a chave para voltar ao real):
 *
 *   babel.px.planoDeProva          o plano que a tela trata como o seu:
 *                                  free | essencial | premium | aovivo
 *   babel.px.testeDeProva          1 = em teste de 14 dias (o plano vira o Premium, "em teste")
 *   babel.px.planosAVendaDeProva   os planos pagos à venda, separados por vírgula, na ordem que for:
 *                                  "premium" (o estado de fábrica) · "essencial,premium" (com
 *                                  venda_planos_v3) · "essencial,premium,aovivo" (com stt_ao_vivo também)
 *   babel.px.aparelhoDeProva       o aparelho do cartão "Você está num…" e do "Recomendado aqui":
 *                                  pc | fraco | celular | quest
 *   babel.px.anunciosDeProva       1 = como se a flag `anuncios` estivesse ligada (as linhas de anúncio
 *                                  do protótipo aparecem)
 *
 * No console do navegador, por exemplo, para ver os quatro planos como um assinante do Essencial:
 *   localStorage['babel.px.planoDeProva'] = 'essencial';
 *   localStorage['babel.px.planosAVendaDeProva'] = 'essencial,premium,aovivo'; location.reload()
 *
 * Quem usa: a tela Planos, a oferta e o cartão do plano em Ajustes (`planoDeProva`), e o comparador
 * (`scripts/polimento/roteiros/planos*.json`, `oferta*.json`).
 */
const CHAVE_DA_PROVA = 'babel.px.planoDeProva';
const CHAVE_DO_TESTE_DE_PROVA = 'babel.px.testeDeProva';
const CHAVE_DOS_PLANOS_A_VENDA_DE_PROVA = 'babel.px.planosAVendaDeProva';
const CHAVE_DO_APARELHO_DE_PROVA = 'babel.px.aparelhoDeProva';
const CHAVE_DOS_ANUNCIOS_DE_PROVA = 'babel.px.anunciosDeProva';

export type PlanoDeProva = 'free' | PlanoPago;
export type AparelhoDeProva = 'pc' | 'fraco' | 'celular' | 'quest';

export interface ProvaDosPlanos {
  plano: PlanoDeProva | null;
  teste: boolean;
  /** `null` = a venda real (o servidor e as flags). */
  aVenda: PlanoPago[] | null;
  aparelho: AparelhoDeProva | null;
  anuncios: boolean;
}

const SEM_PROVA: ProvaDosPlanos = { plano: null, teste: false, aVenda: null, aparelho: null, anuncios: false };

const emDesenvolvimento = (): boolean => !!(import.meta as unknown as { env?: Record<string, unknown> }).env?.DEV;

/** Tudo o que a bancada simula na tela Planos. Fora do desenvolvimento, nada. */
export function provaDosPlanos(): ProvaDosPlanos {
  if (!emDesenvolvimento()) return SEM_PROVA;
  try {
    const plano = localStorage.getItem(CHAVE_DA_PROVA);
    const aVenda = localStorage.getItem(CHAVE_DOS_PLANOS_A_VENDA_DE_PROVA);
    const aparelho = localStorage.getItem(CHAVE_DO_APARELHO_DE_PROVA);
    return {
      plano: plano === 'free' || ehPlanoPago(plano) ? plano : null,
      teste: localStorage.getItem(CHAVE_DO_TESTE_DE_PROVA) === '1',
      aVenda:
        aVenda === null
          ? null
          : PLANOS_PAGOS.filter((p) =>
              aVenda
                .split(',')
                .map((x) => x.trim())
                .includes(p),
            ),
      aparelho: (['pc', 'fraco', 'celular', 'quest'] as const).find((a) => a === aparelho) ?? null,
      anuncios: localStorage.getItem(CHAVE_DOS_ANUNCIOS_DE_PROVA) === '1',
    };
  } catch {
    return SEM_PROVA;
  }
}

/** O plano de prova (`babel.px.planoDeProva`), ou `null`: só em desenvolvimento. */
export function planoDeProva(): PlanoDeProva | null {
  return provaDosPlanos().plano;
}
