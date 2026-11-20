/**
 * LIGA AS PEÇAS À SESSÃO ABERTA do `AvatarCanvas`, sem pôr `three` no arranque: este módulo é leve (só tipos) e
 * carrega `pecas3d.ts` (a porta de `three`) por `import()` quando há peça para mostrar. O `AvatarCanvas` chama
 * `aplicarPecasNaSessao` em UMA linha; sem a prop `pecas`, nada é carregado.
 *
 * Devolve a função de limpeza (para o `useEffect`). O relatório (o que foi montado, o que foi cortado e por quê)
 * vai para `aoRelatorio`, que o Estúdio e o harness usam.
 */
import type { TierDoAvatar } from '../../core/avatar/tiers';
import type { SessaoDeAvatar } from './motor';
import type { ConfigDePecas, PecasMontadas, RelatorioDePecas } from './pecas3d';

export interface PecasDoAvatar {
  /** Ids na ordem da receita. */
  ids: readonly string[];
  cores?: Readonly<Record<string, string>>;
}

const porSessao = new WeakMap<SessaoDeAvatar, Promise<PecasMontadas>>();

export function aplicarPecasNaSessao(
  sessao: SessaoDeAvatar | null,
  pecas: PecasDoAvatar | undefined,
  tier: TierDoAvatar,
  redesenhar: () => void,
  aoRelatorio?: (r: RelatorioDePecas) => void,
): () => void {
  if (!sessao) return () => undefined;
  const existente = porSessao.get(sessao);
  if (!existente && (!pecas || pecas.ids.length === 0)) return () => undefined;
  const pronto = existente ?? import('./pecas3d').then(({ criarPecas }) => criarPecas(sessao.avatar.vrm));
  porSessao.set(sessao, pronto);
  const config: ConfigDePecas = { ids: pecas?.ids ?? [], cores: pecas?.cores, tier };
  let ativo = true;
  void pronto.then((m) => {
    if (!ativo) return;
    aoRelatorio?.(m.atualizar(config));
    redesenhar();
  });
  return () => {
    ativo = false;
  };
}

/** Libera as peças da sessão. A sessão fechada já liberou a GPU; isto solta geometria e material do JS. */
export function liberarPecasDaSessao(sessao: SessaoDeAvatar | null): void {
  if (!sessao) return;
  const p = porSessao.get(sessao);
  porSessao.delete(sessao);
  void p?.then((m) => m.dispose());
}
