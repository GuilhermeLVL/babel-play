import '../../../styles/etiquetas.css';

import { useId, useMemo, useState } from 'react';

import { estadoNoCaderno } from '../../../core/vocabulario/etiquetas';
import { contagemPorIdioma, type EstadoDaMarcacao, progressoDoMarco } from '../../../core/vocabulario/marcadas';
import { desmarcarNoIndice, useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { numero, t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';
import Barra from '../../ui/Barra';

/** Quantas marcadas a lista mostra de cada vez (uma conta pode ter milhares). */
const POR_VEZ = 200;

/**
 * "PALAVRAS QUE VOCÊ CONHECE" (openspec `vocab-conhecidas-e-ignoradas`): o número por idioma (caderno aprendendo ou
 * dominada + "Já sei" sem cartão, sem contar duas vezes), a barra até o próximo marco e a lista das marcadas para
 * desmarcar. Os marcos são por RESULTADO (100, 250, 500…), nunca por tempo: nada de sequência de dias.
 */
export default function PalavrasQueVoceConhece() {
  const s = useSnapshotDasEtiquetas();
  const titulo = useId();
  const [vendo, setVendo] = useState<EstadoDaMarcacao | null>(null);
  const [quantas, setQuantas] = useState(POR_VEZ);
  const [erro, setErro] = useState(false);
  const porIdioma = useMemo(() => contagemPorIdioma(s.caderno, s.marcadas), [s.caderno, s.marcadas]);
  /* A MESMA régua do contador: marcação de palavra que já tem cartão não vale (o cartão manda) e não entra no número
     da aba. Ela aparece no fim da lista, com o aviso "tem cartão", para poder ser desmarcada. */
  const temCartao = (m: { lang: string; chave: string }) => !!estadoNoCaderno(s.caderno, m.chave, m.lang);
  const valendo = s.listaDeMarcadas.filter((m) => !temCartao(m));
  const conhecidas = valendo.filter((m) => m.estado === 'conhecida');
  const ignoradas = valendo.filter((m) => m.estado === 'ignorada');
  const lista = vendo
    ? [
        ...(vendo === 'conhecida' ? conhecidas : ignoradas),
        ...s.listaDeMarcadas.filter((m) => m.estado === vendo && temCartao(m)),
      ]
    : [];

  /* Nada lido ainda: sem número nenhum (um "0" piscando antes do caderno chegar seria falso). */
  if (!s.caderno && !s.marcadas) return null;

  const alternar = (estado: EstadoDaMarcacao) => {
    setVendo((v) => (v === estado ? null : estado));
    setQuantas(POR_VEZ);
  };

  return (
    <section className="q-secao conhecidas" aria-labelledby={titulo}>
      <header>
        <div>
          <h2 id={titulo}>{t('Palavras que você conhece')}</h2>
          <p>{t('As que você está aprendendo ou já domina no caderno, mais as que marcou como “Já sei”.')}</p>
        </div>
      </header>

      {porIdioma.length ? (
        <ul className="conhecidas-idiomas">
          {porIdioma.map(({ lang, conhecidas: n }) => {
            const p = progressoDoMarco(n);
            const idioma = langLabelNaUI(lang);
            return (
              <li key={lang} className="q-cartao">
                <p className="conhecidas-numero">
                  <b>{numero(n)}</b> <span>{idioma}</span>
                </p>
                {p.proximo ? (
                  <>
                    <Barra
                      pct={p.fracao * 100}
                      tom="good"
                      tamanho="fina"
                      rotuloAcessivel={t('Caminho até {marco} palavras em {idioma}', {
                        marco: numero(p.proximo),
                        idioma,
                      })}
                    />
                    <p className="conhecidas-marco">
                      {t('Faltam {n} para {marco} palavras.', { n: numero(p.faltam), marco: numero(p.proximo) })}
                    </p>
                  </>
                ) : (
                  <p className="conhecidas-marco">
                    {t('Você passou do último marco: {marco} palavras.', { marco: numero(p.alcancado ?? 0) })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="q-vazio">{t('Ainda nenhuma. Toque numa palavra e escolha “Já sei”, ou estude o seu caderno.')}</p>
      )}

      {(conhecidas.length > 0 || ignoradas.length > 0) && (
        <div className="q-abas" role="group" aria-label={t('Ver palavras marcadas')}>
          <button
            type="button"
            className="q-aba"
            aria-pressed={vendo === 'conhecida'}
            onClick={() => alternar('conhecida')}
          >
            {t('Já sei ({n})', { n: numero(conhecidas.length) })}
          </button>
          <button
            type="button"
            className="q-aba"
            aria-pressed={vendo === 'ignorada'}
            onClick={() => alternar('ignorada')}
          >
            {t('Ignoradas ({n})', { n: numero(ignoradas.length) })}
          </button>
        </div>
      )}

      {vendo && (
        <>
          <ul className="q-lista conhecidas-lista">
            {lista.slice(0, quantas).map((m) => (
              <li key={`${m.lang}|${m.chave}`} className="q-linha">
                <span lang={m.lang}>{m.chave}</span>
                <span className="q-tag">{langLabelNaUI(m.lang)}</span>
                {temCartao(m) && <span className="q-tag off">{t('tem cartão: o cartão vale')}</span>}
                <button
                  type="button"
                  className="q-ctl"
                  onClick={() => {
                    setErro(false);
                    void desmarcarNoIndice(m.chave, m.lang).then((ok) => setErro(!ok));
                  }}
                >
                  {t('Desmarcar')}
                  <span className="sr"> {m.chave}</span>
                </button>
              </li>
            ))}
          </ul>
          {lista.length > quantas && (
            <button type="button" className="q-ctl" onClick={() => setQuantas((q) => q + POR_VEZ)}>
              {t('Mostrar mais')}
            </button>
          )}
        </>
      )}
      {erro && (
        <p className="q-vazio" role="status">
          {t('Não deu para desmarcar agora.')}
        </p>
      )}
    </section>
  );
}
