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
import { assinarIdioma, ehRTL, idiomaDaInterface, IDIOMAS_DA_INTERFACE, usarIdioma } from './i18n';
import { toBcp47 } from './languages';

export interface LangConfig {
  /** Idioma que VOCÊ fala (microfone). BCP-47, ex.: 'pt-BR'. */
  mine: string;
  /** Idioma que você ESTUDA — o do áudio/texto estrangeiro. BCP-47, ex.: 'en-US'. */
  studying: string;
  /**
   * Idioma em que a INTERFACE é escrita. BCP-47, ex.: 'en-US'.
   *
   * TERCEIRO EIXO, e não um detalhe de `mine`. Até 2026-09-07 a interface era derivada de "Meu
   * idioma" e não havia como divergir: quem fala português e quer a tela em inglês tinha de dizer
   * que fala inglês — e com isso invertia a direção do microfone e das traduções (achado A38 da
   * auditoria). Agora é escolha própria, guardada em `settings.ui.uiLang`; sem escolha, segue
   * `mine`, que é o comportamento de sempre para quem nunca abriu o seletor.
   */
  daInterface: string;
}

/**
 * Padrão. Continua sendo um palpite (é o único momento em que a app não tem como saber), mas agora
 * é um palpite em UM lugar só, e a detecção por texto o corrige a jusante — em vez de virar rótulo
 * permanente no banco.
 */
export const DEFAULT_LANG_CONFIG: LangConfig = { mine: 'pt-BR', studying: 'en-US', daInterface: 'pt-BR' };

/** `?ui=<idioma>` da URL de entrada — ver `useIdiomaDaInterfaceEscolhido`. */
const OVERRIDE_DA_URL = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('ui')
  : null;

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
  /**
   * `settings.targetLanguage` é a ÚNICA fonte do alvo. `ui.captureTargetLang` e `ui.praticaLang`
   * eram gravados em paralelo e divergiam — no banco real, `target_language = 'pt-BR'` ao lado de
   * `ui.praticaLang = 'en'` (auditoria de 2026-09-07, achado A38): dois campos respondendo à mesma
   * pergunta, e cada tela lia um. A migração `0023` consolidou as linhas do servidor; a leitura
   * dos espelhos continua aqui como FALLBACK porque o modo anônimo guarda settings no IndexedDB,
   * onde migração SQL nenhuma chega. Ninguém mais os ESCREVE.
   */
  const studying = normalize(
    targetLanguage || (ui?.captureTargetLang as string) || (ui?.praticaLang as string),
    DEFAULT_LANG_CONFIG.studying,
  );
  // Sem escolha própria, a interface segue o idioma da pessoa — o comportamento de sempre.
  const daInterface = normalize(ui?.uiLang as string, mine);
  return { mine, studying, daInterface };
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
 * Persiste a configuração — UM CAMPO POR EIXO.
 *
 * Antes o alvo era escrito em dois lugares "para manter em sincronia": `settings.targetLanguage` e
 * `ui.captureTargetLang`. Duas escritas não atômicas do mesmo fato divergem, e divergiram (achado
 * A38). Agora cada eixo tem um destino só: alvo em `settings.targetLanguage`, idioma da pessoa em
 * `ui.captureSourceLang`, idioma da interface em `ui.uiLang`.
 */
export async function saveLangConfig(patch: Partial<LangConfig>): Promise<void> {
  const uiPatch: Record<string, unknown> = {};
  if (patch.mine) uiPatch.captureSourceLang = patch.mine;
  if (patch.daInterface) uiPatch.uiLang = patch.daInterface;
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

/**
 * A INTERFACE NO IDIOMA ESCOLHIDO, com "Meu idioma" como padrão.
 *
 * Era derivada de `mine` sem alternativa: quem fala português e quer a tela em inglês precisava
 * declarar que fala inglês, e isso inverte a direção do microfone e da tradução de todo cartão
 * (achado A38). O seletor de Ajustes agora grava `ui.uiLang`; sem escolha, `daInterface` cai em
 * `mine` e nada muda para quem nunca abriu o seletor.
 *
 * Roda uma vez no topo do app e a cada troca em Ajustes. Idioma sem catálogo fica em português —
 * ver `usarIdioma`.
 */
export function useIdiomaDaInterfaceEscolhido(): string {
  const cfg = useLangConfig();

  /* `?ui=<idioma>` VENCE o perfil. Existe por duas razoes praticas:
     
     · o pseudo-idioma (`xx`) nao esta na lista de idiomas oferecidos — e nao deve estar, e uma
       ferramenta de teste, nao uma opcao de produto. Sem este override, o teste de layout nao teria
       como entrar nele;
     · ver a tela num idioma sem trocar a preferencia da conta e o que permite conferir uma
       traducao em segundos, em vez de mexer em Ajustes e lembrar de desfazer.
     
     LIDO UMA VEZ, na carga. A tela de jogos reescreve a query string para guardar fonte e idioma
     (`?fonte=trilha&idioma=en`) e nesse caminho o `ui` some — medido: o override valia so ate a
     primeira navegacao interna, e a tela voltava ao portugues no meio do teste. Capturar na
     entrada torna o override estavel por toda a sessao, que e como uma ferramenta de depuracao
     deve se comportar. */
  const escolhido = OVERRIDE_DA_URL || cfg.daInterface;

  React.useEffect(() => { void usarIdioma(escolhido); }, [escolhido]);

  /* O DOCUMENTO INTEIRO acompanha o idioma: `lang` para leitores de tela e para a quebra de linha
     do navegador, `dir` para árabe e hebraico, que se leem da direita para a esquerda. Sem `dir` a
     interface ficaria espelhada ao contrário do texto — e nenhuma tradução conserta isso. */
  const idioma = React.useSyncExternalStore(assinarIdioma, idiomaDaInterface, () => 'pt');
  React.useEffect(() => {
    document.documentElement.lang = idioma;
    document.documentElement.dir = ehRTL(idioma) ? 'rtl' : 'ltr';
  }, [idioma]);

  /* ASSINA, além de definir. Sem isto o catálogo chegava e a tela continuava em português: `t()` é
     função pura sobre estado de módulo, e quem chama (`navLabel`, `tituloDoJogo`) não é componente
     — ninguém tinha por que renderizar de novo. Aqui na raiz, um re-render cobre a árvore toda, e
     a troca de idioma é rara o bastante para isso não ser custo. */
  return idioma;
}

/**
 * Os idiomas que o seletor de interface oferece, em BCP-47, prontos para o `LangPicker`.
 *
 * A lista vem da COBERTURA MEDIDA de cada catálogo (`scripts/i18n/cobertura.mjs`), não de uma
 * constante escrita à mão: oferecer um idioma com 3% traduzido é prometer uma tela que não existe.
 */
export function idiomasDaInterfaceOferecidos(): string[] {
  return IDIOMAS_DA_INTERFACE.map((l) => toBcp47(l) || l);
}
