/**
 * "FRASE POR FRASE": os controles do modo na faixa do player (openspec `repetir-e-pausar-por-frase`).
 *
 * A lógica (repetir, esperar, seguir, parar) é de `core/learning/frasePorFrase`; a escolha por aparelho e a vigia do
 * `<audio>`, de `lib/analise/usarFrasePorFrase`. Aqui só o desenho e a ponte com a prática: "Repetir em voz alta" abre a
 * sombra (`SombraDaFala`) sobre a frase em foco, sem trocar de tela; ao fechar, o modo segue da frase seguinte.
 * Sem tempo cobrado, sem ponto, sem prêmio: o ritmo é da pessoa.
 */
import { lazy, Suspense, useState } from 'react';

import { limitarPausa, limitarRepeticoes } from '../../../core/learning/frasePorFrase';
import type { MotivoSemTempos } from '../../../core/learning/temposDaFrase';
import type { FalaDaAnalise } from '../../../lib/analise/tiposDaAnalise';
import type { FrasePorFraseDaTela } from '../../../lib/analise/usarFrasePorFrase';
import { t } from '../../../lib/i18n';

const SombraDaFala = lazy(() => import('./SombraDaFala'));

const PAUSAS: ReadonlyArray<{ valor: number; rotulo: () => string }> = [
  { valor: 0.5, rotulo: () => t('Curta (metade da frase)') },
  { valor: 1, rotulo: () => t('Normal (a duração da frase)') },
  { valor: 1.5, rotulo: () => t('Longa (1,5 vez a frase)') },
  { valor: 2, rotulo: () => t('Dobro da frase') },
];

export function motivoSemTempos(motivo: MotivoSemTempos | null): string {
  switch (motivo) {
    case 'frase-longa-demais':
      return t('Esta sessão não tem tempos bons para o modo: há uma frase longa demais.');
    case 'frase-curta-demais':
      return t('Esta sessão não tem tempos bons para o modo: há uma frase curta demais.');
    default:
      return t('Esta sessão não tem tempos bons para o modo: as falas não seguem uma ordem de tempo.');
  }
}

export default function FrasePorFrase({
  frase,
  falas,
  naFala,
  aoPraticar,
  aoSeguirDepoisDaPratica,
}: {
  frase: FrasePorFraseDaTela;
  falas: readonly FalaDaAnalise[];
  /** Índice da frase em foco. */
  naFala: number;
  /** A prática vai usar o microfone: quem chama pausa a reprodução. */
  aoPraticar: () => void;
  /** A prática fechou: toca a frase `i` (a seguinte) e o modo continua dali. */
  aoSeguirDepoisDaPratica: (i: number) => void;
}) {
  const { escolha, tempos, ativo, esperando } = frase;
  const [praticando, setPraticando] = useState<number | null>(null);
  const alvo = praticando !== null ? falas[praticando] : undefined;
  const semTempos = escolha.ligado && !tempos.usavel;

  const fecharPratica = () => {
    const i = praticando;
    setPraticando(null);
    if (i !== null && i < falas.length - 1) aoSeguirDepoisDaPratica(i + 1);
  };

  return (
    <div className="px-escuta px-frase" data-ativo={ativo ? 'sim' : 'nao'}>
      <label className="px-escuta-modo" title={t('Frase por frase')}>
        <input type="checkbox" checked={escolha.ligado} onChange={(e) => frase.ligar(e.target.checked)} />
        <span>{t('Frase por frase')}</span>
      </label>
      {escolha.ligado && (
        <>
          <label className="px-escuta-modo">
            <span>{t('Repetir')}</span>
            <select
              className="px-escuta-select"
              value={escolha.repeticoes}
              onChange={(e) => frase.mudar({ repeticoes: limitarRepeticoes(e.target.value) })}
            >
              <option value={1}>{t('1 vez')}</option>
              <option value={2}>{t('2 vezes')}</option>
              <option value={3}>{t('3 vezes')}</option>
            </select>
          </label>
          <label className="px-escuta-modo">
            <span>{t('Pausa para repetir')}</span>
            <select
              className="px-escuta-select"
              value={escolha.pausa}
              disabled={escolha.pararNoFim}
              onChange={(e) => frase.mudar({ pausa: limitarPausa(e.target.value) })}
            >
              {PAUSAS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo()}
                </option>
              ))}
            </select>
          </label>
          <label className="px-escuta-modo">
            <input
              type="checkbox"
              checked={escolha.pararNoFim}
              onChange={(e) => frase.mudar({ pararNoFim: e.target.checked })}
            />
            <span>{t('Parar no fim da frase')}</span>
          </label>
        </>
      )}
      {/* Sempre no DOM: uma região viva criada junto com o texto não é anunciada. */}
      <span className="px-escuta-passo" role="status">
        {semTempos ? motivoSemTempos(tempos.motivo) : esperando ? t('Sua vez: repita a frase em voz alta.') : ''}
      </span>
      {ativo && (
        <>
          {esperando && (
            <button type="button" className="q-chip" onClick={frase.seguirAgora}>
              {t('Já repeti, seguir')}
            </button>
          )}
          <button
            type="button"
            className="q-chip"
            disabled={praticando !== null || falas[naFala] === undefined}
            onClick={() => {
              aoPraticar();
              setPraticando(naFala);
            }}
          >
            {t('Repetir em voz alta')}
          </button>
        </>
      )}
      {alvo && (
        <div className="px-frase-pratica">
          <Suspense fallback={null}>
            <SombraDaFala texto={alvo.original} idioma={alvo.lang} />
          </Suspense>
          <button type="button" className="q-ctl pri" onClick={fecharPratica}>
            {praticando !== null && praticando < falas.length - 1 ? t('Fechar e seguir') : t('Fechar')}
          </button>
        </div>
      )}
    </div>
  );
}
