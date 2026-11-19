/**
 * QUAL VOZ DO APARELHO LER — as regras puras de idioma e de qualidade das vozes do `speechSynthesis`
 * (spec `docs/specs/2026-10-28-narracao-v2.md`, §6). Sem DOM: quem lê `getVoices()` é `src/lib/tts.ts`.
 *
 * A Web Speech API só informa nome, idioma, `voiceURI` e `localService`. A qualidade é uma heurística de NOME e de
 * `voiceURI` (aproximada, a interface diz isso) com LISTA DE PERMISSÃO: o macOS lista dezenas de vozes robóticas
 * (Eloquence, novidade) e ganha vozes estranhas novas a cada versão; uma lista de bloqueio sempre ficaria para trás.
 * O que não é reconhecido como voz de qualidade é recusado: melhor não falar que falar com voz de robô.
 * A recomendação pesa, nesta ordem: o código EXATO do idioma (pt-BR antes de pt-PT), o nível de qualidade, e a voz
 * que roda no aparelho (funciona sem internet).
 */

/** O que a recomendação precisa saber de uma voz (um `VoiceInfo` ou um `SpeechSynthesisVoice` servem). */
export interface VozDescrita {
  name: string;
  lang: string;
  /** Roda no aparelho. `undefined` = o navegador não informou. */
  local?: boolean;
  /** O identificador do sistema (`com.apple.voice.premium.pt-BR.Luciana`). O Chrome no Mac só diz "Premium" aqui. */
  voiceURI?: string;
}

/**
 * Os códigos que os sistemas dão à MESMA língua: o Android e o Chrome chamam o mandarim de `cmn`, o
 * hebraico de `iw`, o indonésio de `in`, e o norueguês de `no`. Sem isto, a voz instalada não era
 * reconhecida como a do idioma pedido e a tela dizia "sem voz".
 */
const BASES_EQUIVALENTES: Record<string, string> = { cmn: 'zh', iw: 'he', in: 'id', no: 'nb', nn: 'nb' };

/** O código da voz em minúsculas e com hífen (`zh_CN_#Hans` → `zh-cn-#hans`). */
export const codigoDaVoz = (lang: string): string => (lang || '').toLowerCase().replace(/_/g, '-');

/**
 * A base ISO-639-1 de um código de voz ou de idioma, já com os códigos equivalentes reunidos
 * (`cmn-Hans-CN` → `zh`, `iw-IL` → `he`). O cantonês (`yue`, `zh-HK`) NÃO é a base `zh`: é outra
 * língua falada, e ler mandarim com voz cantonesa ensina a pronúncia errada.
 */
export function baseDaVoz(lang: string): string {
  const codigo = codigoDaVoz(lang);
  const base = codigo.split('-')[0];
  if (base === 'zh' && /-(hk|mo)(-|$)/.test(codigo)) return 'yue';
  return BASES_EQUIVALENTES[base] ?? base;
}

/** O nome indica uma voz de alta qualidade? Heurística aproximada: a API não expõe qualidade. (A etiqueta "Natural".) */
export const ehVozNatural = (nome: string): boolean => /natural|neural|online|google|premium|enhanced/i.test(nome);

/**
 * AS VOZES PADRÃO DO macOS/iOS DE QUALIDADE ACEITÁVEL (nível 2), pelo nome base. Lista ÚNICA e fácil de ampliar: uma
 * voz nova da Apple só passa a ser usada depois de alguém ouvi-la e pôr o nome aqui. Ficam de fora, de propósito, as
 * Eloquence (Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley) e as de novidade (Albert, Bad News, Bahh, Bells,
 * Boing, Bubbles, Cellos, Fred, Good News, Jester, Junior, Kathy, Organ, Ralph, Superstar, Trinoids, Whisper, Wobble,
 * Zarvox). Acento e caixa não importam ("Amélie" = "amelie").
 */
const VOZES_PADRAO_ACEITAS: readonly string[] = [
  // pt
  'Luciana',
  'Felipe',
  'Fernanda',
  'Joana',
  'Catarina',
  // en
  'Samantha',
  'Alex',
  'Ava',
  'Allison',
  'Susan',
  'Tom',
  'Evan',
  'Nathan',
  'Zoe',
  'Daniel',
  'Kate',
  'Serena',
  'Oliver',
  'Arthur',
  'Martha',
  'Karen',
  'Lee',
  'Moira',
  'Tessa',
  'Fiona',
  'Rishi',
  'Veena',
  // es
  'Mónica',
  'Paulina',
  'Jorge',
  'Juan',
  'Diego',
  'Marisol',
  'Francisca',
  'Angélica',
  'Isabela',
  // fr
  'Thomas',
  'Amélie',
  'Audrey',
  'Aurélie',
  'Marie',
  // de
  'Anna',
  'Petra',
  'Markus',
  'Yannick',
  'Helena',
  // it
  'Alice',
  'Federica',
  'Luca',
  'Paola',
  // ja
  'Kyoko',
  'Otoya',
  'Hattori',
  'O-ren',
  // zh / yue
  'Ting-Ting',
  'Tingting',
  'Mei-Jia',
  'Meijia',
  'Sin-ji',
  'Sinji',
  'Lili',
  'Yu-shu',
  // ko
  'Yuna',
  'Sora',
  // ru, uk
  'Milena',
  'Katya',
  'Yuri',
  'Lesya',
  // nl, sv, da, nb, fi
  'Xander',
  'Ellen',
  'Claire',
  'Fleur',
  'Alva',
  'Klara',
  'Oskar',
  'Sara',
  'Nora',
  'Satu',
  // pl, cs, sk, hu, ro, hr, el, tr
  'Zosia',
  'Ewa',
  'Zuzana',
  'Laura',
  'Mariska',
  'Tünde',
  'Ioana',
  'Lana',
  'Melina',
  'Yelda',
  'Cem',
  // ar, he, hi, id, ms, th, vi, ca
  'Maged',
  'Majed',
  'Carmit',
  'Lekha',
  'Kiyara',
  'Damayanti',
  'Amira',
  'Kanya',
  'Linh',
  'Montse',
];

/** O nome base de uma voz: sem o que vem entre parênteses, sem acento e em minúsculas ("Eddy (English (US))" → "eddy"). */
const nomeBase = (nome: string): string =>
  (nome || '')
    .replace(/\s*\(.*$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const PADRAO = new Set(VOZES_PADRAO_ACEITAS.map(nomeBase));

/** As robóticas que NUNCA valem, nem com um `voiceURI` que pareça bom (Eloquence e novidade do macOS). */
const RECUSADAS = new Set(
  [
    'Eddy',
    'Flo',
    'Grandma',
    'Grandpa',
    'Reed',
    'Rocko',
    'Sandy',
    'Shelley',
    'Albert',
    'Bad News',
    'Bahh',
    'Bells',
    'Boing',
    'Bubbles',
    'Cellos',
    'Fred',
    'Good News',
    'Jester',
    'Junior',
    'Kathy',
    'Organ',
    'Ralph',
    'Superstar',
    'Trinoids',
    'Whisper',
    'Wobble',
    'Zarvox',
  ].map(nomeBase),
);

/** O que identifica uma voz para a régua de qualidade (o nome basta; o `voiceURI` ajuda no Chrome do Mac). */
type VozIdentificada = Pick<VozDescrita, 'name' | 'voiceURI'>;

/**
 * O NÍVEL DE QUALIDADE de uma voz:
 *  - 3: premium/enhanced/aprimorada (no nome ou no `voiceURI`), Natural/Neural (Edge, Android), Siri, e as "Google …"
 *       do Chrome;
 *  - 2: as vozes padrão conhecidas do macOS/iOS (`VOZES_PADRAO_ACEITAS`) e as do Google TTS no Android
 *       (`pt-BR-language`, `pt-br-x-afs-local`);
 *  - 0: todo o resto, RECUSADA: Eloquence, novidade, eSpeak, SAPI do Windows ("Microsoft Maria", "… Desktop") e qualquer
 *       voz que não reconhecemos.
 */
export function nivelDaVoz(v: VozIdentificada): 0 | 2 | 3 {
  const nome = (v.name || '').trim();
  const uri = (v.voiceURI || '').toLowerCase();
  const base = nomeBase(nome);
  if (RECUSADAS.has(base) || /espeak|eloquence/i.test(nome) || /eloquence|speech\.synthesis\.voice\./.test(uri)) {
    return 0;
  }
  if (/\b(premium|enhanced|aprimorada|melhorada|natural|neural|siri)\b/i.test(nome)) return 3;
  if (/\.(premium|enhanced)\.|siri/.test(uri)) return 3;
  if (/^google\s/i.test(nome)) return 3;
  if (PADRAO.has(base)) return 2;
  /* Google TTS do Android: `pt-BR-language`, `pt-br-x-afs-local`, `pt-br-x-afs-network`. */
  if (/^[a-z]{2,3}(-[a-z0-9]{2,8})*-language$/i.test(nome)) return 2;
  if (/^[a-z]{2,3}-[a-z]{2}-x-[a-z0-9]+-(local|network)$/i.test(nome)) return 2;
  return 0;
}

/** A voz é de qualidade aceitável (nível > 0)? As outras nunca são escolhidas nem oferecidas. */
export const ehVozAceita = (v: VozIdentificada): boolean => nivelDaVoz(v) > 0;

/**
 * As vozes ACEITAS do idioma, da melhor para a pior: região exata, nível, no aparelho; desempate pelo nome (estável).
 * Uma voz recusada nunca aparece, nem como último recurso.
 */
export function ordenarPorQualidade<T extends VozDescrita>(vozes: readonly T[], idioma: string): T[] {
  const base = baseDaVoz(idioma);
  const codigo = codigoDaVoz(idioma);
  const comRegiao = codigo.includes('-');
  return vozes
    .filter((v) => baseDaVoz(v.lang) === base)
    .map((v) => ({
      v,
      exata: comRegiao && codigoDaVoz(v.lang) === codigo ? 1 : 0,
      nivel: nivelDaVoz(v),
      local: v.local === true ? 1 : 0,
    }))
    .filter((x) => x.nivel > 0)
    .sort((a, b) => b.exata - a.exata || b.nivel - a.nivel || b.local - a.local || a.v.name.localeCompare(b.v.name))
    .map((x) => x.v);
}

/** A voz que o app recomenda para o idioma, ou `null` sem nenhuma voz ACEITA dele. */
export const recomendarVoz = <T extends VozDescrita>(vozes: readonly T[], idioma: string): T | null =>
  ordenarPorQualidade(vozes, idioma)[0] ?? null;
