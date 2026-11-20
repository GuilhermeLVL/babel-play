/**
 * TEXTO → FONEMAS para o Kitten TTS 2, no alfabeto do `vocab.json` do modelo. Sem espeak-ng (GPL): regras próprias
 * para pt e es (`./pt.ts`, `./es.ts`) e, para o inglês, o léxico CMUdict no alfabeto do misaki que vem no próprio
 * repositório do modelo (`g2p/cmu_misaki_us.json`, BSD) com regras para o que faltar (`./en.ts`).
 */
import { fonemasEn, type LexicoEn } from './en';
import { fonemasEs } from './es';
import { fonemasPt } from './pt';

export function fonemasDoTexto(texto: string, idioma: string, lexicoEn?: LexicoEn): string {
  const base = (idioma || '').toLowerCase().split(/[-_]/)[0];
  /* NFD: as vogais nasais pré-compostas (ũ, õ) não existem no vocabulário; o til vai combinante. */
  if (base === 'pt') return fonemasPt(texto).normalize('NFD');
  if (base === 'es') return fonemasEs(texto).normalize('NFD');
  if (base === 'en') return fonemasEn(texto, lexicoEn ?? {});
  throw new Error(`fonetizador sem o idioma ${idioma}`);
}
