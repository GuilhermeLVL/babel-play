import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronRight, SlidersHorizontal as SlidersIcon } from 'lucide-react';
import Segmentado from '../ui/Segmentado';
import { numero, t, tp } from '../../lib/i18n';
import { empilharCamada } from '../../lib/camadasDeEscape';

/**
 * O SELETOR DE CONTEÚDO — três linhas de controle viradas uma, com uma gaveta atrás do «Trocar».
 *
 * O DEFEITO QUE ISTO CONSERTA. A tela de jogar tinha abas de fonte, chips de baralho e uma faixa de
 * recorte como três linhas que não se conheciam: mudar a fonte não atualizava o que os chips de
 * baralho contavam, e um chip podia acender sem que nada mudasse no jogo. Ver
 * `docs/prototipos/praticar-v2.html`, seção "JOGANDO COM" — o protótipo aprovado reduz isso a UMA
 * linha de resumo ("jogando com N palavras · fonte · idioma") com um botão «Trocar» que abre uma
 * gaveta com as facetas. Este componente é a versão em React dessa peça.
 *
 * A FUSÃO VISUAL É PROPOSITAL. No protótipo, `.fonte-linha.aberta` perde a borda inferior e os
 * cantos de baixo, e `.gaveta` não tem borda superior e só arredonda embaixo — as duas metades viram
 * uma peça só. Uma emenda visível entre resumo e gaveta foi o defeito original do protótipo (borda
 * dupla, cantos nos dois blocos), por isso as classes abaixo replicam a fusão em vez de duas caixas
 * separadas com `gap`.
 *
 * REUSO: cada faceta é um `Segmentado` — os chips com contagem, `aria-pressed` e motivo de bloqueio
 * já vivem lá (ver `ui/Segmentado.tsx`). Este componente não desenha chip nenhum, só monta a moldura
 * (resumo, gaveta, rodapé) ao redor da lista de facetas que a tela chamadora decide.
 */

export interface FacetaDoSeletor {
  /** Chave estável para o React e para o `aoTrocar`. */
  id: string;
  /** Rótulo curto, minúsculo: "de onde vêm", "quais baralhos", "recorte". */
  rotulo: string;
  /** Frase de apoio à direita do rótulo, ex.: "escolha uma ou várias — elas se somam". */
  ajuda?: string;
  opcoes: Array<{ id: string; rotulo: string; contagem?: number; motivoBloqueio?: string; icone?: ReactNode }>;
  valor: string[];
  aoTrocar: (idDaOpcao: string) => void;
  /**
   * Faceta de escolha ÚNICA (radiogroup) em vez de múltipla.
   *
   * Existe porque "de onde vêm" ainda é exclusiva nesta etapa: o filtro já sabe somar fontes, mas
   * a trilha tem tratamento próprio em vários pontos da tela, e ligar a soma junto com o
   * redesenho misturaria duas mudanças de comportamento numa só. A multi-seleção de fontes entra
   * com a distribuição por cota (`core/minigames/distribuicao.ts`, já pronta e testada).
   */
  exclusiva?: boolean;
}

export interface SeletorDeConteudoProps {
  /** Total do recorte — o número-verdade do qual a tela toda deriva. */
  total: number;
  /** Nome da fonte dominante ("4000 Essential English Words" ou "Curso de palavras"). */
  nomeDaFonte: string;
  idioma?: string;
  facetas: FacetaDoSeletor[];
  aberta: boolean;
  aoAlternar: () => void;
  aoLimpar: () => void;
  /** Mensagem de vazio útil, quando total === 0. Ex.: "nenhum item passa; desligue um recorte". */
  avisoDeVazio?: string;
  /**
   * Ações que TRAZEM ou GERENCIAM material (importar do Anki, abrir os baralhos), no rodapé.
   */
  acoes?: ReactNode;
  /**
   * Ações rápidas exibidas na barra de resumo (Recordes, Mapa, Curadoria, Diagnóstico).
   */
  acoesBarra?: ReactNode;
}

const ID_DA_GAVETA = 'seletor-de-conteudo-gaveta';

function SeletorDeConteudo({
  total,
  nomeDaFonte,
  idioma,
  facetas,
  aberta,
  aoAlternar,
  aoLimpar,
  avisoDeVazio,
  acoes,
  acoesBarra,
}: SeletorDeConteudoProps) {
  // Escape fecha, mas só enquanto a gaveta está aberta — do contrário este seletor roubaria o Esc
  // de outras camadas da tela (diálogos, tour) mesmo fechado.
  const aoAlternarRef = useRef(aoAlternar);
  aoAlternarRef.current = aoAlternar;
  useEffect(() => {
    if (!aberta) return;
    return empilharCamada(() => aoAlternarRef.current());
  }, [aberta]);

  const facetasVisiveis = facetas.filter((f) => f.opcoes.length > 0);

  return (
    <div>
      {/* ── Linha de resumo ──────────────────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 flex-wrap card-panel bg-surface px-4 py-2.5 transition-colors ${
          aberta ? 'border border-accent rounded-b-none' : 'border border-border-subtle'
        }`}
      >
        <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-[240px] text-[13px]">
          <span className="label-mono text-[10.5px] uppercase tracking-wider">{t('jogando com')}</span>
          <span className="font-display font-extrabold text-base tabular-nums text-ink">
            {numero(total)}
          </span>
          <span className="text-ink-muted">{tp(total, 'palavra', 'palavras')}</span>
          {nomeDaFonte && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="text-ink-muted"><b className="text-ink font-semibold">{nomeDaFonte}</b></span>
            </>
          )}
          {idioma && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="text-ink-muted"><b className="text-ink font-semibold">{idioma}</b></span>
            </>
          )}
          {avisoDeVazio && (
            <span className="text-warn font-semibold">— {avisoDeVazio}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {acoesBarra}
          <button
            type="button"
            onClick={aoAlternar}
            aria-expanded={aberta}
            aria-controls={ID_DA_GAVETA}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold border cursor-pointer transition-all ${
              aberta
                ? 'bg-accent text-white border-accent shadow-xs'
                : 'bg-surface border-border-subtle hover:bg-surface-hover hover:border-accent/40 text-ink'
            }`}
          >
            <SlidersIcon className={`w-3.5 h-3.5 ${aberta ? 'text-white' : 'text-accent'}`} />
            <span>{t('Fonte')}</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${aberta ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Gaveta ───────────────────────────────────────────────────────────────────────────
          `hidden`, não uma classe de exibição: é o atributo que o protótipo usa (`.gaveta[hidden]`)
          e o que garante que leitor de tela e navegação por Tab pulem o conteúdo fechado sem que a
          gente precise repetir a lógica em `tabIndex`. */}
      <div
        id={ID_DA_GAVETA}
        hidden={!aberta}
        className="card-panel bg-surface border-2 border-t-0 border-ink rounded-t-none px-4 pb-4 pt-1"
      >
        {facetasVisiveis.map((faceta, i) => (
          <div
            key={faceta.id}
            className={`py-3.5 ${i < facetasVisiveis.length - 1 ? 'border-b border-dashed border-border-subtle' : ''}`}
          >
            <div className="flex items-baseline gap-2.5 mb-2.5">
              <span className="label-mono">{faceta.rotulo}</span>
              {faceta.ajuda && <span className="text-[12px] text-ink-faint">{faceta.ajuda}</span>}
            </div>
            <Segmentado
              rotuloDoGrupo={faceta.rotulo}
              variante="chip"
              multiplo={!faceta.exclusiva}
              valor={faceta.valor}
              aoTrocar={faceta.aoTrocar}
              opcoes={faceta.opcoes}
            />
          </div>
        ))}

        {acoes && (
          <div className="flex items-center gap-2 flex-wrap pt-3.5 mt-1 border-t border-dashed border-border-subtle">
            <span className="label-mono me-1">{t('trazer ou gerenciar')}</span>
            {acoes}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-3.5 border-t border-border-subtle">
          <span className="label-mono">{t('{n} no recorte', { n: numero(total) })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={aoLimpar}
              className="text-[12.5px] text-ink-muted hover:text-accent-ink underline decoration-dotted underline-offset-4 cursor-pointer"
            >
              {t('limpar tudo')}
            </button>
            <button
              type="button"
              onClick={aoAlternar}
              className="px-3.5 py-1.5 rounded-lg text-[13px] font-semibold border-2 border-border-subtle bg-surface hover:bg-surface-hover cursor-pointer text-ink"
            >
              {t('Pronto')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SeletorDeConteudo;
