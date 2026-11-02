/**
 * QUAL VOZ DO APARELHO LER — as regras puras de idioma e de qualidade das vozes do `speechSynthesis`
 * (spec `docs/specs/2026-10-28-narracao-v2.md`, §6). Sem DOM: quem lê `getVoices()` é `src/lib/tts.ts`.
 *
 * A Web Speech API só informa nome, idioma e `localService`. "Natural" é uma heurística de NOME (aproximada,
 * a interface diz isso), e a recomendação pesa, nesta ordem: o código EXATO do idioma (pt-BR antes de pt-PT),
 * voz natural, voz que roda no aparelho (funciona sem internet).
 */

/** O que a recomendação precisa saber de uma voz (um `VoiceInfo` ou um `SpeechSynthesisVoice` servem). */
export interface VozDescrita {
  name: string;
  lang: string;
  /** Roda no aparelho. `undefined` = o navegador não informou. */
  local?: boolean;
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

/** O nome indica uma voz de alta qualidade? Heurística aproximada: a API não expõe qualidade. */
export const ehVozNatural = (nome: string): boolean => /natural|neural|online|google|premium|enhanced/i.test(nome);

/** Pontos de uma voz para um idioma (0 = não é do idioma). Região exata pesa mais que natural, que pesa mais que local. */
function pontos(v: VozDescrita, base: string, codigo: string): number {
  if (baseDaVoz(v.lang) !== base) return 0;
  const exata = codigo.includes('-') && codigoDaVoz(v.lang) === codigo;
  return 1 + (exata ? 8 : 0) + (ehVozNatural(v.name) ? 4 : 0) + (v.local === true ? 2 : 0);
}

/** As vozes do idioma, da melhor para a pior (desempate: ordem alfabética do nome, estável). */
export function ordenarPorQualidade<T extends VozDescrita>(vozes: readonly T[], idioma: string): T[] {
  const base = baseDaVoz(idioma);
  const codigo = codigoDaVoz(idioma);
  return vozes
    .map((v) => ({ v, p: pontos(v, base, codigo) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.v.name.localeCompare(b.v.name))
    .map((x) => x.v);
}

/** A voz que o app recomenda para o idioma, ou `null` sem nenhuma voz dele. */
export const recomendarVoz = <T extends VozDescrita>(vozes: readonly T[], idioma: string): T | null =>
  ordenarPorQualidade(vozes, idioma)[0] ?? null;
