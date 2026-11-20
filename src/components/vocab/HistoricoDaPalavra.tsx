import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

import { NOME_DO_JOGO_NA_MAESTRIA } from '../../core/maestria';
import { baseLang } from '../../core/texto/idioma';
import { chaveDaPalavra } from '../../core/texto/palavra';
import { type EstadoNoCaderno, estadoNoCaderno } from '../../core/vocabulario/etiquetas';
import {
  fetchHistoricoDaPalavra,
  type HistoricoDaPalavra as Historico,
  salvarNotaDoCartao,
  TETO_DA_NOTA,
} from '../../data/api';
import { comBaseDoApp } from '../../lib/baseDoApp';
import { useSnapshotDasEtiquetas } from '../../lib/etiquetas/indiceDeEtiquetas';
import { data, t, tp } from '../../lib/i18n';
import { type Anotacao, lerAnotacoes } from '../../lib/leitura/anotacaoDaFrase';
import { estadoParaUrl, navegarPara } from '../../lib/rotas';

/** Quantas sessões o "Onde" mostra (o servidor manda até 10). */
const ONDE_NO_CARTAO = 3;
/** Quantas anotações da Leitura aparecem. */
const ANOTACOES_NO_CARTAO = 3;
const PREFIXO_DAS_ANOTACOES = 'readingAnnotations:';

/** As anotações da Leitura (deste aparelho) que citam a palavra: a palavra anotada ou o texto da nota. */
export function anotacoesQueCitam(
  chave: string,
  armazenamento: Pick<Storage, 'length' | 'key' | 'getItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
): Array<{ sessaoId: string; anotacao: Anotacao }> {
  const saida: Array<{ sessaoId: string; anotacao: Anotacao }> = [];
  if (!chave || !armazenamento) return saida;
  try {
    for (let i = 0; i < armazenamento.length; i++) {
      const k = armazenamento.key(i);
      if (!k?.startsWith(PREFIXO_DAS_ANOTACOES)) continue;
      const sessaoId = k.slice(PREFIXO_DAS_ANOTACOES.length);
      for (const a of lerAnotacoes(armazenamento.getItem(k))) {
        const daPalavra = !!a.wordText && chaveDaPalavra(a.wordText) === chave;
        const naNota = !!a.content && a.content.split(/\s+/).some((p) => chaveDaPalavra(p) === chave);
        if (daPalavra || naNota) saida.push({ sessaoId, anotacao: a });
      }
    }
  } catch {
    /* armazenamento bloqueado: sem anotações */
  }
  return saida.sort((a, b) => b.anotacao.createdAt - a.anotacao.createdAt);
}

const rotuloDoEstado = (e: EstadoNoCaderno) =>
  e === 'nova' ? t('Salva no caderno') : e === 'aprendendo' ? t('Aprendendo') : t('Dominada');

const nomeDoJogo = (id: string) =>
  id === 'revisao' ? t('Revisão') : t((NOME_DO_JOGO_NA_MAESTRIA as Record<string, string | undefined>)[id] ?? id);

/**
 * O HISTÓRICO DA PALAVRA no cartão da palavra (carregado por `lazy()` quando o cartão abre): o estado no caderno e a
 * próxima revisão, quantas vezes ela apareceu e onde, os jogos, a nota do cartão e as anotações da Leitura.
 *
 * Sem conta (o servidor responde 501), fica só o estado do caderno local, com o aviso honesto de que o resto mora na
 * conta. O link para a sessão abre em NOVA ABA durante a captura e na janela flutuante (`novaAba`): sair da tela
 * derrubaria a captura.
 */
export default function HistoricoDaPalavra({
  palavra,
  lang,
  novaAba = false,
}: {
  palavra: string;
  lang: string | undefined;
  novaAba?: boolean;
}) {
  const chave = chaveDaPalavra(palavra);
  const idioma = baseLang(lang);
  const snapshot = useSnapshotDasEtiquetas();
  const local = estadoNoCaderno(snapshot.caderno, chave, lang);
  const [h, setH] = useState<Historico | null | undefined>(undefined);
  const [nota, setNota] = useState('');
  const [status, setStatus] = useState('');
  const [salvando, setSalvando] = useState(false);
  const notaSalva = useRef('');

  useEffect(() => {
    let vivo = true;
    setH(undefined);
    setStatus('');
    if (!chave || !idioma) {
      setH(null);
      return;
    }
    void fetchHistoricoDaPalavra(idioma, chave).then((r) => {
      if (!vivo) return;
      setH(r);
      notaSalva.current = r?.nota ?? '';
      setNota(r?.nota ?? '');
    });
    return () => {
      vivo = false;
    };
  }, [chave, idioma]);

  const anotacoes = useMemo(() => anotacoesQueCitam(chave).slice(0, ANOTACOES_NO_CARTAO), [chave]);

  const linkDaSessao = (sessaoId: string, aba?: 'reading') => {
    const alvo = estadoParaUrl({ view: 'analysis', sessionId: sessaoId, ...(aba ? { subTab: aba } : {}) });
    return {
      href: comBaseDoApp(alvo),
      ...(novaAba
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {
            onClick: (e: MouseEvent<HTMLAnchorElement>) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navegarPara({ view: 'analysis', sessionId: sessaoId, ...(aba ? { subTab: aba } : {}) });
            },
          }),
    };
  };

  const salvarNota = async () => {
    if (!h?.cartao || salvando) return;
    setSalvando(true);
    const ok = await salvarNotaDoCartao(h.cartao.id, nota);
    setSalvando(false);
    if (ok) notaSalva.current = nota.slice(0, TETO_DA_NOTA);
    setStatus(ok ? (nota.trim() ? t('Nota salva.') : t('Nota apagada.')) : t('Não deu para salvar a nota agora.'));
  };

  const estado = h?.cartao?.estado ?? local;
  const proxima = h?.cartao?.proximaRevisao;
  const linhaDoEstado = estado
    ? proxima && estado !== 'dominada'
      ? t('{estado} · próxima revisão em {data}', {
          estado: rotuloDoEstado(estado),
          data: data(proxima, { day: 'numeric', month: 'short' }),
        })
      : rotuloDoEstado(estado)
    : t('Fora do seu caderno');

  return (
    <section className="hist-palavra" aria-label={t('Histórico da palavra')} data-testid="historico-da-palavra">
      <p className="hist-estado" data-estado={estado ?? 'fora'}>
        {linhaDoEstado}
      </p>
      {h === undefined ? (
        <p aria-busy="true">{t('Buscando onde ela apareceu…')}</p>
      ) : h === null ? (
        <p className="hist-sem-conta">
          {t(
            'Onde a palavra apareceu, os jogos e a nota ficam na sua conta: aqui só o que o caderno deste aparelho sabe.',
          )}
        </p>
      ) : (
        <>
          <p data-testid="historico-contagem">
            {h.vistas.vezes > 0
              ? tp(h.vistas.sessoes, 'Apareceu {vezes}× em {n} sessão', 'Apareceu {vezes}× em {n} sessões', {
                  vezes: h.vistas.vezes,
                })
              : t('Ainda não apareceu nas suas sessões.')}
          </p>
          {h.onde.length > 0 && (
            <div>
              <h4>{t('Onde')}</h4>
              <ul className="hist-onde">
                {h.onde.slice(0, ONDE_NO_CARTAO).map((o) => (
                  <li key={o.sessaoId}>
                    <a {...linkDaSessao(o.sessaoId)}>{o.titulo || t('Sessão sem título')}</a>
                    <small>{data(o.quando, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
                    {o.frase && <q lang={lang || undefined}>{o.frase}</q>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {h.jogos.length > 0 && (
            <div>
              <h4>{t('Jogos')}</h4>
              <ul className="hist-jogos">
                {h.jogos.map((j) => (
                  <li key={j.jogo}>
                    {t('{jogo}: {acertos} certas, {erros} erradas', {
                      jogo: nomeDoJogo(j.jogo),
                      acertos: j.acertos,
                      erros: j.erros,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="hist-nota">
            <h4>
              <label htmlFor={`nota-${chave}`}>{t('Sua nota')}</label>
            </h4>
            {h.cartao ? (
              <>
                <textarea
                  id={`nota-${chave}`}
                  maxLength={TETO_DA_NOTA}
                  value={nota}
                  placeholder={t('Um exemplo, uma dica para lembrar…')}
                  onChange={(e) => setNota(e.target.value)}
                />
                <div className="hist-nota-acoes">
                  <small>
                    {nota.length}/{TETO_DA_NOTA}
                  </small>
                  <button
                    type="button"
                    className="q-chip"
                    disabled={salvando || nota === notaSalva.current}
                    onClick={() => void salvarNota()}
                  >
                    {t('Salvar nota')}
                  </button>
                </div>
              </>
            ) : (
              <p>{t('Salve a palavra para anotar.')}</p>
            )}
            <p className="hist-nota-status" role="status">
              {status}
            </p>
          </div>
        </>
      )}
      {anotacoes.length > 0 && (
        <div>
          <h4>{t('Na Leitura')}</h4>
          <ul className="hist-onde">
            {anotacoes.map(({ sessaoId, anotacao }) => (
              <li key={`${sessaoId}:${anotacao.id}`}>
                <a {...linkDaSessao(sessaoId, 'reading')}>{anotacao.content || anotacao.wordText || palavra}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
