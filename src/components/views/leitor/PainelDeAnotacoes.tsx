import { Cloud, CloudOff, Download, FileText, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import type { AnotacaoDeLeitura } from '../../../core/leitura/anotacao';
import { t } from '../../../lib/i18n';
import type { EstadoDaSincronizacao } from '../../../lib/livros/anotacoesDoLivro';

export type FormatoDeExportacao = 'markdown' | 'json' | 'anki' | 'planilha' | 'texto' | 'epub';

const ROTULO_DO_TIPO = { grifo: 'Grifo', nota: 'Nota', palavra: 'Palavra' } as const;

/**
 * OS GRIFOS, AS NOTAS E AS PALAVRAS DO LIVRO (NOT01, NOT03, NOT06): a lista por capítulo, as que não foram
 * localizadas nesta edição (nunca somem), onde estão guardadas e as exportações. Tudo grátis.
 */
export default function PainelDeAnotacoes({
  anotacoes,
  naoLocalizadas,
  estado,
  podeBaixarTexto,
  podeBaixarEpub,
  aoIr,
  aoEditarNota,
  aoApagar,
  aoExportar,
}: {
  anotacoes: AnotacaoDeLeitura[];
  naoLocalizadas: Set<string>;
  estado: EstadoDaSincronizacao | 'carregando';
  /** Livro de domínio público do catálogo: dá para baixar o texto e o EPUB. */
  podeBaixarTexto: boolean;
  podeBaixarEpub: boolean;
  aoIr: (a: AnotacaoDeLeitura) => void;
  aoEditarNota: (a: AnotacaoDeLeitura, nota: string) => void;
  aoApagar: (a: AnotacaoDeLeitura) => void;
  aoExportar: (f: FormatoDeExportacao) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const localizadas = anotacoes.filter((a) => !naoLocalizadas.has(a.id));
  const perdidas = anotacoes.filter((a) => naoLocalizadas.has(a.id));

  const item = (a: AnotacaoDeLeitura): ReactNode => (
    <li key={a.id} className="leitor-anotacao" data-tipo={a.tipo} data-cor={a.cor}>
      <span className="leitor-anotacao-cor" aria-hidden />
      <div className="leitor-anotacao-corpo">
        <span className="label-mono">
          {t(ROTULO_DO_TIPO[a.tipo])}
          {a.palavra ? ` · ${a.palavra}` : ''}
        </span>
        {a.alvo.citacao.exact && <blockquote>{a.alvo.citacao.exact}</blockquote>}
        {editando === a.id ? (
          <form
            className="leitor-nota-form"
            onSubmit={(e) => {
              e.preventDefault();
              aoEditarNota(a, texto);
              setEditando(null);
            }}
          >
            <label className="sr" htmlFor={`nota-${a.id}`}>
              {t('Nota')}
            </label>
            <textarea
              id={`nota-${a.id}`}
              className="campo"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoFocus
            />
            <div className="leitor-acoes">
              <button type="submit" className="btn btn-solid leitor-alvo">
                {t('Salvar nota')}
              </button>
              <button type="button" className="btn btn-outline leitor-alvo" onClick={() => setEditando(null)}>
                {t('Cancelar')}
              </button>
            </div>
          </form>
        ) : (
          a.nota && <p className="leitor-anotacao-nota">{a.nota}</p>
        )}
        <div className="leitor-acoes">
          {!naoLocalizadas.has(a.id) && (
            <button type="button" className="btn btn-outline peq leitor-alvo" onClick={() => aoIr(a)}>
              {t('Ir ao trecho')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline peq leitor-alvo"
            aria-label={a.nota ? t('Editar a nota') : t('Escrever uma nota')}
            onClick={() => {
              setEditando(a.id);
              setTexto(a.nota);
            }}
          >
            <Pencil aria-hidden /> {a.nota ? t('Editar') : t('Nota')}
          </button>
          <button
            type="button"
            className="btn btn-outline peq leitor-alvo"
            aria-label={t('Apagar esta anotação')}
            onClick={() => aoApagar(a)}
          >
            <Trash2 aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );

  const porCapitulo = new Map<string, AnotacaoDeLeitura[]>();
  for (const a of localizadas) {
    const c = a.alvo.capitulo || '';
    porCapitulo.set(c, [...(porCapitulo.get(c) ?? []), a]);
  }

  return (
    <div className="leitor-anotacoes" data-testid="painel-anotacoes">
      <p className={`leitor-onde ${estado === 'so-aparelho' ? 'aviso' : ''}`} role="status">
        {estado === 'so-aparelho' ? <CloudOff aria-hidden /> : <Cloud aria-hidden />}
        {estado === 'so-aparelho'
          ? t('Suas anotações estão só neste aparelho. Entre na sua conta para guardá-las, ou baixe o backup (JSON).')
          : estado === 'sincronizada'
            ? t('Guardadas na sua conta e neste aparelho.')
            : estado === 'pendente' || estado === 'erro'
              ? t('Guardadas neste aparelho; sobem para a sua conta quando houver conexão.')
              : t('Carregando…')}
      </p>

      {anotacoes.length === 0 ? (
        <p className="leitor-apoio">
          {t('Selecione um trecho para grifar ou anotar. Toque numa palavra para ver o sentido e salvar no deck.')}
        </p>
      ) : (
        [...porCapitulo.entries()].map(([cap, lista]) => (
          <section key={cap || '-'} className="leitor-grupo">
            <h3 className="leitor-subtitulo">{cap || t('Sem capítulo')}</h3>
            <ul className="leitor-lista">{lista.map(item)}</ul>
          </section>
        ))
      )}

      {perdidas.length > 0 && (
        <section className="leitor-grupo" aria-labelledby="leitor-perdidas">
          <h3 id="leitor-perdidas" className="leitor-subtitulo">
            {t('Não localizadas nesta edição')}
          </h3>
          <p className="leitor-apoio">
            {t('O texto mudou e não achamos estes trechos. Elas continuam guardadas e entram nas exportações.')}
          </p>
          <ul className="leitor-lista">{perdidas.map(item)}</ul>
        </section>
      )}

      <section className="leitor-grupo" aria-labelledby="leitor-exportar">
        <h3 id="leitor-exportar" className="leitor-subtitulo">
          {t('Exportar')}
        </h3>
        <div className="leitor-exportacoes">
          <button type="button" className="btn btn-outline leitor-alvo" onClick={() => aoExportar('markdown')}>
            <Download aria-hidden /> Markdown
          </button>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={() => aoExportar('json')}>
            <Download aria-hidden /> {t('JSON (backup)')}
          </button>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={() => aoExportar('anki')}>
            <Download aria-hidden /> Anki
          </button>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={() => aoExportar('planilha')}>
            <Download aria-hidden /> {t('Planilha (CSV)')}
          </button>
          {podeBaixarTexto && (
            <button type="button" className="btn btn-outline leitor-alvo" onClick={() => aoExportar('texto')}>
              <FileText aria-hidden /> {t('Texto do livro (TXT)')}
            </button>
          )}
          {podeBaixarEpub && (
            <button type="button" className="btn btn-outline leitor-alvo" onClick={() => aoExportar('epub')}>
              <FileText aria-hidden /> {t('EPUB do livro')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
