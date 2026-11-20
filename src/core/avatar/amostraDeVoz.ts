/**
 * A FRASE DE AMOSTRA do "Experimentar voz": curta, neutra e no idioma do livro (a voz é desse idioma). Sem frase
 * pronta para o idioma, fala só o nome da personagem, que serve em qualquer língua.
 */
const FRASES: Record<string, (nome: string) => string> = {
  pt: (n) => `Olá, eu sou ${n}. Esta é a minha voz.`,
  en: (n) => `Hello, I am ${n}. This is my voice.`,
  es: (n) => `Hola, soy ${n}. Esta es mi voz.`,
  fr: (n) => `Bonjour, je suis ${n}. Voici ma voix.`,
  de: (n) => `Hallo, ich bin ${n}. Das ist meine Stimme.`,
  it: (n) => `Ciao, sono ${n}. Questa è la mia voce.`,
};

export function fraseDeAmostra(idioma: string, nome: string): string {
  const base = idioma.toLowerCase().split(/[-_]/)[0] ?? '';
  return FRASES[base]?.(nome) ?? nome;
}
