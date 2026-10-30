import { ChevronDown, ChevronUp } from 'lucide-react';

import { estadoDoNarrador, modeloDoPersonagem } from '../../../core/avatar/modos';
import { COLECAO_CURADA } from '../../../data/avatar/colecao';
import type { PonteDaVoz } from '../../../lib/avatar/ponteDaVoz';
import { t } from '../../../lib/i18n';
import type { VistaDoNarrador } from '../../../lib/leitor/narrador';
import { useReceitaDoDono } from '../../avatar/AvatarDaConversa';
import AvatarDoModo from '../../avatar/modo/AvatarDoModo';
import { BotaoDeAjustesDoAvatar } from '../../avatar/modo/BotaoDoAvatar';
import type { AvatarDoModoControle } from '../../avatar/modo/useAvatarDoModo';

/** Quanto do texto da frase cabe na legenda do avatar (o resto está no livro, destacado). */
const MAX_LEGENDA = 140;
const IDS_DA_COLECAO = COLECAO_CURADA.map((m) => m.id);

const ESTADO_EM_TEXTO = (fase: VistaDoNarrador['fase']): string =>
  fase === 'tocando'
    ? t('Lendo')
    : fase === 'virando'
      ? t('Abrindo o capítulo…')
      : fase === 'pausada'
        ? t('Pausado')
        : t('Pronto para ouvir');

/**
 * O AVATAR DO NARRADOR NO LIVRO (flag `avatar_3d`; o elenco, `avatar_elenco`, só troca o rosto de quem fala a frase).
 * Mora numa faixa logo acima da barra da narração, no fluxo da tela (nunca por cima do texto): o avatar com os estados
 * lendo/pausado, a boca que segue a voz (estimada pelo texto), a legenda da frase e dois botões: recolher (fica só a
 * legenda) e ajustes. A LEGENDA em texto fica SEMPRE: o avatar é só imagem, quem lê e ouve nunca depende dele.
 */
export default function AvatarDoNarrador({
  vista,
  ctl,
  ponte,
  elencoLigado = false,
}: {
  vista: VistaDoNarrador;
  ctl: AvatarDoModoControle;
  ponte: PonteDaVoz;
  /** Elenco ligado: cada personagem ganha um rosto próprio. */
  elencoLigado?: boolean;
}) {
  const minha = useReceitaDoDono('meu');
  const fala = vista.fala;
  const falando = vista.fase === 'tocando';
  const quem = fala?.nome ?? t('Narrador');
  const frase = vista.frase.length > MAX_LEGENDA ? `${vista.frase.slice(0, MAX_LEGENDA).trimEnd()}…` : vista.frase;
  const idDaPessoa = minha?.base.origem === 'colecao' ? minha.base.id : null;
  const modeloId = elencoLigado && fala?.nome ? modeloDoPersonagem(fala.nome, IDS_DA_COLECAO, idDaPessoa) : null;
  const estado = estadoDoNarrador(vista.fase);
  return (
    <section
      className="leitor-avatar-narrador"
      aria-label={t('Narrador')}
      data-testid="avatar-do-narrador"
      data-estado={estado}
      data-recolhido={ctl.recolhido ? '' : undefined}
    >
      {!ctl.recolhido && (
        <div
          className="leitor-avatar-narrador-rosto"
          data-testid="avatar-do-narrador-rosto"
          data-emocao={fala?.emocao ?? 'neutro'}
        >
          <AvatarDoModo
            modo="livro"
            dono={ctl.dono}
            estado={estado}
            fonteDaBoca={falando ? ponte.pose : null}
            emocao={fala?.emocao ?? 'neutro'}
            lado={ctl.lado}
            tier={ctl.tier}
            fallback2d={ctl.fallback2d}
            anunciar={ctl.anunciar}
            modeloId={modeloId}
            {...(fala?.nome ? { nomeDoModelo: fala.nome } : {})}
          />
        </div>
      )}
      <p className="leitor-avatar-narrador-legenda" data-testid="avatar-do-narrador-legenda">
        <b>{quem}</b>
        <small data-testid="avatar-do-narrador-estado">{ESTADO_EM_TEXTO(vista.fase)}</small>
        {frase ? <span>{frase}</span> : null}
      </p>
      <button
        type="button"
        className="avm-alvo avm-so-icone"
        aria-expanded={!ctl.recolhido}
        aria-label={ctl.recolhido ? t('Mostrar o avatar') : t('Recolher o avatar')}
        data-testid="avatar-do-narrador-recolher"
        onClick={() => ctl.recolher(!ctl.recolhido)}
      >
        {ctl.recolhido ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
      </button>
      <BotaoDeAjustesDoAvatar modo="livro" aberto={ctl.painelAberto} aoAlternar={ctl.alternarPainel} />
      {ctl.painel && <div className="leitor-avatar-painel">{ctl.painel}</div>}
    </section>
  );
}
