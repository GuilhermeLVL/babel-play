/**
 * O `<dialog>` NATIVO NO JSDOM. O jsdom não implementa `showModal()`/`close()`: sem eles o diálogo
 * dos componentes (`ui/Dialogo.tsx`, que imita o protótipo) fica fechado e fora da árvore
 * acessível, e `getByRole('dialog')` não o acha. Isto dá o mínimo que o navegador faz: abrir, e
 * fechar disparando `close`.
 */
export function prepararDialogoNoJsdom(): void {
  const proto = HTMLDialogElement.prototype
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  proto.close ??= function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
