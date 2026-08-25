import type { ReactNode } from 'react';

/**
 * SEGMENTADO — uma linha de opções mutuamente exclusivas (ou não), com contagem.
 *
 * O DEFEITO QUE ISTO CONSERTA. O app tinha quatro linhas de chip escritas à mão — dificuldade e
 * foco na antessala, fonte no lobby, tipo de gravação no Hub, nível na trilha — e as quatro
 * divergiram em coisas que importam:
 *
 *  - só a antessala desabilitava o chip vazio COM O MOTIVO no `title`; as outras deixavam o chip
 *    clicável e o clique não fazia nada, que é o pior dos dois mundos;
 *  - só a antessala marcava `aria-pressed`, então nas outras o leitor de tela não dizia qual estava
 *    selecionado;
 *  - a linha do Hub usava `bg-ink text-ink-contrast` e a da antessala usava `.kpi-pill.active`, com
 *    resultados visualmente diferentes para a mesma ideia de "este está ligado".
 *
 * A REGRA QUE ESTE COMPONENTE IMPÕE: **opção sem itens não fica clicável, e diz por quê.** Botão
 * que falha ao ser clicado ensina que a tela mente; botão desabilitado com motivo ensina o estado
 * do acervo. Essa era a decisão certa que só a antessala tinha, e agora é a de todos.
 *
 * `multiplo` existe porque a linha de dificuldade é genuinamente multi-seleção (Fácil+Médio é um
 * recorte válido) enquanto fonte e nível são exclusivos. Em multi-seleção o papel ARIA correto é
 * um grupo de `aria-pressed`, não `radiogroup` — daí a distinção não ser cosmética.
 */

export type TomDeOpcao = 'accent' | 'good' | 'warn' | 'rare' | 'error' | 'ink';

export interface OpcaoSegmentada {
  id: string;
  rotulo: string;
  icone?: ReactNode;
  /** Contagem à direita do rótulo. `0` aparece — é justamente a informação que trava o chip. */
  contagem?: number;
  /** Cor quando ativa. Sem isto, usa `accent`. Só o Hub diferencia por tipo de mídia. */
  tom?: TomDeOpcao;
  /**
   * Quando presente, a opção fica DESABILITADA e este texto vira o `title`. É obrigatório por tipo:
   * desabilitar sem dizer por quê foi o defeito original.
   */
  motivoBloqueio?: string;
  /** Dica exibida quando a opção está disponível (ex.: "200 disponíveis"). */
  dica?: string;
}

interface SegmentadoProps {
  opcoes: OpcaoSegmentada[];
  /** Em `multiplo`, todos os ids ligados. Em exclusivo, o id ligado (ou `[]`). */
  valor: readonly string[];
  aoTrocar: (id: string) => void;
  multiplo?: boolean;
  /** Rótulo curto à esquerda da linha ("nível", "foco", "jogar com"). */
  rotulo?: string;
  /** Descreve o grupo para quem não vê a tela. Obrigatório: uma linha de chips sem nome é um enigma. */
  rotuloDoGrupo: string;
  variante?: 'pilula' | 'chip';
  className?: string;
}

/** Ativo por tom, na variante `chip`. Sempre `-soft` de fundo com `-ink` de texto — nunca a cor
 *  cheia com `text-*`, que foi o que dava 1,68:1 no mochi claro (ver `index.css`). */
const ATIVO_CHIP: Record<TomDeOpcao, string> = {
  accent: 'bg-accent-soft text-accent-ink border-accent/30',
  good: 'bg-good-soft text-good-ink border-good/30',
  warn: 'bg-warn-soft text-warn-ink border-warn/30',
  rare: 'bg-rare-soft text-rare-ink border-rare/30',
  error: 'bg-error-soft text-error-ink border-error/30',
  ink: 'bg-ink text-ink-contrast border-ink shadow-sm',
};

export default function Segmentado({
  opcoes,
  valor,
  aoTrocar,
  multiplo = false,
  rotulo,
  rotuloDoGrupo,
  variante = 'pilula',
  className = '',
}: SegmentadoProps) {
  return (
    <div
      role={multiplo ? 'group' : 'radiogroup'}
      aria-label={rotuloDoGrupo}
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {rotulo && <span className="label-mono">{rotulo}</span>}

      {opcoes.map((o) => {
        const ativo = valor.includes(o.id);
        const bloqueada = !!o.motivoBloqueio;

        const estilo = variante === 'pilula'
          ? `kpi-pill ${ativo ? 'active' : ''} ${bloqueada ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`
          : `px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 ${
            bloqueada
              ? 'opacity-40 cursor-not-allowed bg-surface text-ink-muted border-border-subtle'
              : ativo
                ? `cursor-pointer ${ATIVO_CHIP[o.tom ?? 'accent']}`
                : 'cursor-pointer bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
          }`;

        return (
          <button
            key={o.id}
            type="button"
            disabled={bloqueada}
            onClick={() => aoTrocar(o.id)}
            // Em multi-seleção o estado é `aria-pressed`; em exclusivo é `aria-checked` num radio.
            {...(multiplo
              ? { 'aria-pressed': ativo }
              : { role: 'radio' as const, 'aria-checked': ativo })}
            title={o.motivoBloqueio ?? o.dica}
            className={`${estilo} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
          >
            {o.icone}
            <span>{o.rotulo}</span>
            {/* Sem `opacity-70` — mesma correção que `Abas` levou, pelo mesmo motivo: a contagem já
                herda o tom apagado do botão não selecionado, e a opacidade compunha por cima,
                derrubando o par de 5,57:1 para 3,23:1 no tema vercel escuro. Medido em axe
                color-contrast, nas rotas desktop__jogar e mobile__jogar. */}
            {o.contagem !== undefined && (
              <span className="tabular-nums">{o.contagem}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
