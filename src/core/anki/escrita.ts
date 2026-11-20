import { vazaResposta } from '../learning/pistaDeJogo';
import type { EscritaDominante } from './tipos';

/* Ordem de checagem importa: kana ANTES de han, porque uma frente japonesa mistura os dois
   (漢字 + かな) e cada caractere só é contado numa faixa — checar han primeiro classificaria
   caracteres kana como han incorretamente só se as faixas se sobrepusessem (não se sobrepõem,
   mas a ordem abaixo documenta a intenção de qualquer forma: kana é o sinal mais forte de 'ja'). */
const FAIXAS: Array<{ escrita: Exclude<EscritaDominante, 'desconhecido'>; regex: RegExp }> = [
  { escrita: 'kana', regex: /[\p{Script=Hiragana}\p{Script=Katakana}]/u },
  { escrita: 'hangul', regex: /\p{Script=Hangul}/u },
  { escrita: 'cjk', regex: /\p{Script=Han}/u },
  { escrita: 'cirilico', regex: /\p{Script=Cyrillic}/u },
  { escrita: 'arabe', regex: /\p{Script=Arabic}/u },
  { escrita: 'hebraico', regex: /\p{Script=Hebrew}/u },
  { escrita: 'grego', regex: /\p{Script=Greek}/u },
  { escrita: 'devanagari', regex: /\p{Script=Devanagari}/u },
  { escrita: 'thai', regex: /\p{Script=Thai}/u },
  { escrita: 'latino', regex: /\p{Script=Latin}/u },
];

/**
 * Contagem de LETRAS por escrita numa amostra — a matéria-prima de `escritaDominante` e da
 * decisão de idioma da rota de import. Exposta separada porque a DOMINÂNCIA não basta para
 * japonês: um baralho de vocabulário típico é majoritariamente kanji (Han) com kana minoritário,
 * e só a contagem bruta permite a regra "presença de kana prova japonês" (ver a rota).
 */
export function contagemDeEscritas(amostras: string[]): { contagem: Record<string, number>; totalDeLetras: number } {
  const contagem: Record<string, number> = {};
  let totalDeLetras = 0;
  for (const linha of amostras) {
    for (const ch of linha ?? '') {
      const faixa = FAIXAS.find((f) => f.regex.test(ch));
      if (!faixa) continue; // dígito, pontuação, espaço, emoji — não é letra de nenhuma escrita
      contagem[faixa.escrita] = (contagem[faixa.escrita] ?? 0) + 1;
      totalDeLetras++;
    }
  }
  return { contagem, totalDeLetras };
}

export function escritaDominante(amostras: string[]): EscritaDominante {
  const { contagem, totalDeLetras } = contagemDeEscritas(amostras);
  if (!totalDeLetras) return 'desconhecido';
  const [escritaTop, qtd] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
  return qtd / totalDeLetras > 0.5 ? (escritaTop as EscritaDominante) : 'desconhecido';
}

/**
 * CÓDIGOS DE IDIOMA DE ESCRITA LATINA reconhecidos no `X-Src-Lang` — a lista dos que a tela do
 * lobby oferece hoje e cuja escrita nativa É o alfabeto latino. Não precisa ser exaustiva: o pior
 * caso de faltar um código aqui é o mesmo de hoje (carimba sem checar), não um dado novo.
 */
const LANGS_ESCRITA_LATINA = new Set([
  'en',
  'pt',
  'es',
  'fr',
  'de',
  'it',
  'nl',
  'sv',
  'no',
  'nb',
  'nn',
  'da',
  'fi',
  'pl',
  'cs',
  'sk',
  'hu',
  'ro',
  'hr',
  'tr',
  'id',
  'vi',
  'af',
  'ca',
  'et',
  'lv',
  'lt',
  'sl',
  'is',
]);

/** ESCRITAS que o `escritaDominante` pode devolver e que NÃO são latinas. */
const ESCRITAS_NAO_LATINAS = new Set<EscritaDominante>([
  'cjk',
  'kana',
  'hangul',
  'cirilico',
  'arabe',
  'hebraico',
  'grego',
  'devanagari',
  'thai',
]);

/**
 * DECIDE se carimba `idiomaOrigem` do cabeçalho — ou recusa, honestamente, quando o cabeçalho e a
 * escrita real do baralho se contradizem (ver S11 no comentário de topo da rota `/anki`).
 *
 * SEM CONFLITO (a maioria dos casos: baralho de inglês com lobby em inglês) → o cabeçalho vale,
 * exatamente como antes.
 *
 * COM CONFLITO, só DUAS escritas dão um idioma INEQUÍVOCO para carimbar no lugar do cabeçalho:
 * kana → 'ja' e hangul → 'ko' (nenhuma outra língua viva usa essas escritas como principal).
 * `cjk` puro (sem kana — pode ser chinês) e `cirilico`/`arabe`/`hebraico`/`grego` (cada um serve
 * VÁRIAS línguas — cirílico é ru/uk/bg/sr/…, por exemplo) são ambíguos: carimbar um palpite seria
 * trocar "errado por carimbo alheio" por "errado por palpite nosso", igualmente ruim. A resposta
 * honesta ali é `null` — o cartão cai em 'idioma-incerto' na triagem, o que é dito na tela via
 * `avisoIdioma`, em vez de mentir silenciosamente como o comportamento antigo.
 */
export function versoEhDefinicao(notas: Array<{ frente: string; verso?: string | null }>): boolean {
  const comVerso = notas.filter((n) => (n.verso ?? '').trim());
  if (comVerso.length < 5) return false;
  const repetem = comVerso.filter((n) => vazaResposta(n.verso ?? '', n.frente)).length;
  return repetem / comVerso.length >= 0.7;
}

export function decidirIdiomaOrigem(
  cabecalho: string | null,
  frentes: string[],
): { idiomaOrigem: string | null; avisoIdioma?: string } {
  if (!cabecalho) return { idiomaOrigem: null };

  const escrita = escritaDominante(frentes);
  if (escrita === 'desconhecido') return { idiomaOrigem: cabecalho }; // amostra sem letra: nada para contradizer

  const codigoBase = cabecalho.split('-')[0].toLowerCase();
  const headerEhLatino = LANGS_ESCRITA_LATINA.has(codigoBase);
  const conteudoEhLatino = escrita === 'latino';
  const conteudoEhNaoLatino = ESCRITAS_NAO_LATINAS.has(escrita);

  const conflito = (headerEhLatino && conteudoEhNaoLatino) || (!headerEhLatino && conteudoEhLatino);
  if (!conflito) return { idiomaOrigem: cabecalho };

  /* A DOMINÂNCIA é o critério errado para o japonês, e é justamente o caso-bandeira do defeito:
     um baralho de vocabulário japonês típico (Core 2k, Kaishi) é majoritariamente KANJI, com kana
     minoritário — pela dominância cairia em `cjk` ambíguo e o baralho inteiro ficaria sem idioma.
     Mas kana é assinatura EXCLUSIVA do japonês: chinês nunca o mistura. Então a PRESENÇA de kana
     (com um piso mínimo contra ruído — uma citação solta num deck chinês) decide 'ja' mesmo com
     Han dominante; o mesmo vale para hangul → 'ko' (coreano mistura Han, chinês não mistura
     hangul). Só o que sobra sem nenhuma dessas assinaturas fica ambíguo de verdade. */
  const { contagem, totalDeLetras } = contagemDeEscritas(frentes);
  /* O piso tem duas pernas com papéis diferentes: o RELATIVO (2%) protege amostras grandes — uma
     citação japonesa solta num deck chinês de 200 frentes fica em ~0,4% e não dispara — e o
     ABSOLUTO (2) protege amostras pequenas, onde 2% de 14 letras arredondaria para zero e qualquer
     ruído de um caractere decidiria o idioma do baralho. */
  const presenca = (e: string) => (contagem[e] ?? 0) >= Math.max(2, totalDeLetras * 0.02);
  if (escrita === 'kana' || (escrita === 'cjk' && presenca('kana'))) {
    return {
      idiomaOrigem: 'ja',
      avisoIdioma: `o cabeçalho dizia "${cabecalho}", mas o baralho é escrito em japonês (kanji + kana) — idioma corrigido para "ja".`,
    };
  }
  if (escrita === 'hangul' || (escrita === 'cjk' && presenca('hangul'))) {
    return {
      idiomaOrigem: 'ko',
      avisoIdioma: `o cabeçalho dizia "${cabecalho}", mas o baralho é escrito em coreano — idioma corrigido para "ko".`,
    };
  }

  return {
    idiomaOrigem: null,
    avisoIdioma:
      `o cabeçalho dizia "${cabecalho}", mas o conteúdo do baralho é predominantemente ${escrita} — ` +
      'como esse script serve mais de um idioma, o idioma do baralho ficou em branco em vez de arriscar um palpite errado.',
  };
}
