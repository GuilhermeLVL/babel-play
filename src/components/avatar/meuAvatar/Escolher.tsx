import { Check, Shuffle, UserX } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { COLECAO_CURADA, type ModeloDaColecao } from '../../../data/avatar/colecao';
import { t } from '../../../lib/i18n';

export interface ModeloTrazido {
  id: string;
  titulo: string;
}

interface Props {
  /** O id do modelo escolhido (da coleção ou o trazido). */
  escolhido: string | null;
  trazido: ModeloTrazido | null;
  podeImportar: boolean;
  aoEscolher: (modelo: ModeloDaColecao) => void;
  aoEscolherTrazido: () => void;
  aoSortear: () => void;
  aoDispensar: () => void;
}

/**
 * ESCOLHER: a grade da coleção curada (teclado com setas, rótulos, foco visível, alvos de 112 px) mais "Escolher
 * para mim" e "Continuar sem avatar". É um grupo de opções (`radiogroup`): o escolhido é dito por borda grossa, visto
 * e o texto "Escolhido".
 */
export default function Escolher({
  escolhido,
  trazido,
  podeImportar,
  aoEscolher,
  aoEscolherTrazido,
  aoSortear,
  aoDispensar,
}: Props) {
  const itens: Array<{ id: string; nome: string; linha: string; credito?: string; escolher: () => void }> = [
    ...(trazido
      ? [
          {
            id: trazido.id,
            nome: trazido.titulo || t('Meu modelo'),
            linha: t('Trazido por você'),
            escolher: aoEscolherTrazido,
          },
        ]
      : []),
    ...COLECAO_CURADA.map((m) => ({
      id: m.id,
      nome: m.nome,
      linha: t('{autor} · Uso livre ({licenca})', { autor: m.autor, licenca: m.licenca.split(' ')[0] }),
      escolher: () => aoEscolher(m),
    })),
  ];

  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const passo =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!passo && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const destino =
      e.key === 'Home' ? 0 : e.key === 'End' ? itens.length - 1 : (i + passo + itens.length) % itens.length;
    itens[destino].escolher();
    (e.currentTarget.closest('ul')?.querySelectorAll('button')[destino] as HTMLElement | undefined)?.focus();
  };

  const focavel = itens.findIndex((m) => m.id === escolhido);
  return (
    <div className="av-tela" data-testid="avatar-escolher">
      <section className="q-secao">
        <header>
          <div>
            <h3>{t('Coleção do Frasy')}</h3>
            <p>{t('Modelos que o Frasy avaliou um a um. Valem para todas as idades.')}</p>
          </div>
        </header>
        {!podeImportar && (
          <div className="av-protegido" data-testid="avatar-protegido">
            <p className="qc-nota" data-testid="avatar-so-colecao">
              {t(
                'Aqui você usa os avatares da coleção do Frasy, avaliados um a um. Importar arquivos e a galeria de fora ficam fechados para menores de 18 anos.',
              )}
            </p>
            <p className="qc-nota" data-testid="avatar-responsavel">
              {t(
                'Responsável: o avatar fica só neste aparelho e nada dele vai para o servidor. Menores de 18 anos usam só a coleção do Frasy.',
              )}
            </p>
          </div>
        )}
        <ul className="av-grade" role="radiogroup" aria-label={t('Modelos de avatar')}>
          {itens.map((m, i) => (
            <li key={m.id} role="none">
              <button
                type="button"
                role="radio"
                aria-checked={m.id === escolhido}
                tabIndex={m.id === escolhido || (focavel < 0 && i === 0) ? 0 : -1}
                className="av-modelo"
                data-modelo={m.id}
                onClick={m.escolher}
                onKeyDown={(e) => aoTeclar(e, i)}
              >
                <span>{m.nome}</span>
                <small>{m.linha}</small>
                <span className="av-marca">
                  <Check aria-hidden /> {t('Escolhido')}
                  <span className="sr-only">{t(', {nome}', { nome: m.nome })}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="av-acoes">
        <button type="button" className="q-ctl" onClick={aoSortear} data-testid="avatar-sortear">
          <Shuffle aria-hidden /> {t('Escolher para mim')}
        </button>
        <button type="button" className="q-ctl" onClick={aoDispensar} data-testid="avatar-dispensar">
          <UserX aria-hidden /> {t('Continuar sem avatar')}
        </button>
      </div>
    </div>
  );
}
