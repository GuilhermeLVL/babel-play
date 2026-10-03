import { ehAdmin } from './admin';
import { usePerfil } from './usePerfil';

/**
 * A pessoa logada tem papel admin? Lê o perfil que o shell já carregou (`GET /api/me` devolve `role`,
 * e `usePerfil` o guarda em um store de módulo) — não faz requisição nova. Serve ao item de menu e a
 * `/admin`. É só apresentação: as rotas de administração recusam quem não é admin (403).
 */
export function useEhAdmin(): boolean {
  const { perfil } = usePerfil();
  return ehAdmin(perfil);
}
