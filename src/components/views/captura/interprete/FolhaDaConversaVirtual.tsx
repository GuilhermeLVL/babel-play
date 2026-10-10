/* A folha traz o CSS das peças que usa: a folha de baixo e a caixa de marcar da exportação. */
import '../../../../styles/capturaNoCelular.css';
import '../../../../styles/exportacao.css';

import { useEffect, useRef, useState } from 'react';

import { t } from '../../../../lib/i18n';
import FolhaDeBaixo from '../celular/FolhaDeBaixo';

/**
 * A FOLHA DA CONVERSA VIRTUAL — o que o botão "Virtual" da conversa abre, por cima dela (antes levava
 * à tela de entrada antiga). Diz o que a conversa virtual é e pede as duas coisas de sempre antes de
 * começar (`interprete-conversa-virtual`, requisito "Aviso antes de começar"):
 *   1. o aceite (18 anos ou mais, avisar quem estiver na conversa, nada é gravado): OBRIGATÓRIO, e
 *      pedido de novo a cada conversa (a folha monta com as caixas desmarcadas);
 *   2. "estou de fone": opcional; de fone, o microfone também traduz o que a pessoa fala.
 *
 * Sem peça nova: é a folha das outras confirmações do desenho novo (`niveis/FolhaDoCadeado.tsx`: a
 * `FolhaDeBaixo` do protótipo, `.pj-como.ad-confirma`, a frase de `.pj-como-ajudas`, as linhas de
 * `.ad-lista` e o pé `.ad-confirma-pe`), com a caixa de marcar da exportação (`.exp-caixa`) em cada linha.
 */
export default function FolhaDaConversaVirtual({
  aoComecar,
  aoFechar,
}: {
  /** Chamado depois de a folha fechar, ainda dentro do toque: o seletor da aba ou tela exige o gesto. */
  aoComecar: (opcoes: { comMicrofone: boolean }) => void;
  aoFechar: () => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  /** O que acontece DEPOIS de a folha fechar (como em `FolhaDoCadeado`). */
  const depois = useRef<(() => void) | null>(null);
  const [aceitou, setAceitou] = useState(false);
  const [deFone, setDeFone] = useState(false);
  /* O foco vai para a folha, não para a primeira caixa (`focarFolha()` de `anuncios.js:574`). */
  useEffect(() => {
    const d = folha.current;
    if (!d) return;
    d.setAttribute('tabindex', '-1');
    d.focus({ preventScroll: true });
  }, []);
  const fecharE = (faz: (() => void) | null) => {
    depois.current = faz;
    folha.current?.close();
  };

  return (
    <FolhaDeBaixo
      titulo={t('Conversa virtual')}
      classe="pj-como-folha ad-folha"
      doPrototipo
      refDaFolha={folha}
      aoFechar={() => {
        const faz = depois.current;
        depois.current = null;
        aoFechar();
        faz?.();
      }}
    >
      <div className="pj-como ad-confirma" data-testid="folha-conversa-virtual">
        <span className="label-mono">{t('Intérprete')}</span>
        <h2>{t('Conversa virtual')}</h2>
        <p className="pj-como-ajudas">
          {t(
            'Traduz o áudio do computador (vídeo, Discord, jogo, chamada) para você ler, e a sua voz para a outra pessoa. Você escolhe a aba ou a tela com áudio.',
          )}
        </p>
        <ul className="ad-lista">
          <li>
            <label className="exp-caixa">
              <input
                type="checkbox"
                checked={aceitou}
                onChange={(e) => setAceitou(e.target.checked)}
                data-testid="aceite-da-conversa-virtual"
              />
              <span>
                {t(
                  'Tenho 18 anos ou mais e vou avisar quem estiver na conversa de que ela está sendo traduzida. Nada é gravado.',
                )}
              </span>
            </label>
          </li>
          <li>
            <label className="exp-caixa">
              <input
                type="checkbox"
                checked={deFone}
                onChange={(e) => setDeFone(e.target.checked)}
                data-testid="fone-da-conversa-virtual"
              />
              <span>
                {t(
                  'Estou de fone: o microfone também traduz o que eu falo. Sem fone, ele fica desligado para não ouvir o computador.',
                )}
              </span>
            </label>
          </li>
        </ul>
        <div className="ad-confirma-pe">
          <button type="button" className="btn btn-outline" onClick={() => fecharE(null)}>
            {t('Agora não')}
          </button>
          <button
            type="button"
            className="btn btn-solid"
            disabled={!aceitou}
            onClick={() => fecharE(() => aoComecar({ comMicrofone: deFone }))}
            data-testid="comecar-conversa-virtual"
          >
            {t('Começar conversa virtual')}
          </button>
        </div>
      </div>
    </FolhaDeBaixo>
  );
}
