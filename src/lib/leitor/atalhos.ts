/**
 * OS ATALHOS DO TRECHO SELECIONADO (openspec `leitura-assistida`, fatia B): T traduz, V lê em voz alta, C copia, A ajusta o nível.
 * Só valem com um trecho selecionado e NUNCA com o foco num campo de texto (a pessoa digitando uma nota não dispara nada).
 */
export type AcaoDoAtalho = 'traduzir' | 'ler' | 'copiar' | 'ajustar';

export interface TeclaDoAtalho {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
}

const POR_TECLA: Record<string, AcaoDoAtalho> = { t: 'traduzir', v: 'ler', c: 'copiar', a: 'ajustar' };

export function acaoDoAtalho(
  e: TeclaDoAtalho,
  contexto: { temTrecho: boolean; emCampo: boolean; ajustarDisponivel?: boolean },
): AcaoDoAtalho | null {
  if (!contexto.temTrecho || contexto.emCampo) return null;
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  const acao = POR_TECLA[e.key.toLowerCase()];
  if (!acao) return null;
  if (acao === 'ajustar' && !contexto.ajustarDisponivel) return null;
  return acao;
}
