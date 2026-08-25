import React from 'react';
/**
 * CONFIGURAÇÃO DE IDIOMA — leitor único, com nomes que não admitem inversão.
 *
 * POR QUE ISTO EXISTE (bug real): a mesma chave de configuração era lida com significados OPOSTOS
 * em telas diferentes.
 *
 *   Analysis.tsx:107      → { src: ui.captureSourceLang, tgt: ui.captureTargetLang }
 *   Study.tsx:380         → { src: ui.captureTargetLang, tgt: ui.captureSourceLang }   ← invertido
 *   Metrics.tsx:185       → { src: ui.captureTargetLang, tgt: ui.captureSourceLang }   ← invertido
 *
 * Como esse par é o fallback usado para CRIAR CARTÕES e para escolher a DIREÇÃO DA TRADUÇÃO, o mesmo
 * cartão saía com o idioma trocado dependendo da tela em que o usuário clicou na palavra. É uma das
 * causas diretas de "palavra em português com descrição em inglês, e vice-versa".
 *
 * A raiz do problema é o nome: `source`/`target` não dizem *de quem*. Aqui eles não existem. Existem
 * `mine` (o idioma que VOCÊ fala, o do seu microfone) e `studying` (o idioma que você ESTUDA, o do
 * áudio estrangeiro). Não há como inverter os dois sem que o código fique absurdo à leitura.
 *
 * BÔNUS — o órfão: `settings.targetLanguage` era WRITE-ONLY. A tela de Configurações oferecia um
 * seletor de idioma, salvava no banco… e nenhuma linha do repositório lia o campo. O usuário
 * configurava o idioma de estudo numa tela que não tinha efeito nenhum. Agora ele é a fonte
 * AUTORITATIVA de `studying`, com a Captura como fallback.
 */
import { fetchSettings, patchUiSettings, saveSettings } from '../data/api';
import { toBcp47 } from './languages';

export interface LangConfig {
  /** Idioma que VOCÊ fala (microfone). BCP-47, ex.: 'pt-BR'. */
  mine: string;
  /** Idioma que você ESTUDA — o do áudio/texto estrangeiro. BCP-47, ex.: 'en-US'. */
  studying: string;
}

/**
 * Padrão. Continua sendo um palpite (é o único momento em que a app não tem como saber), mas agora
 * é um palpite em UM lugar só, e a detecção por texto o corrige a jusante — em vez de virar rótulo
 * permanente no banco.
 */
export const DEFAULT_LANG_CONFIG: LangConfig = { mine: 'pt-BR', studying: 'en-US' };

/** Evento de mudança — as telas abertas se atualizam sozinhas (mesmo padrão do `tts.ts`). */
const CHANGED = 'babel_lang_config_changed';

function normalize(code: string | null | undefined, fallback: string): string {
  const raw = (code || '').trim();
  if (!raw) return fallback;
  // Aceita 'pt' ou 'pt-BR'; devolve sempre BCP-47 (é o que TTS e reconhecimento esperam).
  return raw.includes('-') ? raw : toBcp47(raw) || fallback;
}

/** Extrai a configuração de um `AppSettings` já carregado (sem ir à rede de novo). */
export function langConfigFrom(
  ui: Record<string, unknown> | null | undefined,
  targetLanguage?: string | null,
): LangConfig {
  const mine = normalize(ui?.captureSourceLang as string, DEFAULT_LANG_CONFIG.mine);
  // `settings.targetLanguage` manda: é o seletor explícito da tela de Configurações. A Captura é o
  // fallback (foi lá que o usuário escolheu, ainda que implicitamente).
  const studying = normalize(
    targetLanguage || (ui?.captureTargetLang as string),
    DEFAULT_LANG_CONFIG.studying,
  );
  return { mine, studying };
}

export async function fetchLangConfig(): Promise<LangConfig> {
  const s = await fetchSettings();
  let ui: Record<string, unknown>;
  try {
    ui = s?.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {};
  } catch {
    ui = {};
  }
  return langConfigFrom(ui, s?.targetLanguage);
}

/**
 * Persiste a configuração. Escreve nos DOIS lugares de propósito: `settings.targetLanguage` (a fonte
 * autoritativa, que a tela de Configurações lê) e o blob `ui` (que a Captura reidrata nos seletores).
 * Manter os dois em sincronia é o que evita a próxima geração deste mesmo bug.
 */
export async function saveLangConfig(patch: Partial<LangConfig>): Promise<void> {
  const uiPatch: Record<string, unknown> = {};
  if (patch.mine) uiPatch.captureSourceLang = patch.mine;
  if (patch.studying) uiPatch.captureTargetLang = patch.studying;
  if (Object.keys(uiPatch).length) await patchUiSettings(uiPatch);
  if (patch.studying) await saveSettings({ targetLanguage: patch.studying });

  try {
    window.dispatchEvent(new CustomEvent(CHANGED, { detail: patch }));
  } catch {
    /* fora do navegador — só não notifica */
  }
}

/** Escuta mudanças na configuração de idioma. Devolve o unsubscribe. */
export function onLangConfigChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}

/**
 * Assina a configuração de idioma e acompanha a troca em Ajustes.
 *
 * Estava copiado byte a byte em `Analysis.tsx` e `Reading.tsx`. E `Reading` é renderizado DENTRO de
 * `Analysis`: na aba Leitura os dois efeitos montavam juntos, ou seja, DOIS listeners registrados e
 * dois estados a manter em sincronia. Um hook só resolve as duas coisas.
 */
export function useLangConfig(): LangConfig {
  const [cfg, setCfg] = React.useState<LangConfig>(DEFAULT_LANG_CONFIG);
  React.useEffect(() => {
    let vivo = true;
    const carregar = () => { fetchLangConfig().then((c) => { if (vivo) setCfg(c); }).catch(() => {}); };
    carregar();
    const off = onLangConfigChange(carregar);
    return () => { vivo = false; off(); };
  }, []);
  return cfg;
}
