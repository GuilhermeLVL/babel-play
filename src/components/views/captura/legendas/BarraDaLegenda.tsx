import { Gauge, Keyboard, Languages, Lock, MousePointerClick, Palette, Pause, PictureInPicture2, Play, X } from 'lucide-react';
import { useState } from 'react';

import type { Leitura } from '../../../../lib/captura/ritmoDaLegenda';
import { t } from '../../../../lib/i18n';
import type { Traducao } from './aparenciaDaLegenda';

/** Os atalhos da janelinha, na ordem da ajuda. As teclas valem com o foco dentro da janela. */
export const ATALHOS: ReadonlyArray<[string, string]> = [
  ['Espaço', 'Pausar ou continuar'],
  ['← →', 'Voltar e avançar pelas falas'],
  ['T', 'Tradução da fala em foco'],
  ['P', 'Ouvir a fala em foco'],
];

/**
 * A BARRA DA JANELINHA, enxuta (ei/leg): pausar, ritmo de leitura, tradução, personalizar e
 * fechar. Modo, cores, tamanho, quantas falas, predefinições e "Meu perfil" moram no Personalizar.
 * O título recolhe e expande a janela; o cadeado (deixar o clique passar) só existe dentro do app —
 * uma janela sempre-no-topo do navegador sempre recebe o clique (limitação da plataforma).
 */
export default function BarraDaLegenda({
  emJanela,
  travado,
  aoTravar,
  pausado,
  aoPausar,
  recolhido,
  aoRecolher,
  leitura,
  aoTrocarLeitura,
  traducao,
  aoTrocarTraducao,
  painel,
  aoPainel,
  aoFechar,
}: {
  emJanela: boolean;
  travado: boolean;
  aoTravar: () => void;
  pausado: boolean;
  aoPausar: () => void;
  recolhido: boolean;
  aoRecolher: () => void;
  leitura: Leitura;
  aoTrocarLeitura: (l: Leitura) => void;
  traducao: Traducao;
  aoTrocarTraducao: (t: Traducao) => void;
  painel: boolean;
  aoPainel: () => void;
  aoFechar: () => void;
}) {
  const [ajuda, setAjuda] = useState(false);
  const dicaDosAtalhos = ATALHOS.map(([k, o]) => `${t(k)}: ${t(o)}`).join(' · ');
  return (
    <div className="leg-barra">
      <button
        type="button"
        className="leg-tit"
        aria-expanded={!recolhido}
        aria-label={recolhido ? t('Expandir') : t('Recolher')}
        title={recolhido ? t('Expandir') : t('Recolher')}
        onClick={aoRecolher}
      >
        <PictureInPicture2 aria-hidden /> <span>{t('Legendas')}</span>
      </button>
      {!emJanela && (
        <button
          type="button"
          aria-pressed={travado}
          aria-label={travado ? t('Destravar o clique') : t('Deixar o clique passar pela janela')}
          title={t('Travar o clique')}
          onClick={aoTravar}
        >
          {travado ? <Lock aria-hidden /> : <MousePointerClick aria-hidden />}
        </button>
      )}
      <button
        type="button"
        aria-pressed={pausado}
        aria-label={pausado ? t('Continuar as legendas') : t('Pausar legendas')}
        title={`${pausado ? t('Continuar') : t('Pausar')} (${t('Espaço')})`}
        onClick={aoPausar}
      >
        {pausado ? <Play aria-hidden /> : <Pause aria-hidden />}
      </button>
      <label className="leg-escolha" title={t('Ritmo de leitura')}>
        <Gauge aria-hidden />
        <select aria-label={t('Ritmo de leitura')} value={leitura} onChange={(e) => aoTrocarLeitura(e.target.value as Leitura)}>
          <option value="lenta">{t('Lenta')}</option>
          <option value="normal">{t('Normal')}</option>
          <option value="rapida">{t('Rápida')}</option>
        </select>
      </label>
      <label className="leg-escolha" title={t('Tradução')}>
        <Languages aria-hidden />
        <select aria-label={t('Tradução')} value={traducao} onChange={(e) => aoTrocarTraducao(e.target.value as Traducao)}>
          <option value="sempre">{t('Sempre')}</option>
          <option value="discreta">{t('Discreta')}</option>
          <option value="oculta">{t('Oculta')}</option>
          <option value="toque">{t('Ao tocar')}</option>
        </select>
      </label>
      <span className="leg-ajuda">
        <button
          type="button"
          aria-expanded={ajuda}
          aria-label={t('Atalhos do teclado')}
          title={dicaDosAtalhos}
          onClick={() => setAjuda((v) => !v)}
        >
          <Keyboard aria-hidden />
        </button>
        {ajuda && (
          <span className="leg-atalhos" role="tooltip">
            {ATALHOS.map(([k, o]) => (
              <span key={k}>
                <kbd>{t(k)}</kbd> {t(o)}
              </span>
            ))}
          </span>
        )}
      </span>
      <button type="button" aria-pressed={painel} aria-label={t('Personalizar')} title={t('Personalizar')} onClick={aoPainel}>
        <Palette aria-hidden />
      </button>
      <button type="button" aria-label={t('Fechar as legendas flutuantes')} title={t('Fechar')} onClick={aoFechar}>
        <X aria-hidden />
      </button>
    </div>
  );
}
