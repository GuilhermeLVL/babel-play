import {
  AArrowDown,
  AArrowUp,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Contrast,
  Gauge,
  Keyboard,
  Languages,
  LayoutPanelTop,
  Palette,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { useState } from 'react';

import type { Leitura } from '../../../../lib/captura/ritmoDaLegenda';
import { t } from '../../../../lib/i18n';
import type { Fundo, Modo, Mostrar, Traducao } from './aparenciaDaLegenda';

/** Os atalhos da janelinha, na ordem da ajuda. As teclas valem com o foco dentro da janela. */
const ATALHOS: ReadonlyArray<[string, string]> = [
  ['Espaço', 'Pausar ou continuar'],
  ['← →', 'Voltar e avançar pelas falas'],
  ['T', 'Tradução da fala em foco'],
  ['P', 'Ouvir a fala em foco'],
  ['S', 'Salvar a frase atual'],
];

/** O nome curto do que a fala mostra (o texto do botão de troca rápida). */
export const ROTULO_DO_MOSTRAR: Readonly<Record<Mostrar, string>> = {
  ambos: 'Original e tradução',
  original: 'Só o original',
  traducao: 'Só a tradução',
};

export const ROTULO_DO_FUNDO: Readonly<Record<Fundo, string>> = {
  auto: 'Seguir o tema',
  escuro: 'Escuro',
  preto: 'Preto',
  claro: 'Claro',
};

/**
 * A BARRA DA JANELINHA (ei/leg, refeita na PiP inteligente). Fica escondida até a pessoa passar o
 * mouse, tocar ou chegar pelo teclado, e some sozinha (quem esconde é a raiz). Tem o que se usa sem
 * sair do jogo ou do vídeo: formato, pausar, o que a fala mostra, letra menor e maior, salvar a frase,
 * fundo, personalizar e fechar. Ritmo e modo da tradução aparecem aqui só em janela larga (o CSS
 * esconde), e moram também no Personalizar. O primeiro botão recolhe e expande a janela.
 */
export default function BarraDaLegenda({
  pausado,
  aoPausar,
  recolhido,
  aoRecolher,
  leitura,
  aoTrocarLeitura,
  traducao,
  aoTrocarTraducao,
  modo,
  aoTrocarModo,
  mostrar,
  aoTrocarMostrar,
  aoLetra,
  letraNoMinimo,
  letraNoMaximo,
  fundo,
  aoTrocarFundo,
  aoSalvarFrase,
  painel,
  aoPainel,
  aoFechar,
}: {
  pausado: boolean;
  aoPausar: () => void;
  recolhido: boolean;
  aoRecolher: () => void;
  leitura: Leitura;
  aoTrocarLeitura: (l: Leitura) => void;
  traducao: Traducao;
  aoTrocarTraducao: (t: Traducao) => void;
  modo: Modo;
  aoTrocarModo: (m: Modo) => void;
  mostrar: Mostrar;
  aoTrocarMostrar: () => void;
  aoLetra: (passo: -1 | 1) => void;
  letraNoMinimo: boolean;
  letraNoMaximo: boolean;
  fundo: Fundo;
  aoTrocarFundo: () => void;
  /** Salvar a frase em foco. Ausente = sem fichamento (o botão não aparece). */
  aoSalvarFrase?: () => void;
  painel: boolean;
  aoPainel: () => void;
  aoFechar: () => void;
}) {
  const [ajuda, setAjuda] = useState(false);
  const dicaDosAtalhos = ATALHOS.map(([k, o]) => `${t(k)}: ${t(o)}`).join(' · ');
  return (
    <div className="leg-barra" role="toolbar" aria-label={t('Controles da legenda flutuante')}>
      <button
        type="button"
        className="leg-tit"
        aria-expanded={!recolhido}
        aria-label={recolhido ? t('Expandir') : t('Recolher')}
        title={recolhido ? t('Expandir') : t('Recolher')}
        onClick={aoRecolher}
      >
        {recolhido ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
      </button>
      <label className="leg-escolha leg-formato" title={t('Formato da janela')}>
        <LayoutPanelTop aria-hidden />
        <select aria-label={t('Modo da janela')} value={modo} onChange={(e) => aoTrocarModo(e.target.value as Modo)}>
          <option value="jogo">{t('Faixa (jogo)')}</option>
          <option value="video">{t('Legenda (vídeo)')}</option>
          <option value="conversa">{t('Conversa')}</option>
          <option value="estudo">{t('Estudo')}</option>
        </select>
      </label>
      <button
        type="button"
        aria-pressed={pausado}
        aria-label={pausado ? t('Continuar as legendas') : t('Pausar legendas')}
        title={`${pausado ? t('Continuar') : t('Pausar')} (${t('Espaço')})`}
        onClick={aoPausar}
      >
        {pausado ? <Play aria-hidden /> : <Pause aria-hidden />}
      </button>
      <button
        type="button"
        className="leg-mostrar"
        aria-label={t('Mostrar: {o_que}. Trocar', { o_que: t(ROTULO_DO_MOSTRAR[mostrar]) })}
        title={t('Mostrar: {o_que}. Trocar', { o_que: t(ROTULO_DO_MOSTRAR[mostrar]) })}
        onClick={aoTrocarMostrar}
      >
        <Languages aria-hidden />
        <span className="leg-mostrar-txt">{t(ROTULO_DO_MOSTRAR[mostrar])}</span>
      </button>
      <button
        type="button"
        className="leg-letra"
        aria-label={t('Letra menor')}
        title={t('Letra menor')}
        disabled={letraNoMinimo}
        onClick={() => aoLetra(-1)}
      >
        <AArrowDown aria-hidden />
      </button>
      <button
        type="button"
        className="leg-letra"
        aria-label={t('Letra maior')}
        title={t('Letra maior')}
        disabled={letraNoMaximo}
        onClick={() => aoLetra(1)}
      >
        <AArrowUp aria-hidden />
      </button>
      {aoSalvarFrase && (
        <button
          type="button"
          aria-label={t('Salvar a frase atual')}
          title={`${t('Salvar a frase atual')} (S)`}
          onClick={aoSalvarFrase}
        >
          <BookmarkPlus aria-hidden />
        </button>
      )}
      <button
        type="button"
        className="leg-fundo"
        aria-label={t('Fundo: {qual}. Trocar', { qual: t(ROTULO_DO_FUNDO[fundo]) })}
        title={t('Fundo: {qual}. Trocar', { qual: t(ROTULO_DO_FUNDO[fundo]) })}
        onClick={aoTrocarFundo}
      >
        <Contrast aria-hidden />
      </button>
      <label className="leg-escolha leg-larga" title={t('Ritmo de leitura')}>
        <Gauge aria-hidden />
        <select
          aria-label={t('Ritmo de leitura')}
          value={leitura}
          onChange={(e) => aoTrocarLeitura(e.target.value as Leitura)}
        >
          <option value="lenta">{t('Lenta')}</option>
          <option value="normal">{t('Normal')}</option>
          <option value="rapida">{t('Rápida')}</option>
        </select>
      </label>
      <label className="leg-escolha leg-larga" title={t('Tradução')}>
        <Languages aria-hidden />
        <select
          aria-label={t('Tradução')}
          value={traducao}
          onChange={(e) => aoTrocarTraducao(e.target.value as Traducao)}
        >
          <option value="sempre">{t('Sempre')}</option>
          <option value="discreta">{t('Discreta')}</option>
          <option value="oculta">{t('Oculta')}</option>
          <option value="toque">{t('Ao tocar')}</option>
        </select>
      </label>
      <span className="leg-espaco" />
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
      <button
        type="button"
        aria-pressed={painel}
        aria-label={t('Personalizar')}
        title={t('Personalizar')}
        onClick={aoPainel}
      >
        <Palette aria-hidden />
      </button>
      <button type="button" aria-label={t('Fechar as legendas flutuantes')} title={t('Fechar')} onClick={aoFechar}>
        <X aria-hidden />
      </button>
    </div>
  );
}
