/* A folha traz o CSS da peça que usa: a folha de baixo (as confirmações e o `.q-rotulo` são da casca). */
import '../../styles/capturaNoCelular.css';

import { useEffect, useRef } from 'react';

import { t } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import type { LadoDaVoz } from '../../lib/voz/catalogoDeVozes';
import FolhaDeBaixo from '../views/captura/celular/FolhaDeBaixo';
import SeletorDeVoz from './SeletorDeVoz';

/**
 * A FOLHA DAS VOZES DA CONVERSA — o que a pílula de voz do intérprete e da conversa virtual abre.
 *
 * Cada lado da conversa ouve um idioma, então são DUAS vozes: o seletor (`SeletorDeVoz`) aparece uma vez
 * por idioma. A escolha é a mesma preferência do app inteiro e vale na próxima fala lida.
 *
 * Sem peça nova: é a folha das outras confirmações da conversa (`FolhaDaConversaVirtual`: a
 * `FolhaDeBaixo` do protótipo, `.pj-como.ad-confirma`, a frase de `.pj-como-ajudas` e o pé
 * `.ad-confirma-pe`), com o rótulo `.q-rotulo` em cima de cada lista.
 */
export default function FolhaDasVozes({
  lados,
  nuvem,
  aoFechar,
}: {
  lados: readonly LadoDaVoz[];
  /** O plano tem a voz natural ligada nesta conversa? */
  nuvem?: boolean;
  aoFechar: () => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  /* O foco vai para a folha, não para a primeira voz (como nas outras folhas da conversa). */
  useEffect(() => {
    const d = folha.current;
    if (!d) return;
    d.setAttribute('tabindex', '-1');
    d.focus({ preventScroll: true });
  }, []);
  /* Dois lados no mesmo idioma (raro, mas a tela deixa): uma lista só. */
  const base = (i: string) => i.toLowerCase().split(/[-_]/)[0];
  const unicos = lados.filter((l, i) => lados.findIndex((x) => base(x.idioma) === base(l.idioma)) === i);

  return (
    <FolhaDeBaixo
      titulo={t('Voz da conversa')}
      classe="pj-como-folha ad-folha"
      doPrototipo
      refDaFolha={folha}
      aoFechar={aoFechar}
    >
      <div className="pj-como ad-confirma" data-testid="folha-das-vozes">
        <span className="label-mono">{t('Intérprete')}</span>
        <h2>{t('Voz da conversa')}</h2>
        <p className="pj-como-ajudas">
          {t('Cada lado ouve a tradução em um idioma. Escolha a voz de cada um; ela vale no app inteiro.')}
        </p>
        <div className="voz-lados">
          {unicos.map((l) => (
            <section key={l.idioma} className="voz-lado" data-voz-lado={l.idioma}>
              <span className="q-rotulo">
                {l.quem} · {langLabelNaUI(l.idioma)}
              </span>
              <SeletorDeVoz idioma={l.idioma} {...(nuvem === undefined ? {} : { nuvem })} />
            </section>
          ))}
        </div>
        <div className="ad-confirma-pe">
          <button type="button" className="btn btn-solid" onClick={() => folha.current?.close()}>
            {t('Pronto')}
          </button>
        </div>
      </div>
    </FolhaDeBaixo>
  );
}
