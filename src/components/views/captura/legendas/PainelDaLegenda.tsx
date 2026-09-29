import type { CSSProperties } from 'react';

import { t, tp } from '../../../../lib/i18n';
import { Interruptor, Segmentos } from '../../vocab/Dialogo';
import { type Aparencia, type Modo, type Preset, QUANTAS, type Traducao, type Visiveis } from './aparenciaDaLegenda';

const PREDEFINICOES: Array<[Preset, string]> = [
  ['filme', 'Filme'],
  ['conversa', 'Conversa'],
  ['jogo', 'Jogo'],
  ['imersao', 'Imersão'],
  ['meu', 'Meu perfil'],
];

/**
 * O PERSONALIZAR da janelinha: tudo o que saiu da barra (ei/leg) — modo da janela, predefinições,
 * tradução, quantas falas ficam à vista, pausar ao passar o mouse, esconder, tamanho, cores e
 * "Meu perfil". Mesmo desenho do painel do protótipo (C6).
 */
export default function PainelDaLegenda({
  ap,
  mudar,
  aoPreset,
  aoSalvarMeu,
  aoResetar,
  oculto,
  aoOcultar,
}: {
  ap: Aparencia;
  mudar: (patch: Partial<Aparencia>) => void;
  aoPreset: (p: Preset) => void;
  aoSalvarMeu: () => void;
  aoResetar: () => void;
  oculto: boolean;
  aoOcultar: () => void;
}) {
  return (
    <div className="leg-painel">
      <div className="entre">
        <b>{t('Personalização')}</b>
        <button type="button" className="link" onClick={aoResetar}>
          {t('Resetar tudo')}
        </button>
      </div>
      <label className="entre">
        <span className="label-mono">{t('Modo da janela')}</span>
        <select className="leg-select" aria-label={t('Modo da janela')} value={ap.modo} onChange={(e) => mudar({ modo: e.target.value as Modo })}>
          <option value="video">{t('Modo vídeo')}</option>
          <option value="conversa">{t('Conversa')}</option>
          <option value="jogo">{t('Jogo')}</option>
        </select>
      </label>
      <span className="label-mono">{t('Predefinições')}</span>
      <div className="chips">
        {PREDEFINICOES.map(([v, r]) => (
          <button key={v} type="button" className="pill" aria-pressed={ap.preset === v} onClick={() => aoPreset(v)}>
            {t(r)}
          </button>
        ))}
      </div>
      <span className="label-mono">{t('Tradução')}</span>
      <Segmentos<Traducao>
        rotulo={t('Tradução')}
        atual={ap.traducao}
        opcoes={[
          ['sempre', t('Sempre visível')],
          ['discreta', t('Discreta')],
          ['oculta', t('Imersão')],
          ['toque', t('Ao tocar')],
        ]}
        aoTrocar={(traducao) => mudar({ traducao })}
      />
      <span className="label-mono">{t('Falas à vista')}</span>
      <Segmentos<string>
        rotulo={t('Falas à vista')}
        atual={String(ap.visiveis)}
        opcoes={QUANTAS.map((n) => [String(n), tp(n, '{n} fala', '{n} falas')])}
        aoTrocar={(v) => mudar({ visiveis: Number(v) as Visiveis })}
      />
      <div className="entre">
        <span>{t('Pausar ao passar o mouse')}</span>
        <Interruptor
          ligado={ap.pausarAoPassar}
          rotulo={t('Pausar ao passar o mouse')}
          aoTrocar={() => mudar({ pausarAoPassar: !ap.pausarAoPassar })}
        />
      </div>
      <div className="entre">
        <span>{t('Esconder a legenda')}</span>
        <Interruptor ligado={oculto} rotulo={t('Esconder a legenda')} aoTrocar={aoOcultar} />
      </div>
      <label>
        <span className="label-mono">{t('Tamanho · {tam}%', { tam: ap.tam })}</span>
        <input
          type="range"
          min={70}
          max={160}
          step={10}
          value={ap.tam}
          aria-label={t('Tamanho da legenda')}
          className="trilho"
          style={{ '--p': `${((ap.tam - 70) / 90) * 100}%` } as CSSProperties}
          onChange={(e) => mudar({ tam: +e.target.value })}
        />
      </label>
      <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
        {(
          [
            ['legenda', 'Legenda', 'Cor da legenda'],
            ['traducao', 'Tradução', 'Cor da tradução'],
          ] as Array<[keyof Aparencia['cores'], string, string]>
        ).map(([k, r, rotulo]) => (
          <label key={k} className="cor">
            <input
              type="color"
              value={ap.cores[k]}
              aria-label={t(rotulo)}
              onChange={(e) => mudar({ cores: { ...ap.cores, [k]: e.target.value } })}
            />
            {t(r)}
          </label>
        ))}
      </div>
      <button type="button" className="link" onClick={aoSalvarMeu}>
        {t('Salvar como “Meu perfil”')}
      </button>
    </div>
  );
}
