/**
 * A PÁGINA FOI ABERTA PELA EXTENSÃO? (openspec `captura-em-um-clique`, 3.3). A extensão abre o app em
 * `/capturar?fonte=extensao`. O roteador reescreve a barra de endereço (e a busca some) antes de a tela de captura
 * montar, então a resposta é guardada AQUI, no boot (`main.tsx` importa este módulo antes do primeiro render). Só lê a
 * barra uma vez: não registra ouvinte, não toca em armazenamento, não faz rede. Sem o parâmetro, é `false` e nada mais
 * acontece (o receptor, `daExtensao.ts`, nem é baixado).
 */

/** Só `?fonte=extensao` (exato) conta. Pura. */
export function abertaPelaExtensao(search: string): boolean {
  try {
    return new URLSearchParams(search).get('fonte') === 'extensao';
  } catch {
    return false;
  }
}

export const ABERTA_PELA_EXTENSAO: boolean =
  typeof window !== 'undefined' && abertaPelaExtensao(window.location.search);
