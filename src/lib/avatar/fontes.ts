/**
 * DE ONDE VEM O ARQUIVO DE UMA RECEITA. Leve de propósito (sem `three`): o componente importa isto de forma
 * estática; só o motor pesado é carregado por `import()`.
 *
 *  · `colecao`: a coleção curada num bucket (`VITE_AVATARES_URL`, a CSP libera a origem em `connect-src`);
 *    sem a variável, do PRÓPRIO domínio em `/avatares/colecao/<id>.vrm` (`public/avatares/colecao/`, que vai no
 *    `dist`; ver o `LICENSES.md` de lá). `public/avatares/dev/` é só dos testes do harness e não vai ao `dist`;
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

/** A URL do modelo da coleção: `<VITE_AVATARES_URL>/colecao/<id>.vrm` com bucket, senão `/avatares/colecao/<id>.vrm`. */
export const urlDoModeloDaColecao = (id: string): string => `${baseDosAvatares()}/colecao/${id}.vrm`;

export async function fonteDaReceita(receita: ReceitaDeAvatar): Promise<FonteDoAvatar | null> {
  const { origem, id } = receita.base;
  if (origem === 'colecao') return urlDoModeloDaColecao(id);
  if (origem === 'familia') return `${baseDosAvatares()}/familia/${id}.glb`;
  return lerModeloImportado(id);
}
