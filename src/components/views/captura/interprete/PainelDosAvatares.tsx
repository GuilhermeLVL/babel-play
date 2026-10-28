import { useEffect, useRef } from 'react';

import {
  type FocoDoAvatar,
  OPCOES_DE_QUEM,
  type PreferenciasDosAvatares,
  type QuemAparece,
  type TamanhoDoAvatar,
  TAMANHOS_DO_AVATAR,
} from '../../../../core/avatar/interprete';
import { t } from '../../../../lib/i18n';

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
  sem3d,
  aoEscolherVoz,
}: {
  prefs: PreferenciasDosAvatares;
  aoMudar: (parcial: Partial<PreferenciasDosAvatares>) => void;
  aoFechar: () => void;
  /** A flag `avatar_sinais`: sem ela, "só mãos" fica desabilitado. */
  sinaisLigada: boolean;
  /** O aparelho não tem WebGL2: os avatares aparecem como foto ou iniciais. */
  sem3d: boolean;
  /** Abre o seletor de voz que já existe (ausente onde a conversa não tem voz a escolher). */
  aoEscolherVoz?: (() => void) | undefined;
}) {
  const primeiro = useRef<HTMLInputElement>(null);
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
            const desabilitado = f === 'maos' && !sinaisLigada;
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
        </fieldset>

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
