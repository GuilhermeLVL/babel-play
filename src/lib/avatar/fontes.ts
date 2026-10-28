/**
 * DE ONDE VEM O ARQUIVO DE UMA RECEITA. Leve de propósito (sem `three`): o componente importa isto de forma
 * estática; só o motor pesado é carregado por `import()`.
 *
 *  · `colecao`: a coleção curada num bucket (`VITE_AVATARES_URL`, a CSP libera a origem em `connect-src`);
 *    sem a variável, do PRÓPRIO domínio em `/avatares/colecao/<id>.vrm` (e, em desenvolvimento, de
 *    `/avatares/dev/<id>.vrm`, os modelos de teste CC0 que não vão para o `dist`);
 *  · `familia`: os modelos da família Frasy, em `<base>/familia/<id>.glb`;
 *  · `importado`: o arquivo que a pessoa trouxe, só no IndexedDB deste aparelho.
 */
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import { lerModeloImportado } from './armazem';
import type { FonteDoAvatar } from './carregador';

export function baseDosAvatares(): string {
  const v = (import.meta.env?.VITE_AVATARES_URL as string | undefined)?.trim().replace(/\/+$/, '');
  return v || '/avatares';
}

/** Há bucket configurado? Sem ele, só o desenvolvimento tem os modelos (`public/avatares/dev/`, fora do `dist`). */
const temBucket = () => !!(import.meta.env?.VITE_AVATARES_URL as string | undefined)?.trim();

export async function fonteDaReceita(receita: ReceitaDeAvatar): Promise<FonteDoAvatar | null> {
  const { origem, id } = receita.base;
  if (origem === 'colecao') {
    if (!temBucket() && import.meta.env?.DEV) return `/avatares/dev/${id}.vrm`;
    return `${baseDosAvatares()}/colecao/${id}.vrm`;
  }
  if (origem === 'familia') return `${baseDosAvatares()}/familia/${id}.glb`;
  return lerModeloImportado(id);
}
