/** Tipos mínimos do bundle de navegador do mammoth (o pacote só tipa a entrada de Node). */
declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    extractRawText(entrada: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
    convertToHtml(
      entrada: { arrayBuffer: ArrayBuffer },
      opcoes?: { convertImage?: unknown },
    ): Promise<{ value: string; messages: unknown[] }>;
    images: { imgElement(f: (imagem: unknown) => Promise<{ src: string }>): unknown };
  };
  export default mammoth;
}
