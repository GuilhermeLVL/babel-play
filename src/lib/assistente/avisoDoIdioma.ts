/**
 * "Dispensar" o aviso de que a conversa está no idioma da pessoa (o assistente ajuda no idioma que ela aprende): vale
 * pela SESSÃO do navegador (`sessionStorage`), não para sempre — numa próxima sessão a conversa pode estar em outro
 * idioma, e o aviso volta a explicar por que o assistente está quieto. A janela flutuante (Document PiP) roda no mesmo
 * JavaScript do app, então o estado do módulo também vale lá.
 */
import { useSyncExternalStore } from 'react';

const CHAVE = 'babel.assistente.avisoDoIdioma.dispensado';
const ouvintes = new Set<() => void>();
let dispensadoNaMemoria = false;

function lerDispensado(): boolean {
  if (dispensadoNaMemoria) return true;
  try {
    return sessionStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

/** Dispensa o aviso até o fim da sessão. */
export function dispensarAvisoDoIdioma(): void {
  dispensadoNaMemoria = true;
  try {
    sessionStorage.setItem(CHAVE, '1');
  } catch {
    /* sem armazenamento: vale enquanto a página estiver aberta */
  }
  for (const f of ouvintes) f();
}

/** Para os testes: volta ao estado de uma sessão nova. */
export function esquecerAvisoDoIdiomaDispensado(): void {
  dispensadoNaMemoria = false;
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* nada a limpar */
  }
  for (const f of ouvintes) f();
}

function assinar(f: () => void): () => void {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

/** O aviso foi dispensado nesta sessão? */
export function useAvisoDoIdiomaDispensado(): boolean {
  return useSyncExternalStore(assinar, lerDispensado, () => false);
}
