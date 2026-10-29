/**
 * O QUE A DESCOBERTA DOS AVATARES LEMBRA, só neste aparelho (`localStorage`, sempre em `try/catch`: modo privado ou
 * armazenamento cheio devolvem "ainda não viu" e a tela funciona igual). E o pedido de abrir o Perfil já na aba Avatar.
 */
import { useCallback, useState } from 'react';

export const DICA_DO_INTERPRETE = 'frasy.avatar.dica.interprete';
export const CONVITE_DO_PERFIL = 'frasy.avatar.dica.perfil';

export function jaViu(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === '1';
  } catch {
    return false;
  }
}

export function marcarComoVisto(chave: string): void {
  try {
    localStorage.setItem(chave, '1');
  } catch {
    /* sem armazenamento: a dica volta na próxima vez, e só */
  }
}

/** Uma dica de uma vez só: `visivel` até a pessoa dispensá-la (ou até agir) e, então, nunca mais neste aparelho. */
export function useDicaUmaVez(chave: string): { visivel: boolean; dispensar: () => void } {
  const [visivel, setVisivel] = useState(() => !jaViu(chave));
  const dispensar = useCallback(() => {
    marcarComoVisto(chave);
    setVisivel(false);
  }, [chave]);
  return { visivel, dispensar };
}

/* A aba do Perfil pedida por quem vem de fora (o Intérprete: "Escolher outro avatar"). Vale uma entrada só. */
let abaPedida: string | null = null;

export function pedirAbaDoPerfil(aba: string): void {
  abaPedida = aba;
}

/** Espia o pedido sem gastá-lo (o StrictMode chama o inicializador do estado duas vezes). */
export function abaPedidaAoPerfil(): string | null {
  return abaPedida;
}

export function consumirAbaDoPerfil(): string | null {
  const a = abaPedida;
  abaPedida = null;
  return a;
}

/** Abre Perfil › Avatar a partir de qualquer tela (`navegar` é o `onChangeView` da tela). */
export function abrirMeuAvatar(navegar: (view: string) => void): void {
  pedirAbaDoPerfil('avatar');
  navegar('profile');
}
