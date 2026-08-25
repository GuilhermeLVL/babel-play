import { ThemeType } from './appearance';

export interface PanelConfig {
  show: boolean;
  widthPercent: number; // ex.: 30 = 30% da largura do container
  heightPx: number; // piso de altura (min-height); 0 = automático
  /** Override de tema SÓ deste painel (mescla). Ausente = herda o tema global. */
  theme?: ThemeType;
}

interface ViewLayoutConfig {
  [panelKey: string]: PanelConfig;
}

/**
 * Painéis editáveis, por tela.
 *
 * INVARIANTE: cada chave aqui corresponde a um `<EditablePanel viewKey panelKey>`
 * realmente renderizado. O Studio lista esta config, então uma chave sem painel
 * vira um controle que não faz nada — o usuário oculta e a tela não muda.
 * Ao adicionar um `EditablePanel`, registre-o aqui E em `panelMeta.ts`.
 *
 * `vocabAnalyst` (Analista de Vocabulário) existe em TODAS as telas com conteúdo. Nele,
 * `show` significa "painel HABILITADO nesta tela" — a visibilidade real é condicional à
 * palavra selecionada (`<VocabularyPanel/>` não monta sem `word`). Por isso o default é
 * `show: true`: o painel fica oculto até o usuário clicar numa palavra, sem precisar
 * mexer no layout persistido a cada clique.
 */
export interface AppLayoutConfig {
  capture: {
    diarization: PanelConfig;
    vocabAnalyst: PanelConfig;
    liveTranscript: PanelConfig;
  };
  analysis: {
    overview: PanelConfig;
    transcript: PanelConfig;
    vocabAnalyst: PanelConfig;
  };
  reading: {
    interactiveArea: PanelConfig;
    notesSidebar: PanelConfig;
    vocabAnalyst: PanelConfig;
  };
  study: {
    vocabAnalyst: PanelConfig;
  };
  hub: {
    quickActions: PanelConfig;
    statsDashboard: PanelConfig;
    recentRecordings: PanelConfig;
  };
  library: {
    filters: PanelConfig;
    gridList: PanelConfig;
  };
  metrics: {
    header: PanelConfig;
    vocabAnalyst: PanelConfig;
  };
}

export const DEFAULT_LAYOUT_CONFIG: AppLayoutConfig = {
  capture: {
    diarization: { show: true, widthPercent: 40, heightPx: 380 },
    vocabAnalyst: { show: true, widthPercent: 28, heightPx: 480 },
    liveTranscript: { show: true, widthPercent: 100, heightPx: 280 }
  },
  analysis: {
    overview: { show: true, widthPercent: 100, heightPx: 600 },
    transcript: { show: true, widthPercent: 65, heightPx: 550 },
    vocabAnalyst: { show: true, widthPercent: 35, heightPx: 550 }
  },
  reading: {
    interactiveArea: { show: true, widthPercent: 65, heightPx: 600 },
    notesSidebar: { show: false, widthPercent: 35, heightPx: 600 },
    vocabAnalyst: { show: true, widthPercent: 35, heightPx: 0 }
  },
  study: {
    vocabAnalyst: { show: true, widthPercent: 35, heightPx: 0 }
  },
  hub: {
    quickActions: { show: true, widthPercent: 100, heightPx: 140 },
    statsDashboard: { show: true, widthPercent: 100, heightPx: 200 },
    recentRecordings: { show: true, widthPercent: 100, heightPx: 320 }
  },
  library: {
    filters: { show: true, widthPercent: 100, heightPx: 80 },
    gridList: { show: true, widthPercent: 100, heightPx: 450 }
  },
  metrics: {
    header: { show: true, widthPercent: 100, heightPx: 100 },
    vocabAnalyst: { show: true, widthPercent: 35, heightPx: 0 }
  }
};

/**
 * Layout adaptativo: gera uma disposição adequada à janela atual, evitando
 * barras de rolagem duplas e colunas espremidas.
 */
export function getIntelligentLayout(width: number, height: number): AppLayoutConfig {
  const config = JSON.parse(JSON.stringify(DEFAULT_LAYOUT_CONFIG)) as AppLayoutConfig;

  if (width < 1024) {
    // Celular / tablet retrato: uma coluna só, painéis secundários ocultos.
    config.capture.diarization.show = true;
    config.capture.diarization.widthPercent = 100;
    config.capture.diarization.heightPx = 280;
    config.capture.vocabAnalyst.show = false; // prioriza a transcrição na captura
    config.capture.liveTranscript.heightPx = 220;

    config.analysis.transcript.widthPercent = 100;
    config.analysis.transcript.heightPx = 400;
    config.analysis.vocabAnalyst.show = false;

    config.reading.interactiveArea.widthPercent = 100;
    config.reading.interactiveArea.heightPx = 450;
    config.reading.notesSidebar.show = false;
    config.reading.vocabAnalyst.show = false;
    config.study.vocabAnalyst.show = false;
    config.metrics.vocabAnalyst.show = false;

    config.hub.statsDashboard.heightPx = 160;
    config.hub.recentRecordings.heightPx = 280;

    config.library.gridList.heightPx = 350;
  } else if (width < 1440) {
    // Notebook / desktop padrão: divisões lado a lado, alturas contidas na viewport.
    const usableHeight = height - 160; // desconta cabeçalho/sidebar aproximados

    config.capture.diarization.widthPercent = 45;
    config.capture.diarization.heightPx = Math.min(320, usableHeight * 0.4);
    config.capture.vocabAnalyst.widthPercent = 28;
    config.capture.vocabAnalyst.heightPx = Math.min(320, usableHeight * 0.4);
    config.capture.liveTranscript.heightPx = Math.min(260, usableHeight * 0.45);

    config.analysis.transcript.widthPercent = 60;
    config.analysis.transcript.heightPx = Math.max(400, usableHeight - 120);
    config.analysis.vocabAnalyst.widthPercent = 40;
    config.analysis.vocabAnalyst.heightPx = Math.max(400, usableHeight - 120);

    config.reading.interactiveArea.widthPercent = 60;
    config.reading.interactiveArea.heightPx = Math.max(400, usableHeight - 100);
    config.reading.notesSidebar.widthPercent = 40;
    config.reading.notesSidebar.heightPx = Math.max(400, usableHeight - 100);
  } else {
    // Ultra-wide / alta resolução: aproveita o espaço vertical.
    const usableHeight = height - 180;

    config.capture.diarization.widthPercent = 35;
    config.capture.diarization.heightPx = Math.max(420, usableHeight * 0.45);
    config.capture.vocabAnalyst.widthPercent = 28;
    config.capture.vocabAnalyst.heightPx = Math.max(420, usableHeight * 0.45);
    config.capture.liveTranscript.heightPx = Math.max(340, usableHeight * 0.45);

    config.analysis.transcript.widthPercent = 65;
    config.analysis.transcript.heightPx = Math.max(580, usableHeight - 80);
    config.analysis.vocabAnalyst.widthPercent = 35;
    config.analysis.vocabAnalyst.heightPx = Math.max(580, usableHeight - 80);

    config.reading.interactiveArea.widthPercent = 65;
    config.reading.interactiveArea.heightPx = Math.max(620, usableHeight - 80);
    config.reading.notesSidebar.widthPercent = 35;
    config.reading.notesSidebar.heightPx = Math.max(620, usableHeight - 80);
  }

  return config;
}

// Chaves do localStorage. v4: o schema ganhou `theme?` por painel e perdeu os
// painéis que nunca eram renderizados (visionScan, metrics.*, study.*, …).
const STORAGE_KEY = 'babel_app_layout_config_v4';
const EDIT_MODE_KEY = 'babel_app_layout_edit_mode';

/**
 * Casa o que está salvo com o schema atual: adiciona telas/painéis novos com
 * seus defaults e DESCARTA chaves que não existem mais. Sem isto, um layout
 * salvo antigo faria o Studio listar painéis fantasmas e o `useLayout`
 * devolver `undefined` para painéis novos.
 */
function normalizeLayout(saved: unknown): AppLayoutConfig {
  const out = JSON.parse(JSON.stringify(DEFAULT_LAYOUT_CONFIG)) as AppLayoutConfig;
  if (!saved || typeof saved !== 'object') return out;

  for (const viewKey of Object.keys(out) as (keyof AppLayoutConfig)[]) {
    const savedView = (saved as Record<string, unknown>)[viewKey];
    if (!savedView || typeof savedView !== 'object') continue;
    const outView = out[viewKey] as unknown as ViewLayoutConfig;
    for (const panelKey of Object.keys(outView)) {
      const savedPanel = (savedView as Record<string, unknown>)[panelKey];
      if (savedPanel && typeof savedPanel === 'object') {
        outView[panelKey] = { ...outView[panelKey], ...(savedPanel as Partial<PanelConfig>) };
      }
    }
  }
  return out;
}

export function getSavedLayout(): AppLayoutConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeLayout(JSON.parse(saved));
  } catch (e) {
    console.error('Error reading saved layout', e);
  }
  return DEFAULT_LAYOUT_CONFIG;
}

export function saveLayout(config: AppLayoutConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    // Evento custom = o barramento de reatividade (sem context provider).
    window.dispatchEvent(new CustomEvent('babel_layout_changed', { detail: config }));
  } catch (e) {
    console.error('Error saving layout', e);
  }
}

export function resetLayout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('babel_layout_changed', { detail: DEFAULT_LAYOUT_CONFIG }));
  } catch (e) {
    console.error('Error resetting layout', e);
  }
}

export function isLayoutEditMode(): boolean {
  return localStorage.getItem(EDIT_MODE_KEY) === 'true';
}

export function setLayoutEditMode(active: boolean) {
  localStorage.setItem(EDIT_MODE_KEY, active ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('babel_layout_edit_mode_changed', { detail: active }));
}
