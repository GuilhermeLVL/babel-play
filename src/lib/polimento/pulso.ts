/**
 * O PULSO DO CONTADOR, EM CAMADA COMPOSTA — a medida que `styles/polimentoDesempenho.css` precisa.
 *
 * No protótipo o anel do contador é um `box-shadow` que cresce 10 px para cada lado (`efeitos.css:169-173`),
 * e sombra animada custa estilo e pintura a cada quadro. No app o mesmo anel é uma camada que cresce por
 * `transform`; para crescer os mesmos 10 px ela precisa saber o tamanho do contador (1 algarismo é um
 * círculo, 2 já é uma pílula, e na barra do celular ele é menor). Quem mede é um `ResizeObserver`: sem
 * ler layout à força, e de novo sempre que o número ou a largura da janela mudam o tamanho.
 */

/** Quanto o anel cresce para cada lado, em px (`efeitos.css:171`: `0 0 0 10px`). */
const CRESCE = 10;

/** A camada do anel tem o tamanho final (o contador mais 10 px de cada lado): começa encolhida até o do contador. */
const escala = (lado: number): string => String(Math.round((lado / (lado + 2 * CRESCE)) * 10000) / 10000);

function medir(entradas: ResizeObserverEntry[]): void {
  for (const e of entradas) {
    const el = e.target as HTMLElement;
    const caixa = e.borderBoxSize?.[0];
    const largura = caixa ? caixa.inlineSize : el.offsetWidth;
    const altura = caixa ? caixa.blockSize : el.offsetHeight;
    if (!(largura > 0) || !(altura > 0)) continue;
    el.style.setProperty('--px-pulso-x', escala(largura));
    el.style.setProperty('--px-pulso-y', escala(altura));
  }
}

let observador: ResizeObserver | null = null;

/**
 * `ref` do contador (`<i className="q-contagem" ref={medirOPulso}>`): mede enquanto ele estiver na tela.
 * Onde não há `ResizeObserver` fica a escala padrão do CSS (a do contador de um algarismo).
 */
export function medirOPulso(el: HTMLElement | null): (() => void) | undefined {
  if (!el || typeof ResizeObserver === 'undefined') return undefined;
  observador ??= new ResizeObserver(medir);
  observador.observe(el);
  return () => observador?.unobserve(el);
}
