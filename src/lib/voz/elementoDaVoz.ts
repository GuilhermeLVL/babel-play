/**
 * O `HTMLAudioElement` COMPARTILHADO da voz natural (nuvem). Mora aqui, sozinho e sem dependências, para o
 * avatar (`lib/avatar/amplitude.ts`) poder analisá-lo sem importar o motor inteiro da voz.
 *
 * Um elemento só, reaproveitado: no iPhone, o elemento que já tocou num gesto pode tocar depois sem ele.
 */
let elementoCompartilhado: HTMLAudioElement | null = null;

/** O elemento (cria na primeira chamada). */
export const elemento = (): HTMLAudioElement => (elementoCompartilhado ??= new Audio());

/** O elemento SE já existe (nunca cria um). */
export const elementoDeAudioDaVoz = (): HTMLAudioElement | null => elementoCompartilhado;
