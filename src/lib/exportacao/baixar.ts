/** Baixa um arquivo gerado no navegador. */
export function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', nome);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const baixarTexto = (texto: string, nome: string, tipo: string) =>
  baixar(new Blob([texto], { type: `${tipo};charset=utf-8` }), nome);
