/**
 * TEMA ÁGUA — A CENA VIVA. Porte de `agua.js` (o arquivo inteiro), função por função, com os mesmos
 * números. A água fica "no nível": quando o aparelho inclina, a superfície gira para o outro lado e
 * balança até assentar (mola pouco amortecida). As bolhas sobem para o lado mais alto, os raios de luz
 * acompanham e o brilho desliza sobre os cartões. Sem sensor (computador), o ponteiro faz esse papel.
 * Só anima `transform` e dois canvas; nada mexe no layout.
 *
 * Este arquivo só é baixado quando o tema em vigor (equipado ou em prova) é a Água: quem decide é
 * `agua.ts`, que o traz por `import()` e chama `montarCena()`; ao sair do tema, a função devolvida
 * tira tudo do documento (os nós, os ouvintes e o laço).
 *
 * O que muda do protótipo para o app:
 *   - Lá a cena é montada uma vez e fica escondida por CSS fora do tema. Aqui ela só existe no
 *     documento enquanto o tema está ligado.
 *   - Lá `mouse` é uma variável da página, que o ponteiro e o giroscópio escrevem
 *     (`prototipo.js:814-817`, `sentidos.js:253`). `ponteiro.ts` guarda a dele sem deixar ler, então a
 *     cena acompanha o ponteiro e o sensor por conta própria, com as mesmas contas.
 *   - O `<main>` é do React: se ele trocar o elemento, a cena é posta de volta no quadro seguinte.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: F4–F16, F25, F27.
 */
import { novoEstadoDaInclinacao, passoDaInclinacao } from '../dispositivo/inclinacao';
import { reduz } from './base';

/** `agua.js:23-24`. */
export const MAR_ALT = 200;
export const PASSO = 8;

/** A marcação de `agua.js:11-15`, sem tirar nem pôr. */
const CENA =
  '<div class="ag-cena" aria-hidden="true"><div class="ag-raios"><i></i><i></i></div><div class="ag-caustica a"><i></i></div><div class="ag-caustica b"><i></i></div><canvas class="ag-bolhas"></canvas><canvas class="ag-mar"></canvas></div>';
const FRENTE = '<div class="ag-frente" aria-hidden="true"><div class="ag-brilho"></div></div>';

export interface Bolha {
  x: number;
  y: number;
  r: number;
  v: number;
  f: number;
  vx: number;
  vida: number;
  morta?: boolean;
}

/** O `ag` de `agua.js:16-20`: o que a física guarda de um quadro para o outro. */
export interface EstadoDaAgua {
  t: number;
  ang: number;
  vAng: number;
  niv: number;
  vNiv: number;
  w: number;
  h: number;
  bolhas: Bolha[];
  sacode: number;
  tempo: number;
  agito: number;
  n: number;
  p: Float32Array;
  v: Float32Array;
}

export const novoEstadoDaAgua = (): EstadoDaAgua => ({
  t: 0,
  ang: 0,
  vAng: 0,
  niv: 0,
  vNiv: 0,
  w: 0,
  h: 0,
  bolhas: [],
  sacode: 0,
  tempo: 0,
  agito: 0,
  n: 0,
  p: new Float32Array(0),
  v: new Float32Array(0),
});

/** A fileira de molas do respingo tem um ponto a cada `PASSO` px (`agua.js:36-38`). */
export function medirMolas(ag: EstadoDaAgua, w: number, h: number): void {
  ag.w = w;
  ag.h = h;
  ag.n = Math.ceil(w / PASSO) + 2;
  ag.p = new Float32Array(ag.n);
  ag.v = new Float32Array(ag.n);
}

/* A superfície é desenhada a cada quadro, não é um ladrilho repetido (`agua.js:40-46`):
   - o nível, que inclina com o aparelho (a ponta sobe ou desce até ~64 px);
   - três ondas de tamanhos e velocidades diferentes somadas, para nunca repetir igual;
   - o respingo: uma fileira de molas ligadas entre si. Um toque ou uma bolha que estoura empurra um
     ponto, e a ondulação corre para os lados e morre sozinha. */
/** `nivelEm()` de `agua.js:45`. */
export const nivelEm = (ag: EstadoDaAgua, x: number): number =>
  48 + ag.niv + (ag.ang / 7) * Math.min(64, ag.w * 0.1) * ((x - ag.w / 2) / (ag.w / 2));

/** `ondaEm()` de `agua.js:46`. */
export const ondaEm = (ag: EstadoDaAgua, x: number, t: number, k: number): number =>
  (Math.sin(x * 0.0105 + t * 0.85 + k * 1.7) * 7 +
    Math.sin(x * 0.0236 - t * 1.35 + k * 0.6) * 3.6 +
    Math.sin(x * 0.049 + t * 2.2 + k * 2.9) * 1.5) *
  (1 + ag.agito * 1.7);

/** `respingo()` de `agua.js:47-53`. */
export function respingo(ag: EstadoDaAgua, x: number, forca: number): void {
  const c = Math.round(x / PASSO);
  for (let d = -4; d <= 4; d++) {
    const i = c + d;
    if (i >= 0 && i < ag.n) ag.v[i] += forca * (1 - Math.abs(d) / 5);
  }
}

/** As molas do respingo, dois subpassos por quadro (`agua.js:55-65`). */
export function passoDasMolas(ag: EstadoDaAgua, dt: number): void {
  const { p, v, n } = ag;
  for (let s = 0; s < 2; s++) {
    const h = dt / 2;
    for (let i = 0; i < n; i++) {
      const e = p[i > 0 ? i - 1 : i];
      const d = p[i < n - 1 ? i + 1 : i];
      v[i] += (-24 * p[i] + 95 * (e + d - 2 * p[i])) * h;
      v[i] *= 1 - 1.5 * h;
    }
    for (let i = 0; i < n; i++) p[i] += v[i] * h;
  }
}

/** A entrada da inclinação: o ponteiro (ou o giroscópio, que o leva) vira `tx`, `ty` (`agua.js:152-153`). */
export function inclinacaoDoPonto(mx: number, my: number, largura: number, altura: number): [number, number] {
  return [
    Math.max(-1, Math.min(1, (mx / largura - 0.5) / 0.45)),
    Math.max(-1, Math.min(1, (my / altura - 0.45) / 0.4)),
  ];
}

/**
 * A física de um quadro (`agua.js:154-166`): a mola do ângulo (46 / 4,4), a do nível (40 / 4,2), a
 * sacudida que morre (×0,86) e o agito, que acelera o tempo das ondas.
 */
export function passoDaFisica(ag: EstadoDaAgua, tx: number, ty: number, dt: number, parado: boolean): void {
  if (parado) {
    ag.ang = ag.niv = 0;
  } else {
    /* Mola pouco amortecida: a água passa do ponto e volta, duas ou três vezes, antes de assentar. */
    ag.vAng += (46 * (-tx * 7 - ag.ang) - 4.4 * ag.vAng) * dt + ag.sacode * dt * 60;
    ag.ang += ag.vAng * dt;
    ag.vNiv += (40 * (ty * 16 - ag.niv) - 4.2 * ag.vNiv) * dt;
    ag.niv += ag.vNiv * dt;
    ag.sacode *= 0.86;
  }
  const agito = Math.min(1, Math.abs(ag.vAng) / 26);
  ag.tempo += dt * (1 + agito * 1.2);
  ag.agito += (agito - ag.agito) * Math.min(1, dt * 5);
}

/** `novaBolha()` de `agua.js:141`. */
export const novaBolha = (ag: EstadoDaAgua, x?: number, y?: number, pequena?: boolean): Bolha => ({
  x: x ?? Math.random() * ag.w,
  y: y ?? ag.h + 20 + Math.random() * ag.h,
  r: pequena ? 1.5 + Math.random() * 3 : 2 + Math.random() * 7,
  v: 18 + Math.random() * 34,
  f: Math.random() * 6.28,
  vx: pequena ? (Math.random() - 0.5) * 90 : 0,
  vida: pequena ? 1 : Infinity,
});

/** `semearBolhas()` de `agua.js:142-144`. */
export function semearBolhas(ag: EstadoDaAgua): void {
  ag.bolhas = Array.from({ length: Math.round(Math.min(34, 14 + ag.w / 60)) }, () =>
    novaBolha(ag, undefined, Math.random() * ag.h),
  );
}

/** Altura da superfície num ponto x, já com a inclinação: é onde a bolha estoura (`agua.js:146`). */
export const superficieEm = (ag: EstadoDaAgua, x: number): number => nivelEm(ag, x) + ondaEm(ag, x, ag.tempo, 0);

/**
 * O movimento de uma bolha num quadro (`agua.js:178-191`). Devolve `false` quando ela sai de cena
 * (estourou, acabou ou saiu pelo lado): a comum renasce embaixo, a de toque fica marcada como morta.
 */
export function passoDaBolha(ag: EstadoDaAgua, b: Bolha, dt: number): boolean {
  b.f += dt * 2.2;
  /* a bolha sobe "para cima de verdade": se o aparelho inclina, ela escorrega para o lado mais alto */
  b.x += (Math.sin(b.f) * 9 + ag.ang * 9 + b.vx) * dt;
  b.y -= b.v * (1 + b.r / 9) * dt;
  b.vx *= 0.95;
  if (b.vida !== Infinity) b.vida -= dt * 0.7;
  const estourou = b.y < superficieEm(ag, b.x) + b.r || b.vida <= 0;
  if (estourou || b.x < -30 || b.x > ag.w + 30) {
    /* a bolha que chega à superfície faz um respingo pequeno */
    if (estourou && b.vida > 0) respingo(ag, b.x, -b.r * 5);
    if (b.vida === Infinity) Object.assign(b, novaBolha(ag, undefined, ag.h + 20 + Math.random() * 120));
    else b.morta = true;
    return false;
  }
  return true;
}

type Motion = { requestPermission?: () => Promise<unknown> };

/**
 * Monta a cena no `<main>` e liga o laço. Devolve como desmontar. Quem chama garante que o tema é a
 * Água e que a camada está ligada (`aguaLigada`, `agua.js:25`).
 */
export function montarCena(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const html = document.documentElement;
  let main = document.querySelector<HTMLElement>('main');
  if (!main) return () => undefined;

  const ag = novoEstadoDaAgua();
  let on = true;
  let pedido = 0;
  let pediu = false;

  /* ---- Os nós (`agua.js:11-22`) ---- */
  let cena!: HTMLElement;
  let frente!: HTMLElement;
  let raios!: HTMLElement;
  let ca!: HTMLElement;
  let cb!: HTMLElement;
  let brilho!: HTMLElement;
  let cv!: HTMLCanvasElement;
  let mar!: HTMLCanvasElement;
  let cx: CanvasRenderingContext2D | null = null;
  let mx: CanvasRenderingContext2D | null = null;
  const tirarNos = () => {
    cena?.remove();
    frente?.remove();
  };
  const porNos = (em: HTMLElement) => {
    tirarNos();
    em.insertAdjacentHTML('afterbegin', CENA);
    em.insertAdjacentHTML('beforeend', FRENTE);
    cena = em.querySelector<HTMLElement>(':scope > .ag-cena')!;
    frente = em.querySelector<HTMLElement>(':scope > .ag-frente')!;
    raios = cena.querySelector<HTMLElement>('.ag-raios')!;
    ca = cena.querySelector<HTMLElement>('.ag-caustica.a')!;
    cb = cena.querySelector<HTMLElement>('.ag-caustica.b')!;
    cv = cena.querySelector<HTMLCanvasElement>('.ag-bolhas')!;
    mar = cena.querySelector<HTMLCanvasElement>('.ag-mar')!;
    brilho = frente.querySelector<HTMLElement>('.ag-brilho')!;
    cx = cv.getContext('2d');
    mx = mar.getContext('2d');
  };

  /** `medirAgua()` de `agua.js:26-39`. */
  const medirAgua = () => {
    if (!main) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    medirMolas(ag, main.clientWidth, main.clientHeight);
    cv.width = ag.w * dpr;
    cv.height = ag.h * dpr;
    cx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    mar.width = ag.w * dpr;
    mar.height = MAR_ALT * dpr;
    mx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /** `desenharMar()` de `agua.js:54-140`. */
  const desenharMar = (dt: number) => {
    passoDasMolas(ag, dt);
    const c = mx;
    if (!c) return;
    const { p, n } = ag;
    const escuro = html.classList.contains('dark');
    const luz = escuro ? '130,228,246' : '255,255,255';
    const t = ag.tempo;
    c.clearRect(0, 0, ag.w, MAR_ALT);
    const y = (x: number, k: number) =>
      nivelEm(ag, x) +
      ondaEm(ag, x, t * (1 - k * 0.2), k) +
      p[Math.min(n - 1, Math.round(x / PASSO))] * (1 - k * 0.3) +
      k * 8;
    const curva = (k: number, volta?: number) => {
      if (volta == null) {
        c.moveTo(0, y(0, k));
        for (let x = PASSO; x <= ag.w + PASSO; x += PASSO) c.lineTo(x, y(x, k));
      } else for (let x = ag.w + PASSO; x >= 0; x -= PASSO) c.lineTo(x, y(x, k) + volta);
    };
    /* três camadas, da mais funda para a da frente: o ar visto por baixo d'água */
    [2, 1, 0].forEach((k) => {
      const g = c.createLinearGradient(0, 0, 0, MAR_ALT * 0.7);
      const a = (escuro ? [0.08, 0.13, 0.24] : [0.3, 0.42, 0.7])[2 - k];
      g.addColorStop(0, `rgba(${luz},${a * 1.25})`);
      g.addColorStop(1, `rgba(${luz},${a * 0.5})`);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, y(0, k));
      for (let x = PASSO; x <= ag.w + PASSO; x += PASSO) c.lineTo(x, y(x, k));
      c.lineTo(ag.w + PASSO, 0);
      c.closePath();
      c.fillStyle = g;
      c.fill();
    });
    /* no tema claro, uma sombra azul logo abaixo da linha: é ela que faz a borda da água aparecer sobre o fundo claro */
    if (!escuro) {
      const fundo = nivelEm(ag, ag.w / 2);
      const sombra = c.createLinearGradient(0, fundo - 10, 0, fundo + 70);
      sombra.addColorStop(0, 'rgba(8,120,160,0.26)');
      sombra.addColorStop(1, 'rgba(8,120,160,0)');
      c.beginPath();
      curva(0);
      curva(0, 64);
      c.closePath();
      c.fillStyle = sombra;
      c.fill();
    }
    /* a luz que atravessa a superfície e se espalha logo abaixo dela */
    const base = nivelEm(ag, ag.w / 2);
    const luzDeBaixo = c.createLinearGradient(0, base - 14, 0, base + 62);
    luzDeBaixo.addColorStop(0, `rgba(${luz},${escuro ? 0.2 : 0.3})`);
    luzDeBaixo.addColorStop(1, `rgba(${luz},0)`);
    c.beginPath();
    curva(0);
    curva(0, escuro ? 56 : 18);
    c.closePath();
    c.fillStyle = luzDeBaixo;
    c.fill();
    /* a linha d'água: um fio claro com halo, sem contorno duro */
    c.lineJoin = c.lineCap = 'round';
    c.beginPath();
    curva(0);
    c.strokeStyle = `rgba(${luz},${escuro ? 0.1 : 0.2})`;
    c.lineWidth = 9;
    c.stroke();
    c.shadowColor = `rgba(${luz},0.9)`;
    c.shadowBlur = 10;
    c.strokeStyle = `rgba(${luz},${escuro ? 0.6 : 0.92})`;
    c.lineWidth = 1.8;
    c.stroke();
    c.shadowBlur = 0;
    /* cintilações nas cristas: acendem e apagam, cada uma no seu tempo */
    for (let x = 30; x < ag.w; x += 74) {
      const xx = x + Math.sin(x * 12.9898) * 26;
      const f = Math.pow(Math.max(0, Math.sin(xx * 0.05 + t * 2.6 + Math.sin(x) * 6)), 10);
      if (f < 0.04) continue;
      c.beginPath();
      c.ellipse(xx, y(xx, 0) - 0.5, 4 + 13 * f, 1.3 + f, 0, 0, 6.283);
      c.fillStyle = `rgba(${luz},${0.95 * f})`;
      c.fill();
    }
  };

  /* ---- De onde vem a inclinação: o ponteiro, ou o giroscópio no lugar dele ----
     `prototipo.js:814-817` (o ponteiro escreve `mouse`) e `sentidos.js:206-223, 250-253` (o sensor,
     suavizado a 0,12 por quadro, vira o ponto que o ponteiro ocuparia). */
  let mouse = [innerWidth / 2, innerHeight / 2];
  const giro = { ativo: false, x: 0, y: 0, ax: 0, ay: 0 };
  const neutro = novoEstadoDaInclinacao();
  const aoMover = (e: PointerEvent) => {
    mouse = [e.clientX, e.clientY];
  };
  const aoGirar = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || reduz()) return;
    const i = passoDaInclinacao(neutro, e.beta, e.gamma);
    giro.ax = i.x;
    giro.ay = i.y;
    giro.ativo = true;
  };

  /** `quadroDaAgua()` de `agua.js:147-207`. */
  function quadroDaAgua(agora: number) {
    pedido = 0;
    if (!on) return;
    /* O `<main>` é do React: se a cena saiu do documento com ele, volta para o que está lá agora. */
    if (!cena.isConnected) {
      main = document.querySelector<HTMLElement>('main');
      if (!main) return;
      porNos(main);
      observador.disconnect();
      observador.observe(main);
      medirAgua();
    }
    const dt = Math.min(0.05, (agora - ag.t) / 1000 || 0.016);
    ag.t = agora;
    if (giro.ativo) {
      giro.x += (giro.ax - giro.x) * 0.12;
      giro.y += (giro.ay - giro.y) * 0.12;
      mouse = [innerWidth * (0.5 + giro.x * 0.45), innerHeight * (0.45 + giro.y * 0.4)];
    }
    /* a inclinação vem do giroscópio (que já alimenta "mouse") ou do ponteiro */
    const [tx, ty] = inclinacaoDoPonto(mouse[0], mouse[1], innerWidth, innerHeight);
    passoDaFisica(ag, tx, ty, dt, reduz());
    desenharMar(dt);
    raios.style.transform = `rotate(${(ag.ang * 1.7).toFixed(3)}deg)`;
    /* profundidade: o que está longe anda menos, o que está perto anda mais */
    ca.style.transform = `translate(${(-tx * 14).toFixed(1)}px, ${(-ty * 10).toFixed(1)}px)`;
    cb.style.transform = `translate(${(-tx * 30).toFixed(1)}px, ${(-ty * 20).toFixed(1)}px)`;
    brilho.style.transform = `translate(${(-ag.ang * 2.4).toFixed(2)}%, ${(-ty * 9).toFixed(2)}%)`;
    const c = cx;
    if (c) {
      c.clearRect(0, 0, ag.w, ag.h);
      const escuro = html.classList.contains('dark');
      const luz = escuro ? '120,225,245' : '255,255,255';
      for (const b of ag.bolhas) {
        if (!passoDaBolha(ag, b, dt)) continue;
        const a = Math.min(1, b.vida) * (escuro ? 0.5 : 0.75);
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, 6.283);
        c.fillStyle = `rgba(${luz},${0.1 * a})`;
        c.fill();
        c.lineWidth = 1.2;
        c.strokeStyle = `rgba(${luz},${0.8 * a})`;
        c.stroke();
        c.beginPath();
        c.arc(b.x - b.r * 0.32, b.y - b.r * 0.34, Math.max(0.6, b.r * 0.22), 0, 6.283);
        c.fillStyle = `rgba(${luz},${0.95 * a})`;
        c.fill();
      }
    }
    if (ag.bolhas.some((b) => b.morta)) ag.bolhas = ag.bolhas.filter((b) => !b.morta);
    pedir();
  }
  /** Um pedido de quadro por vez, e nenhum com a aba escondida. */
  const pedir = () => {
    if (on && !pedido && !document.hidden) pedido = requestAnimationFrame(quadroDaAgua);
  };
  const aoMudarDeVista = () => {
    if (document.hidden) {
      cancelAnimationFrame(pedido);
      pedido = 0;
      return;
    }
    ag.t = performance.now();
    pedir();
  };

  /* Cada toque faz uma onda e solta bolhinhas no ponto tocado (`agua.js:222-246`). */
  const aoTocar = (e: PointerEvent) => {
    if (!on || !main || !(e.target instanceof Node) || !main.contains(e.target) || reduz()) return;
    const r = main.getBoundingClientRect();
    const [x, y] = [e.clientX - r.left, e.clientY - r.top];
    const o = document.createElement('i');
    o.className = 'ag-onda';
    o.style.left = x + 'px';
    o.style.top = y + 'px';
    o.append(document.createElement('b'));
    frente.append(o);
    /* o toque também mexe a superfície: quanto mais perto do alto, mais forte */
    respingo(ag, x, 220 * Math.max(0.12, 1 - y / 420));
    window.setTimeout(() => o.remove(), 2400);
    for (let k = 0; k < 7; k++)
      ag.bolhas.push(novaBolha(ag, x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 12, true));
    const M = (window as unknown as { DeviceMotionEvent?: Motion }).DeviceMotionEvent;
    if (M?.requestPermission && !pediu) {
      pediu = true;
      M.requestPermission().catch(() => undefined);
    }
  };
  /* Sacudir o aparelho agita a água (`agua.js:247-251`). */
  const aoSacudir = (e: DeviceMotionEvent) => {
    const a = e.acceleration?.x;
    if (on && a && Math.abs(a) > 1.2) ag.sacode = Math.max(-6, Math.min(6, ag.sacode + a * 0.5));
  };

  /* ---- `ligarAgua()` de `agua.js:208-220`: mede, semeia as bolhas e inicia o laço ---- */
  porNos(main);
  const observador = new ResizeObserver(() => on && medirAgua());
  observador.observe(main);
  medirAgua();
  semearBolhas(ag);
  ag.t = performance.now();
  document.addEventListener('pointermove', aoMover, { passive: true });
  document.addEventListener('pointerdown', aoTocar, { capture: true, passive: true });
  document.addEventListener('visibilitychange', aoMudarDeVista);
  window.addEventListener('deviceorientation', aoGirar);
  window.addEventListener('devicemotion', aoSacudir);
  pedir();

  return () => {
    on = false;
    cancelAnimationFrame(pedido);
    pedido = 0;
    observador.disconnect();
    document.removeEventListener('pointermove', aoMover);
    document.removeEventListener('pointerdown', aoTocar, { capture: true });
    document.removeEventListener('visibilitychange', aoMudarDeVista);
    window.removeEventListener('deviceorientation', aoGirar);
    window.removeEventListener('devicemotion', aoSacudir);
    for (const o of frente.querySelectorAll('.ag-onda')) o.remove();
    tirarNos();
    ag.bolhas = [];
  };
}
