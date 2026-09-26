/**
 * O IDIOMA DA SESSÃO, DE CADA FALA E DE CADA CARTÃO — decidido num lugar só, com teste.
 *
 * CAUSA RAIZ do relato de 2026-09-26 ("sessão em português vira prática em inglês"): ao salvar,
 * a FALA já gravava o idioma detectado (`s.lang`), mas o CARTÃO recebia o idioma do SELETOR —
 * `isSys ? targetLang : sourceLang`. No "Detectar" com o par "eu falo pt / estudo en", o áudio do
 * sistema em português virava cartão `srcLang: 'en'`: a Biblioteca, Jogar e o TTS liam inglês, e a
 * extração usava as stopwords inglesas ("porque", "também" viravam cartão). E a SESSÃO gravava
 * `sourceLang = config.mine`, que não é o idioma do conteúdo.
 *
 * A regra agora: o idioma DETECTADO da fala vence; o configurado é só o fallback quando nada foi
 * medido. O cartão herda o idioma da fala de origem. A sessão grava o idioma DOMINANTE das falas.
 */
import { fraseQueContem } from '@core/texto/segmentacao';

import { baseLang, toBcp47 } from '../languages';
import { type SpeechSegment, wordsFromText } from './tiposDaFala';

/** O par configurado na captura: `sourceLang` = eu falo, `targetLang` = estudo. */
export interface ParConfigurado {
  sourceLang: string;
  targetLang: string;
}

type FalaComIdioma = Pick<SpeechSegment, 'source'> & { lang?: string };

/**
 * Idioma (BCP-47) do TEXTO de uma fala: o detectado, senão o que a fonte implica no par
 * (sistema = o que se estuda; microfone = o que se fala).
 */
export function idiomaDaFala(s: FalaComIdioma, par: ParConfigurado): string {
  const detectado = baseLang(s.lang ?? '');
  if (detectado) return toBcp47(detectado) || detectado;
  return s.source === 'system' ? par.targetLang : par.sourceLang;
}

/**
 * Idioma do VERSO (a tradução) de uma fala. É o "outro" idioma do par em relação ao da fala: fala
 * em português com par pt/en traduz para inglês, mesmo vindo do áudio do sistema (onde o padrão
 * seria traduzir para o seu idioma, que aqui é o mesmo da fala e não daria verso nenhum).
 */
export function idiomaDoVerso(s: FalaComIdioma, par: ParConfigurado): string {
  const fala = baseLang(idiomaDaFala(s, par));
  const padrao = s.source === 'system' ? par.sourceLang : par.targetLang;
  if (baseLang(padrao) !== fala) return padrao;
  const outro = s.source === 'system' ? par.targetLang : par.sourceLang;
  return baseLang(outro) !== fala ? outro : padrao;
}

/**
 * O idioma DOMINANTE de um conjunto de falas, pesado pelo número de palavras (uma fala longa em
 * português pesa mais que um "ok" em inglês). `''` se nenhuma tem idioma.
 */
export function idiomaDominante(falas: ReadonlyArray<{ sourceLang?: string | null; sourceText?: string | null }>): string {
  const peso = new Map<string, { n: number; codigo: string }>();
  for (const f of falas) {
    const base = baseLang(f.sourceLang ?? '');
    if (!base) continue;
    const n = Math.max(1, (f.sourceText ?? '').trim().split(/\s+/).filter(Boolean).length);
    const atual = peso.get(base);
    peso.set(base, { n: (atual?.n ?? 0) + n, codigo: atual?.codigo ?? (f.sourceLang as string) });
  }
  let melhor: { n: number; codigo: string } | null = null;
  for (const v of peso.values()) if (!melhor || v.n > melhor.n) melhor = v;
  return melhor?.codigo ?? '';
}

/**
 * O par GRAVADO NA SESSÃO: `sourceLang` = idioma do conteúdo (o dominante das falas, que é o que a
 * Biblioteca mostra e filtra); `targetLang` = o outro idioma do par configurado.
 */
export function parDaSessao(
  falas: ReadonlyArray<{ sourceLang?: string | null; sourceText?: string | null }>,
  par: ParConfigurado,
): ParConfigurado {
  const conteudo = idiomaDominante(falas);
  if (!conteudo) return par;
  const alvo = baseLang(conteudo) === baseLang(par.sourceLang) ? par.targetLang : par.sourceLang;
  return { sourceLang: conteudo, targetLang: alvo };
}

export interface PalavraPendente {
  word: string;
  back: string;
  /** A FRASE da fala em que a palavra aparece (não a fala inteira). */
  sentence: string;
  srcLang: string;
  tgtLang: string;
}

/**
 * As palavras únicas das falas, cada uma com o idioma DA FALA de onde veio.
 *
 * As palavras são RE-EXTRAÍDAS no idioma final da fala: durante a captura, `s.words` pode ter sido
 * calculado antes de a detecção chegar (com o idioma do seletor, logo com as stopwords erradas). A
 * tradução já obtida para uma palavra que continua na lista é preservada.
 */
export function palavrasDasFalas(segs: ReadonlyArray<SpeechSegment>, par: ParConfigurado): PalavraPendente[] {
  const vistas = new Set<string>();
  const saida: PalavraPendente[] = [];
  for (const s of segs) {
    const srcLang = idiomaDaFala(s, par);
    const tgtLang = idiomaDoVerso(s, par);
    const traducoes = new Map<string, string>();
    for (const w of (s.words ?? []) as Array<{ word?: string; translation?: string }>) {
      const k = String(w?.word ?? '').toLowerCase();
      if (k && w?.translation) traducoes.set(k, String(w.translation));
    }
    for (const w of wordsFromText(s.originalText ?? '', srcLang)) {
      const word = String(w.word ?? '');
      // A chave de "já vista" inclui o idioma: "no" em inglês e "no" em português são cartões outros.
      const chave = `${baseLang(srcLang)}|${word.toLowerCase()}`;
      if (!word || vistas.has(chave)) continue;
      vistas.add(chave);
      saida.push({
        word,
        back: traducoes.get(word.toLowerCase()) ?? '',
        sentence: fraseQueContem(s.originalText, word, srcLang),
        srcLang,
        tgtLang,
      });
    }
  }
  return saida;
}
