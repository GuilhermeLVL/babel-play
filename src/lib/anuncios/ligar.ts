/**
 * LIGA O PROVEDOR REAL DE ANÚNCIOS, SE O BUILD O TEM (ruling R32).
 *
 * Só com `VITE_ANUNCIOS_ORIGEM` (a origem da página de anúncios, `https://…`) e `VITE_ANUNCIOS_REDE_CONTA`
 * (o código da rede no Ad Manager, só dígitos) no build. Sem as duas, nada é carregado: nem o módulo do
 * provedor nem o CSS. Com as duas, registrar o provedor ainda não mostra nada — os espaços continuam
 * perguntando à política (flag, plano, perfil, consentimento…), e a CSP do app só abre o quadro com a
 * flag ligada.
 *
 * A DEMONSTRAÇÃO (`components/anuncios/demonstracao/ligar.ts`) continua só em desenvolvimento e não troca
 * um provedor que já esteja registrado (nem este a troca).
 */
import { provedorDeAnuncios, registrarProvedorDeAnuncios } from './provedor';

const env: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** A configuração do provedor real lida do build, ou `null` (o estado de fábrica). */
export function configDosAnuncios(
  e: Record<string, string | undefined> = env,
): { origem: string; rede: string } | null {
  const rede = e.VITE_ANUNCIOS_REDE_CONTA?.trim() ?? '';
  if (!/^[0-9]{1,20}$/.test(rede)) return null;
  try {
    const u = new URL(e.VITE_ANUNCIOS_ORIGEM?.trim() ?? '');
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return { origem: u.origin, rede };
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
