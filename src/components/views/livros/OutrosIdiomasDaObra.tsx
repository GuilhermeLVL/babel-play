import { BookOpen } from 'lucide-react';
import React, { useId } from 'react';

import type { LivroDoCatalogo, Pessoa } from '../../../core/livros/tipos';
import { t } from '../../../lib/i18n';
import { direcaoDoTexto } from '../../../lib/languages';
import { rotuloDoIdioma } from './rotulos';

const comAno = (p: Pessoa) => (p.anoMorte != null ? `${p.nome} (†${p.anoMorte})` : p.nome);

/**
 * "LER ESTA OBRA EM OUTROS IDIOMAS": as outras edições da mesma obra, uma linha por edição, com o idioma, quem
 * traduziu (e quando morreu) e o botão Ler. Quem monta a lista passa SÓ edições que o leitor pode ver (filtro
 * legal e faixa etária edição por edição, `livrosVisiveis`); aqui nada é filtrado de novo nem afrouxado.
 */
export default function OutrosIdiomasDaObra({
  edicoes,
  aoAbrir,
  aoLer,
}: {
  edicoes: readonly LivroDoCatalogo[];
  aoAbrir: (l: LivroDoCatalogo) => void;
  aoLer: (l: LivroDoCatalogo) => void;
}) {
  const id = useId();
  if (edicoes.length === 0) return null;
  return (
    <section className="lv-outros-idiomas" aria-labelledby={id} data-testid="outros-idiomas">
      <h2 id={id}>{t('Ler esta obra em outros idiomas')}</h2>
      <ul>
        {edicoes.map((e) => (
          <li key={e.id} data-edicao={e.id}>
            <div className="lv-outro-texto">
              <span className="lv-selo idioma">{rotuloDoIdioma(e.idioma)}</span>
              <button
                type="button"
                className="lv-link"
                onClick={() => aoAbrir(e)}
                lang={e.idioma}
                dir={direcaoDoTexto(e.idioma)}
              >
                {e.titulo}
              </button>
              {e.tradutores.length > 0 && (
                <small>{t('tradução de {nomes}', { nomes: e.tradutores.map(comAno).join(', ') })}</small>
              )}
            </div>
            <button
              type="button"
              className="q-ctl"
              onClick={() => aoLer(e)}
              aria-label={t('Ler em {idioma}', { idioma: rotuloDoIdioma(e.idioma).toLowerCase() })}
              data-testid="ler-outra-edicao"
            >
              <BookOpen aria-hidden /> {t('Ler')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
