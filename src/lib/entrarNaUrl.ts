/**
 * O ATALHO DO SITE PARA O LOGIN (`/app?entrar=login` e `/app?entrar=signup`).
 *
 * O cabeçalho do site público (`scripts/site/layout.ts`) leva "Entrar" e "Criar conta" direto à porta do
 * app. O `App` lê o parâmetro UMA vez, tira-o da barra (`replaceState`, sem entrada nova de histórico) e
 * pede a porta no modo certo (`setPedindoLogin`). Assim recarregar a tela, o "voltar" e a intenção guardada
 * para depois do login não carregam o atalho de novo.
 *
 * É só um atalho: valor fora de `login`/`signup` é ignorado (e também sai da barra), e onde não há porta
 * (self-host, edição estática, quem já tem conta) o `App` só limpa a URL.
 */
import { estadoDeIdentidade } from './identidade';
import { type ModoDeEntrada, semContaComPorta } from './pedirConta';

export const PARAMETRO_ENTRAR = 'entrar';

/** O modo pedido pela URL (sem efeito colateral). */
export function lerEntrarDaUrl(search: string): ModoDeEntrada | null {
  const v = new URLSearchParams(search).get(PARAMETRO_ENTRAR);
  return v === 'login' || v === 'signup' ? v : null;
}

/** Lê o modo e tira o parâmetro da barra, mantendo o caminho, os outros parâmetros e o `#`. */
export function tirarEntrarDaUrl(): ModoDeEntrada | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAMETRO_ENTRAR)) return null;
    const modo = lerEntrarDaUrl(url.search);
    url.searchParams.delete(PARAMETRO_ENTRAR);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    return modo;
  } catch {
    return null;
  }
}

/**
 * O que o `App` faz com o atalho: espera a identidade resolver (sessão guardada ainda carregando), tira o
 * parâmetro da barra e só pede a porta a quem está sem conta num app que tem conta (`semContaComPorta`).
 * No self-host, na edição estática e com sessão, o parâmetro só sai da URL. Devolve o modo aplicado.
 */
export function aplicarEntrarDaUrl(pedirPorta: (modo: ModoDeEntrada) => void): ModoDeEntrada | null {
  if (estadoDeIdentidade() === 'carregando') return null;
  const modo = tirarEntrarDaUrl();
  if (!modo || !semContaComPorta()) return null;
  pedirPorta(modo);
  return modo;
}
