import { Ear, RotateCcw, Volume2 } from 'lucide-react';
import { useState } from 'react';

import { conferirDitado, type ResultadoDoDitado } from '../../../core/leitura/ditado';
import { t } from '../../../lib/i18n';
import { lerEmVozAlta } from '../../../lib/leitor/lerEmVoz';

/**
 * O DITADO DE UMA FRASE GRIFADA (openspec `leitura-assistida`, fatia B): ouve a frase, escreve de memória e vê as
 * diferenças. Nada é gravado nem enviado: o que a pessoa escreve só existe nesta tela, e some ao fechar.
 */
export default function DitadoDaFrase({ frase, idioma }: { frase: string; idioma: string }) {
  const [escrito, setEscrito] = useState('');
  const [resultado, setResultado] = useState<ResultadoDoDitado | null>(null);

  const ouvir = () => lerEmVozAlta(frase, idioma);

  return (
    <section className="leitor-ditado" aria-label={t('Ditado da frase')} data-testid="ditado-da-frase">
      {!resultado ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (escrito.trim()) setResultado(conferirDitado(frase, escrito, idioma));
          }}
        >
          <p className="leitor-apoio">{t('Ouça a frase e escreva o que entendeu.')}</p>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={ouvir}>
            <Volume2 aria-hidden /> {t('Ouvir')}
          </button>
          <label htmlFor="leitor-ditado-campo" className="leitor-legenda">
            {t('O que você ouviu')}
          </label>
          <textarea
            id="leitor-ditado-campo"
            className="campo"
            rows={2}
            lang={idioma || undefined}
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-solid leitor-alvo" disabled={!escrito.trim()}>
            <Ear aria-hidden /> {t('Conferir')}
          </button>
        </form>
      ) : (
        <div role="status" data-testid="ditado-resultado">
          <p className="leitor-apoio">
            {resultado.perfeito
              ? t('Acertou tudo.')
              : t('Você acertou {n}% das palavras.', { n: Math.round(resultado.acerto * 100) })}
          </p>
          <p className="leitor-ditado-passos" lang={idioma || undefined}>
            {resultado.passos.map((p, i) => {
              if (p.tipo === 'igual') return <span key={i}>{p.palavra} </span>;
              if (p.tipo === 'faltou')
                return (
                  <mark key={i} className="leitor-ditado-faltou" title={t('Faltou')}>
                    {p.esperada}{' '}
                  </mark>
                );
              if (p.tipo === 'sobrou')
                return (
                  <del key={i} className="leitor-ditado-sobrou" title={t('Sobrou')}>
                    {p.escrita}{' '}
                  </del>
                );
              return (
                <span key={i}>
                  <del className="leitor-ditado-sobrou">{p.escrita}</del>{' '}
                  <mark className="leitor-ditado-faltou">{p.esperada}</mark>{' '}
                </span>
              );
            })}
          </p>
          <button
            type="button"
            className="btn btn-outline leitor-alvo"
            onClick={() => {
              setResultado(null);
              setEscrito('');
            }}
          >
            <RotateCcw aria-hidden /> {t('Tentar de novo')}
          </button>
        </div>
      )}
    </section>
  );
}
