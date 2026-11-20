/**
 * O ZOOM DO `<body>` (o tamanho do texto P/M/G, `useAparencia.ts`), como número.
 *
 * Dentro do body, um `px` de CSS vale `zoom` px da janela. Já `clientX/Y` e `getBoundingClientRect()`
 * vêm em px da JANELA (Chromium e WebKit, medido). Quem lê uma coordenada do evento ou de um retângulo
 * e a grava como `px` num elemento do body precisa dividir por isto, senão o desenho sai multiplicado
 * pelo zoom (o cursor "perdia a precisão" no tamanho G).
 *
 * O valor fica em cache e é refeito quando o `style` do body muda (é onde o `useAparencia` grava o zoom).
 */
let cache: number | null = null;
let vigia: MutationObserver | null = null;

function ler(): number {
  const bruto = getComputedStyle(document.body).zoom;
  const n = bruto.endsWith('%') ? parseFloat(bruto) / 100 : parseFloat(bruto);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** O zoom atual do body (1 quando não há zoom, fora do navegador ou sem suporte). */
export function zoomDoCorpo(): number {
  if (typeof document === 'undefined' || !document.body) return 1;
  if (cache === null) {
    cache = ler();
    if (typeof MutationObserver !== 'undefined' && !vigia) {
      vigia = new MutationObserver(() => {
        cache = null;
      });
      vigia.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }
  return cache;
}
