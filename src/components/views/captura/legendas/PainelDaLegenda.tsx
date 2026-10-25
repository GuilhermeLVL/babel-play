import type { CSSProperties } from 'react';

import { mudarAjustesDoAssistente, useAjustesDoAssistente } from '../../../../lib/assistente/ajustesDoAssistente';
import type { Leitura } from '../../../../lib/captura/ritmoDaLegenda';
import { t, tp } from '../../../../lib/i18n';
import { Interruptor, Segmentos } from '../../vocab/Dialogo';
import {
  type Aparencia,
  type Fundo,
  FUNDOS,
  type Preset,
  QUANTAS,
  type Traducao,
  type Visiveis,
} from './aparenciaDaLegenda';
import { ROTULO_DO_FUNDO } from './BarraDaLegenda';

const PREDEFINICOES: Array<[Preset, string]> = [
  ['filme', 'Filme'],
  ['conversa', 'Conversa'],
  ['jogo', 'Jogo'],
  ['imersao', 'Imersão'],
  ['meu', 'Meu perfil'],
];

/**
 * O PERSONALIZAR da janelinha, uma folha compacta: predefinições, fundo, ritmo de leitura, tradução,
 * quantas falas ficam à vista, pausar ao passar o mouse, esconder, tamanho, cores e "Meu perfil".
 * O formato da janela mora na barra (troca com um toque). Mesmo desenho do painel do protótipo (C6).
 */
export default function PainelDaLegenda({
  ap,
  mudar,
  aoPreset,
  aoSalvarMeu,
  aoResetar,
  oculto,
  aoOcultar,
  assistente,
}: {
  ap: Aparencia;
  mudar: (patch: Partial<Aparencia>) => void;
  aoPreset: (p: Preset) => void;
  aoSalvarMeu: () => void;
  aoResetar: () => void;
  oculto: boolean;
  aoOcultar: () => void;
  /** O assistente ao vivo está na janela (`nuvem` = os recursos pagos existem para esta conta). */
  assistente?: { nuvem: boolean };
}) {
  return (
    <div className="leg-painel">
      <div className="entre">
        <b>{t('Personalização')}</b>
        <button type="button" className="link" onClick={aoResetar}>
          {t('Resetar tudo')}
        </button>
      </div>
      <span className="label-mono">{t('Predefinições')}</span>
      <div className="chips">
        {PREDEFINICOES.map(([v, r]) => (
          <button key={v} type="button" className="pill" aria-pressed={ap.preset === v} onClick={() => aoPreset(v)}>
            {t(r)}
          </button>
        ))}
      </div>
      <span className="label-mono">{t('Fundo')}</span>
      <Segmentos<Fundo>
        rotulo={t('Fundo')}
        atual={ap.fundo}
        opcoes={FUNDOS.map((f) => [f, t(ROTULO_DO_FUNDO[f])])}
        aoTrocar={(fundo) => mudar({ fundo })}
      />
      <p className="leg-nota">
        {t('A janela por cima de tudo não fica transparente: escolha o fundo que menos atrapalha o que está atrás.')}
      </p>
      <span className="label-mono">{t('Ritmo de leitura')}</span>
      <Segmentos<Leitura>
        rotulo={t('Ritmo de leitura')}
        atual={ap.leitura}
        opcoes={[
          ['lenta', t('Lenta')],
          ['normal', t('Normal')],
          ['rapida', t('Rápida')],
        ]}
        aoTrocar={(leitura) => mudar({ leitura })}
      />
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
      {ap.fundo === 'claro' && <p className="leg-nota">{t('No fundo claro, o texto fica escuro para dar leitura.')}</p>}
      <button type="button" className="link" onClick={aoSalvarMeu}>
        {t('Salvar como “Meu perfil”')}
      </button>
      {assistente && <AssistenteNoPainel nuvem={assistente.nuvem} />}
    </div>
  );
}

/**
 * O ASSISTENTE no Personalizar (Fase C2): os mesmos interruptores de Ajustes da captura, o essencial. Os pagos só
 * aparecem quando existem para a conta (flag e plano); a correção da fala nasce desligada (opt-in).
 */
function AssistenteNoPainel({ nuvem }: { nuvem: boolean }) {
  const aj = useAjustesDoAssistente();
  const linha = (rotulo: string, ligado: boolean, aoTrocar: () => void) => (
    <div className="entre">
      <span>{rotulo}</span>
      <Interruptor ligado={ligado} rotulo={rotulo} aoTrocar={aoTrocar} />
    </div>
  );
  return (
    <>
      <span className="label-mono">{t('Assistente ao vivo')}</span>
      {linha(t('Palavras acima do meu nível'), aj.niveis, () => mudarAjustesDoAssistente({ niveis: !aj.niveis }))}
      {nuvem && (
        <>
          {linha(t('Expressões e gírias'), aj.expressoes, () =>
            mudarAjustesDoAssistente({ expressoes: !aj.expressoes }),
          )}
          {linha(t('Termos e siglas'), aj.termos, () => mudarAjustesDoAssistente({ termos: !aj.termos }))}
          {linha(t('Correção da minha fala'), aj.correcao, () => mudarAjustesDoAssistente({ correcao: !aj.correcao }))}
        </>
      )}
    </>
  );
}
