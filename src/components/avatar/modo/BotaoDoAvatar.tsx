import '../../../styles/avatarDoModo.css';

import { Settings2, UserRound, X } from 'lucide-react';

import type { ModoDoAvatar } from '../../../core/avatar/modos';
import { t } from '../../../lib/i18n';

/**
 * O BOTÃO "AVATAR": o mesmo em todos os modos (ícone + rótulo, alvo de 44 px, `aria-pressed` = ligado). Um toque liga
 * ou desliga; o estado se lê pelo atributo e pela cor, nunca só pela cor. `classe` deixa cada tela vestir o botão com o
 * visual dela (`leitor-botao leitor-botao-rotulo`, `q-ctl`).
 */
export function BotaoDoAvatar({
  modo,
  ligado,
  aoAlternar,
  classe = '',
}: {
  modo: ModoDoAvatar;
  ligado: boolean;
  aoAlternar: () => void;
  classe?: string;
}) {
  return (
    <button
      type="button"
      className={classe || 'avm-alvo'}
      aria-pressed={ligado}
      aria-label={ligado ? t('Avatar ligado: desligar') : t('Avatar desligado: ligar')}
      data-testid={`botao-avatar-${modo}`}
      onClick={aoAlternar}
    >
      <UserRound aria-hidden />
      <span>{t('Avatar')}</span>
    </button>
  );
}

/** O botão que abre o painel de ajustes do avatar (a engrenagem, ao lado do avatar na tela). */
export function BotaoDeAjustesDoAvatar({
  modo,
  aberto,
  aoAlternar,
  classe = '',
}: {
  modo: ModoDoAvatar;
  aberto: boolean;
  aoAlternar: () => void;
  classe?: string;
}) {
  return (
    <button
      type="button"
      className={`avm-alvo avm-so-icone ${classe}`.trim()}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      aria-label={t('Ajustes do avatar')}
      data-testid={`ajustes-avatar-${modo}`}
      onClick={aoAlternar}
    >
      <Settings2 aria-hidden />
    </button>
  );
}

/**
 * A DICA DA PRIMEIRA VEZ de um modo: uma faixa discreta, dispensável e lembrada neste aparelho. Sem pop-up, sem tirar o
 * foco, sem prender ninguém: dois botões comuns.
 */
export function DicaDoAvatar({
  modo,
  aoLigar,
  aoDispensar,
}: {
  modo: ModoDoAvatar;
  aoLigar: () => void;
  aoDispensar: () => void;
}) {
  return (
    <section className="avm-dica" aria-label={t('Dica: avatar')} data-testid={`dica-avatar-${modo}`}>
      <UserRound aria-hidden className="avm-dica-icone" />
      <p>
        {modo === 'livro'
          ? t('Um avatar pode ler o livro com você, ao lado do texto.')
          : t('Um avatar pode ouvir a legenda com você, ao lado do texto.')}
      </p>
      <button
        type="button"
        className="avm-alvo avm-dica-acao"
        data-testid={`dica-avatar-${modo}-ligar`}
        onClick={aoLigar}
      >
        {t('Ligar o avatar')}
      </button>
      <button
        type="button"
        className="avm-alvo avm-so-icone"
        aria-label={t('Dispensar a dica')}
        data-testid={`dica-avatar-${modo}-dispensar`}
        onClick={aoDispensar}
      >
        <X aria-hidden />
      </button>
    </section>
  );
}
