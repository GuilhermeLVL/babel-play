import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { FaixaDeclarada } from '../../core/acessoSemConta';
import { lembrarDeOndeVeio } from '../../lib/estado/useGateDeConta';
import { t } from '../../lib/i18n';
import CascaDeEntradaDoQuest from '../auth/quest/CascaDeEntradaDoQuest';
import Login from '../Login';

type Etapa = 'pergunta' | 'menor' | 'entrar';

/**
 * A PORTA OBRIGATÓRIA do acesso sem conta v2 (openspec `acesso-sem-conta-v2`, flag
 * `acesso_restrito_sem_conta`): depois da 1ª sessão, quem volta ou começa a 2ª passa por aqui.
 *
 *  · A pergunta "Você tem 18 anos ou mais?" é autodeclaração e fica SÓ neste aparelho
 *    (`faixaSemConta`). Não é verificação de idade: ao criar a conta, a `PerguntaDeIdade` decide.
 *  · Adulto: o Login de sempre (na casca com a vitrine), SEM "Continuar sem conta". Depois de entrar,
 *    a intenção guardada aqui devolve a pessoa ao destino e o `ModalDeMigracao` oferece subir o que
 *    ficou neste navegador.
 *  · Menor de 18: segue no modo local como hoje, sem pressão; o convite é neutro e não volta a cada tela.
 *  · LIVRO (`aoVoltarAoLivro`): a leitura de um livro sem `podeLer` também passa por aqui. A porta diz por
 *    quê, guarda a rota da leitura (o livro abre depois do login) e oferece a volta à ficha, que é livre.
 */
export default function PortaDeEntrada({
  faixa,
  aoDeclarar,
  modoInicial = 'signup',
  aoVoltarAoLivro,
}: {
  faixa: FaixaDeclarada;
  aoDeclarar: (f: 'adulto' | 'menor') => void;
  modoInicial?: 'login' | 'signup';
  /** A porta abriu na leitura de um livro: a volta à ficha dele (o catálogo e as fichas são livres). */
  aoVoltarAoLivro?: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>(faixa === 'adulto' ? 'entrar' : 'pergunta');

  /* Quem entra por aqui volta para onde ia (a tela de captura da 2ª sessão, a rota que abriu). */
  useEffect(() => {
    lembrarDeOndeVeio();
  }, []);

  const voltarAoLivro = aoVoltarAoLivro && (
    <p className="qen-rodape">
      <button type="button" className="qen-link" onClick={aoVoltarAoLivro}>
        {t('Voltar ao livro')}
      </button>
    </p>
  );

  if (etapa === 'entrar') {
    return (
      <Login
        modoInicial={modoInicial}
        rodape={
          <>
            {aoVoltarAoLivro && (
              <p className="qen-nota" data-testid="porta-do-livro">
                {t('Para ler, entre na sua conta ou crie uma. O catálogo e as fichas continuam abertos.')}
              </p>
            )}
            <p className="qen-rodape">
              <button type="button" className="qen-link" onClick={() => setEtapa('pergunta')}>
                {t('Tenho menos de 18 anos')}
              </button>
            </p>
            {voltarAoLivro}
          </>
        }
      />
    );
  }

  if (etapa === 'menor') {
    return (
      <CascaDeEntradaDoQuest testId="porta-de-entrada">
        <header className="qen-cab">
          <div>
            <h1>{t('Tudo certo')}</h1>
            <p>{t('Você continua usando o Frasy neste navegador, como até agora.')}</p>
          </div>
        </header>
        <p className="qen-aviso" data-testid="convite-do-responsavel">
          <ShieldCheck aria-hidden />
          <span>{t('Com um responsável, você pode criar uma conta.')}</span>
        </p>
        <div className="qen-acoes">
          <button type="button" className="qen-botao pri" onClick={() => aoDeclarar('menor')}>
            {t('Continuar')}
          </button>
        </div>
        <p className="qen-rodape">
          <button type="button" className="qen-link" onClick={() => setEtapa('pergunta')}>
            {t('Voltar')}
          </button>
        </p>
      </CascaDeEntradaDoQuest>
    );
  }

  return (
    <CascaDeEntradaDoQuest testId="porta-de-entrada">
      <header className="qen-cab">
        <div>
          <p className="qen-sobre">{t('Antes de continuar')}</p>
          <h1>{t('Você tem 18 anos ou mais?')}</h1>
          <p>{t('A resposta fica só neste aparelho e serve para mostrar o caminho certo para você.')}</p>
        </div>
      </header>
      <div className="qen-acoes">
        <button
          type="button"
          className="qen-botao pri"
          onClick={() => {
            aoDeclarar('adulto');
            setEtapa('entrar');
          }}
        >
          {t('Sim, tenho 18 anos ou mais')}
        </button>
        <button type="button" className="qen-botao" onClick={() => setEtapa('menor')}>
          {t('Não, tenho menos de 18')}
        </button>
      </div>
      {voltarAoLivro}
    </CascaDeEntradaDoQuest>
  );
}
