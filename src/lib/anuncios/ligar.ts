/**
 * LIGA O PROVEDOR REAL DE ANÚNCIOS, SE O BUILD O TEM (rulings R32 e R35).
 *
 * Só com `VITE_ANUNCIOS_ORIGEM` (a origem do Worker de anúncios `frasy-anuncios`, `https://…`) no build, e
 * só quando ela NÃO é a origem do próprio app (R35: a página de anúncios nunca roda na origem do app;
 * igual = falha fechada). Sem ela, nada é carregado: nem o módulo do provedor nem o CSS. Quem chama
 * (`EspacoDeAnuncio`) só chama com a flag `anuncios` ligada. Registrar o provedor ainda não mostra nada:
 * os espaços continuam perguntando à política (flag, plano, perfil, consentimento…), e a CSP do app só
 * abre o quadro com a flag ligada. O código da rede (`VITE_ANUNCIOS_REDE_CONTA`) é do build da página
 * de anúncios (`scripts/anuncios/build.mjs`), não do app.
 *
 * A DEMONSTRAÇÃO (`components/anuncios/demonstracao/ligar.ts`) continua só em desenvolvimento e não troca
 * um provedor que já esteja registrado (nem este a troca).
 */
import { provedorDeAnuncios, registrarProvedorDeAnuncios } from './provedor';

const env: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const origemDoApp = () => (typeof window !== 'undefined' ? window.location.origin : null);

/** A configuração do provedor real lida do build, ou `null` (o estado de fábrica). */
export function configDosAnuncios(
  e: Record<string, string | undefined> = env,
  app: string | null = origemDoApp(),
): { origem: string } | null {
  try {
    const u = new URL(e.VITE_ANUNCIOS_ORIGEM?.trim() ?? '');
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    if (u.origin === app) return null;
    return { origem: u.origin };
  } catch {
    return null;
  }
}

let ligando: Promise<boolean> | null = null;

/** Registra o provedor real uma vez. Devolve se ele ficou registrado. */
export function ligarProvedorDeAnuncios(): Promise<boolean> {
  const cfg = configDosAnuncios();
  if (!cfg) return Promise.resolve(false);
  ligando ??= import('./provedores/iframe').then(({ criarProvedorPorIframe }) => {
    if (!provedorDeAnuncios()) registrarProvedorDeAnuncios(criarProvedorPorIframe(cfg));
    return provedorDeAnuncios()?.id === 'iframe';
  });
  return ligando;
}
