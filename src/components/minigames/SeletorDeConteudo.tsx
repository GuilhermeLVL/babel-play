import { Check, ChevronRight, SlidersHorizontal as SlidersIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { numero, t, tp } from '../../lib/i18n';
import { fecharPainelDe, OpcoesDoQuest, PainelDoQuest } from '../views/play/quest/pecasDoQuest';

/**
 * O SELETOR DE CONTEÚDO — a faixa escura "Jogando com…" e a GAVETA "O que você vai praticar".
 *
 * Marcação do protótipo aprovado (`T.jogar` + `gavetaFonte()`): a faixa é `.cartao.escuro.faixa-escura`
 * com o resumo e os botões (Recordes, Mapa, Curadoria, diagnóstico, Fonte); "Fonte" abre a gaveta
 * lateral `dialog.gaveta` (de baixo, no celular) com o cabeçalho `.dlg-cab`, as facetas em
 * `.gav-corpo.pilha-g` (rótulo mono, a frase de apoio `.aj` e os chips `.pill` com contagem `.n`), o
 * cartão "Trazer ou gerenciar" e o rodapé `.gav-pe` com o total do recorte, "Limpar tudo" e "Pronto".
 *
 * Cada faceta é UMA decisão sobre o mesmo conjunto: o total do rodapé e o da faixa são o mesmo
 * número-verdade, e a tela inteira deriva dele. Opção sem material fica desabilitada e diz por quê
 * (`title`), nunca clicável e inerte.
 */

export interface FacetaDoSeletor {
  /** Chave estável para o React e para o `aoTrocar`. */
  id: string;
  /** Rótulo da faceta: "Idioma", "De onde vêm", "Quais baralhos", "Recorte". */
  rotulo: string;
  /** Frase de apoio sob o rótulo, ex.: "Marque quantas quiser: elas se somam na rodada." */
  ajuda?: string;
  opcoes: Array<{ id: string; rotulo: string; contagem?: number; motivoBloqueio?: string; icone?: ReactNode }>;
  valor: string[];
  aoTrocar: (idDaOpcao: string) => void;
  /** Escolha única (o idioma, o nível). Continua um chip com `aria-pressed`, como no protótipo. */
  exclusiva?: boolean;
}

export interface SeletorDeConteudoProps {
  /** Total do recorte — o número-verdade do qual a tela toda deriva. */
  total: number;
  /** Nome da fonte dominante ("Minhas gravações", "4000 Essential English Words"). */
  nomeDaFonte: string;
  idioma?: string;
  facetas: FacetaDoSeletor[];
  aberta: boolean;
  aoAlternar: () => void;
  aoLimpar: () => void;
  /** Aviso curto do rodapé quando nada passa. Ex.: "nenhum item passa; desligue um recorte". */
  avisoDeVazio?: string;
  /** Os botões do cartão "Trazer ou gerenciar" (Trazer do Anki, Gerenciar baralhos, idiomas). */
  acoes?: ReactNode;
  /** O que abre embaixo dos botões de "Trazer ou gerenciar" (a tabela dos idiomas). */
  detalheDasAcoes?: ReactNode;
  /** Ações da faixa escura (Recordes, Mapa, Curadoria, Diagnóstico). */
  acoesBarra?: ReactNode;
  /**
   * Só a gaveta, sem a faixa escura: o "Trocar a fonte" do Mapa abre a gaveta POR CIMA do Mapa
   * (`#btn-fonte` do protótipo), e a faixa é do lobby.
   */
  soGaveta?: boolean;
}

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
  detalheDasAcoes,
  acoesBarra,
  soGaveta = false,
}: SeletorDeConteudoProps) {
  const facetasVisiveis = facetas.filter((f) => f.opcoes.length > 0);

  /* META QUEST: a mesma escolha, num painel que abre no centro (nada desliza pela lateral), com as
     opções em pílulas grandes e o motivo de cada opção travada ESCRITO (não há hover no headset). A
     faixa "Jogando com" continua a de sempre: no lobby do headset quem abre o painel é o chip da fonte. */
  const painelDoQuest = () => (
    <PainelDoQuest
      largo
      icone={SlidersIcon}
      titulo={t('O que você vai praticar')}
      sub={t('A escolha fica salva para as próximas rodadas.')}
      aoFechar={aoAlternar}
      classe="qj-fonte"
      pe={
        <>
          <span className="qj-total tn" aria-live="polite">
            <b>{numero(total)}</b> {t('no recorte')}
            {avisoDeVazio && <span className="qj-total-aviso">{avisoDeVazio}</span>}
          </span>
          <button type="button" className="q-ctl" onClick={aoLimpar}>
            {t('Limpar tudo')}
          </button>
          <button type="button" className="q-ctl pri" onClick={(e) => fecharPainelDe(e.currentTarget)}>
            <Check aria-hidden /> {t('Pronto')}
          </button>
        </>
      }
    >
      {facetasVisiveis.map((faceta) => (
        <section key={faceta.id} className="q-secao" data-faceta={faceta.id}>
          <header>
            <div>
              <h3>{faceta.rotulo}</h3>
              {faceta.ajuda && <p>{faceta.ajuda}</p>}
            </div>
          </header>
          <OpcoesDoQuest
            rotulo={faceta.rotulo}
            exclusiva={faceta.exclusiva}
            opcoes={faceta.opcoes}
            valor={faceta.valor}
            aoTrocar={faceta.aoTrocar}
          />
        </section>
      ))}
      {acoes && (
        <section className="q-cartao fundo">
          <p className="q-rotulo">{t('Trazer ou gerenciar')}</p>
          <div className="q-acoes">{acoes}</div>
          {detalheDasAcoes}
        </section>
      )}
    </PainelDoQuest>
  );

  return (
    <div>
      {!soGaveta && (
        <section className="cartao escuro faixa-escura" aria-label={t('O que você vai praticar')}>
          <div className="resumo">
            <span className="label-mono" style={{ color: 'inherit', opacity: 0.8 }}>
              {t('Jogando com')}
            </span>
            <b className="tn">{numero(total)}</b> {tp(total, 'palavra', 'palavras')}
            {nomeDaFonte && (
              <>
                {' · '}
                <b style={{ font: '700 13.5px var(--font-display)' }}>{nomeDaFonte}</b>
              </>
            )}
            {idioma && <> · {idioma}</>}
          </div>
          <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
            {acoesBarra}
            <button
              type="button"
              className="btn btn-outline peq"
              onClick={aoAlternar}
              aria-haspopup="dialog"
              aria-expanded={aberta}
            >
              <SlidersIcon aria-hidden /> {t('Fonte')} <ChevronRight aria-hidden />
            </button>
          </div>
        </section>
      )}

      {aberta && painelDoQuest()}
    </div>
  );
}

export default SeletorDeConteudo;
