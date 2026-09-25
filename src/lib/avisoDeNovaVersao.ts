/**
 * O AVISO DE "NOVA VERSÃO DISPONÍVEL" (P0-7b).
 *
 * UM EVENTO DE JANELA, e não uma chamada direta ao `toast`, porque quem detecta é o `apiFetch` —
 * a folha da camada de dados (`src/data/funil.ts`), que não pode puxar componente de interface
 * sem criar ciclo de importação (o `madge` é portão de CI). O funil só anuncia; quem mostra é o
 * ouvinte ligado uma vez no `main.tsx`, que usa o canal de avisos que já existe
 * (`components/Toast.tsx`).
 *
 * O aviso é `info`, fica até ser dispensado ou usado (sumir sozinho em 2,6 s seria perder a única
 * chance de ver), e não bloqueia nada: a ação "Atualizar" recarrega a página, que baixa o
 * `index.html` novo (ele é `no-cache`, ver `server/http/estaticos.ts`) e com ele os chunks novos.
 */
import { t } from './i18n';

export const EVENTO_NOVA_VERSAO = 'babel:nova-versao';

/** Anuncia que o servidor já está noutra versão. Chamado pela conferência de `lib/versao.ts`. */
export function avisarNovaVersao(versao: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_NOVA_VERSAO, { detail: { versao } }));
}

export interface AvisoDeVersao {
  mensagem: string;
  rotuloDaAcao: string;
  aoAtualizar: () => void;
}

/**
 * Liga o ouvinte. `mostrar` e `recarregar` são injetáveis para o teste; no app, `mostrar` é o
 * `toast.info` e `recarregar` é o `location.reload`. Devolve a função que desliga.
 */
export function ligarAvisoDeNovaVersao(
  mostrar: (aviso: AvisoDeVersao) => void,
  recarregar: () => void = () => window.location.reload(),
): () => void {
  const ouvir = () =>
    mostrar({
      mensagem: t('Nova versão disponível'),
      rotuloDaAcao: t('Atualizar'),
      aoAtualizar: recarregar,
    });
  window.addEventListener(EVENTO_NOVA_VERSAO, ouvir);
  return () => window.removeEventListener(EVENTO_NOVA_VERSAO, ouvir);
}
