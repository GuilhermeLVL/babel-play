import { ShieldCheck, TrendingUp, User, UserRound } from 'lucide-react';
import { useState } from 'react';

import { t } from '../../lib/i18n';
import type { AgeProfileType } from '../../lib/profile';
import type { DerivedProgress } from '../../lib/progress';
import MolduraETitulo from '../perfil/MolduraETitulo';
import { Abas, CabecalhoDeTela, PainelDeAba, Tela } from '../ui';
import AbaDados from './perfil/AbaDados';
import AbaProgresso from './perfil/AbaProgresso';
import AbaVoce from './perfil/AbaVoce';

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
  const [aba, setAba] = useState('voce');

  return (
    <Tela largura="estreita">
      <CabecalhoDeTela
        sobrancelha={t('Sua conta')}
        icone={UserRound}
        titulo={t('Seu perfil')}
        /* Recompensas v2: a moldura e o título que a pessoa vestiu (maestria, conquista, temporada). */
        acoes={<MolduraETitulo nivel={progress.available ? progress.level : 1} tamanho={44} />}
        /* O protótipo troca o subtítulo por aba: "Você" fala do formulário; as outras duas, do resto. */
        sub={
          aba === 'voce'
            ? t('Como o app te chama, o que você quer alcançar e onde está em cada idioma.')
            : t('Os seus dados, o que você já conquistou e onde você está no idioma.')
        }
        abas={
          <Abas
            rotuloDoGrupo={t('Seções do perfil')}
            ativo={aba}
            aoTrocar={setAba}
            itens={[
              { id: 'voce', rotulo: t('Você'), icone: <User aria-hidden /> },
              { id: 'progresso', rotulo: t('Progresso'), icone: <TrendingUp aria-hidden /> },
              /* 'Conquistas' saiu do Perfil (v4, 31/08): um lugar só, Personalizar → Desafios. */
              // LGPD art. 18: exportar e excluir existiam no servidor e NENHUMA tela chamava (E5).
              { id: 'dados', rotulo: t('Seus dados'), icone: <ShieldCheck aria-hidden /> },
            ]}
          />
        }
      />

      <PainelDeAba id="voce" ativo={aba}>
        <AbaVoce />
      </PainelDeAba>

      <PainelDeAba id="progresso" ativo={aba}>
        <AbaProgresso progress={progress} ageProfile={ageProfile} />
      </PainelDeAba>

      <PainelDeAba id="dados" ativo={aba}>
        <AbaDados />
      </PainelDeAba>
    </Tela>
  );
}
