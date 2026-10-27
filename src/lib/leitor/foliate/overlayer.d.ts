/* Tipos (à mão) do `overlayer.js` vendorizado do foliate-js. Ver ORIGEM.txt. */
type Desenho = (rects: DOMRectList | DOMRect[], opts?: Record<string, unknown>) => SVGElement;

export declare class Overlayer {
  static highlight: Desenho;
  static underline: Desenho;
  static outline: Desenho;
  static squiggly: Desenho;
  static strikethrough: Desenho;
}
