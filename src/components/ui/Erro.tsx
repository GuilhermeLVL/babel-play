import { AlertTriangle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * ERRO — a tela dizendo que NÃO SABE, em vez de fingir que sabe.
 *
 * O par de `Vazio`, e a distinção entre os dois é o ponto inteiro. `CatalogoDePalavras.tsx:113`
 * nomeou o defeito melhor do que qualquer paráfrase: "antes os três fetches faziam
 * `.catch(() => [])` e rede caída era indistinguível de baralho vazio".
 *
 * É a mesma família que `semConteudoFabricado.test.ts` e `contagemHonesta.test.ts` já perseguem,
 * só que pela porta dos fundos: em vez de INVENTAR um número, a tela inventa um ZERO. Para quem
 * está do outro lado, "Nenhuma palavra no deck ainda" com o wi-fi fora não é imprecisão — é o app
 * dizendo que o vocabulário sumiu. Um `Vazio` exibido no lugar de um `Erro` é conteúdo fabricado.
 *
 * Três coisas obrigatórias, e é por elas que este componente existe em vez de cada tela improvisar:
 *  1. `role="alert"` — sem isto o leitor de tela não anuncia nada e a pessoa espera um conteúdo
 *     que nunca vem;
 *  2. o `detalhe` técnico visível, porque é o que se cola no suporte;
 *  3. UMA PORTA DE SAÍDA (`aoTentarDeNovo`) — a regra de produto do projeto é que nada é beco sem
 *     saída. Só se omite quando não existe nada a refazer.
 *
 * Admissão nesta pasta (ver `index.ts`): nasce com dois consumidores reais — `Study.tsx`, onde a
 * falha de rede era apresentada como deck vazio, e `CatalogoDePalavras.tsx`, de onde o markup veio.
 */
interface ErroProps {
  /** O que falhou, em linguagem de gente. Ex.: "Não consegui carregar seu vocabulário." */
  titulo: string;
  /** A mensagem crua. Some da tela se não houver — melhor nada do que um "undefined". */
  detalhe?: ReactNode;
  aoTentarDeNovo?: () => void;
  className?: string;
}

export default function Erro({ titulo, detalhe, aoTentarDeNovo, className = '' }: ErroProps) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-error/30 bg-error-soft/10 p-3 text-[13px] ${className}`}
    >
      <div className="flex items-start gap-2 text-error font-semibold">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p>{titulo}</p>
          {detalhe ? (
            <p className="font-normal text-ink-muted text-[12px] mt-0.5">{detalhe}</p>
          ) : null}
        </div>
      </div>

      {aoTentarDeNovo && (
        <button
          type="button"
          onClick={aoTentarDeNovo}
          className="btn-solid mt-2 px-3 py-1.5 text-[12px] flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" aria-hidden /> Tentar de novo
        </button>
      )}
    </div>
  );
}
