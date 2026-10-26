import '../../../styles/leitor.css';

import { BookOpen, FileUp, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { criarArmazemDePosicoes } from '../../../core/leitura/posicao';
import { comBaseDoApp } from '../../../lib/baseDoApp';
import { t } from '../../../lib/i18n';
import { abrirLivroNoLeitor, ErroAoAbrirLivro } from '../../../lib/livros/abrir';
import { estante, type LivroGuardado } from '../../../lib/livros/armazem';
import { esquecerLivroDoBoot, estadoParaUrl, lerLivroDoBoot, lerUrlAtual, navegarPara } from '../../../lib/rotas';
import { toast } from '../../Toast';
import LeitorDoLivro from './LeitorDoLivro';

const posicoes = criarArmazemDePosicoes({
  ler: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  gravar: () => {},
  apagar: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* sem armazenamento */
    }
  },
});

/**
 * O LEITOR (`/leitor` e `/leitor/<livroId>`, L2 de Livros & Leitura). Com o id, abre o livro; sem, mostra a
 * estante do aparelho (os livros abertos aqui, "continuar de onde parei" e abrir um arquivo). O catálogo
 * de livros é a tela da L1 — ela chama `abrirLivroNoLeitor` e cai aqui.
 */
export default function Leitor({ onChangeView }: { onChangeView?: (view: string, data?: unknown) => void }) {
  const [livroId, setLivroId] = useState<string | undefined>(
    () => lerUrlAtual().livroId ?? lerLivroDoBoot() ?? undefined,
  );
  /* O F5 em `/leitor/<id>`: o boot do App reescreve a URL antes de o leitor montar; o id volta para a barra. */
  useEffect(() => {
    esquecerLivroDoBoot();
    if (livroId && lerUrlAtual().livroId !== livroId) {
      window.history.replaceState({}, '', comBaseDoApp(estadoParaUrl({ view: 'leitor', livroId })));
    }
    // Só na montagem: depois, quem manda no id é a URL (o `popstate` abaixo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const aoMudar = () => setLivroId(lerUrlAtual().livroId);
    window.addEventListener('popstate', aoMudar);
    return () => window.removeEventListener('popstate', aoMudar);
  }, []);

  if (livroId) {
    return (
      <LeitorDoLivro
        key={livroId}
        livroId={livroId}
        aoVoltar={() => navegarPara({ view: 'leitor' })}
        aoConhecerPlanos={onChangeView ? () => onChangeView('planos') : undefined}
      />
    );
  }
  return <Estante />;
}

function Estante() {
  const [livros, setLivros] = useState<LivroGuardado[] | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = () =>
    estante
      .livros()
      .then(setLivros)
      .catch(() => setLivros([]));
  useEffect(() => {
    void carregar();
  }, []);

  const abrirArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setAbrindo(true);
    try {
      await abrirLivroNoLeitor(arquivo);
    } catch (e) {
      toast.error(e instanceof ErroAoAbrirLivro ? t(MENSAGEM_DO_ERRO[e.code]) : t('Não deu para abrir o arquivo.'));
    } finally {
      setAbrindo(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  return (
    <div className="leitor-estante" data-testid="estante">
      <header>
        <h1>{t('Leitor')}</h1>
        <p className="leitor-apoio">
          {t('Os livros que você abre aqui ficam só neste aparelho; o arquivo nunca vai para o servidor.')}
        </p>
      </header>
      <div className="leitor-acoes">
        <label className={`btn btn-solid leitor-alvo ${abrindo ? 'ocupado' : ''}`}>
          <FileUp aria-hidden />
          {abrindo ? t('Abrindo…') : t('Abrir um livro do aparelho (EPUB, PDF ou TXT)')}
          <input
            ref={entrada}
            type="file"
            className="sr"
            accept=".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain"
            data-testid="abrir-arquivo"
            disabled={abrindo}
            onChange={(e) => void abrirArquivo(e.target.files?.[0])}
          />
        </label>
      </div>
      {livros === null ? (
        <p className="leitor-apoio" role="status">
          {t('Carregando…')}
        </p>
      ) : livros.length === 0 ? (
        <p className="leitor-apoio">{t('Nenhum livro neste aparelho ainda.')}</p>
      ) : (
        <ul className="leitor-livros">
          {livros.map((l) => {
            const p = posicoes.ler(l.livroId);
            return (
              <li key={l.livroId} className="cartao leitor-livro">
                <BookOpen aria-hidden />
                <div>
                  <h2>{l.titulo}</h2>
                  <p className="leitor-apoio">
                    {[l.autor, l.credito, p ? t('{pct}% lido', { pct: Math.round(p.fracao * 100) }) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="leitor-acoes">
                  <button
                    type="button"
                    className="btn btn-solid leitor-alvo"
                    onClick={() => {
                      void estante.marcarAberto(l.livroId);
                      navegarPara({ view: 'leitor', livroId: l.livroId });
                    }}
                  >
                    {p ? t('Continuar de onde parei') : t('Abrir')}
                  </button>
                  {l.origem !== 'sessao' && (
                    <button
                      type="button"
                      className="btn btn-outline leitor-alvo"
                      aria-label={t('Tirar "{titulo}" deste aparelho', { titulo: l.titulo })}
                      onClick={async () => {
                        await estante.apagarLivro(l.livroId);
                        posicoes.esquecer(l.livroId);
                        void carregar();
                      }}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const MENSAGEM_DO_ERRO: Record<ErroAoAbrirLivro['code'], string> = {
  formato: 'Formato não suportado. Use EPUB, PDF ou TXT.',
  grande: 'O arquivo é grande demais para abrir no navegador.',
  rede: 'Não consegui baixar o livro. Confira a conexão.',
  sem_formato: 'Este livro não tem arquivo para abrir.',
  vazio: 'O arquivo está vazio.',
};
