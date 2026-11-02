import { BookOpen, Hand, Info, X } from 'lucide-react';
import { useState } from 'react';

import type { AtalhoDeSoletrar } from '../../../../core/avatar/descoberta';
import { t } from '../../../../lib/i18n';

/**
 * A LINHA DOS AVATARES, embaixo da faixa do Intérprete: o atalho "Soletrar nomes (Libras/ASL)" (só com `avatar_sinais`),
 * a explicação quando o avatar não serve para soletrar e a dica da primeira vez. Tudo é complemento: a legenda e a voz
 * da conversa não dependem disto. Os dois avisos fixos da soletração ficam com `SoletracaoNaConversa` (sempre à vista
 * enquanto a opção está ligada); aqui não se repetem nem se escondem.
 */
export default function LinhaDosAvatares({
  atalho,
  aoAlternar,
  dica,
  aoDispensarDica,
  motivoEmTexto,
  aoEscolherOutroAvatar,
  aoMostrarInterprete,
  aoAbrirGuia,
}: {
  atalho: AtalhoDeSoletrar;
  aoAlternar: () => void;
  /** A dica da primeira vez ainda está à vista. */
  dica: boolean;
  aoDispensarDica: () => void;
  /** O texto do motivo pelo qual não dá para soletrar (vem do painel, que já o tem). */
  motivoEmTexto: string | null;
  /** Leva a Perfil › Avatar (ausente onde o Perfil não existe). */
  aoEscolherOutroAvatar?: (() => void) | undefined;
  aoMostrarInterprete: () => void;
  /** Abre o guia "Alfabeto manual" (só quando o avatar consegue soletrar). */
  aoAbrirGuia?: (() => void) | undefined;
}) {
  const [explicando, setExplicando] = useState(false);
  if (atalho.tipo === 'oculto' && !dica) return null;
  const indisponivel = atalho.tipo === 'indisponivel';
  const pressionado = atalho.tipo === 'pronto' && atalho.ligado;
  const aoTocar = () => {
    if (atalho.tipo === 'pronto') {
      aoDispensarDica();
      aoAlternar();
    } else if (atalho.tipo === 'indisponivel') setExplicando((v) => !v);
  };
  return (
    <div className="int-av-linha-atalhos" data-testid="linha-dos-avatares">
      {atalho.tipo !== 'oculto' && (
        <button
          type="button"
          className="int-modo int-modo-avatar"
          aria-pressed={pressionado}
          aria-disabled={atalho.tipo === 'verificando' ? true : undefined}
          aria-expanded={indisponivel ? explicando : undefined}
          aria-describedby={indisponivel && explicando ? 'int-av-explica' : undefined}
          data-indisponivel={indisponivel ? '' : undefined}
          onClick={aoTocar}
          data-testid="atalho-soletrar"
        >
          <Hand aria-hidden />
          <span className="int-modo-visivel">{t('Soletrar nomes (Libras/ASL)')}</span>
          <span className="int-modo-estado" aria-hidden>
            {pressionado ? t('Ligado') : t('Desligado')}
          </span>
        </button>
      )}
      {atalho.tipo === 'pronto' && aoAbrirGuia && (
        <button
          type="button"
          className="int-modo int-modo-avatar int-modo-guia"
          aria-haspopup="dialog"
          title={t('Alfabeto manual')}
          onClick={aoAbrirGuia}
          data-testid="abrir-guia-do-alfabeto"
        >
          <BookOpen aria-hidden />
          <span className="int-modo-visivel">{t('Alfabeto manual')}</span>
        </button>
      )}
      {indisponivel && explicando && (
        <div id="int-av-explica" className="int-av-explica" role="status" data-testid="atalho-soletrar-explica">
          <Info aria-hidden />
          <p>
            {t('Não dá para soletrar com este avatar.')} {motivoEmTexto}
          </p>
          <div className="int-av-explica-acoes">
            {atalho.saida === 'outro_avatar' && aoEscolherOutroAvatar && (
              <button
                type="button"
                className="int-ib int-ib-pri"
                onClick={aoEscolherOutroAvatar}
                data-testid="atalho-outro-avatar"
              >
                {t('Escolher outro avatar')}
              </button>
            )}
            {atalho.saida === 'mostrar_interprete' && (
              <button
                type="button"
                className="int-ib int-ib-pri"
                onClick={() => {
                  aoMostrarInterprete();
                  setExplicando(false);
                }}
                data-testid="atalho-mostrar-interprete"
              >
                {t('Mostrar o intérprete')}
              </button>
            )}
            <button type="button" className="int-ib" onClick={() => setExplicando(false)}>
              {t('Fechar')}
            </button>
          </div>
        </div>
      )}
      {dica && !(indisponivel && explicando) && (
        <div className="int-av-dica" role="status" data-testid="dica-dos-avatares">
          <p>
            {atalho.tipo === 'oculto'
              ? t('Novo: toque em Avatares para ver um avatar na conversa.')
              : t('Novo: toque em Avatares para ver um avatar na conversa, ou ligue aqui a soletração de nomes.')}
          </p>
          <button
            type="button"
            className="int-ib peq"
            aria-label={t('Dispensar a dica')}
            onClick={aoDispensarDica}
            data-testid="dica-dispensar"
          >
            <X aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
