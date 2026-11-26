/**
 * "LEGENDAR AGORA": o que encurta o caminho até a primeira legenda do som da aba/tela.
 *
 * O seletor do navegador é OBRIGATÓRIO (nenhuma página escolhe a aba por quem assiste; a extensão
 * `extensao/` é o único jeito de pular isso). O que a página pode fazer é entregar o seletor
 * PRÉ-ARRUMADO, com as dicas do `getDisplayMedia`:
 *
 *   - `systemAudio: 'include'` e `surfaceSwitching: 'include'`: já oferecem o áudio e a troca de aba;
 *   - `selfBrowserSurface: 'exclude'`: tira a aba do próprio Frasy (eco certo, e uma linha a menos);
 *   - `video.displaySurface`: a ABA vem pré-selecionada quando foi o que a pessoa usou da última vez
 *     (uma dica, não uma exigência: o navegador nunca recusa por causa dela);
 *   - `preferCurrentTab` NUNCA: ele compartilharia a aba do Frasy, que é o contrário do que se quer
 *     (legendar OUTRA aba) e conflita com `selfBrowserSurface`.
 *
 * A detecção de suporte usa `getSupportedConstraints()` para o que ele sabe responder
 * (`displaySurface`); as demais chaves são membros de dicionário que um navegador sem suporte ignora.
 * Puro, exceto a memória em `localStorage` (sempre em try/catch: sem armazenamento = sem memória).
 */

export type SuperficieLembrada = 'browser' | 'window' | 'monitor';

const CHAVE = 'babel.captura.ultimaSuperficie';

/** Grava o que a pessoa compartilhou da última vez (e que ela já legendou o som do sistema uma vez). */
export function lembrarSuperficie(s: string | undefined | null): void {
  if (s !== 'browser' && s !== 'window' && s !== 'monitor') return;
  try {
    localStorage.setItem(CHAVE, s);
  } catch {
    /* modo privado / armazenamento bloqueado: segue sem memória */
  }
}

export function superficieLembrada(): SuperficieLembrada | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'browser' || v === 'window' || v === 'monitor' ? v : null;
  } catch {
    return null;
  }
}

/** A pessoa já legendou o som do computador neste navegador: o "Legendar agora" faz sentido. */
export const jaLegendouOSistema = (): boolean => superficieLembrada() !== null;

export interface EntradaDasDicas {
  /** `navigator.mediaDevices.getSupportedConstraints()`, quando existe. */
  suportadas?: Record<string, unknown> | null;
  /** A superfície da última sessão; `null` = primeira vez. */
  ultima: SuperficieLembrada | null;
}

export interface DicasDoSeletor {
  video: { displaySurface?: SuperficieLembrada };
  topo: {
    systemAudio: 'include';
    selfBrowserSurface: 'exclude';
    surfaceSwitching: 'include';
    monitorTypeSurfaces: 'include';
  };
}

/**
 * As dicas do seletor. A ABA é a superfície padrão quando não há memória (legendar um vídeo numa aba é o
 * caso comum, e é a única que sempre traz áudio); com memória, a de antes.
 */
export function dicasDoSeletor({ suportadas, ultima }: EntradaDasDicas): DicasDoSeletor {
  const video: DicasDoSeletor['video'] = {};
  if (suportadas?.displaySurface === true) video.displaySurface = ultima ?? 'browser';
  return {
    video,
    topo: {
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include',
    },
  };
}

export interface EntradaDoBotao {
  capturaDoSistema: boolean;
  gravando: boolean;
  abrindo: boolean;
  jaLegendou: boolean;
}

/** O botão "Legendar agora" aparece para quem já usou uma vez, onde há som do computador a capturar. */
export const podeLegendarAgora = (e: EntradaDoBotao): boolean =>
  e.capturaDoSistema && e.jaLegendou && !e.gravando && !e.abrindo;

const CHAVE_DOWNLOAD = 'babel.captura.downloadConfirmado';

/**
 * "BAIXAR E INICIAR" JÁ RESPONDIDO. A confirmação do download valia só até a tela fechar; quem já disse
 * "sim" no computador e voltava à captura via a mesma pergunta (se o download não terminou, ou o cache
 * foi limpo). A lembrança vale só onde a pergunta é por tamanho (o limite do desktop, não o "sempre
 * pergunta" da economia de dados ou da rede lenta) e é do aparelho: nada vai ao servidor.
 */
export function lembrarDownloadConfirmado(): void {
  try {
    localStorage.setItem(CHAVE_DOWNLOAD, '1');
  } catch {
    /* sem armazenamento: a pergunta volta, como antes */
  }
}

export function downloadConfirmadoAntes(): boolean {
  try {
    return localStorage.getItem(CHAVE_DOWNLOAD) === '1';
  } catch {
    return false;
  }
}
