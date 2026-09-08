/**
 * QUEM O `Escape` FECHA: a camada de cima, e só ela.
 *
 * `SeletorDeConteudo` e `SalaDeEscolha` registravam cada um o seu `keydown` em `window`, sem
 * `stopPropagation`. Os dois coexistem na árvore, e o botão que reabre a Sala fica DENTRO do
 * seletor — então um único `Esc` com a gaveta aberta fechava as duas de uma vez.
 *
 * Uma pilha resolve porque o problema não é o listener: é não haver ordem entre eles. Quem entra
 * por último é quem responde, e sair do meio da pilha (desmontagem fora de ordem) remove só a
 * própria entrada.
 */
type Fechar = () => void;

const pilha: Array<{ id: symbol; fechar: Fechar }> = [];
let ouvindo = false;

function aoTeclar(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !pilha.length) return;
  e.stopPropagation();
  pilha[pilha.length - 1].fechar();
}

function ligar(): void {
  if (ouvindo || typeof window === 'undefined') return;
  /* CAPTURA: precisa chegar antes dos listeners que ainda não migraram (`LiveCapture`,
     `CommandPalette` e outros doze registram em `window`/`document` por decisão própria). Sem a
     fase de captura, o `stopPropagation` acima não os alcançaria. */
  window.addEventListener('keydown', aoTeclar, true);
  ouvindo = true;
}

/** Empilha uma camada e devolve como tirá-la. Chamar de dentro de um `useEffect`. */
export function empilharCamada(fechar: Fechar): () => void {
  const id = Symbol('camada');
  pilha.push({ id, fechar });
  ligar();
  return () => {
    const i = pilha.findIndex((c) => c.id === id);
    if (i >= 0) pilha.splice(i, 1);
  };
}

/** Só para teste: quantas camadas estão abertas. */
export function camadasAbertas(): number {
  return pilha.length;
}
