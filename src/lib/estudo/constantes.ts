/**
 * AS CONSTANTES DA IA DE ESTUDO que a tela usa sem carregar o prompt (planos v4, etapa 2). O prompt do resumo
 * (`promptDoResumo.ts`) só chega ao servidor e ao corpo do resumo, que é carregado sob demanda.
 */

/** Abaixo disto a sessão é curta demais para resumir (400 `sessao_curta`; a tela nem mostra o resumo). */
export const MIN_FALAS_DO_RESUMO = 4;
