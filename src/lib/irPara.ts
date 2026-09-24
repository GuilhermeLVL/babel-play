import { type EstadoDeRota, estadoParaUrl } from './rotas';

/**
 * Navega para uma tela sem prop do App: a navegação escuta a URL (`popstate` em
 * `lib/estado/useNavegacao`), o mesmo caminho que Planos usa para levar a Ajustes.
 */
export function irPara(e: EstadoDeRota): void {
  window.history.pushState({}, '', estadoParaUrl(e));
  window.dispatchEvent(new PopStateEvent('popstate'));
}
