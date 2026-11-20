/**
 * A NORMALIZAÇÃO DAS LISTAS DE MODERAÇÃO — uma régua só para o servidor e o cliente.
 *
 * Nasceu no filtro da saída do tutor (`server/ai/moderacao/moderarSaidaDoTutor.ts`, change `filtro-tutor-menores`) e
 * mudou para o núcleo com a change `legenda-segura-para-menores`: a legenda e a tradução da captura rodam no navegador e
 * leem as listas pela MESMA régua (acento, leetspeak, letra espaçada, invisíveis). Duas cópias divergiriam com o tempo.
 *
 * Puro: sem DOM, sem rede.
 */

/** Caracteres invisíveis que separam letras sem parecer ("p", U+200B, "orn"). */
export const INVISIVEIS = new RegExp(
  `[${[0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff].map((c) => String.fromCharCode(c)).join('')}]`,
  'g',
);

/** Minúsculo, sem acento, sem invisível. Compatibilidade (NFKD) também desfaz letra de largura cheia e ligadura. */
export function base(texto: string): string {
  return texto.normalize('NFKD').replace(/\p{M}/gu, '').replace(INVISIVEIS, '').toLowerCase();
}

export const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  $: 's',
  '@': 'a',
  '!': 'i',
};

/**
 * Leetspeak desfeito só DENTRO de palavra que tem letra (o "10" de "top 10" fica), `!` e `@` só antes de letra ("olá!"
 * não vira "olai"). Recebe uma palavra já passada por `base`.
 */
export function desfazerLeet(palavra: string): string {
  return /[a-z]/.test(palavra) ? palavra.replace(/[013457$]|[@!](?=[a-z])/g, (c) => LEET[c] ?? c) : palavra;
}

/**
 * O texto que as listas leem: leetspeak desfeito (`desfazerLeet`), pontuação vira espaço (o `?` fica: dado pessoal exige
 * pergunta), letras soltas espaçadas juntam ("s e x o", "p.o.r.n") e 3+ letras repetidas viram uma ("porrrn"). Espaço
 * nas pontas para o `\b` da primeira e da última palavra.
 */
export function normalizar(texto: string): string {
  let s = base(texto);
  s = s.replace(/\S+/g, desfazerLeet);
  s = s.replace(/[^a-z0-9?]+/g, ' ');
  s = s.replace(/\?/g, ' ? ').replace(/ +/g, ' ');
  s = s.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ''));
  s = s.replace(/([a-z])\1{2,}/g, '$1');
  return ` ${s.trim()} `;
}
