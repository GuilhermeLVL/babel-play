import { Check, ChevronRight, SlidersHorizontal as SlidersIcon, X } from 'lucide-react';
import { type ReactNode, useId, useRef } from 'react';

import { numero, t, tp } from '../../lib/i18n';
import { DialogoBase } from '../ui/Dialogo';
import IconeEmBloco from '../ui/IconeEmBloco';

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
}: SeletorDeConteudoProps) {
  const idTitulo = useId();
  const gaveta = useRef<HTMLDialogElement>(null);
  const facetasVisiveis = facetas.filter((f) => f.opcoes.length > 0);
  /* Fechar pela gaveta (Esc nativo, "x", "Pronto") sempre passa pelo `close` do `<dialog>`, e é
     ele que avisa a tela: um caminho só, sem o risco de alternar duas vezes. */
  const fechar = () => gaveta.current?.close();

  return (
    <div>
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

      {aberta && (
        <DialogoBase classe="gaveta" rotuloId={idTitulo} aoFechar={aoAlternar} refDialogo={gaveta}>
          <div className="dlg-cab">
            <IconeEmBloco icone={SlidersIcon} />
            <div style={{ minWidth: 0 }}>
              <h2 id={idTitulo}>{t('O que você vai praticar')}</h2>
              <p className="mut" style={{ fontSize: 13 }}>
                {t('A escolha fica salva para as próximas rodadas.')}
              </p>
            </div>
            <button type="button" className="x" aria-label={t('Fechar')} onClick={fechar}>
              <X aria-hidden />
            </button>
          </div>

          <div className="gav-corpo pilha-g">
            {facetasVisiveis.map((faceta) => (
              <div key={faceta.id}>
                <span className="label-mono">{faceta.rotulo}</span>
                {faceta.ajuda && <p className="mut aj">{faceta.ajuda}</p>}
                <div className="chips" role="group" aria-label={faceta.rotulo}>
                  {faceta.opcoes.map((o) => {
                    const ligado = faceta.valor.includes(o.id);
                    const travado = !!o.motivoBloqueio && !ligado;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="pill"
                        aria-pressed={ligado}
                        disabled={travado}
                        title={travado ? o.motivoBloqueio : undefined}
                        onClick={() => faceta.aoTrocar(o.id)}
                      >
                        {o.icone}
                        {o.rotulo}
                        {o.contagem !== undefined && <span className="n">{numero(o.contagem)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {acoes && (
              <div className="cartao p5 sutil">
                <span className="label-mono">{t('Trazer ou gerenciar')}</span>
                <div className="linha" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {acoes}
                </div>
                {detalheDasAcoes}
              </div>
            )}
          </div>

          <div className="gav-pe">
            <span className="tn" aria-live="polite">
              <b>{numero(total)}</b> {t('no recorte')}
              {avisoDeVazio && <span className="aviso-curto">{avisoDeVazio}</span>}
            </span>
            <button type="button" className="link" onClick={aoLimpar}>
              {t('Limpar tudo')}
            </button>
            <button type="button" className="btn btn-solid" onClick={fechar}>
              <Check aria-hidden /> {t('Pronto')}
            </button>
          </div>
        </DialogoBase>
      )}
    </div>
  );
}

export default SeletorDeConteudo;
