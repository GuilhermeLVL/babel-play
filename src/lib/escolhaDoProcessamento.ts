/**
 * APARELHO × NUVEM — a escolha de "Onde as contas rodam", num lugar só.
 *
 * Quem grava: a aba Processamento dos Ajustes (`AiEnginePanel`) e o painel de processamento da Captura
 * (`PainelDeProcessamento`). Os dois chamam ESTAS funções, para que a mesma escolha nunca grave coisas
 * diferentes conforme a tela: aparelho = perfil `free-web` (ou `local-private`, com a IA do computador);
 * nuvem = perfil `cloud-quality` com a chave cadastrada. A chave anterior fica lembrada no servidor
 * (`credencialDaNuvem`): voltar para a nuvem depois não pede de novo.
 *
 * Sem chave, `escolherNuvem` não muda nada e diz `sem-chave`: quem chama decide o que fazer (a aba dos
 * Ajustes abre o formulário da chave; a Captura fica com a nuvem do plano, que não precisa de chave).
 */
import { fetchSettings, patchUiSettings } from '../data/api';
import { CREDENTIAL_KEY, setProviderChoice } from '../gateway/activeProfile';

export type PerfilDoAparelho = 'free-web' | 'local-private';

/** A chave guardada neste navegador. */
export function lerCredencial(): string | null {
  try {
    return localStorage.getItem(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

/** A chave lembrada no servidor, quando o navegador não a tem. */
async function credencialDoServidor(): Promise<string | null> {
  const s = await fetchSettings();
  try {
    const ui = s?.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {};
    return (ui.credencialDaNuvem as string | undefined) ?? (ui.credentialId as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Rodar no aparelho. Devolve se o servidor gravou (a escolha local vale de qualquer jeito). */
export async function escolherAparelho(perfil: PerfilDoAparelho = 'free-web'): Promise<boolean> {
  const cred = lerCredencial();
  setProviderChoice({ mode: 'local', profileId: perfil });
  const salvo = await patchUiSettings({
    providerMode: 'local',
    credentialId: null,
    ...(cred ? { credencialDaNuvem: cred } : {}),
  });
  return !!salvo;
}

/** Usar a nuvem com esta chave. Devolve se o servidor gravou. */
export async function usarNuvemComChave(credentialId: string): Promise<boolean> {
  setProviderChoice({ mode: 'cloud', profileId: 'cloud-quality', credentialId });
  const salvo = await patchUiSettings({ providerMode: 'cloud', credentialId, credencialDaNuvem: credentialId });
  return !!salvo;
}

export type ResultadoDaNuvem = 'ok' | 'sem-chave' | 'falhou';

/** Usar a nuvem com a chave já cadastrada (deste navegador ou lembrada no servidor). */
export async function escolherNuvem(): Promise<ResultadoDaNuvem> {
  const cred = lerCredencial() ?? (await credencialDoServidor());
  if (!cred) return 'sem-chave';
  return (await usarNuvemComChave(cred)) ? 'ok' : 'falhou';
}
