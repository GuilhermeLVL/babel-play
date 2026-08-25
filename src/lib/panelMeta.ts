// Rótulos legíveis de cada tela e de cada painel editável.
// Fonte única compartilhada pelo LayoutStudio e pela barra de edição na tela.
// Mantenha em sincronia com `AppLayoutConfig` em `layoutStore.ts`.

export const VIEWS_LABELS: Record<string, string> = {
  hub: 'Tela Inicial (Início)',
  capture: 'Captura & Gravação de Áudio',
  library: 'Biblioteca de Mídia & Docs',
  analysis: 'Análise de Sessão',
  reading: 'Leitura & Notas (Leitor)',
  study: 'Estudo & Exercícios (SRS)',
  metrics: 'Meu Vocabulário & Métricas'
};

export const PANEL_TITLES: Record<string, string> = {
  // Captura
  diarization: 'Falantes',
  vocabAnalyst: 'Analista de Vocabulário',
  liveTranscript: 'Transcrição Ao Vivo',
  // Análise
  overview: 'Visão Geral & Métricas',
  transcript: 'Transcrição Integrada',
  // Leitura
  interactiveArea: 'Área do Texto e Sentenças',
  notesSidebar: 'Sidebar de Notas & Tutor',
  // Início
  quickActions: 'Ações Rápidas (Importação)',
  statsDashboard: 'Métricas Rápidas',
  recentRecordings: 'Sessões Recentes',
  // Biblioteca
  filters: 'Filtros e Busca',
  gridList: 'Grade de Gravações',
  // Métricas
  header: 'Cabeçalho de Telemetria'
};
