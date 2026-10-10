import {
  ChevronDown,
  ChevronRight,
  CircleQuestionMark,
  Cpu,
  Info,
  type LucideIcon,
  Pause,
  Play,
  Server,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

import type { EstadoDoChip } from '../../../../lib/captura/estadoDaCaptura';
import type { IconeDaMarca, MarcaDoSelo } from '../../../../lib/captura/nivelDeServico';
import { t } from '../../../../lib/i18n';
import { pulsarPausa } from '../../../../lib/polimento/enxuto';

/**
 * AS PEÇAS DA CAPTURA ENXUTA — o que o protótipo `telas-enxutas` acrescenta à tela (`enxuto.js:44-205`):
 * o chip de estado, o botão de pausa, a ajuda no cabeçalho do painel de ajustes e as linhas que a folha
 * "Como isto funciona" ganha. A marcação e as classes são as do protótipo, elemento por elemento (o CSS
 * é o dele: `styles/polimento/enxuto.css`). Só apresentação: o que cada peça diz chega pronto.
 */

const ICONE_DA_MARCA: Record<IconeDaMarca, LucideIcon> = {
  cpu: Cpu,
  smartphone: Smartphone,
  server: Server,
  'wifi-off': WifiOff,
};

/**
 * `chipDeEstado()` de `enxuto.js:62-65`: um chip que junta o chip do modelo, a marca e o seletor de
 * nível. Ao toque, abre a folha "Como isto funciona" (o nível, o modelo e as horas de nuvem).
 */
export function ChipDeEstado({
  estado,
  marca,
  motivo,
  aoAbrir,
}: {
  estado: EstadoDoChip;
  /** O ícone e o tom, do selo. `null` = ainda não há selo (o chip é só a porta da folha). */
  marca: MarcaDoSelo | null;
  /** O porquê da rota, para quem para o ponteiro em cima. */
  motivo?: string;
  aoAbrir: () => void;
}) {
  const Icone = marca ? ICONE_DA_MARCA[marca.icone] : Info;
  const { forte, resto } = estado;
  return (
    <button
      type="button"
      className="q-chip ex-estado"
      data-pl="como"
      data-tom={marca?.tom ?? ''}
      data-testid="chip-de-estado"
      aria-haspopup="dialog"
      aria-label={`${[forte, resto].filter(Boolean).join(', ')}. ${t('Abrir o nível, o modelo e as horas de nuvem')}`}
      title={motivo || undefined}
      onClick={aoAbrir}
    >
      <Icone aria-hidden />
      <span className="ex-estado-txt">
        <b>{forte}</b>
        {resto && <> · {resto}</>}
      </span>
      <ChevronDown aria-hidden />
    </button>
  );
}

/** `botaoDePausa()` de `enxuto.js:66`: ao lado de Encerrar, só enquanto grava. */
export function BotaoDePausa({ pausada, aoAlternar }: { pausada: boolean; aoAlternar: () => void }) {
  const botao = useRef<HTMLButtonElement>(null);
  const antes = useRef(pausada);
  /* `pausarOuRetomar()`, `enxuto.js:137-138`: o botão responde quando o estado muda de verdade. */
  useLayoutEffect(() => {
    if (antes.current === pausada) return;
    antes.current = pausada;
    pulsarPausa(botao.current);
  }, [pausada]);
  return (
    <button
      ref={botao}
      type="button"
      className="q-ctl q-fica ex-pausar"
      data-ex="pausar"
      data-sfx="none"
      data-testid="pausar-captura"
      aria-pressed={pausada}
      aria-label={pausada ? t('Retomar a captura') : t('Pausar a captura')}
      onClick={aoAlternar}
    >
      {pausada ? <Play aria-hidden /> : <Pause aria-hidden />}
      <span className="ex-pausar-t">{pausada ? t('Retomar') : t('Pausar')}</span>
    </button>
  );
}

/**
 * A ajuda dentro do painel de ajustes (`enxuto.js:148-158`): o mesmo botão redondo do cabeçalho do
 * diálogo, com o ícone de ajuda de sempre, ao lado do Fechar.
 */
export function AjudaNoPainel({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <button
      type="button"
      className="x ex-ajuda-no-dlg"
      aria-label={t('Ajuda da captura')}
      title={t('Ajuda da captura')}
      onClick={aoAbrir}
    >
      <CircleQuestionMark aria-hidden />
    </button>
  );
}

/**
 * O que a folha "Como isto funciona" ganha (`enxugarComo()`, `enxuto.js:175-183`): "Neste aparelho",
 * com o modelo local como uma linha (era um chip) e a ajuda da captura (era um botão do topo).
 *
 * A seta do fim tem 16 px: no protótipo o ícone veio da captura de produção com o tamanho escrito nele, e
 * é assim que ele aparece lá (a regra de 18 px de `enxuto.css:37` perde para o tamanho do próprio ícone).
 */
const SETA = { width: 16, height: 16 } as const;

export function NesteAparelho({
  modelo,
  aoVerModelo,
  aoAjuda,
}: {
  /** "Modelo local · 589 MB"; ausente quando quem transcreve não é o modelo local. */
  modelo?: string | null;
  aoVerModelo?: () => void;
  aoAjuda?: () => void;
}) {
  const comModelo = !!modelo && !!aoVerModelo;
  if (!comModelo && !aoAjuda) return null;
  return (
    <>
      <p className="folha-rotulo ex-neste">{t('Neste aparelho')}</p>
      <div className="q-lista ex-lista-da-folha">
        {comModelo && (
          <button type="button" className="q-linha" data-ex-f="modelo" onClick={aoVerModelo}>
            <span className="q-ic" aria-hidden="true">
              <Cpu />
            </span>
            <span>
              <b>{modelo}</b>
              {/* O protótipo diz "Já baixado": a folha não sabe disso sem ler o cache, e quem confere
                  arquivo por arquivo é o painel do modelo. A linha diz só o que ele faz. */}
              <small>{t('Ver o modelo, atualizar ou liberar espaço.')}</small>
            </span>
            <span className="q-fim" aria-hidden="true">
              <ChevronRight style={SETA} />
            </span>
          </button>
        )}
        {aoAjuda && (
          <button type="button" className="q-linha" data-ex-f="ajuda" onClick={aoAjuda}>
            <span className="q-ic" aria-hidden="true">
              <CircleQuestionMark />
            </span>
            <span>
              <b>{t('Ajuda da captura')}</b>
              <small>{t('Como o som chega ao app e o que fazer quando a legenda não aparece.')}</small>
            </span>
            <span className="q-fim" aria-hidden="true">
              <ChevronRight style={SETA} />
            </span>
          </button>
        )}
      </div>
    </>
  );
}
