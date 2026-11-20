import '../../../styles/leitor.css';

import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { t } from '../../../lib/i18n';
import { consumirRemovidosDaEstante, estante } from '../../../lib/livros/armazem';
import { CopiaIndisponivel } from '../../../lib/livros/textoDoLivro';
import { toast } from '../../Toast';
import LeitorDoLivro from './LeitorDoLivro';

type Estado = { tipo: 'preparando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'pronto'; livroId: string };

/**
 * O LEITOR SOBRE UM LIVRO DA L1 (`/livros/<id>/ler`): põe o livro na estante do aparelho (`preparar`, de
 * `src/lib/livros/doCatalogo.ts`) e abre o leitor de verdade nele. Na primeira vez o livro desce da fonte;
 * depois, abre sem rede.
 */
export default function LeitorDoCatalogo({
  preparar,
  aoAbrir,
  aoVoltar,
}: {
  /** Põe o livro na estante e devolve o id do leitor; `null` = o conteúdo não está mais neste aparelho. */
  preparar: () => Promise<string | null>;
  /** O livro abriu (a L1 marca "aberto em" em Meus livros). */
  aoAbrir?: () => void;
  aoVoltar: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'preparando' });

  useEffect(() => {
    let vivo = true;
    preparar()
      .then(async (livroId) => {
        if (!vivo) return;
        if (!livroId) {
          setEstado({
            tipo: 'erro',
            mensagem: t('O conteúdo deste livro não está mais neste aparelho. Traga o arquivo de novo.'),
          });
          return;
        }
        await estante.marcarAberto(livroId);
        const sairam = consumirRemovidosDaEstante();
        if (sairam.length) {
          toast.warn(
            t(
              'Para caber, saíram deste aparelho: {titulos}. As anotações continuam; para ler de novo, abra o livro outra vez.',
              { titulos: sairam.join(', ') },
            ),
          );
        }
        aoAbrir?.();
        if (vivo) setEstado({ tipo: 'pronto', livroId });
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        console.error('[leitor] o livro do catálogo não abriu', e);
        setEstado({
          tipo: 'erro',
          mensagem:
            e instanceof CopiaIndisponivel
              ? t(
                  'A cópia revisada deste livro ainda não foi publicada. Tente um livro do Standard Ebooks ou da Wikisource.',
                )
              : t('Não deu para abrir este livro agora. Confira a conexão e tente de novo.'),
        });
      });
    return () => {
      vivo = false;
    };
    // `preparar` muda a cada render da tela de Livros; o livro é o mesmo enquanto este componente vive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (estado.tipo === 'pronto') {
    return <LeitorDoLivro livroId={estado.livroId} aoVoltar={aoVoltar} rotuloDoVoltar={t('Voltar')} />;
  }
  return (
    <div className="leitor" data-testid="leitor" data-estado={estado.tipo === 'erro' ? 'erro' : 'carregando'}>
      <section className="leitor-pagina" aria-busy={estado.tipo === 'preparando'}>
        {estado.tipo === 'preparando' ? (
          <p className="leitor-estado" role="status">
            <BookOpen aria-hidden /> {t('Abrindo o livro…')}
          </p>
        ) : (
          <div className="leitor-estado" role="alert">
            <p>{estado.mensagem}</p>
            <button type="button" className="btn btn-solid leitor-alvo" onClick={aoVoltar}>
              {t('Voltar')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
