import '../../../styles/avatarDoModo.css';

import { useEffect, useRef } from 'react';

import {
  type PreferenciasDosAvatares,
  type TamanhoDoAvatar,
  TAMANHOS_DO_AVATAR,
} from '../../../core/avatar/interprete';
import type { DonoDoModo, ModoDoAvatar, PreferenciasDoModo } from '../../../core/avatar/modos';
import { t } from '../../../lib/i18n';

const TITULO: Record<ModoDoAvatar, () => string> = {
  livro: () => t('Avatar da narração'),
  legenda: () => t('Avatar da legenda'),
};
const NOME_DE_TAMANHO: Record<TamanhoDoAvatar, () => string> = {
  p: () => t('Pequeno'),
  m: () => t('Médio'),
  g: () => t('Grande'),
};
const QUEM: Record<ModoDoAvatar, Record<DonoDoModo, () => string>> = {
  livro: { meu: () => t('Meu avatar (do Perfil)'), outro: () => t('Avatar do intérprete') },
  legenda: { meu: () => t('Meu avatar (do Perfil)'), outro: () => t('Avatar do intérprete') },
};

/**
 * O PAINEL "AVATAR" de qualquer modo: o MESMO painel no Livro e na Legenda. Quem aparece (o seu avatar do Perfil, que pode
 * ser o que você trouxe, ou o do intérprete), o tamanho, o modo economia e o aviso por voz (estes três valem em todos os
 * modos e no Intérprete). Esc fecha e devolve o foco; controles nativos, lidos por qualquer leitor de tela.
 */
export default function PainelDoAvatarDoModo({
  modo,
  prefs,
  gerais,
  aoMudar,
  aoMudarGerais,
  aoDesligar,
  aoFechar,
  aoEscolherMeuAvatar,
  comPip = false,
  sem3d = false,
}: {
  modo: ModoDoAvatar;
  prefs: PreferenciasDoModo;
  gerais: PreferenciasDosAvatares;
  aoMudar: (parcial: Partial<PreferenciasDoModo>) => void;
  aoMudarGerais: (parcial: Partial<PreferenciasDosAvatares>) => void;
  aoDesligar: () => void;
  aoFechar: () => void;
  /** Leva a Perfil › Avatar (escolher outro ou trazer o seu). Ausente onde o Perfil não existe. */
  aoEscolherMeuAvatar?: (() => void) | undefined;
  /** Oferece "mostrar também na janela flutuante" (só a legenda). */
  comPip?: boolean;
  sem3d?: boolean;
}) {
  const primeiro = useRef<HTMLInputElement>(null);
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    primeiro.current?.focus();
    return () => antes?.focus?.();
  }, []);
  return (
    <div
      className="avm-painel"
      role="dialog"
      aria-label={TITULO[modo]()}
      data-testid="painel-do-avatar"
      data-modo={modo}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          fecharRef.current();
        }
      }}
    >
      <h2 className="avm-titulo">{TITULO[modo]()}</h2>
      <p className="avm-nota">{t('O texto continua sempre à vista. O avatar é só um complemento.')}</p>

      <fieldset className="avm-grupo">
        <legend>{t('Quem aparece')}</legend>
        {(['meu', 'outro'] as const).map((q, i) => (
          <label key={q} className="avm-opcao">
            <input
              ref={i === 0 ? primeiro : undefined}
              type="radio"
              name={`avm-quem-${modo}`}
              checked={prefs.dono === q}
              onChange={() => aoMudar({ dono: q })}
              data-testid={`avm-quem-${q}`}
            />
            <span>{QUEM[modo][q]()}</span>
          </label>
        ))}
        {aoEscolherMeuAvatar && (
          <button
            type="button"
            className="avm-botao avm-link"
            data-testid="avm-escolher-meu"
            onClick={() => {
              aoFechar();
              aoEscolherMeuAvatar();
            }}
          >
            {t('Escolher ou trazer o meu avatar')}
          </button>
        )}
      </fieldset>

      <fieldset className="avm-grupo">
        <legend>{t('Tamanho')}</legend>
        <div className="avm-tamanhos">
          {TAMANHOS_DO_AVATAR.map((tm) => (
            <label key={tm} className="avm-opcao avm-tamanho">
              <input
                type="radio"
                name={`avm-tamanho-${modo}`}
                checked={gerais.tamanho === tm}
                onChange={() => aoMudarGerais({ tamanho: tm })}
                aria-label={NOME_DE_TAMANHO[tm]()}
                data-testid={`avm-tamanho-${tm}`}
              />
              <span aria-hidden>{tm.toUpperCase()}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {comPip && (
        <label className="avm-opcao avm-linha">
          <input
            type="checkbox"
            checked={prefs.noPip}
            onChange={(e) => aoMudar({ noPip: e.target.checked })}
            data-testid="avm-no-pip"
          />
          <span>{t('Mostrar também na janela flutuante')}</span>
        </label>
      )}
      <label className="avm-opcao avm-linha">
        <input
          type="checkbox"
          checked={gerais.economia}
          onChange={(e) => aoMudarGerais({ economia: e.target.checked })}
          data-testid="avm-economia"
        />
        <span>{t('Modo economia: sem avatares, a tela como era antes')}</span>
      </label>
      <label className="avm-opcao avm-linha">
        <input
          type="checkbox"
          checked={gerais.anunciar}
          onChange={(e) => aoMudarGerais({ anunciar: e.target.checked })}
          data-testid="avm-anunciar"
        />
        <span>{t('Avisar por voz do leitor de tela quando o avatar falar')}</span>
      </label>
      {sem3d && (
        <p className="avm-nota">{t('Este aparelho não mostra o avatar em 3D: aparecem a foto ou as iniciais.')}</p>
      )}

      <div className="avm-acoes">
        <button type="button" className="avm-botao" data-testid="avm-desligar" onClick={aoDesligar}>
          {t('Desligar o avatar')}
        </button>
        <button type="button" className="avm-botao avm-pri" data-testid="avm-pronto" onClick={aoFechar}>
          {t('Pronto')}
        </button>
      </div>
    </div>
  );
}
