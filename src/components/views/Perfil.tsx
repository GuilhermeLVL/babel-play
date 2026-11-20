import '../../styles/questConta.css';

import { ShieldCheck, Smile, TrendingUp, User } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';

import { FLAG_AVATAR_3D } from '../../core/planos';
import { abaPedidaAoPerfil, consumirAbaDoPerfil } from '../../lib/avatar/descoberta';
import { useFlag } from '../../lib/flags';
import { t } from '../../lib/i18n';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import { useAbasAVista } from '../../lib/polimento/ajustes';
import type { AgeProfileType } from '../../lib/profile';
import type { DerivedProgress } from '../../lib/progress';
import ConviteDoAvatar from '../perfil/ConviteDoAvatar';
import MolduraETitulo from '../perfil/MolduraETitulo';
import { PainelDeAba } from '../ui';
import AbasDoQuest from './ajustes/quest/AbasDoQuest';
import AbaDados from './perfil/AbaDados';
import AbaProgresso from './perfil/AbaProgresso';
import AbaVoce from './perfil/AbaVoce';

/* O avatar (flag `avatar_3d`) mora num chunk próprio: nem a tela, nem o motor 3D entram no arranque. */
const AbaAvatar = lazyComRecarga(() => import('../avatar/meuAvatar/AbaAvatar'));

/**
 * PERFIL — quem você é e onde você está.
 *
 * A FORMA É A DO PROTÓTIPO APROVADO (`T.perfil` em `docs/prototipos/consistencia-telas.html`):
 * cabeçalho "Sua conta · Seu perfil" e três abas — Você, Progresso, Seus dados.
 *
 * UMA TELA, TRÊS ABAS, e isso é uma decisão: identidade e trajetória são a mesma pergunta feita de
 * dois ângulos, e "Seus dados" (LGPD art. 18) mora junto de quem os dados descrevem.
 *
 * COMO SE CHEGA AQUI: pelo avatar no canto do shell (`shell/MenuDaConta`), que aparece nas quatro
 * posições de menu e no celular.
 */

interface PerfilProps {
  progress: DerivedProgress;
  ageProfile: AgeProfileType;
}

export default function Perfil({ progress, ageProfile }: PerfilProps) {
  const avatarLigado = useFlag(FLAG_AVATAR_3D);
  /* Quem vem do Intérprete ("Escolher outro avatar") pede a aba Avatar; a flag pode chegar depois da tela, então o pedido
     só vale se a flag estiver ligada ao montar (senão a aba não existe e cai em Você). */
  const [aba, setAba] = useState(() => (abaPedidaAoPerfil() === 'avatar' && avatarLigado ? 'avatar' : 'voce'));
  useEffect(() => {
    consumirAbaDoPerfil();
  }, []);
  /* O Perfil não existe no protótipo: recebe a camada comum, como os Ajustes (a aba escolhida à vista). */
  const palco = useRef<HTMLDivElement>(null);
  useAbasAVista(palco, aba);

  /* QUEST: as mesmas três abas, na mesma ordem, no desenho do headset. Cada aba (`perfil/*`) tem o
     próprio ramo do Quest, com o mesmo estado: aqui só mudam o cabeçalho e as abas. */
  return (
    <div ref={palco} className="q-palco qc" data-testid="perfil-do-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{t('Sua conta')}</p>
          <h1>{t('Seu perfil')}</h1>
          <p className="qc-sub">
            {aba === 'voce'
              ? t('Como o app te chama, o que você quer alcançar e onde está em cada idioma.')
              : aba === 'avatar'
                ? t('Escolha, personalize e guarde o avatar que te representa. É opcional.')
                : t('Os seus dados, o que você já conquistou e onde você está no idioma.')}
          </p>
        </div>
        <MolduraETitulo nivel={progress.available ? progress.level : 1} tamanho={56} />
      </header>

      {aba !== 'avatar' && <ConviteDoAvatar flag={avatarLigado} aoCriar={() => setAba('avatar')} />}

      <AbasDoQuest
        rotuloDoGrupo={t('Seções do perfil')}
        grade={avatarLigado}
        ativo={aba}
        aoTrocar={setAba}
        itens={[
          { id: 'voce', rotulo: t('Você'), icone: <User aria-hidden /> },
          { id: 'progresso', rotulo: t('Progresso'), icone: <TrendingUp aria-hidden /> },
          { id: 'dados', rotulo: t('Seus dados'), icone: <ShieldCheck aria-hidden /> },
          ...(avatarLigado ? [{ id: 'avatar', rotulo: t('Avatar'), icone: <Smile aria-hidden /> }] : []),
        ]}
      />

      <PainelDeAba id="voce" ativo={aba} className="qc-painel">
        <AbaVoce />
      </PainelDeAba>
      <PainelDeAba id="progresso" ativo={aba} className="qc-painel">
        <AbaProgresso progress={progress} ageProfile={ageProfile} />
      </PainelDeAba>
      <PainelDeAba id="dados" ativo={aba} className="qc-painel">
        <AbaDados />
      </PainelDeAba>
      {avatarLigado && (
        <PainelDeAba id="avatar" ativo={aba} className="qc-painel">
          <Suspense fallback={<div role="status">{t('Carregando…')}</div>}>
            <AbaAvatar
              nivel={progress.available ? progress.level : 1}
              saldoSeeds={progress.available ? progress.seeds : 0}
            />
          </Suspense>
        </PainelDeAba>
      )}
    </div>
  );
}
