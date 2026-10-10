/**
 * A PÍLULA, A TROCA DE TELA E A ENTRADA — porte de `prototipo.js:154-380`, com os mesmos números.
 *
 * No protótipo a tela é um `innerHTML` que ele mesmo troca; no app quem troca é o React, um instante
 * depois do clique. Por isso a saída segura a tela escondida até a nova chegar (um observador avisa),
 * e só então solta a entrada. Fora isso, cada função é a do protótipo, com a linha de origem.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: B5–B19.
 */
import { anima, EVENTO_DOS_ESTILOS, limpar, MOLA, polido, reduz } from './base';

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

const telaAtual = () => $('.px-tela');
const trilhoAtual = () => $('.q-trilho');

/* ---- Pílula que desliza: abas e trilho (`prototipo.js:154-211`) ---------------------------------- */

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ativaDe = (g: HTMLElement) =>
  g.matches('.q-trilho')
    ? $('.q-item[aria-current="page"]', g)
    : $('.q-aba[aria-selected="true"], .q-aba[aria-checked="true"]', g);

function medir(g: HTMLElement): Caixa | null {
  const a = ativaDe(g);
  if (!a) return null;
  const rg = g.getBoundingClientRect();
  const ra = a.getBoundingClientRect();
  /* No protótipo a pílula é medida ANTES de o painel começar a crescer. No app a medida pode cair no
     meio da animação (o painel está em escala 0,55): a conta desfaz a escala para dar o mesmo número. */
  const k = g.offsetWidth && rg.width ? rg.width / g.offsetWidth : 1;
  return {
    x: (ra.left - rg.left) / k - g.clientLeft + g.scrollLeft,
    y: (ra.top - rg.top) / k - g.clientTop + g.scrollTop,
    w: ra.width / k,
    h: ra.height / k,
  };
}

function aplicar(p: HTMLElement, r: Caixa | null): void {
  if (!r) {
    p.style.opacity = '0';
    return;
  }
  p.style.opacity = '1';
  p.style.width = r.w + 'px';
  p.style.height = r.h + 'px';
  p.style.transform = `translate(${r.x}px, ${r.y}px)`;
}

function porPilula(g: HTMLElement): void {
  if (!polido()) return;
  let p = $(':scope > .px-pilula', g);
  if (!p) {
    p = document.createElement('span');
    p.className = 'px-pilula';
    p.setAttribute('aria-hidden', 'true');
    g.prepend(p);
    g.classList.add('px-com-pilula');
    p.style.transition = 'none';
    aplicar(p, medir(g));
    void p.offsetWidth;
    p.style.transition = '';
  }
  aplicar(p, medir(g));
}

function tirarPilulas(): void {
  $$('.px-pilula').forEach((p) => p.remove());
  $$('.px-com-pilula').forEach((g) => g.classList.remove('px-com-pilula'));
}

function reposicionar(): void {
  for (const p of $$('.px-pilula')) {
    if (!p.parentElement) continue;
    p.style.transition = 'none';
    aplicar(p, medir(p.parentElement));
    void p.offsetWidth;
    p.style.transition = '';
  }
}

/* ---- O trilho responde no toque (`prototipo.js:217-228`) ----------------------------------------- */

let itemDoTrilho: Element | null = null;

/** O ícone do destino escolhido salta: 620 ms na mola (`prototipo.js:225-227`). */
function saltarIcone(alvo: Element | null): void {
  if (!alvo || alvo === itemDoTrilho) return;
  const primeiraVez = itemDoTrilho === null;
  itemDoTrilho = alvo;
  if (primeiraVez || !polido() || reduz()) return;
  const svg = alvo.querySelector('svg');
  if (svg)
    anima(svg, [{ transform: 'scale(0.6) rotate(-14deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
      d: 620,
      e: MOLA,
    });
}

/**
 * O botão do trilho que responde por uma rota. Na barra de cinco, o "Praticar" responde por duas
 * (Cartões e Jogar): a segunda vem em `data-px-tambem` (`marcarTrilho`, `cartoes3.js:66-78`).
 */
const itemDaRota = (trilho: ParentNode, rota: string): HTMLElement | null =>
  $(`.q-item[data-px-rota="${CSS.escape(rota)}"], .q-item[data-px-tambem="${CSS.escape(rota)}"]`, trilho);

/** Marca o destino no trilho já no toque, antes de a tela trocar (`prototipo.js:240`). */
function marcarTrilho(rota: string): void {
  const trilho = trilhoAtual();
  if (!trilho) return;
  const alvo = itemDaRota(trilho, rota) ?? $('.q-mais-botao', trilho);
  for (const b of $$('.q-item', trilho)) b.removeAttribute('aria-current');
  alvo?.setAttribute('aria-current', 'page');
  porPilula(trilho);
  saltarIcone(alvo);
}

/* A posição no menu de quem não tem botão: a Biblioteca, que a barra de cinco esconde, continua em
   quarto (`CT_NAV.a.itens`, `cartoes3.js:14`). */
const FORA_DA_BARRA = { library: 3 } as const;

/** A ordem do menu decide o lado: quem vem antes sai para baixo (`prototipo.js:232, 236`). */
function ordem(rota: string): number {
  const trilho = trilhoAtual();
  const i = trilho
    ? $$('.q-item[data-px-rota]', trilho).findIndex((b) => b.dataset.pxRota === rota || b.dataset.pxTambem === rota)
    : -1;
  /* No celular a Biblioteca sai da barra e vai para o "Mais", mas continua na ordem do menu. */
  if (i < 0 && rota in FORA_DA_BARRA) return FORA_DA_BARRA[rota as keyof typeof FORA_DA_BARRA];
  return i < 0 ? 7 : i;
}

/* ---- Entrada (`prototipo.js:278-360`) ------------------------------------------------------------ */

const ENTRA = (y: number): Keyframe[] => [
  { opacity: 0, transform: `translateY(${y}px) scale(0.96)`, filter: 'blur(8px)' },
  { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
];

/** Quem está fora da vista espera: entra quando a rolagem chegar nele (`prototipo.js:283-294`). */
let olheiro: IntersectionObserver | null = null;
function olhar(): IntersectionObserver {
  olheiro ??= new IntersectionObserver(
    (es) => {
      let i = 0;
      for (const e of es) {
        if (!e.isIntersecting) continue;
        olheiro?.unobserve(e.target);
        (e.target as HTMLElement).style.opacity = '';
        anima(e.target, ENTRA(34), { d: 680, atraso: i++ * 70 });
      }
    },
    { threshold: 0.12 },
  );
  return olheiro;
}

/**
 * O título entra palavra por palavra e a sobrancelha pela esquerda (`prototipo.js:296-315`).
 *
 * O `<h1>` é do React: os nós de texto dele saem enquanto as palavras sobem e VOLTAM quando a última
 * pousa, para um título que mude depois continuar sendo atualizado por quem o desenhou.
 */
function revelarTitulo(tela: HTMLElement): void {
  const h1 = $('.q-cab h1, .cab h1', tela);
  if (!h1 || h1.children.length || reduz()) return;
  const palavras = (h1.textContent ?? '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return;
  const originais = [...h1.childNodes];
  h1.textContent = '';
  let ultima: Animation | null = null;
  palavras.forEach((p, i) => {
    const caixa = document.createElement('span');
    caixa.className = 'px-pal';
    const dentro = document.createElement('span');
    dentro.textContent = p;
    caixa.append(dentro);
    h1.append(caixa, i < palavras.length - 1 ? ' ' : '');
    ultima = anima(
      dentro,
      [{ transform: 'translateY(115%) rotate(7deg)' }, { transform: 'translateY(0) rotate(0deg)' }],
      {
        d: 760,
        atraso: 60 + i * 75,
      },
    );
  });
  const devolver = () => {
    if (h1.querySelector('.px-pal')) h1.replaceChildren(...originais);
  };
  (ultima as Animation | null)?.finished.then(devolver, devolver);
  const sobre = $('.q-cab .q-sobre, .cab .sobrancelha', tela);
  if (sobre)
    anima(
      sobre,
      [
        { opacity: 0, transform: 'translateX(-14px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      {
        d: 520,
      },
    );
}

/** Os blocos que entram em cascata (`prototipo.js:317-326`). */
function pecas(tela: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const abre = (b: HTMLElement) => {
    if (b.matches('.q-grade')) out.push(...([...b.children] as HTMLElement[]));
    else if (b.matches('.q-secao') && $(':scope > .q-grade', b)) ([...b.children] as HTMLElement[]).forEach(abre);
    else out.push(b);
  };
  new Set($$('.q-palco > *, .tela > *', tela)).forEach(abre);
  return out.filter((b) => b.offsetParent && !b.matches('.q-cab, .cab'));
}

/** A tela entra: título, depois os blocos, 60 ms um do outro (`prototipo.js:328-344`). */
function entrar(tela: HTMLElement, dir: number): void {
  if (reduz()) {
    anima(tela, [{ opacity: 0 }, { opacity: 1 }], { d: 160, e: 'ease' });
    return;
  }
  revelarTitulo(tela);
  const lista = pecas(tela);
  if (!lista.length) anima(tela, ENTRA(28 * dir), { d: 620 });
  let i = 0;
  for (const b of lista) {
    if (b.getBoundingClientRect().top < innerHeight - 20) {
      anima(b, ENTRA(30 * dir), { d: 700, atraso: 90 + Math.min(i++, 12) * 60 });
    } else {
      b.style.opacity = '0';
      olhar().observe(b);
    }
  }
}

/* ---- Troca de tela (`prototipo.js:230-275`) ------------------------------------------------------ */

let vezDaTela = 0;
/** Uma navegação está no ar: a próxima tela que montar é a dela. */
let chegando: { dir: number; tipo: 'clique' | 'teclado'; solta: number } | null = null;
let ultimaTecla = 0;
let ultimoPonteiro = 0;

/**
 * Troca de tela com saída: a de antes some para o lado do destino (150 ms, `ease-out`, 18 px, 0,985,
 * desfoque 5) e só então `trocar` roda. Navegação pelo teclado não anima; só a última vale.
 */
export function trocarDeTela(proxima: string, atual: string, trocar: () => void): void {
  const tela = telaAtual();
  const tipo = ultimaTecla > ultimoPonteiro ? 'teclado' : 'clique';
  const vez = ++vezDaTela;
  const dir = ordem(proxima) < ordem(atual) ? -1 : 1;
  if (!tela || !polido() || proxima === atual) return trocar();
  if (chegando) clearTimeout(chegando.solta);
  /* Rede de segurança: se nenhuma tela nova montar (destino sem conteúdo), a de agora reaparece. */
  const solta = window.setTimeout(() => {
    chegando = null;
    limpar(tela);
  }, 4000);
  chegando = { dir, tipo, solta };
  const sair = !reduz() && tipo === 'clique' && !!tela.firstElementChild;
  if (!sair) return trocar();
  marcarTrilho(proxima);
  limpar(tela);
  let feito = false;
  const fim = () => {
    if (feito || vez !== vezDaTela) return;
    feito = true;
    trocar();
  };
  /* A navegação nunca fica presa à animação: numa aba em segundo plano o navegador congela as
     animações e a promessa não chega. O relógio garante a troca. */
  window.setTimeout(fim, 400);
  anima(tela, [{ opacity: 0, transform: `translateY(${-18 * dir}px) scale(0.985)`, filter: 'blur(5px)' }], {
    d: 150,
    e: 'ease-out',
    fill: 'forwards',
  }).finished.then(fim, fim);
}

/**
 * A tela chegou só com o esqueleto de carregamento. Quando o conteúdo de verdade entra NO MESMO palco
 * (sem montar tela nova), ninguém avisava, e telas como o Vocabulário nunca entravam animadas: o
 * olheiro abaixo roda a entrada assim que o último esqueleto some.
 */
let aEspera: MutationObserver | null = null;
function esperarOConteudo(tela: HTMLElement): void {
  aEspera?.disconnect();
  const olho = new MutationObserver(() => {
    if (!tela.isConnected) return void olho.disconnect();
    if ($('.q-esqueleto', tela)) return;
    olho.disconnect();
    if (aEspera === olho) aEspera = null;
    chegou(tela);
  });
  olho.observe(tela, { childList: true, subtree: true });
  aEspera = olho;
}

/** Uma tela nova montou dentro de `.px-tela`. */
function chegou(tela: HTMLElement): void {
  /* O app carrega dados e o protótipo não: enquanto a tela é só o esqueleto de carregamento, ela aparece
     sem cerimônia, e a entrada fica guardada para o conteúdo de verdade. */
  if ($('.q-esqueleto', tela)) {
    limpar(tela);
    esperarOConteudo(tela);
    return;
  }
  aEspera?.disconnect();
  aEspera = null;
  const de = chegando;
  if (de) clearTimeout(de.solta);
  chegando = null;
  olheiro?.disconnect();
  limpar(tela);
  if (!polido() || de?.tipo === 'teclado') return;
  /* Só a tela `jogo` antiga do protótipo ficava no título (`prototipo.js:273`); a partida entra inteira. */
  entrar(tela, de?.dir ?? 1);
}

/**
 * As telas de dentro do Jogar (lobby, antessala, rodada, fim) trocam fora da navegação: quem as troca
 * (`sairDaTelaDoJogar`, `jogos.ts`) avisa de que lado a próxima entra.
 */
export function anunciarChegada(dir: number): void {
  if (chegando) clearTimeout(chegando.solta);
  const solta = window.setTimeout(() => (chegando = null), 4000);
  chegando = { dir, tipo: 'clique', solta };
}

/* ---- Aba primária: o painel entra pelo lado (`prototipo.js:362-380`) ----------------------------- */

/* As três do protótipo (`prototipo.js:88-92`); `.q-aju` é o palco dos Ajustes no app. */
/* O Vocabulário (`.qv-abas`) e as telas de conta (`.qc > .q-abas`: Perfil, Planos) não existem no
   protótipo com abas primárias próprias; entram aqui para o painel não trocar a seco só nelas. */
const PRIMARIA = '.qe-abas, .qp-abas, .qv-abas, .qc > .q-abas:not(.q-seg), .q-aju .q-abas:not(.q-seg)';
const indiceDaAba = new WeakMap<Element, number>();

function entrarAba(g: HTMLElement): void {
  const abas = $$('.q-aba', g);
  const agora = abas.findIndex((a) => a.matches('[aria-selected="true"], [aria-checked="true"]'));
  const antes = indiceDaAba.get(g);
  indiceDaAba.set(g, agora);
  if (antes === undefined || antes === agora || agora < 0 || !polido()) return;
  const dirAba = agora < antes ? -1 : 1;
  let topo: HTMLElement = g;
  while (topo.parentElement && !topo.parentElement.matches('.q-palco, .tela, .px-tela')) topo = topo.parentElement;
  let i = 0;
  for (let n = topo.nextElementSibling; n; n = n.nextElementSibling) {
    anima(
      n,
      reduz()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${70 * dirAba}px)`, filter: 'blur(8px)' },
            { opacity: 1, transform: 'translateX(0)', filter: 'blur(0)' },
          ],
      { d: 560, atraso: Math.min(i++, 5) * 60 },
    );
  }
}

/* ---- Instalação --------------------------------------------------------------------------------- */

const ehDaPilula = (n: Node) => n instanceof Element && n.classList.contains('px-pilula');
/* Quem tem pílula (as barras de abas e o trilho) e as abas primárias, que nem sempre são `.q-abas`. */
const COM_PILULA = `.q-abas, .q-trilho, ${PRIMARIA}`;
/* O que a camada pendura num botão sem mexer no tamanho dele (a luz, a onda do toque: `ponteiro.ts`). */
const semCaixa = (n: Node) => n instanceof Element && n.matches('.px-pilula, .px-luz, .px-onda-caixa');
/** A mutação pode ter mudado o lugar ou o tamanho de uma pílula: mexeu dentro de uma barra, ou trouxe uma. */
function mexeNasPilulas(m: MutationRecord): boolean {
  const nos = [...m.addedNodes, ...m.removedNodes];
  if (m.target instanceof Element && m.target.closest(COM_PILULA)) return !nos.every(semCaixa);
  return nos.some((n) => n instanceof Element && (n.matches(COM_PILULA) || !!n.querySelector(COM_PILULA)));
}
/* Diálogo e painel não são tela: abrir os Recordes por cima do lobby não refaz a entrada do lobby. */
const ehTelaNova = (n: Node): n is HTMLElement =>
  n instanceof HTMLElement &&
  !n.matches('dialog, .q-mais-fundo') &&
  !n.classList.contains('carregando-da-tela') &&
  !n.closest('.px-pal');

/**
 * Liga a pílula, a troca e a entrada enquanto a casca do desenho novo estiver montada. Devolve como
 * desligar.
 */
export function instalarTelas(): () => void {
  let pedido = 0;
  let telaNova = false;
  let abasMexidas = new Set<HTMLElement>();
  /*
   * AS PÍLULAS SÓ SÃO MEDIDAS QUANDO PODEM TER MUDADO (auditoria de desempenho de 10/10/2026, G5). Antes,
   * toda mutação do documento (uma fala nova, a luz que entra num botão, um aviso) media todas as barras
   * de abas e o trilho com `getBoundingClientRect`: 54 a 78 ms por interação no celular médio. Agora só
   * mede quando uma aba ou o destino muda, quando uma barra entra ou muda por dentro, quando a camada
   * liga, e quando uma barra muda de tamanho (o `ResizeObserver` abaixo). A posição e a mola são as mesmas.
   */
  let pilulasSujas = true;
  const vigiadas = new Set<HTMLElement>();
  const tamanhos =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          pilulasSujas = true;
          pedir();
        });
  const vigiar = (g: HTMLElement) => {
    if (!tamanhos || vigiadas.has(g)) return;
    vigiadas.add(g);
    tamanhos.observe(g);
  };

  const atualizar = () => {
    pedido = 0;
    if (!polido()) tirarPilulas();
    else if (pilulasSujas) {
      for (const g of vigiadas)
        if (!g.isConnected) {
          vigiadas.delete(g);
          tamanhos?.unobserve(g);
        }
      const trilho = trilhoAtual();
      if (trilho) {
        porPilula(trilho);
        saltarIcone(ativaDe(trilho));
        vigiar(trilho);
      }
      for (const g of $$('.q-abas')) {
        porPilula(g);
        vigiar(g);
      }
    }
    for (const g of abasMexidas) if (g.isConnected) entrarAba(g);
    abasMexidas = new Set();
    const tela = telaAtual();
    if (telaNova && tela) chegou(tela);
    telaNova = false;
    /* Aba primária nova só chega junto com uma barra (a mesma marca das pílulas). */
    if (pilulasSujas) for (const g of $$(PRIMARIA)) if (!indiceDaAba.has(g)) entrarAba(g);
    pilulasSujas = false;
  };
  const pedir = () => {
    if (!pedido) pedido = requestAnimationFrame(atualizar);
  };

  /* O QUE NÃO É DA CAMADA NÃO PEDE QUADRO: a mutação que não troca de tela, não mexe em aba e não toca em
     barra nenhuma (cada fala nova da captura, com centenas na tela) acaba aqui, sem `atualizar`. Antes cada
     uma pedia um quadro e uma varredura do documento, que crescia com ele. */
  const observador = new MutationObserver((mudancas) => {
    const tela = telaAtual();
    for (const m of mudancas) {
      if (m.type === 'attributes') {
        pilulasSujas = true;
        const g = (m.target as Element).closest<HTMLElement>(PRIMARIA);
        if (g && m.attributeName !== 'aria-current') abasMexidas.add(g);
        continue;
      }
      if ([...m.addedNodes, ...m.removedNodes].every(ehDaPilula)) continue;
      if (!pilulasSujas && mexeNasPilulas(m)) pilulasSujas = true;
      if (!tela || !tela.contains(m.target)) continue;
      for (const n of m.addedNodes) {
        if (!ehTelaNova(n)) continue;
        /* Tela nova: um filho direto de `.px-tela` (a navegação) ou um palco que montou mais fundo
           (as telas de dentro do Jogar trocam sem passar pela navegação). */
        if (m.target === tela || n.matches('.q-palco, .tela') || n.querySelector('.q-palco, .tela')) telaNova = true;
      }
    }
    if (pilulasSujas || telaNova || abasMexidas.size) pedir();
  });
  observador.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-selected', 'aria-checked', 'aria-current', 'data-px'],
  });
  const daMarca = new MutationObserver(() => {
    pilulasSujas = true;
    pedir();
  });
  daMarca.observe(document.documentElement, { attributes: true, attributeFilter: ['data-px'] });

  /* Borda de rolagem: o degradê aparece depois de 6 px (`prototipo.js:266`, `polimento.css:195-208`). */
  const aoRolar = (e: Event) => {
    const alvo = e.target;
    if (!(alvo instanceof HTMLElement) || !alvo.matches('.q-palco, .rolagem')) return;
    alvo.closest('main')?.toggleAttribute('data-px-rolou', alvo.scrollTop > 6);
  };
  const aoRedimensionar = () => requestAnimationFrame(reposicionar);
  const aoTeclar = () => (ultimaTecla = performance.now());
  const aoApontar = () => (ultimoPonteiro = performance.now());

  document.addEventListener('scroll', aoRolar, { capture: true, passive: true });
  window.addEventListener('resize', aoRedimensionar);
  window.addEventListener('keydown', aoTeclar, { capture: true });
  window.addEventListener('pointerdown', aoApontar, { capture: true, passive: true });
  document.fonts?.ready.then(reposicionar).catch(() => undefined);
  document.addEventListener(EVENTO_DOS_ESTILOS, reposicionar);
  pedir();

  return () => {
    observador.disconnect();
    daMarca.disconnect();
    tamanhos?.disconnect();
    olheiro?.disconnect();
    olheiro = null;
    itemDoTrilho = null;
    document.removeEventListener('scroll', aoRolar, { capture: true });
    window.removeEventListener('resize', aoRedimensionar);
    document.removeEventListener(EVENTO_DOS_ESTILOS, reposicionar);
    window.removeEventListener('keydown', aoTeclar, { capture: true });
    window.removeEventListener('pointerdown', aoApontar, { capture: true });
    if (pedido) cancelAnimationFrame(pedido);
    tirarPilulas();
  };
}
