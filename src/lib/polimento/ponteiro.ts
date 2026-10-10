/**
 * O QUE RESPONDE AO PONTEIRO — porte de `prototipo.js:792-848` (a aura) e `1194-1294` (a luz dentro
 * do cartão, a inclinação 3D e a onda no toque), com os mesmos números.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: B2, B36, B37, B38.
 */
import { anima, EVENTO_DOS_ESTILOS, polido, reduz } from './base';

const BOTAO_COM_LUZ = 'button.q-tile:not(.apagado):not(:disabled), button.q-linha:not(:disabled)';
const COM_ONDA = '.q-ctl, .btn, .q-chip, .q-aba, .q-tile, .q-linha, .q-item, .campo-idioma, .cmd-item';

interface Tilt {
  el: HTMLElement;
  /** rotateX, rotateY, translateY, scale: o valor na tela, que persegue o alvo. */
  v: number[];
  ax: number;
  ay: number;
  saindo: boolean;
  aperta: boolean;
  /** O laço da inclinação está pedindo quadros (dorme quando o cartão chega ao alvo). */
  rodando: boolean;
}

/*
 * OS LAÇOS DORMEM (auditoria de desempenho de 10/10/2026, G4 e G9). A aura e a inclinação perseguem um
 * alvo com uma fração do caminho por quadro; antes pediam um quadro por vsync para sempre, mesmo já em
 * cima do alvo (Início parado, celular médio: 240 ms/s de fio principal). Agora param quando a distância
 * que falta não aparece na tela e voltam no próximo movimento. Os números da perseguição são os mesmos.
 */
/** A aura parou: falta menos de 0,05 px em cada eixo. */
const AURA_CHEGOU = 0.05;
/** A inclinação parou: falta menos de 0,01 (graus, px e centésimos de escala) em cada um dos quatro. */
const TILT_CHEGOU = 0.01;
/** O quadro de referência da perseguição da aura (60 Hz), para o tempo em que a camada ficou desligada. */
const QUADRO_MS = 1000 / 60;

/** Quem leva o ponteiro para onde o giroscópio aponta, enquanto a casca estiver montada. */
let levarPonteiro: ((x: number, y: number) => void) | null = null;

/**
 * O giroscópio como ponteiro (`sentidos.js:253`): no celular não há mouse, e o que segue o ponteiro
 * (a aura) passa a seguir o ponto que o movimento do aparelho indica.
 */
export function moverPonteiro(x: number, y: number): void {
  levarPonteiro?.(x, y);
}

export function instalarPonteiro(): () => void {
  let til: Tilt | null = null;
  let comLuz: Element | null = null;
  let vivo = true;

  /* ---- Inclinação 3D com mola (`prototipo.js:1197-1218`) ---- */
  /** O alvo mudou (o mouse andou, apertou, soltou ou saiu): o laço volta a pedir quadros. */
  const acordarTilt = () => {
    if (!til || til.rodando) return;
    til.rodando = true;
    requestAnimationFrame(quadroTilt);
  };
  const soltarTilt = () => {
    if (!til) return;
    til.saindo = true;
    acordarTilt();
  };
  const zerarTilt = () => {
    if (!til) return;
    til.el.style.transform = '';
    til.el.style.transition = '';
    til = null;
  };
  const quadroTilt = () => {
    const t = til;
    if (!t) return;
    if (!t.el.isConnected || !polido()) return zerarTilt();
    const alvo = t.saindo ? [0, 0, 0, 1] : [t.ax, t.ay, -6, t.aperta ? 0.96 : 1.02];
    t.v = t.v.map((v, i) => v + (alvo[i] - v) * 0.16);
    const [rx, ry, y, s] = t.v;
    if (t.saindo && Math.abs(rx) + Math.abs(ry) + Math.abs(y) + Math.abs(s - 1) * 100 < 0.1) return zerarTilt();
    t.el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${y}px) scale(${s})`;
    /* Com o mouse parado sobre o cartão a mola chega e o laço dorme (antes: um quadro por vsync até o
       mouse sair). A escala conta em centésimos, como na conta da saída logo acima. */
    const falta = Math.max(
      Math.abs(alvo[0] - rx),
      Math.abs(alvo[1] - ry),
      Math.abs(alvo[2] - y),
      Math.abs(alvo[3] - s) * 100,
    );
    if (!t.saindo && falta < TILT_CHEGOU) {
      t.rodando = false;
      return;
    }
    requestAnimationFrame(quadroTilt);
  };

  /* ---- Luz que segue o ponteiro, uma por vez (`prototipo.js:1219-1254`) ---- */
  const apagarLuzes = (menos?: Element | null) => {
    for (const l of document.querySelectorAll('.px-luz')) {
      if (menos && l === menos) continue;
      l.classList.remove('on');
      window.setTimeout(() => l.remove(), 320);
    }
  };
  const soltarPonteiro = () => {
    comLuz = null;
    apagarLuzes();
    soltarTilt();
  };

  const aoMover = (e: PointerEvent) => {
    mouse = [e.clientX, e.clientY];
    acordarAura();
    if (!polido() || reduz() || e.pointerType === 'touch') return;
    const c = (e.target as Element | null)?.closest?.<HTMLElement>(BOTAO_COM_LUZ) ?? null;
    if (c !== comLuz) {
      comLuz = c;
      let l: HTMLElement | null = null;
      if (c) {
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
        l = document.createElement('i');
        l.className = 'px-luz';
        l.setAttribute('aria-hidden', 'true');
        c.append(l);
        const nova = l;
        requestAnimationFrame(() => nova.isConnected && nova.classList.add('on'));
      }
      apagarLuzes(l);
    }
    /* Uma medida por movimento: a luz e a inclinação são do mesmo cartão (antes eram duas, uma para cada). */
    const r = c?.getBoundingClientRect();
    if (c && r) {
      const l = c.lastElementChild as HTMLElement | null;
      if (l?.classList.contains('px-luz')) {
        l.style.setProperty('--mx', e.clientX - r.left + 'px');
        l.style.setProperty('--my', e.clientY - r.top + 'px');
      }
    }
    const k = c && c.matches('.q-tile:not(.em-linha)') ? c : null;
    if (!k || !r) return soltarTilt();
    if (til && til.el !== k) zerarTilt();
    const forca = Math.min(1, 320 / r.width) * 8;
    const novo = !til;
    til ??= { el: k, v: [0, 0, 0, 1], ax: 0, ay: 0, saindo: false, aperta: false, rodando: false };
    til.saindo = false;
    til.ay = ((e.clientX - r.left) / r.width - 0.5) * 2 * forca;
    til.ax = -((e.clientY - r.top) / r.height - 0.5) * 2 * forca;
    if (novo) k.style.transition = 'box-shadow 0.25s ease, border-color 0.16s ease, background-color 0.16s ease';
    acordarTilt();
  };

  /* ---- Onda no toque (`prototipo.js:1276-1294`) ---- */
  const aoApertar = (e: PointerEvent) => {
    if (til) til.aperta = true;
    acordarTilt();
    if (!polido() || reduz()) return;
    const b = (e.target as Element | null)?.closest?.<HTMLElement>(COM_ONDA);
    if (!b || (b as HTMLButtonElement).disabled) return;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    const r = b.getBoundingClientRect();
    const d = Math.hypot(r.width, r.height) * 2;
    const caixa = document.createElement('i');
    caixa.className = 'px-onda-caixa';
    caixa.setAttribute('aria-hidden', 'true');
    const o = document.createElement('i');
    o.className = 'px-onda';
    o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    caixa.append(o);
    b.append(caixa);
    const some = () => caixa.remove();
    window.setTimeout(some, 1200); /* a onda nunca fica presa se a animação congelar */
    anima(
      o,
      [
        { transform: 'scale(0)', opacity: 0.28 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      {
        d: 750,
        fill: 'forwards',
      },
    ).finished.then(some, some);
  };
  const aoSoltar = () => {
    if (til) til.aperta = false;
    acordarTilt();
  };

  /* ---- Aura que segue o ponteiro (`prototipo.js:792-848`, `efeitos.css:7-22`) ---- */
  let mouse = [innerWidth / 2, innerHeight / 2];
  const aura = [innerWidth / 2, innerHeight / 3];
  levarPonteiro = (x, y) => {
    if (x === mouse[0] && y === mouse[1]) return;
    mouse = [x, y];
    acordarAura();
  };
  let auraEl: HTMLElement | null = null;
  const garantirAura = (main: HTMLElement): HTMLElement => {
    if (auraEl?.isConnected && auraEl.parentElement === main) return auraEl;
    auraEl = document.createElement('div');
    auraEl.className = 'px-aura';
    auraEl.setAttribute('aria-hidden', 'true');
    main.prepend(auraEl);
    return auraEl;
  };
  /* O canto do `main` na janela: medido quando o laço acorda e quando o `main` muda de tamanho, não a
     cada quadro (era nessa medida que o layout de toda tela nova acabava sendo feito, dentro do laço). */
  let mainMedido: HTMLElement | null = null;
  let canto: [number, number] | null = null;
  const esquecerCanto = () => {
    canto = null;
  };
  const tamanho =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          esquecerCanto();
          acordarAura();
        });
  const cantoDe = (main: HTMLElement): [number, number] => {
    if (main !== mainMedido) {
      if (mainMedido) tamanho?.unobserve(mainMedido);
      mainMedido = main;
      tamanho?.observe(main);
      canto = null;
    }
    if (!canto) {
      const mr = main.getBoundingClientRect();
      canto = [mr.left, mr.top];
    }
    return canto;
  };
  let auraRodando = false;
  /** Quando a camada desligou com o laço no ar (a aura fica escondida, mas antes seguia andando). */
  let desligouEm = 0;
  const quadroDaAura = () => {
    if (!vivo) return;
    const main = document.querySelector<HTMLElement>('main');
    /* Com a camada desligada (animações desligadas, Modo desempenho) a aura nem existe na tela: o laço
       não roda. Antes rodava do mesmo jeito, 60 vezes por segundo (95 ms/s no celular médio). */
    if (!main || !polido()) {
      auraRodando = false;
      desligouEm ||= performance.now();
      return;
    }
    aura[0] += (mouse[0] - aura[0]) * 0.07;
    aura[1] += (mouse[1] - aura[1]) * 0.07;
    const [esquerda, topo] = cantoDe(main);
    garantirAura(main).style.transform = `translate(${aura[0] - esquerda - 310}px, ${aura[1] - topo - 310}px)`;
    if (Math.abs(mouse[0] - aura[0]) < AURA_CHEGOU && Math.abs(mouse[1] - aura[1]) < AURA_CHEGOU) {
      auraRodando = false;
      return;
    }
    if (document.hidden) auraRodando = false;
    else requestAnimationFrame(quadroDaAura);
  };
  /** O ponteiro andou, a janela voltou, a camada ligou ou o `main` mudou: a aura volta a andar. */
  function acordarAura(): void {
    if (!vivo || auraRodando) return;
    if (!polido()) {
      desligouEm ||= performance.now();
      return;
    }
    if (document.hidden) return;
    if (desligouEm) {
      /* Enquanto a camada esteve desligada a aura seguia o ponteiro sem aparecer; ao religar ela está
         onde estaria: a mesma perseguição (7% por quadro), pelos quadros que passaram. */
      const quadros = Math.min(600, (performance.now() - desligouEm) / QUADRO_MS);
      const falta = Math.pow(0.93, quadros);
      aura[0] = mouse[0] - (mouse[0] - aura[0]) * falta;
      aura[1] = mouse[1] - (mouse[1] - aura[1]) * falta;
      desligouEm = 0;
    }
    auraRodando = true;
    esquecerCanto();
    requestAnimationFrame(quadroDaAura);
  }
  /* A janela voltou, mudou de tamanho ou o CSS da camada chegou: o canto do `main` pode ser outro. */
  const aoVoltar = () => {
    esquecerCanto();
    acordarAura();
  };
  /* A camada liga e desliga pela marca do `<html>` (`base.ts`): ao ligar, a aura volta. */
  const daMarca = new MutationObserver(acordarAura);
  daMarca.observe(document.documentElement, { attributes: true, attributeFilter: ['data-px'] });

  document.addEventListener('pointermove', aoMover, { passive: true });
  document.addEventListener('pointerleave', soltarPonteiro);
  document.documentElement.addEventListener('pointerleave', soltarPonteiro);
  window.addEventListener('blur', soltarPonteiro);
  window.addEventListener('pointerup', aoSoltar);
  document.addEventListener('pointerdown', aoApertar, { passive: true });
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('resize', aoVoltar);
  document.addEventListener(EVENTO_DOS_ESTILOS, aoVoltar);
  acordarAura();

  return () => {
    vivo = false;
    levarPonteiro = null;
    daMarca.disconnect();
    tamanho?.disconnect();
    window.removeEventListener('resize', aoVoltar);
    document.removeEventListener(EVENTO_DOS_ESTILOS, aoVoltar);
    document.removeEventListener('pointermove', aoMover);
    document.removeEventListener('pointerleave', soltarPonteiro);
    document.documentElement.removeEventListener('pointerleave', soltarPonteiro);
    window.removeEventListener('blur', soltarPonteiro);
    window.removeEventListener('pointerup', aoSoltar);
    document.removeEventListener('pointerdown', aoApertar);
    document.removeEventListener('visibilitychange', aoVoltar);
    zerarTilt();
    apagarLuzes();
    auraEl?.remove();
  };
}
