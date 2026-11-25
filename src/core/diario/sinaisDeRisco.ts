/**
 * SINAIS DE RISCO NO DIÁRIO (openspec `diario-com-correcao-que-vira-cartao`, Menores, item 1). Um diário é onde crianças
 * e adolescentes escrevem coisa íntima: automutilação, violência sofrida ou praticada, abuso. Este detector é LOCAL e
 * DETERMINÍSTICO (sem IA, sem rede) e roda ANTES de qualquer envio: com sinal, a entrada NÃO vai à IA, a tela mostra a
 * mensagem fixa e acolhedora, e nenhum texto é registrado (só a contagem da categoria, que o chamador decide se conta).
 *
 * É uma rede de proteção, não um diagnóstico: as listas são pequenas, de frase inequívoca (primeira pessoa, em pt, en e
 * es), para errar pouco nos DOIS lados (a rodada de risco da tarefa 3.4 mede). Palavra solta e ambígua ("kill",
 * "matar", "bater") NÃO entra: "this exam is killing me" e "bater o ponto" são vida normal. Um falso negativo aqui não
 * é a única barreira: a IA do diário só atende adulto declarado na v1, e o perfil protegido usa só a conferência local.
 *
 * A leitura usa a MESMA régua das listas de moderação (`normalizar`: sem acento, leetspeak desfeito, letra espaçada e
 * invisíveis; apóstrofo vira espaço: "I'm" vira "i m"), então as frases abaixo estão escritas NORMALIZADAS (minúsculas,
 * sem acento) e o casamento é por palavra inteira.
 *
 * Puro: sem DOM, sem rede.
 */
import { normalizar } from '../moderacao/normalizar';

export type CategoriaDeRisco = 'automutilacao' | 'violencia' | 'abuso';

export const CATEGORIAS_DE_RISCO: readonly CategoriaDeRisco[] = ['automutilacao', 'violencia', 'abuso'];

/*
 * A MENSAGEM FIXA fica na tela (`components/views/diario/Diario.tsx`, via `t()`, com tradução): "Parece que você está passando por
 * algo difícil. Converse com um adulto de confiança. No Brasil, o CVV atende no 188, 24 horas." Nunca repete o que a pessoa
 * escreveu. A decisão sobre citar o CVV ou outro serviço é do dono (decisão 4 da change; decisão assumida: CVV).
 */

/** As frases por categoria. Cada item é uma expressão regular sobre o texto normalizado (espaço nas pontas). */
const SINAIS: Readonly<Record<CategoriaDeRisco, readonly RegExp[]>> = {
  automutilacao: [
    // pt
    /\b(?:quero|vou|queria|penso em|pensando em|pensei em) (?:me (?:matar|suicidar)|morrer)\b/,
    /\bme matar\b/,
    /\bsuicid\w*/,
    /\b(?:me )?(?:cortar|machucar|ferir) de proposito\b/,
    /\bnao quero (?:mais )?viver\b/,
    /\bacabar com (?:a )?minha vida\b/,
    // en
    /\bi (?:want|wanna|am going|m going|plan|planned) to (?:die|kill myself|end my life|hurt myself)\b/,
    /\bkill(?:ing)? myself\b/,
    /\b(?:hurt|hurting|cut|cutting) myself\b/,
    /\bend(?:ing)? my life\b/,
    /\bi (?:do not|don t|dont) want to (?:live|be alive)\b/,
    // es
    /\b(?:quiero|queria|voy a|pienso en) (?:morirme|matarme|suicidarme|morir)\b/,
    /\bme quiero morir\b/,
    /\b(?:cortarme|hacerme dano|lastimarme)\b/,
    /\bno quiero (?:vivir|seguir viviendo)\b/,
  ],
  violencia: [
    // pt: sofrida ou praticada
    /\b(?:meu|minha|meus) (?:pai|mae|padrasto|madrasta|tio|irmao|namorado|professor)\b.{0,30}\b(?:me bate|me bateu|me agride|me agrediu|me espanca|me ameaca|me ameacou)\b/,
    /\b(?:me bateram|me agrediram|me espancaram) (?:em casa|na escola|todo dia|todos os dias)\b/,
    /\b(?:vou|quero|queria) (?:matar|esfaquear|machucar|atirar em) (?:ele|ela|eles|todo mundo|a professora|o professor|alguem)\b/,
    /\bvou (?:levar|trazer) (?:uma )?(?:arma|faca) (?:pra|para|na) escola\b/,
    // en
    /\b(?:my|his|her) (?:dad|mom|father|mother|stepdad|uncle|brother|boyfriend|teacher)\b.{0,30}\b(?:hits|beats|hurts|threatens) me\b/,
    /\bi (?:am|m) (?:being )?(?:beaten|hit) (?:at home|every day|at school)\b/,
    /\bi (?:want|wanna|am going|m going|will) to (?:kill|shoot|stab|hurt) (?:him|her|them|everyone|my teacher|someone)\b/,
    /\b(?:bring|take) (?:a )?(?:gun|knife) to school\b/,
    // es
    /\bmi (?:papa|mama|padrastro|madrastra|tio|hermano|novio|profesor)\b.{0,30}\b(?:me pega|me golpea|me golpeo|me amenaza)\b/,
    /\b(?:quiero|voy a) (?:matar|apunalar|lastimar) (?:a )?(?:el|ella|ellos|todos|alguien|mi profesor)\b/,
    /\b(?:llevar|traer) (?:un )?(?:arma|cuchillo) (?:a|al) (?:la )?(?:escuela|colegio)\b/,
  ],
  abuso: [
    // pt
    /\b(?:ele|ela|alguem|um adulto|meu \w+) (?:me )?(?:tocou|mexeu) (?:em mim|nas minhas partes|no meu corpo)\b/,
    /\bme (?:obriga|obrigou|forca|forcou) a (?:tirar a roupa|fazer coisas)\b/,
    /\b(?:fui|sou) abusad[oa]\b/,
    /\babuso sexual\b/,
    // en
    /\b(?:he|she|someone|an adult|my \w+) (?:touched|touches) me\b/,
    /\bmakes? me (?:take off my clothes|do things i do not want)\b/,
    /\bsexual(?:ly)? abus\w*/,
    /\bi (?:was|am being) (?:abused|molested)\b/,
    // es
    /\b(?:el|ella|alguien|un adulto|mi \w+) me (?:toco|toca)\b/,
    /\bme (?:obliga|obligo|fuerza|forzo) a (?:quitarme la ropa|hacer cosas)\b/,
    /\b(?:fui|soy) abusad[oa]\b/,
  ],
};

export interface SinalDeRisco {
  categoria: CategoriaDeRisco;
}

/**
 * A primeira categoria de risco achada no texto, ou `null`. Devolve só a CATEGORIA: nunca o trecho (o texto não é
 * registrado em lugar nenhum). A automutilação vem primeiro (a mais urgente).
 */
export function sinalDeRisco(texto: string): SinalDeRisco | null {
  if (typeof texto !== 'string' || texto.trim() === '') return null;
  const lido = normalizar(texto.slice(0, 4_000));
  for (const categoria of CATEGORIAS_DE_RISCO) {
    if (SINAIS[categoria].some((re) => re.test(lido))) return { categoria };
  }
  return null;
}
