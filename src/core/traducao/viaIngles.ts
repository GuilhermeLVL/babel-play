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
 * Não entram os idiomas que já têm modelo direto (pt, es, fr, it, de, ro, ca, gl) nem o par entre eles: o inglês no meio
 * piora o que o tradutor direto da web faz bem.
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
