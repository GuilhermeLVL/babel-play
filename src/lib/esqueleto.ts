/**
 * O ESQUELETO DO INÍCIO SAI QUANDO O REACT DESENHA (carga-rapida-no-celular, 2.4).
 *
 * O HTML do `/app` no modo público traz o Início pronto para o visitante da primeira visita
 * (`scripts/vite/esqueletoDoInicio.ts`), por cima do `#root`. Ele sai quando a tela de verdade aparece: o Início
 * montou (depois de pintar, para não piscar o fundo), a pessoa foi para outra tela, ou deu erro. Sem esqueleto
 * (dev, testes, self-host, edição estática, quem tem conta), tudo aqui é nada.
 */
import { avisarTelaPronta } from './polimento/depoisDoLcp';

type ComQuadro = typeof globalThis & { requestAnimationFrame?: (f: () => void) => number };

/** Tira o esqueleto já. */
export function tirarEsqueleto(): void {
  avisarTelaPronta();
  if (typeof document === 'undefined') return;
  document.getElementById('esqueleto')?.remove();
  document.documentElement.removeAttribute('data-esqueleto');
}

/** Tira o esqueleto depois de o React pintar o que está montando agora (dois quadros). */
export function tirarEsqueletoDepoisDaPintura(): void {
  /* Sem esqueleto também: é o aviso de "tela pronta" que libera o que espera o LCP (`depoisDoLcp`). */
  const g = globalThis as ComQuadro;
  if (typeof g.requestAnimationFrame !== 'function') {
    tirarEsqueleto();
    return;
  }
  g.requestAnimationFrame(() => g.requestAnimationFrame?.(tirarEsqueleto));
}

/** Quanto o Início espera a camada de polimento antes de sair do esqueleto assim mesmo (ms). */
export const TETO_DA_CAMADA_MS = 8000;

/**
 * O INÍCIO MONTOU: o esqueleto sai quando ele tiver a forma final. A forma do Início depende do CSS da camada de
 * polimento (`polimento/base.ts`, que marca `<html data-px-estilos="ok">` quando ele entra): antes dele, os
 * ladrilhos ficam empilhados e o texto do de Cartões ocupa a largura toda. O `#root` fica escondido atrás do
 * esqueleto (`visibility: hidden`) até aqui, então essa forma intermediária nem pinta (nem vira um LCP novo).
 * Devolve como cancelar.
 */
export function tirarEsqueletoQuandoOInicioEstiverPronto(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const raiz = document.documentElement;
  if (!document.getElementById('esqueleto') || raiz.dataset.pxEstilos === 'ok') {
    tirarEsqueletoDepoisDaPintura();
    return () => undefined;
  }
  let feito = false;
  const sair = () => {
    if (feito) return;
    feito = true;
    document.removeEventListener('px:estilos', sair);
    window.clearTimeout(relogio);
    tirarEsqueletoDepoisDaPintura();
  };
  document.addEventListener('px:estilos', sair);
  const relogio = window.setTimeout(sair, TETO_DA_CAMADA_MS);
  return () => {
    feito = true;
    document.removeEventListener('px:estilos', sair);
    window.clearTimeout(relogio);
  };
}
