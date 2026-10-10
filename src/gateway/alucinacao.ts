/**
 * FILTRO DE ALUCINAÇÃO — o que o Whisper "inventa" em silêncio, música e ruído.
 *
 * O modelo foi treinado em legendas da internet; sem fala de verdade ele completa com o que mais
 * viu: créditos de legenda, agradecimentos, reticências, uma palavra repetida. Nada disto é
 * plausível como fala capturada de um vídeo ou chamada, e cada item abaixo apareceu em uso real ou
 * está na lista pública de alucinações conhecidas do Whisper (créditos da Amara.org, "thanks for
 * watching", marcadores de música). A lista é curta e nomeada de propósito: filtro genérico "por
 * probabilidade" esconderia fala legítima; este só corta o que sabidamente não é.
 *
 * TRÊS NÍVEIS DE CERTEZA, e é isso que separa as listas:
 *  1. CRÉDITOS/MARCADORES (`FRASES_ALUCINADAS`) — ninguém DIZ "Legendas pela comunidade Amara.org"
 *     nem "[Música]" numa conversa. Saída inteira igual a isso sai sempre, qualquer duração.
 *  2. CORTESIAS CURTAS (`CORTESIAS`) — "Obrigado.", "Thank you.", "Tchau, tchau." são AS
 *     alucinações mais frequentes do Whisper... e também coisas que gente de verdade diz. Uma
 *     cortesia dita dura ~0,5–1,5 s; com o pré-pad de 0,3 s e os 0,8 s de redenção do VAD o trecho
 *     fica abaixo de ~3 s. Quando o trecho tem MAIS de 3 s e o motor só "ouviu" um obrigado, o
 *     resto do áudio era música/ruído que o modelo completou com o clichê. Abaixo disso, a palavra
 *     é da pessoa e fica. (Antes, "Thank you." caía SEMPRE — e a pessoa que agradecia sumia.)
 *  3. FORMA (velocidade e repetição) — texto longo demais para a duração do áudio e o mesmo token
 *     repetido (o "no no no no" do decode greedy). O teto de palavras/segundo é POR IDIOMA: 6/s
 *     foi calibrado em inglês; português falado rápido chega perto disso legitimamente, então fora
 *     do EN o teto é 8/s.
 *
 *  4. VOCALIZAÇÃO — a saída INTEIRA é grito, riso, interjeição esticada ou letra solta ("Aaaah!",
 *     "Ahahahah!", "BAPAPAP!", "Hmmmm…", "e"). Medido na bancada de 2026-09 (ESC-50, sons sem fala):
 *     mesmo com o VAD na frente, 26–30% dos trechos sem fala saíam do Whisper local com texto, e o
 *     grosso era isto. Não é legenda útil nem quando alguém de fato ri — e palavra de verdade
 *     ("Não.", "Oi!", "Tá.") não tem letra triplicada nem sílaba em ciclo, então fica.
 *
 * E UM REPARO, não um descarte: o DE-LOOPING. O decode greedy às vezes entra em ciclo no fim do
 * trecho ("a gente vai a gente vai a gente vai…"). Jogar a fala inteira fora perderia a parte boa
 * que veio antes; colapsar o ciclo numa ocorrência devolve a frase que a pessoa disse.
 *
 * A ASSINATURA `(texto, audioSec, lang)` é contrato: o servidor importa esta função para filtrar a
 * saída do STT de nuvem com as mesmas regras do worker local.
 */
import { baseLang } from '@core/texto/idioma';

const FRASES_ALUCINADAS: RegExp[] = [
  /legendas? (pela|da) comunidade/i,
  /amara\.org/i,
  /^(obrigad[oa] por assistir|thanks? (you )?for watching|gracias por ver)/i,
  /^(subtitles?|sous-titres|subt[ií]tulos|untertitel) (by|par|de|von|der|por|réalisés|realizados)\b/i,
  /^(legendad[oa]s?|legendas|legendagem|transcri[çc][ãa]o|tradu[çc][ãa]o|subtitulado|sous-titrage) (por|de|by|par)\b/i,
  /^(inscreva-se|se inscreva|subscribe|please subscribe|like and subscribe|suscr[ií]bete)/i,
  // Marcador de trilha: "[Música]", "(music)", "[Aplausos]" — descrição de legenda, não fala.
  /^[[(]\s*(m[úu]sica|music|musique|musik|aplausos|applause|risos|laughter|sil[êe]ncio|silence)\s*[\])]\W*$/i,
  // O mesmo marcador SEM colchetes, quando é a saída inteira (medido: "Música" sobre som de insetos).
  /^(m[úu]sica|music|aplausos|applause|risos|laughter)[\s\p{P}]*$/iu,
  /^[\s\p{P}\p{S}]*$/u, // só pontuação / reticências / notas musicais (♪)
];
/* Token solto clássico do silêncio — SÓ quando a dica de idioma é inglês (ou desconhecida). Em
   português "Ah." e "Hum." são respostas legítimas curtas, e um "so" isolado não aparece. */
const TOKEN_SOLTO_EN = /^(you|so|hmm|uh|um|ah)\W*$/i;

/** Cortesia curta que é a saída INTEIRA do motor. Só é descartada com áudio longo (ver nível 2). */
const CORTESIAS =
  /^(muito )?(obrigad[oa]|valeu|thank you( (very|so) much)?|thanks( a lot)?|(muchas )?gracias|merci( beaucoup)?|danke( sch[öo]n)?|tchau(,? tchau)?|bye(,? bye)?|adi[óo]s|e a[íi])[\s\p{P}]*$/iu;
/** Interjeições sem conteúdo — só contam quando a saída INTEIRA é feita delas (nível 4). */
const INTERJEICOES = new Set([
  'ah',
  'oh',
  'eh',
  'uh',
  'hum',
  'hm',
  'hmm',
  'hã',
  'ahn',
  'tchp',
  'bip',
  'argh',
  'arg',
  'ugh',
]);

/** Escritas em que um caractere sozinho é palavra ou sílaba: han, kana e hangul. */
const UM_CARACTERE_E_PALAVRA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const SO_LATINO = /^[\p{Script=Latin}\p{M}]+$/u;
/** As vogais do alfabeto latino, depois de separar o acento (NFD): cobre ä, ö, å, ě, ů e as demais. */
const VOGAL_LATINA = /[aeiouyıøæœ]/;

/**
 * Um token é vocalização: letra solta, letra triplicada ou sílaba curta em ciclo — sempre. A
 * interjeição SIMPLES ("Ah.", "Hum.") só conta com áudio longo: dita, é resposta legítima de ~1 s;
 * sozinha num trecho de mais de 3 s, é o motor completando ruído (a mesma régua das cortesias).
 */
function ehVocalizacao(token: string, audioSec: number): boolean {
  /* As marcas (`\p{M}`) ficam: em hindi, árabe e tailandês a vogal É uma marca, e sem ela "हाँ" virava
     uma letra só. */
  const w = token.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');
  /* Um caractere só é letra solta num ALFABETO. Em chinês, japonês e coreano um caractere é uma
     palavra (ou uma sílaba) inteira: "好", "对", "네" são respostas completas. */
  if ([...w].length <= 1) return !UM_CARACTERE_E_PALAVRA.test(w);
  if (INTERJEICOES.has(w)) return audioSec > SEGUNDOS_DE_CORTESIA_SUSPEITA;
  /* Sem nenhuma vogal não é palavra: "Vrm", "Grr", "Shh", "Tsk" — ruído virando texto. A RÉGUA É DO
     ALFABETO LATINO: aplicada a tudo, ela descartava TODA fala em chinês, japonês, coreano, árabe,
     russo, hindi, grego, hebraico e tailandês (nenhuma tem vogal latina), e a transcrição certa sumia
     antes de chegar à tela (relato do dono, 10/10/2026: "botei no mandarim e não funcionou"). As
     vogais são conferidas sem o acento, para "Öl", "kış" e "řekl" não caírem junto. */
  if (SO_LATINO.test(w) && !VOGAL_LATINA.test(w.normalize('NFD'))) return true;
  if (/(\p{L})\1{2,}/u.test(w)) return true; // "aaah", "hmmm", "rrrr"
  return /(\p{L}{1,3})\1{2,}/u.test(w); // "hahaha", "ahahah", "bapapap"
}

/** Acima disto, uma cortesia sozinha não explica o áudio: é o clichê preenchendo silêncio/música. */
const SEGUNDOS_DE_CORTESIA_SUSPEITA = 3;

/**
 * Colapsa n-gramas repetidos em sequência. Bigramas para cima: 3 ou mais repetições viram uma.
 * Palavra ÚNICA só a partir de 4: "não, não, não" é ênfase de gente, "no no no no" é o decode em
 * ciclo (e a saída inteira assim já é descartada em `filtrarAlucinacao`). A comparação ignora
 * caixa e pontuação; o que fica é a PRIMEIRA ocorrência, com a grafia original.
 */
export function desenrolarLoops(texto: string): string {
  let palavras = texto.split(/\s+/).filter(Boolean);
  const chave = (w: string) => w.toLowerCase().replace(/[\p{P}\p{S}]/gu, '');
  let mudou = true;
  while (mudou) {
    mudou = false;
    const k = palavras.map(chave);
    const igual = (a: number, b: number, n: number) => {
      for (let j = 0; j < n; j++) if (!k[a + j] || k[a + j] !== k[b + j]) return false;
      return true;
    };
    for (let n = 1; n <= Math.floor(palavras.length / 3) && !mudou; n++) {
      const minimo = n === 1 ? 4 : 3;
      for (let i = 0; i + n * minimo <= palavras.length; i++) {
        let reps = 1;
        while (i + (reps + 1) * n <= palavras.length && igual(i, i + reps * n, n)) reps++;
        if (reps >= minimo) {
          palavras = [...palavras.slice(0, i + n), ...palavras.slice(i + reps * n)];
          mudou = true;
          break;
        }
      }
    }
  }
  return palavras.join(' ');
}

/** Palavras por segundo acima do qual não é fala humana, por idioma da dica. */
export function tetoDePalavrasPorSegundo(lang?: string): number {
  const l = baseLang(lang);
  return !l || l === 'en' ? 6 : 8;
}

/** Tokens/segundo para o teto dinâmico de geração: PT/ES/… tokenizam pior que EN no vocabulário do Whisper. */
export function tokensPorSegundo(lang?: string): number {
  const l = baseLang(lang);
  return !l || l === 'en' ? 15 : 22;
}

export function filtrarAlucinacao(texto: string, audioSec: number, lang?: string): string {
  const original = texto.trim();
  if (!original) return '';
  if (FRASES_ALUCINADAS.some((r) => r.test(original))) return '';
  const palavrasOriginais = original.split(/\s+/);
  // "no no no no": a saída INTEIRA é um token só em ciclo — não há fala a salvar.
  if (palavrasOriginais.length >= 4 && new Set(palavrasOriginais.map((p) => p.toLowerCase())).size === 1) return '';
  // Reparo antes das checagens de forma: o ciclo colapsado deixa de estourar o teto de velocidade.
  const t = desenrolarLoops(original);
  if (audioSec > SEGUNDOS_DE_CORTESIA_SUSPEITA && CORTESIAS.test(t)) return '';
  const l = baseLang(lang);
  if ((!l || l === 'en') && TOKEN_SOLTO_EN.test(t)) return '';
  const palavras = t.split(/\s+/);
  if (palavras.every((p) => ehVocalizacao(p, audioSec))) return '';
  if (audioSec > 0 && palavras.length / audioSec > tetoDePalavrasPorSegundo(lang)) return ''; // rápido demais para fala
  return t;
}
