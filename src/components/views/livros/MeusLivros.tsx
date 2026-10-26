import { BookOpen, Library, Trash2, Upload } from 'lucide-react';
import React from 'react';

import { t } from '../../../lib/i18n';
import {
  type MeuLivro,
  mudarStatus,
  recentes,
  removerMeuLivro,
  type StatusDeLeitura,
  useMeusLivros,
} from '../../../lib/livros/meusLivros';

const STATUS: StatusDeLeitura[] = ['quero-ler', 'lendo', 'lido'];
const rotuloDoStatus = (s: StatusDeLeitura) =>
  s === 'quero-ler' ? t('Quero ler') : s === 'lendo' ? t('Lendo') : t('Lido');
const rotuloDaOrigem = (l: MeuLivro) =>
  l.origem === 'catalogo' ? t('Do catálogo') : l.origem === 'link' ? t('Artigo por link') : t('Arquivo seu');

/**
 * "MEUS LIVROS" (CAT11): os guardados do catálogo e os trazidos, com status, neste aparelho. O progresso de
 * leitura fica para o leitor da L2 (a posição por CFI), e a linha diz "ainda sem progresso" em vez de 0%.
 */
export default function MeusLivros({
  aoAbrir,
  aoTrazer,
  aoCatalogo,
}: {
  aoAbrir: (livro: MeuLivro) => void;
  aoTrazer: () => void;
  aoCatalogo: () => void;
}) {
  const lista = useMeusLivros();
  if (lista.length === 0) {
    return (
      <section className="q-vazio" data-testid="meus-livros">
        <span className="q-ic">
          <Library aria-hidden />
        </span>
        <h2>{t('Nenhum livro guardado ainda')}</h2>
        <p>{t('Guarde um livro do catálogo ou traga um arquivo seu. Ele aparece aqui, neste aparelho.')}</p>
        <div className="q-acoes">
          <button type="button" className="q-ctl pri" onClick={aoCatalogo}>
            {t('Ver o catálogo')}
          </button>
          <button type="button" className="q-ctl" onClick={aoTrazer}>
            <Upload aria-hidden /> {t('Trazer o seu')}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="lv-meus" aria-labelledby="lv-meus-titulo" data-testid="meus-livros">
      <header>
        <h2 id="lv-meus-titulo">{t('Meus livros')}</h2>
        <p className="lv-nota">
          {t(
            'Guardados neste aparelho. A posição de leitura e os grifos vão sincronizar quando o leitor completo chegar.',
          )}
        </p>
      </header>
      <ul className="q-lista">
        {recentes(lista, lista.length).map((l) => (
          <li key={l.id} className="lv-meu">
            <div className="lv-meu-texto">
              <b lang={l.idioma}>{l.titulo}</b>
              <small>
                {[
                  l.autor,
                  rotuloDaOrigem(l),
                  l.abertoEm ? t('aberto em {data}', { data: new Date(l.abertoEm).toLocaleDateString('pt-BR') }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
              <small className="lv-progresso">{t('Ainda sem progresso salvo')}</small>
            </div>
            <label className="q-campo lv-status">
              <span className="sr-only">{t('Status de {titulo}', { titulo: l.titulo })}</span>
              <select value={l.status} onChange={(e) => mudarStatus(l.id, e.target.value as StatusDeLeitura)}>
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {rotuloDoStatus(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="q-acoes">
              <button type="button" className="q-ctl pri" onClick={() => aoAbrir(l)}>
                <BookOpen aria-hidden /> {t('Ler')}
              </button>
              <button
                type="button"
                className="q-ctl"
                onClick={() => void removerMeuLivro(l.id)}
                aria-label={t('Tirar {titulo} de Meus livros', { titulo: l.titulo })}
              >
                <Trash2 aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
