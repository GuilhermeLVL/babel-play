import { BookOpen, ImagePlus, Library, Search, Trash2, Upload } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { capaDoLivro } from '../../../core/livros/capas';
import {
  contarPorStatus,
  filtrarMeus,
  minutosRestantes,
  ordenarPorRecentes,
  porcentagemDe,
  statusSugerido,
} from '../../../core/livros/meusLivros';
import type { LivroDoCatalogo } from '../../../core/livros/tipos';
import { data, t, tp } from '../../../lib/i18n';
import { estante } from '../../../lib/livros/armazem';
import { faltaTentarCapa, garantirCapaDoArquivo } from '../../../lib/livros/capasLocais';
import {
  filtrarMeusLivrosVisiveis,
  idNaEstante,
  lerConteudo,
  type MeuLivro,
  mudarStatus,
  removerMeuLivro,
  type StatusDeLeitura,
  useMeusLivros,
} from '../../../lib/livros/meusLivros';
import { posicoes } from '../../../lib/livros/posicoesDoAparelho';
import { CapaDesenhada, rotuloDoTempo } from './CartaoDoLivro';
import TrocarCapa from './TrocarCapa';

const STATUS: StatusDeLeitura[] = ['quero-ler', 'lendo', 'lido'];
const rotuloDoStatus = (s: StatusDeLeitura) =>
  s === 'quero-ler' ? t('Quero ler') : s === 'lendo' ? t('Lendo') : t('Lido');
const rotuloDaOrigem = (l: MeuLivro) =>
  l.origem === 'catalogo' ? t('Do catálogo') : l.origem === 'link' ? t('Artigo por link') : t('Arquivo seu');

/** Quantas anotações vivas (não apagadas) cada livro tem. Assíncrono (IndexedDB): a lista não espera por isso. */
function useContagemDeAnotacoes(ids: readonly string[]): Record<string, number> {
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const chave = ids.join('\n');
  useEffect(() => {
    let vivo = true;
    void Promise.all(
      ids.map((id) =>
        estante
          .anotacoes(id)
          .then((l) => [id, l.filter((a) => a.apagadoEm === null).length] as const)
          .catch(() => [id, 0] as const),
      ),
    ).then((pares) => vivo && setContagem(Object.fromEntries(pares)));
    return () => {
      vivo = false;
    };
    // `chave` resume `ids`: refaz só quando a lista de livros muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return contagem;
}

/**
 * "MEUS LIVROS" (CAT11): os guardados do catálogo e os trazidos, neste aparelho, com capa, progresso, capítulo
 * atual, última leitura, tempo que falta e anotações.
 *
 * O PROGRESSO NÃO É GRAVADO AQUI: é DERIVADO da posição que o leitor já guarda (`posicoes.ler`), pela chave do
 * livro NA ESTANTE (`idNaEstante`: `cat:<id>` no catálogo, o próprio `meu-…` no trazido). Gravar uma segunda
 * cópia no `MeuLivro` daria duas verdades para a mesma coisa.
 */
export default function MeusLivros({
  aoAbrir,
  aoTrazer,
  aoCatalogo,
  visivel,
  catalogo = [],
}: {
  aoAbrir: (livro: MeuLivro) => void;
  aoTrazer: () => void;
  aoCatalogo: () => void;
  /**
   * O livro DO CATÁLOGO que este perfil pode ver (`livrosVisiveis`). Um guardado que deixou de ser visível (a
   * conta passou a ser de menor, a classificação mudou) some da lista, sem dizer o título. Os trazidos pela
   * pessoa continuam: são dela.
   */
  visivel: (id: string) => boolean;
  /** O catálogo já filtrado para o perfil: dele vêm o tempo estimado de leitura (só livro do catálogo). */
  catalogo?: readonly LivroDoCatalogo[];
}) {
  const todos = filtrarMeusLivrosVisiveis(useMeusLivros(), visivel);
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<StatusDeLeitura | null>(null);
  const [trocando, setTrocando] = useState<MeuLivro | null>(null);

  const porId = useMemo(() => new Map(catalogo.map((l) => [l.id, l])), [catalogo]);
  const anotacoes = useContagemDeAnotacoes(todos.map(idNaEstante));

  /* A posição é lida a cada render (localStorage, síncrono, poucas dezenas de livros): voltar do leitor remonta
     esta tela, e é aí que o progresso novo aparece. */
  const itens = todos.map((livro) => {
    const posicao = posicoes.ler(idNaEstante(livro));
    const fracao = posicao?.fracao ?? 0;
    return {
      livro,
      titulo: livro.titulo,
      autor: livro.autor,
      status: livro.status,
      posicao,
      fracao,
      ultimaAtividade: Math.max(posicao?.atualizadaEm ?? 0, livro.abertoEm ?? 0, livro.adicionadoEm),
      ficha: livro.origem === 'catalogo' ? porId.get(livro.id) : undefined,
    };
  });

  /* Os livros trazidos antes das capas (ou sem capa tirada ainda): tenta UMA vez, um de cada vez, fora da pressa. */
  const aTentar = todos
    .filter((l) => l.origem === 'arquivo' && (l.formato === 'epub' || l.formato === 'pdf'))
    .map((l) => l.id)
    .join('\n');
  useEffect(() => {
    let vivo = true;
    void (async () => {
      for (const id of aTentar.split('\n').filter(Boolean)) {
        if (!vivo) return;
        if (!(await faltaTentarCapa(id))) continue;
        const conteudo = await lerConteudo(id);
        await garantirCapaDoArquivo(id, conteudo?.arquivo);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aTentar]);

  if (todos.length === 0) {
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

  const contagem = contarPorStatus(itens);
  const lista = ordenarPorRecentes(filtrarMeus(itens, { texto, status: filtro }));
  const limpar = () => {
    setTexto('');
    setFiltro(null);
  };

  return (
    <section className="lv-meus" aria-labelledby="lv-meus-titulo" data-testid="meus-livros">
      <header>
        <h2 id="lv-meus-titulo">{t('Meus livros')}</h2>
        <p className="lv-nota">{t('Guardados neste aparelho, com a sua posição de leitura e os seus grifos.')}</p>
      </header>

      <div className="lv-meus-ferramentas">
        <label className="q-campo lv-campo-busca">
          <span className="sr-only">{t('Buscar em Meus livros')}</span>
          <Search aria-hidden className="lv-lupa" />
          <input
            type="search"
            autoComplete="off"
            placeholder={t('Buscar em Meus livros')}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            data-testid="busca-meus-livros"
          />
        </label>
        <div className="lv-meus-filtro" role="group" aria-label={t('Filtrar por status')}>
          <button type="button" className="q-ctl" aria-pressed={filtro === null} onClick={() => setFiltro(null)}>
            {t('Todos')} <span className="n">{itens.length}</span>
          </button>
          {STATUS.map((s) => (
            <button
              key={s}
              type="button"
              className="q-ctl"
              aria-pressed={filtro === s}
              onClick={() => setFiltro(filtro === s ? null : s)}
              data-status={s}
            >
              {rotuloDoStatus(s)} <span className="n">{contagem[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="q-vazio" data-testid="meus-livros-sem-resultado">
          <h2>{t('Nenhum livro encontrado')}</h2>
          <p>{t('Tente outro termo ou limpe os filtros.')}</p>
          <div className="q-acoes">
            <button type="button" className="q-ctl pri" onClick={limpar}>
              {t('Limpar filtros')}
            </button>
          </div>
        </div>
      ) : (
        <ul className="q-lista">
          {lista.map(({ livro: l, posicao, fracao, ficha }) => {
            const pct = porcentagemDe(fracao);
            const faltam = minutosRestantes(ficha?.minutosEstimados, fracao);
            const sugestao = statusSugerido(l.status, fracao);
            const n = anotacoes[idNaEstante(l)] ?? 0;
            const quando = posicao?.atualizadaEm || l.abertoEm;
            const extras = [
              quando ? t('Última leitura em {data}', { data: data(quando) }) : null,
              faltam !== null && pct < 100 ? t('Faltam cerca de {tempo}', { tempo: rotuloDoTempo(faltam) }) : null,
              n > 0 ? tp(n, '{n} anotação', '{n} anotações') : null,
            ].filter(Boolean);
            return (
              <li key={l.id} className="lv-meu" data-livro={l.id}>
                <span className="lv-meu-capa">
                  <CapaDesenhada
                    id={idNaEstante(l)}
                    titulo={l.titulo}
                    autor={l.autor}
                    idioma={l.idioma}
                    imagemDoCatalogo={ficha ? capaDoLivro(ficha)?.url : undefined}
                  />
                  <button
                    type="button"
                    className="q-chip lv-meu-capa-acao"
                    onClick={() => setTrocando(l)}
                    aria-label={t('Trocar a capa de {titulo}', { titulo: l.titulo })}
                  >
                    <ImagePlus aria-hidden /> {t('Trocar capa')}
                  </button>
                </span>
                <div className="lv-meu-texto">
                  <b lang={l.idioma}>{l.titulo}</b>
                  <small>{[l.autor, rotuloDaOrigem(l)].filter(Boolean).join(' · ')}</small>
                  {pct > 0 ? (
                    <>
                      <div
                        className="q-barra lv-barra"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        aria-label={t('Progresso de {titulo}', { titulo: l.titulo })}
                      >
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <small className="lv-progresso">
                        {[
                          t('{pct}% lido', { pct }),
                          posicao?.capitulo ? t('Capítulo atual: {capitulo}', { capitulo: posicao.capitulo }) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </>
                  ) : (
                    <small className="lv-progresso">{t('Ainda sem progresso salvo')}</small>
                  )}
                  {extras.length > 0 && <small>{extras.join(' · ')}</small>}
                </div>
                <div className="lv-meu-lado">
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
                  {sugestao && (
                    <button type="button" className="q-ctl lv-sugestao" onClick={() => mudarStatus(l.id, sugestao)}>
                      {t('Marcar como {status}', { status: rotuloDoStatus(sugestao).toLowerCase() })}
                    </button>
                  )}
                </div>
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
            );
          })}
        </ul>
      )}
      {trocando && (
        <TrocarCapa livroId={idNaEstante(trocando)} titulo={trocando.titulo} aoFechar={() => setTrocando(null)} />
      )}
    </section>
  );
}
