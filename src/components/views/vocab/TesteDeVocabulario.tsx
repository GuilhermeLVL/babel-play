import '../../../styles/etiquetas.css';

import { ListChecks } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { chavesConhecidas } from '../../../core/vocabulario/marcadas';
import { andamentoDoTeste, montarTeste, resultadoDoTeste } from '../../../core/vocabulario/testeDeVocabulario';
import {
  desfazerLoteNoIndice,
  marcarLoteNoIndice,
  useSnapshotDasEtiquetas,
} from '../../../lib/etiquetas/indiceDeEtiquetas';
import { numero, t, tp } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';
import Barra from '../../ui/Barra';
import Dialogo from '../../ui/Dialogo';

type Fase = 'intro' | 'testando' | 'resultado' | 'feito' | 'desfeito';

/**
 * "DESCUBRA QUANTAS PALAVRAS VOCÊ JÁ SABE" (openspec `teste-de-vocabulario`): uma palavra por vez, "Sei" ou "Não
 * sei", e no fim as palavras conhecidas entram na conta de uma vez (com desfazer em lote). É um DIAGNÓSTICO: não dá
 * XP nem Seeds, não tem tempo, contagem regressiva nem nota. Algumas palavras são inventadas, de propósito, para o
 * resultado não sair inflado por chute (avisamos antes de começar).
 */
export default function TesteDeVocabulario({
  lang,
  aoFechar,
  semente,
}: {
  lang: string;
  aoFechar: () => void;
  /** Só para testes: fixa a amostra. */
  semente?: string;
}) {
  const [fase, setFase] = useState<Fase>('intro');
  const [respostas, setRespostas] = useState<boolean[]>([]);
  const [chaves, setChaves] = useState<string[]>([]);
  const [erro, setErro] = useState(false);
  const [gravando, setGravando] = useState(false);
  const teste = useMemo(() => montarTeste(lang, semente ?? String(Date.now())), [lang, semente]);
  const s = useSnapshotDasEtiquetas();
  const idioma = langLabelNaUI(lang);

  const andamento = teste ? andamentoDoTeste(teste, respostas) : null;
  const resultado = useMemo(() => (teste ? resultadoDoTeste(teste, respostas) : null), [teste, respostas]);

  /* O número honesto: só o que ainda não conta (já conhecida pelo caderno ou marcada) e não é "ignorada". */
  const novas = useMemo(() => {
    if (!resultado) return [];
    const ja = chavesConhecidas(s.caderno, s.marcadas, lang);
    return resultado.aMarcar.filter((c) => !ja.has(c) && s.marcadas?.get(lang)?.get(c) !== 'ignorada');
  }, [resultado, s.caderno, s.marcadas, lang]);

  const responder = (sei: boolean) => {
    if (fase !== 'testando' || !teste || !andamento || andamento.terminou) return;
    const proximas = [...respostas, sei];
    setRespostas(proximas);
    if (andamentoDoTeste(teste, proximas).terminou) setFase('resultado');
  };

  useEffect(() => {
    if (fase !== 'testando') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's' || k === 'arrowright') responder(true);
      else if (k === 'n' || k === 'arrowleft') responder(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  const confirmar = async () => {
    setErro(false);
    setGravando(true);
    const r = await marcarLoteNoIndice(lang, novas);
    setGravando(false);
    if (!r) return setErro(true);
    setChaves(r.criadas);
    setFase('feito');
  };

  const desfazer = async () => {
    setErro(false);
    setGravando(true);
    const ok = await desfazerLoteNoIndice(lang, chaves);
    setGravando(false);
    if (!ok) return setErro(true);
    setFase('desfeito');
  };

  const erroAviso = erro && (
    <p className="q-vazio" role="status">
      {t('Não deu para salvar agora. Nada foi alterado; tente de novo em instantes.')}
    </p>
  );

  return (
    <Dialogo
      icone={ListChecks}
      titulo={t('Descubra quantas palavras você já sabe')}
      sub={t('Sem tempo e sem pontos: é só para o Frasy conhecer você.')}
      aoFechar={aoFechar}
    >
      {fase === 'intro' && (
        <>
          <div className="dlg-corpo teste-vocab">
            <p>
              {t(
                'Vamos mostrar uma palavra em {idioma} por vez. Toque em “Sei” se você conhece e em “Não sei” se não.',
                { idioma },
              )}
            </p>
            <p>
              {t(
                'Responda com sinceridade: algumas palavras foram inventadas só para o teste. Se você marcar “Sei” nelas, o resultado perde a precisão.',
              )}
            </p>
            <p className="mut">{t('Não vale nota, e você pode parar quando quiser. É rápido: são poucas palavras.')}</p>
          </div>
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" onClick={aoFechar}>
              {t('Agora não')}
            </button>
            <button type="button" className="btn btn-solid" data-autofocus="" onClick={() => setFase('testando')}>
              {t('Começar')}
            </button>
          </div>
        </>
      )}

      {fase === 'testando' && andamento?.proximo && (
        <>
          <div className="dlg-corpo teste-vocab">
            <Barra
              pct={(andamento.faixaAtual / andamento.totalDeFaixas) * 100}
              tom="good"
              tamanho="fina"
              rotuloAcessivel={t('Etapa {n} de {total}', {
                n: andamento.faixaAtual + 1,
                total: andamento.totalDeFaixas,
              })}
            />
            <p className="teste-vocab-etapa mut">
              {t('Etapa {n} de {total}', { n: andamento.faixaAtual + 1, total: andamento.totalDeFaixas })}
            </p>
            <p className="teste-vocab-palavra" lang={lang} aria-live="polite">
              {andamento.proximo.palavra}
            </p>
            <p className="mut teste-vocab-dica">{t('Atalhos: S para “Sei”, N para “Não sei” (ou as setas).')}</p>
          </div>
          <div className="dlg-pe">
            <button type="button" className="link" style={{ marginRight: 'auto' }} onClick={() => setFase('resultado')}>
              {t('Parar por aqui')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => responder(false)}>
              {t('Não sei')}
            </button>
            <button type="button" className="btn btn-solid" data-autofocus="" onClick={() => responder(true)}>
              {t('Sei')}
            </button>
          </div>
        </>
      )}

      {fase === 'resultado' && resultado && (
        <>
          <div className="dlg-corpo teste-vocab" data-testid="teste-resultado" data-motivo={resultado.motivo}>
            {resultado.motivo === 'sem_dados' && (
              <p>
                {t(
                  'Você parou antes de responder alguma palavra, então não temos o que mostrar. Sem problema: dá para tentar quando quiser.',
                )}
              </p>
            )}
            {resultado.motivo === 'chute' && (
              <p>
                {t(
                  'Algumas palavras inventadas passaram por conhecidas, e isso acontece com todo mundo. Para não marcar palavra errada, não vamos marcar nada agora. Você pode refazer o teste quando quiser.',
                )}
              </p>
            )}
            {resultado.motivo === 'ok' && (
              <>
                <p className="teste-vocab-nivel">
                  {resultado.nivel
                    ? t('Seu nível estimado em {idioma}: {nivel}', { idioma, nivel: resultado.nivel })
                    : t('Você está começando em {idioma}, e este é um ótimo ponto de partida.', { idioma })}
                </p>
                {resultado.palavrasEstimadas > 0 && (
                  <p className="mut">
                    {t('Você deve conhecer cerca de {n} das palavras mais comuns que usamos como referência.', {
                      n: numero(resultado.palavrasEstimadas),
                    })}
                  </p>
                )}
                {novas.length > 0 ? (
                  <p>
                    {tp(
                      novas.length,
                      'Vamos marcar {n} palavra como conhecida. Você pode desfazer na lista “Palavras que você conhece”.',
                      'Vamos marcar {n} palavras como conhecidas. Você pode desfazer na lista “Palavras que você conhece”.',
                    )}
                  </p>
                ) : (
                  <p>{t('Não há palavras novas para marcar agora.')}</p>
                )}
              </>
            )}
            {erroAviso}
          </div>
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" onClick={aoFechar}>
              {novas.length > 0 ? t('Agora não') : t('Fechar')}
            </button>
            {novas.length > 0 && resultado.confiavel && (
              <button
                type="button"
                className="btn btn-solid"
                data-autofocus=""
                disabled={gravando}
                onClick={() => void confirmar()}
              >
                {t('Marcar palavras')}
              </button>
            )}
          </div>
        </>
      )}

      {(fase === 'feito' || fase === 'desfeito') && (
        <>
          <div className="dlg-corpo teste-vocab" role="status">
            <p>
              {fase === 'feito'
                ? tp(
                    chaves.length,
                    'Pronto: marcamos {n} palavra como conhecida.',
                    'Pronto: marcamos {n} palavras como conhecidas.',
                  )
                : t('Desfeito: as palavras deste teste voltaram a ser desconhecidas.')}
            </p>
            {erroAviso}
          </div>
          <div className="dlg-pe">
            {fase === 'feito' && chaves.length > 0 && (
              <button type="button" className="btn btn-outline" disabled={gravando} onClick={() => void desfazer()}>
                {t('Desfazer todas')}
              </button>
            )}
            <button type="button" className="btn btn-solid" data-autofocus="" onClick={aoFechar}>
              {t('Fechar')}
            </button>
          </div>
        </>
      )}
    </Dialogo>
  );
}
