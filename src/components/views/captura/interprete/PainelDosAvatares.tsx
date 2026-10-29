import { useEffect, useRef } from 'react';

import {
  type FocoDoAvatar,
  OPCOES_DE_QUEM,
  type PreferenciasDosAvatares,
  type QuemAparece,
  type TamanhoDoAvatar,
  TAMANHOS_DO_AVATAR,
} from '../../../../core/avatar/interprete';
import {
  type EscolhaDeAlfabeto,
  ESCOLHAS_DE_ALFABETO,
  type MotivoDoPainel,
  type RitmoDaSoletracao,
  RITMOS_DA_SOLETRACAO,
  type SuporteDoInterprete,
} from '../../../../core/avatar/sinais/soletracaoDoInterprete';
import { t } from '../../../../lib/i18n';
import AvisosDaSoletracao from '../../../avatar/AvisosDaSoletracao';

const ROTULO_DE_QUEM: Record<QuemAparece, () => string> = {
  ambos: () => t('Eu e o intérprete'),
  meu: () => t('Só eu'),
  interprete: () => t('Só o intérprete'),
  nenhum: () => t('Nenhum'),
};
const ROTULO_DE_TAMANHO: Record<TamanhoDoAvatar, () => string> = {
  p: () => t('P'),
  m: () => t('M'),
  g: () => t('G'),
};
const NOME_DE_TAMANHO: Record<TamanhoDoAvatar, () => string> = {
  p: () => t('Pequeno'),
  m: () => t('Médio'),
  g: () => t('Grande'),
};

const ROTULO_DE_ALFABETO: Record<EscolhaDeAlfabeto, () => string> = {
  auto: () => t('Automático (pelo idioma da outra pessoa)'),
  libras: () => t('Libras'),
  asl: () => t('ASL'),
};
const ROTULO_DE_RITMO: Record<RitmoDaSoletracao, () => string> = {
  lenta: () => t('Lenta'),
  normal: () => t('Normal'),
  rapida: () => t('Rápida'),
};
const MOTIVO_DO_PAINEL: Record<MotivoDoPainel, () => string> = {
  sem_dedos: () => t('Este avatar não tem dedos articulados.'),
  sem_braco: () => t('Este avatar não tem braços articulados.'),
  sem_ossos_reconheciveis: () => t('Os ossos deste avatar não têm nomes reconhecíveis.'),
  sem_modelo: () => t('O avatar ainda não carregou.'),
  sem_3d: () => t('Este aparelho não mostra o avatar em 3D.'),
  maos_minusculas: () =>
    t('As mãos deste avatar são pequenas demais para soletrar. Escolha outro avatar em Meu avatar (o intérprete muda).'),
  sem_interprete: () => t('Escolha "Eu e o intérprete" ou "Só o intérprete" em Quem aparece.'),
};

/**
 * "AVATARES DA CONVERSA": quem aparece, o tamanho, rosto ou mãos, modo economia e a voz. Folha pequena sobre a
 * conversa, com foco que entra e volta, Esc que fecha e controles nativos (rádio e caixa), lidos por qualquer leitor
 * de tela. Tudo é preferência LOCAL (`frasy.avatar.interprete.*`).
 */
export default function PainelDosAvatares({
  prefs,
  aoMudar,
  aoFechar,
  sinaisLigada,
  suporte,
  sem3d,
  aoEscolherVoz,
}: {
  prefs: PreferenciasDosAvatares;
  aoMudar: (parcial: Partial<PreferenciasDosAvatares>) => void;
  aoFechar: () => void;
  /** A flag `avatar_sinais`: sem ela, "só mãos" fica desabilitado. */
  sinaisLigada: boolean;
  /** O avatar-intérprete tem dedos e braços articulados? Só então "Só mãos" e a soletração valem. */
  suporte: SuporteDoInterprete;
  /** O aparelho não tem WebGL2: os avatares aparecem como foto ou iniciais. */
  sem3d: boolean;
  /** Abre o seletor de voz que já existe (ausente onde a conversa não tem voz a escolher). */
  aoEscolherVoz?: (() => void) | undefined;
}) {
  const primeiro = useRef<HTMLInputElement>(null);
  const disponivel = sinaisLigada && suporte.estado === 'sim';
  const motivoDoSuporte =
    sinaisLigada && suporte.estado === 'nao'
      ? MOTIVO_DO_PAINEL[suporte.motivo]()
      : sinaisLigada && suporte.estado === 'verificando'
        ? t('Verificando o avatar…')
        : null;
  const soletrando = disponivel && prefs.soletrar;
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    primeiro.current?.focus();
    return () => antes?.focus?.();
  }, []);

  return (
    <div
      className="int-folha"
      role="dialog"
      aria-modal="true"
      aria-label={t('Avatares da conversa')}
      data-testid="painel-dos-avatares"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          aoFecharRef.current();
          return;
        }
        // `aria-modal`: o Tab fica DENTRO do painel (o que está atrás não é alcançável). Volta ao primeiro depois do
        // último, e ao último antes do primeiro. (Grupo de rádio: só o marcado entra na ordem do Tab.)
        if (e.key !== 'Tab') return;
        const alcancaveis = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        ].filter(
          (el) =>
            el.offsetParent !== null &&
            !(
              el instanceof HTMLInputElement &&
              el.type === 'radio' &&
              !el.checked &&
              el.name &&
              e.currentTarget.querySelector(`input[type=radio][name="${el.name}"]:checked`)
            ),
        );
        if (!alcancaveis.length) return;
        const primeiroEl = alcancaveis[0];
        const ultimoEl = alcancaveis[alcancaveis.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiroEl || !e.currentTarget.contains(ativo))) {
          e.preventDefault();
          ultimoEl.focus();
        } else if (!e.shiftKey && (ativo === ultimoEl || !e.currentTarget.contains(ativo))) {
          e.preventDefault();
          primeiroEl.focus();
        }
      }}
    >
      <div className="int-folha-corpo int-av-painel">
        <h2 className="int-av-titulo">{t('Avatares da conversa')}</h2>
        <p className="int-av-nota">{t('O texto da conversa continua sempre à vista. O avatar é só um complemento.')}</p>

        <fieldset className="int-av-grupo">
          <legend>{t('Quem aparece')}</legend>
          {OPCOES_DE_QUEM.map((q, i) => (
            <label key={q} className="int-av-opcao">
              <input
                ref={i === 0 ? primeiro : undefined}
                type="radio"
                name="avatar-quem"
                checked={prefs.quem === q}
                onChange={() => aoMudar({ quem: q })}
                data-testid={`avatar-quem-${q}`}
              />
              <span>{ROTULO_DE_QUEM[q]()}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="int-av-grupo">
          <legend>{t('Tamanho')}</legend>
          {TAMANHOS_DO_AVATAR.map((tm) => (
            <label key={tm} className="int-av-opcao">
              <input
                type="radio"
                name="avatar-tamanho"
                checked={prefs.tamanho === tm}
                onChange={() => aoMudar({ tamanho: tm })}
                aria-label={NOME_DE_TAMANHO[tm]()}
                data-testid={`avatar-tamanho-${tm}`}
              />
              <span aria-hidden>{ROTULO_DE_TAMANHO[tm]()}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="int-av-grupo">
          <legend>{t('O que mostrar')}</legend>
          {(['rosto', 'maos'] as const satisfies readonly FocoDoAvatar[]).map((f) => {
            const desabilitado = f === 'maos' && !disponivel;
            return (
              <label key={f} className="int-av-opcao" data-desabilitado={desabilitado ? '' : undefined}>
                <input
                  type="radio"
                  name="avatar-foco"
                  checked={(desabilitado ? 'rosto' : prefs.foco) === f}
                  disabled={desabilitado}
                  onChange={() => aoMudar({ foco: f })}
                  data-testid={`avatar-foco-${f}`}
                />
                <span>{f === 'rosto' ? t('Só rosto') : t('Só mãos')}</span>
              </label>
            );
          })}
          {!sinaisLigada && <p className="int-av-nota">{t('Só mãos ainda não está disponível.')}</p>}
          {motivoDoSuporte && (
            <p className="int-av-nota" data-testid="avatar-maos-motivo">
              {motivoDoSuporte}
            </p>
          )}
        </fieldset>

        {sinaisLigada && (
          <fieldset className="int-av-grupo" data-testid="avatar-soletracao-grupo">
            <legend>{t('Soletração')}</legend>
            <label className="int-av-opcao int-av-linha" data-desabilitado={disponivel ? undefined : ''}>
              <input
                type="checkbox"
                checked={soletrando}
                disabled={!disponivel}
                onChange={(e) => aoMudar({ soletrar: e.target.checked })}
                data-testid="avatar-soletrar"
              />
              <span>{t('Soletrar nomes e palavras sem sinal')}</span>
            </label>
            {motivoDoSuporte && (
              <p className="int-av-nota" data-testid="avatar-soletrar-motivo">
                {motivoDoSuporte}
              </p>
            )}
            {soletrando && (
              <>
                <div className="int-av-sub" role="radiogroup" aria-label={t('Alfabeto manual')}>
                  {ESCOLHAS_DE_ALFABETO.map((a) => (
                    <label key={a} className="int-av-opcao">
                      <input
                        type="radio"
                        name="avatar-alfabeto"
                        checked={prefs.alfabeto === a}
                        onChange={() => aoMudar({ alfabeto: a })}
                        data-testid={`avatar-alfabeto-${a}`}
                      />
                      <span>{ROTULO_DE_ALFABETO[a]()}</span>
                    </label>
                  ))}
                </div>
                <div className="int-av-sub" role="radiogroup" aria-label={t('Velocidade da soletração')}>
                  {RITMOS_DA_SOLETRACAO.map((r) => (
                    <label key={r} className="int-av-opcao">
                      <input
                        type="radio"
                        name="avatar-ritmo"
                        checked={prefs.ritmo === r}
                        onChange={() => aoMudar({ ritmo: r })}
                        data-testid={`avatar-ritmo-${r}`}
                      />
                      <span>{ROTULO_DE_RITMO[r]()}</span>
                    </label>
                  ))}
                </div>
                <label className="int-av-opcao int-av-linha">
                  <input
                    type="checkbox"
                    checked={prefs.espelhar}
                    onChange={(e) => aoMudar({ espelhar: e.target.checked })}
                    data-testid="avatar-espelhar"
                  />
                  <span>{t('Mão esquerda (espelhar, para canhotos)')}</span>
                </label>
                <AvisosDaSoletracao />
              </>
            )}
          </fieldset>
        )}

        <label className="int-av-opcao int-av-linha">
          <input
            type="checkbox"
            checked={prefs.economia}
            onChange={(e) => aoMudar({ economia: e.target.checked })}
            data-testid="avatar-economia"
          />
          <span>{t('Modo economia: sem avatares, a tela como era antes')}</span>
        </label>
        <label className="int-av-opcao int-av-linha">
          <input
            type="checkbox"
            checked={prefs.anunciar}
            onChange={(e) => aoMudar({ anunciar: e.target.checked })}
            data-testid="avatar-anunciar"
          />
          <span>{t('Avisar por voz do leitor de tela quando o avatar falar')}</span>
        </label>

        {sem3d && (
          <p className="int-av-nota">{t('Este aparelho não mostra o avatar em 3D: aparecem a foto ou as iniciais.')}</p>
        )}

        <div className="int-folha-acoes">
          {aoEscolherVoz && (
            <button
              type="button"
              className="int-ib"
              onClick={() => {
                aoFechar();
                aoEscolherVoz();
              }}
              data-testid="avatar-escolher-voz"
            >
              {t('Escolher voz')}
            </button>
          )}
          <button type="button" className="int-ib int-ib-pri" onClick={aoFechar} data-testid="avatar-painel-fechar">
            {t('Pronto')}
          </button>
        </div>
      </div>
    </div>
  );
}
