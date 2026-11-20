/**
 * OS IDIOMAS QUE TRADUZEM NO APARELHO PASSANDO PELO INGLÊS. Não há modelo local de "japonês para português" (nem de
 * coreano, russo…): o tradutor local faz a fala `X → inglês` com o modelo do idioma e, se o alvo não é o inglês,
 * `inglês → alvo` com o que já existia (pt, es, fr, it, de). Sem isto, a fala saía transcrita e SEM tradução quando o
 * tradutor nativo do navegador não estava pronto e a nuvem não estava autorizada (o tradutor da web exige consentimento).
 *
 * UMA tabela, lida pelo worker (`mtWorker.ts`), pelo adaptador (`opusMtLocal.ts`), pela lista de download
 * (`modelCache.ts`) e pela cobertura que a tela anuncia (`languages.ts`): os quatro não discordam. Cada id tem a revisão
 * fixada em `src/gateway/revisoesDosModelos.ts` (cadeia de suprimentos) e é um repositório `Xenova/opus-mt-<idioma>-en`
 * com os pesos q8 (~110 MB por par).
 *
 * SÓ ENTRA QUEM FOI TESTADO (17/10/2026, mesma frase em cada idioma, motor real em q8): zh, ja, ko, ru, ar, tr, pl, nl, uk,
 * sv, fi, cs, hu, id e th saíram em inglês sensato. Ficaram de fora o hindi ("Today's weather good, let's walk in park") e o
 * vietnamita ("I loved learning the language"): pior que a internet (Chrome Translator, MyMemory, LLM), que hoje os atende.
 * Não entram aqui os idiomas que já têm modelo direto até o inglês (pt, es, fr, it, de, ro, ca, gl): esses estão em
 * `MODELOS_DIRETOS_PARA_O_INGLES`, logo abaixo.
 */
export const MODELOS_PARA_O_INGLES: Readonly<Record<string, string>> = {
  zh: 'Xenova/opus-mt-zh-en',
  ja: 'Xenova/opus-mt-ja-en',
  ko: 'Xenova/opus-mt-ko-en',
  ru: 'Xenova/opus-mt-ru-en',
  ar: 'Xenova/opus-mt-ar-en',
  tr: 'Xenova/opus-mt-tr-en',
  pl: 'Xenova/opus-mt-pl-en',
  nl: 'Xenova/opus-mt-nl-en',
  uk: 'Xenova/opus-mt-uk-en',
  sv: 'Xenova/opus-mt-sv-en',
  fi: 'Xenova/opus-mt-fi-en',
  cs: 'Xenova/opus-mt-cs-en',
  hu: 'Xenova/opus-mt-hu-en',
  id: 'Xenova/opus-mt-id-en',
  th: 'Xenova/opus-mt-th-en',
};

/** A base ISO-639-1 de um código ("ja-JP" → "ja"). */
const baseDoIdioma = (lang: string): string => lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';

/** O modelo `idioma → inglês` deste idioma, ou `null` se ele não passa pelo inglês. */
export function modeloParaOIngles(lang: string): string | null {
  return Object.hasOwn(MODELOS_PARA_O_INGLES, baseDoIdioma(lang)) ? MODELOS_PARA_O_INGLES[baseDoIdioma(lang)] : null;
}

/** Os alvos que o aparelho alcança saindo do inglês (os mesmos do `opus-mt` direto). */
export const ALVOS_DO_INGLES: ReadonlySet<string> = new Set(['pt', 'es', 'fr', 'it', 'de']);

/**
 * OS IDIOMAS COM MODELO DIRETO ATÉ O INGLÊS (espelho de `modelFor` em `opusMtLocal.ts` e de `dirConfig` no worker):
 * os dedicados (es/fr/it/de) e o grupo ROMANCE (pt/ro/ca/gl) pelo `opus-mt-ROMANCE-en`.
 *
 * Entre eles NÃO há modelo direto (não existe opus-mt `es-pt` com revisão testada). Antes, o par entre eles (es→pt…) não
 * passava pelo inglês porque "o inglês no meio piora o que o tradutor da web faz bem" — mas a web exige consentimento de
 * nuvem, e o visitante no celular (perfil protegido, sem Translator nativo no Chrome Android nem no Safari) ficava SEM
 * tradução nenhuma: 9 de 9 falas na auditoria de 17/11/2026 (CEL-01). Agora o pivô é o ÚLTIMO recurso local: o nativo e a
 * nuvem autorizada vêm antes (a ordem da cascata, `coberturaNoAparelho.ts`).
 */
export const MODELOS_DIRETOS_PARA_O_INGLES: Readonly<Record<string, string>> = {
  es: 'Xenova/opus-mt-es-en',
  fr: 'Xenova/opus-mt-fr-en',
  it: 'Xenova/opus-mt-it-en',
  de: 'Xenova/opus-mt-de-en',
  pt: 'Xenova/opus-mt-ROMANCE-en',
  ro: 'Xenova/opus-mt-ROMANCE-en',
  ca: 'Xenova/opus-mt-ROMANCE-en',
  gl: 'Xenova/opus-mt-ROMANCE-en',
};

/** O modelo opus-mt `idioma → inglês` (direto ou o da tabela do pivô), ou `null`. */
export function modeloDaPernaParaOIngles(lang: string): string | null {
  const b = baseDoIdioma(lang);
  if (Object.hasOwn(MODELOS_DIRETOS_PARA_O_INGLES, b)) return MODELOS_DIRETOS_PARA_O_INGLES[b];
  return modeloParaOIngles(b);
}

/**
 * O modelo opus-mt `inglês → alvo`, ou `null`: dedicado para es/fr/it/de e o `en-ROMANCE` (com o token `>>pt_br<<`) para
 * o português. ro/ca/gl ficam de fora (sem o id do token, o modelo responde em qualquer língua latina).
 */
export function modeloDoInglesPara(alvo: string): string | null {
  const t = baseDoIdioma(alvo);
  if (t === 'pt') return 'Xenova/opus-mt-en-ROMANCE';
  return ALVOS_DO_INGLES.has(t) ? `Xenova/opus-mt-en-${t}` : null;
}

/**
 * O par traduz no aparelho PASSANDO PELO INGLÊS (`X → en → alvo`)? Vale para quem não tem modelo direto até o alvo: os
 * idiomas da tabela do pivô (zh, ja…) e, desde CEL-01, também os pares entre pt, es, fr, it e de. Quem chama decide a
 * ORDEM: o pivô só entra depois do nativo e da nuvem autorizada.
 */
export function passaPeloIngles(de: string, para: string): boolean {
  const s = baseDoIdioma(de);
  const t = baseDoIdioma(para);
  if (!s || s === t || s === 'en' || t === 'en') return false;
  // ro/ca/gl só chegam ao inglês: o pivô deles para pt/es… não foi avaliado (fora do escopo de CEL-01).
  const origem = ALVOS_DO_INGLES.has(s) || modeloParaOIngles(s) !== null;
  return origem && modeloDoInglesPara(t) !== null;
}

/**
 * Os idiomas com modelo do Bergamot (X→inglês) no CDN (`VITE_BERGAMOT_MODELOS_URL`): `paresDoCdn` de
 * `src/gateway/adapters/modelosDoBergamot.json` (um teste prende as duas listas). Só entra onde existe a arquitetura
 * `base-memory` (a menor): o A/B de 17/10/2026 mediu o Bergamot melhor que o opus-mt em todos eles.
 */
export const ORIGENS_DO_BERGAMOT_NO_CDN: ReadonlySet<string> = new Set([
  'es',
  'fr',
  'de',
  'it',
  'ru',
  'ar',
  'ja',
  'ko',
  'zh',
  'cs',
  'fi',
  'hu',
  'nl',
  'pl',
  'th',
]);

/**
 * O par passa pelo inglês SÓ porque não há modelo direto entre dois idiomas que já têm modelo direto até o inglês
 * (es→pt, pt→fr…; o pivô de CEL-01). É o pivô que vem por ÚLTIMO: com a nuvem consentida, quem traduz esses pares é a
 * nuvem/o tradutor da web, como antes (o inglês no meio perde nuance, e as duas pernas baixam até 226 MB).
 */
export function pivoEntreDiretos(de: string, para: string): boolean {
  return passaPeloIngles(de, para) && ALVOS_DO_INGLES.has(baseDoIdioma(de));
}
