import { useState } from 'react';
import { User, TrendingUp } from 'lucide-react';
import { Abas, PainelDeAba } from '../ui';
import { usePerfil } from '../../lib/usePerfil';
import type { DerivedProgress } from '../../lib/progress';
import type { AgeProfileType } from '../../lib/profile';
import AbaVoce from './perfil/AbaVoce';
import AbaProgresso from './perfil/AbaProgresso';

/**
 * PERFIL — quem você é e onde você está.
 *
 * UMA TELA, DUAS ABAS, e isso é uma decisão. As duas coisas foram pedidas na mesma frase ("uma tela
 * pra acompanhar o nível do usuário… e o perfil do usuário"), e são a mesma pergunta feita de dois
 * ângulos: identidade e trajetória. Dois destinos separados obrigariam a escolher entre eles no
 * menu, sem que ninguém saiba de antemão qual quer.
 *
 * O QUE ESTA TELA CONSERTA. Antes dela, a aplicação era anônima e sem espelho: nenhum lugar mostrava
 * quem estava logado, não havia perfil no banco, o nível só aparecia como um número no Início, e o
 * único botão de sair estava a quatro níveis de profundidade dentro de Ajustes — dentro de uma
 * seção que, sem login configurado, não renderiza nada.
 *
 * COMO SE CHEGA AQUI: pelo avatar no canto do shell (`shell/MenuDaConta`), que aparece nas quatro
 * posições de menu e no celular. Não entrou em `NAV_ITEMS` porque a barra do celular já renderiza a
 * lista inteira e está no limite de largura por item.
 */

interface PerfilProps {
  progress: DerivedProgress;
  ageProfile: AgeProfileType;
}

export default function Perfil({ progress, ageProfile }: PerfilProps) {
  const [aba, setAba] = useState('voce');
  const { perfil } = usePerfil();

  const nome = perfil?.displayName?.trim();

  return (
    <div className="flex-1 overflow-y-auto w-full bg-canvas">
      <div className="p-6 md:p-10 max-w-4xl mx-auto w-full">

        <header className="mb-6">
          <span className="label-mono text-accent">Sua conta</span>
          <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight mt-1 mb-2">
            {/* Cumprimenta pelo nome quando ele existe — e não inventa um quando não existe. */}
            {nome ? `Olá, ${nome.split(/\s+/)[0]}` : 'Seu perfil'}
          </h1>
          <p className="text-ink-muted text-xs md:text-sm max-w-[62ch]">
            Os seus dados, o que você já conquistou e onde você está no idioma.
          </p>
        </header>

        <Abas
          rotuloDoGrupo="Seções do perfil"
          ativo={aba}
          aoTrocar={setAba}
          className="mb-8"
          itens={[
            { id: 'voce', rotulo: 'Você', icone: <User className="w-4 h-4" /> },
            { id: 'progresso', rotulo: 'Progresso', icone: <TrendingUp className="w-4 h-4" /> },
          ]}
        />

        <PainelDeAba id="voce" ativo={aba}>
          <AbaVoce />
        </PainelDeAba>

        <PainelDeAba id="progresso" ativo={aba}>
          <AbaProgresso progress={progress} ageProfile={ageProfile} />
        </PainelDeAba>
      </div>
    </div>
  );
}
