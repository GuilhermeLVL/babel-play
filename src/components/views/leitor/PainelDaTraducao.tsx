import { Languages, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../../lib/i18n';
import { traduzirParagrafos } from '../../../lib/leitor/traducaoDeCapitulo';

type Fase = 'parado' | 'andando' | 'completo' | 'cancelado' | 'erro';

/**
 * A TRADUÇÃO DO CAPÍTULO, lado a lado com o original, parágrafo por parágrafo. Roda no aparelho (`gateway.mt`):
 * o texto não sai dele e não custa nada. NÃO altera o livro: o painel só LÊ os parágrafos do capítulo em exibição.
 * Cancelável; em lotes pequenos com pausa para a página não travar (`traducaoDeCapitulo.ts`). Quem chama põe
 * `key` no capítulo: outro capítulo é outro painel.
 */
export default function PainelDaTraducao({
  paragrafos,
  idiomaDoLivro,
  idiomaDaPessoa,
  traduzir,
  lote,
  pausaMs,
  preparoMs,
}: {
  /** Os parágrafos do capítulo em exibição (lidos pelo leitor). */
  paragrafos: readonly string[];
  idiomaDoLivro: string;
  idiomaDaPessoa: string;
  /** Traduz UM parágrafo (`gateway.mt.translate`); `null` = não deu. */
  traduzir: (texto: string) => Promise<string | null>;
  lote?: number;
  pausaMs?: number;
  /** Quanto esperar o tradutor do aparelho carregar antes de dar a falha (padrão 60 s; os testes passam 0). */
  preparoMs?: number;
}) {
  const [fase, setFase] = useState<Fase>('parado');
  const [traducoes, setTraducoes] = useState<Array<string | null | undefined>>([]);
  const [feitos, setFeitos] = useState(0);
  const [aviso, setAviso] = useState('');
  const [preparando, setPreparando] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const traducoesRef = useRef(traducoes);
  traducoesRef.current = traducoes;

  useEffect(() => () => ctrl.current?.abort(), []);

  const mesmoIdioma = !!idiomaDoLivro && !!idiomaDaPessoa && idiomaDoLivro === idiomaDaPessoa;
  const total = paragrafos.length;
  const textos = useMemo(() => [...paragrafos], [paragrafos]);

  const traduzirTudo = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setFase('andando');
    setAviso('');
    const r = await traduzirParagrafos(textos, traduzir, {
      sinal: c.signal,
      lote,
      pausaMs,
      preparoMs,
      aoPreparar: setPreparando,
      jaTraduzidos: traducoesRef.current,
      aoProgresso: (f, _total, parcial) => {
        setFeitos(f);
        setTraducoes([...parcial]);
      },
    });
    if (c.signal.aborted && r.fim !== 'cancelado') return;
    setTraducoes([...r.traducoes]);
    setFase(r.fim);
    if (r.fim === 'completo') setAviso(t('Capítulo traduzido.'));
  }, [textos, traduzir, lote, pausaMs, preparoMs]);

  const cancelar = () => {
    ctrl.current?.abort();
    setPreparando(false);
    setFase('cancelado');
  };

  const umParagrafo = async (i: number) => {
    const saida = (await traduzir(textos[i]).catch(() => null)) || null;
    setTraducoes((atual) => {
      const novo = [...atual];
      novo[i] = saida;
      return novo;
    });
  };

  if (mesmoIdioma) {
    return (
      <p className="leitor-apoio" data-testid="traducao-mesmo-idioma">
        {t('Este livro já está no seu idioma. Para traduzir para outro, troque o idioma em Ajustes.')}
      </p>
    );
  }
  if (total === 0) {
    return (
      <p className="leitor-apoio" data-testid="traducao-sem-texto">
        {t('Não achei texto neste capítulo para traduzir. Se o livro acabou de abrir, tente de novo em instantes.')}
      </p>
    );
  }

  const andando = fase === 'andando';
  const statusDaFase =
    fase === 'andando' && preparando
      ? t('Preparando o tradutor do aparelho. Na primeira vez ele baixa um modelo e pode levar um minuto.')
      : fase === 'andando'
        ? t('Traduzindo {n} de {total}…', { n: feitos, total })
        : fase === 'cancelado'
          ? t('Parei. O que já foi traduzido continua aqui.')
          : fase === 'erro'
            ? t('Não deu para traduzir agora. O tradutor do aparelho pode estar carregando; tente de novo.')
            : aviso;

  return (
    <section className="leitor-ia-bloco" aria-label={t('Traduzir este capítulo')} data-testid="painel-da-traducao">
      <div className="leitor-acoes">
        {!andando ? (
          <button
            type="button"
            className="btn btn-solid leitor-alvo"
            data-testid="traduzir-capitulo"
            onClick={() => void traduzirTudo()}
          >
            <Languages aria-hidden />{' '}
            {fase === 'cancelado' || fase === 'erro' ? t('Continuar a tradução') : t('Traduzir tudo')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-outline leitor-alvo"
            data-testid="cancelar-traducao"
            onClick={cancelar}
          >
            <Square aria-hidden /> {t('Parar')}
          </button>
        )}
      </div>
      {(andando || feitos > 0) && (
        <progress
          className="leitor-ia-progresso"
          value={feitos}
          max={total}
          aria-label={t('Progresso da tradução')}
          data-testid="traducao-progresso"
        />
      )}
      <p className="leitor-apoio" role="status" data-testid="traducao-status">
        {statusDaFase}
      </p>
      <p className="leitor-apoio">
        {t(
          'A tradução roda no seu aparelho. Se ele ainda não está pronto e você autorizou a IA de nuvem, os parágrafos podem ir à nuvem, que não guarda nada.',
        )}
      </p>

      <ol className="leitor-bilingue">
        {textos.map((original, i) => (
          <li key={i} className="leitor-bilingue-par">
            <p lang={idiomaDoLivro || undefined}>{original}</p>
            {typeof traducoes[i] === 'string' ? (
              <p className="leitor-bilingue-traducao" lang={idiomaDaPessoa || undefined}>
                {traducoes[i]}
              </p>
            ) : traducoes[i] === null ? (
              <p className="leitor-apoio">{t('Não deu para traduzir este parágrafo.')}</p>
            ) : (
              !andando && (
                <button type="button" className="leitor-bilingue-um" onClick={() => void umParagrafo(i)}>
                  {t('Traduzir este parágrafo')}
                </button>
              )
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
