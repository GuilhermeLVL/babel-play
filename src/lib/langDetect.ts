/**
 * DETECÇÃO DE IDIOMA — usada pela "leitura inteligente" do narrador.
 *
 * Por que existe: num transcript de chamada bilíngue, o campo `original` pode MISTURAR idiomas
 * (um participante fala português, outro inglês — tudo cai no mesmo campo). Narrar uma frase em
 * português com voz inglesa soa péssimo. Detectar o idioma POR FRASE resolve isso.
 *
 * Duas fontes, nesta ordem:
 *  1. **LanguageDetector nativo** (Chrome/Edge ≥ 138) — modelo on-device, zero download, bom.
 *  2. **Heurística local** (fallback) — script Unicode + palavras-função. Determinística e sem
 *     dependência. Cobre bem os idiomas de script próprio (CJK, cirílico, árabe…) e é razoável
 *     nos de alfabeto latino.
 *
 * HONESTIDADE: o resultado sempre diz de ONDE veio (`method`) e com que `confidence`. Quando não dá
 * para afirmar nada, devolve `null` — quem chama decide o fallback (tipicamente o idioma declarado
 * da sessão). Nunca "chutamos" um idioma sem sinal.
 */
import { detectarIdiomaPorTexto } from '@core/texto/detectarIdioma';

import { baseLang } from './languages';

export type DetectMethod = 'native' | 'heuristic';

export interface LangDetection {
  /** ISO-639-1 ('pt', 'en', 'ja'…). */
  lang: string;
  /** 0..1. Na heurística é uma pontuação normalizada, não uma probabilidade calibrada. */
  confidence: number;
  method: DetectMethod;
}

// ───────────────────────── 1. Detector nativo do navegador ─────────────────────────

type NativeDetector = { detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>> };
let nativePromise: Promise<NativeDetector | null> | null = null;

/** Instancia (uma vez) o LanguageDetector nativo, se o navegador tiver. */
function getNativeDetector(): Promise<NativeDetector | null> {
  if (nativePromise) return nativePromise;
  nativePromise = (async () => {
    try {
      // Exposto como `LanguageDetector` global (Chrome/Edge ≥138). Em versões antigas ficava sob
      // `self.ai.languageDetector` — checamos os dois.
      const Ctor: any =
        (globalThis as any).LanguageDetector ??
        (globalThis as any).self?.ai?.languageDetector ??
        null;
      if (!Ctor) return null;
      // `availability()`/`capabilities()` podem exigir download do modelo; se não estiver pronto,
      // não bloqueamos a UI — caímos na heurística e o nativo entra quando estiver disponível.
      const availability = await (Ctor.availability?.() ?? Promise.resolve('available'));
      if (availability === 'unavailable') return null;
      return await Ctor.create();
    } catch {
      return null;
    }
  })();
  return nativePromise;
}

// ───────────────────────── API pública ─────────────────────────

/**
 * Cache por texto. Tem TETO porque uma captura ao vivo detecta o idioma de cada fala: numa sessão
 * longa isso é milhares de entradas de até 280 caracteres retidas até a página recarregar, e o
 * ganho de uma entrada de uma hora atrás é zero (o texto nunca se repete). Descarta a mais antiga.
 */
const LIMITE_DO_CACHE = 500;
const cache = new Map<string, LangDetection | null>();

/**
 * Detecta o idioma de um texto. `null` = sem sinal suficiente (quem chama usa o idioma declarado
 * da sessão como fallback — jamais um chute).
 */
export async function detectLanguage(text: string): Promise<LangDetection | null> {
  const key = (text || '').trim().slice(0, 280);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  let result: LangDetection | null = null;

  const native = await getNativeDetector();
  if (native) {
    try {
      const out = await native.detect(key);
      const best = out?.[0];
      // 'und' = undetermined. Confiança baixa → preferimos admitir que não sabemos.
      if (best && best.detectedLanguage !== 'und' && best.confidence >= 0.5) {
        result = {
          lang: baseLang(best.detectedLanguage),
          confidence: best.confidence,
          method: 'native',
        };
      }
    } catch {
      /* cai na heurística */
    }
  }

  if (!result) result = detectarIdiomaPorTexto(key);

  cache.set(key, result);
  if (cache.size > LIMITE_DO_CACHE) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga !== undefined) cache.delete(maisAntiga);
  }
  return result;
}

/** O navegador tem o detector nativo (on-device) disponível? Só para exibir na UI. */
export async function hasNativeDetector(): Promise<boolean> {
  return (await getNativeDetector()) !== null;
}
