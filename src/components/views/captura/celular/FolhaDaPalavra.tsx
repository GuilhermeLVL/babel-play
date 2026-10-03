import { ArrowLeft, BookmarkPlus, Mic, Volume2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';

import { type DictionaryResult, lookup } from '../../../../lib/dictionary';
import { t } from '../../../../lib/i18n';
import FolhaDeBaixo from './FolhaDeBaixo';

const SombraDaFala = lazy(() => import('../../analise/SombraDaFala'));
/* A Tradução Nuance (D3): "Sempre traduzir assim" chega por `lazy()` — a UI nova não entra no JS inicial. */
const NuanceDaPalavra = lazy(() => import('../nuance/NuanceDaPalavra'));

/** O que a folha precisa para o "Sempre traduzir assim" (o glossário pessoal, D3 da Fase D). */
export interface NuanceNaFolhaDaPalavra {
  /** A pessoa tem a Tradução Nuance (`traducaoNuance`); sem ela, o botão vem com cadeado. */
  disponivel: boolean;
  /** O idioma da tradução que se fixa. */
  destino: string;
  /** O convite ao Premium — ausente no perfil protegido (oferta promocional, nunca a menor). */
  aoConhecer?: () => void;
}

/** Sem resposta nisto (MT fora, rede lenta), a folha diz "sem tradução" em vez de esperar para sempre. */
const PACIENCIA_MS = 8000;

/**
 * A FOLHA DA PALAVRA — o cartão da palavra no celular (maquete aprovada, 2026-09-29). O mesmo
 * contrato do cartão das Legendas flutuantes (`legendas/CartaoDaPalavra`): a glosa pelo caminho do
 * Analista (dicionário local → Wiktionary → MT), ouvir pela voz do navegador e salvar pelo mesmo
 * fichamento FSRS, cujo resultado é o que o fichamento DISSE (entrou, repetida, recusada).
 *
 * Mais a pronúncia escrita e o primeiro sentido do verbete (`lookup`, o do Analista), só quando a
 * fonte os deu — nada fabricado. "Devagar/Normal" vale para o botão grande de ouvir.
 */
export default function FolhaDaPalavra({
  palavra,
  frase,
  lang,
  aoConsultar,
  aoOuvir,
  aoSalvar,
  aoVoltar,
  aoPraticar,
  semPratica = false,
  aoFechar,
  nuance,
}: {
  palavra: string;
  frase: string;
  lang: string;
  aoConsultar: (palavra: string, frase: string, lang?: string) => Promise<{ traducao: string }>;
  aoOuvir: (texto: string, lang: string, lenta: boolean) => void;
  aoSalvar: (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => Promise<string>;
  /** Volta à folha da frase de onde a palavra saiu. */
  aoVoltar?: () => void;
  /** A prática vai abrir o microfone: quem chama emudece a captura antes (ver `FolhaDaFrase`). */
  aoPraticar?: () => void;
  /** Sem o "Falar eu": a prática abriria o microfone, e o intérprete já o usa (Intérprete v3). */
  semPratica?: boolean;
  aoFechar: () => void;
  /** "Sempre traduzir assim" (D3). Ausente = a folha de sempre, sem o glossário. */
  nuance?: NuanceNaFolhaDaPalavra;
}) {
  const [glosa, setGlosa] = useState<string | null>(null);
  const [verbete, setVerbete] = useState<DictionaryResult | null>(null);
  const [lenta, setLenta] = useState(false);
  const [status, setStatus] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [praticando, setPraticando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setGlosa(null);
    setStatus('');
    const desistir = setTimeout(() => vivo && setGlosa((g) => g ?? ''), PACIENCIA_MS);
    aoConsultar(palavra, frase, lang).then(
      (r) => vivo && setGlosa(r.traducao || ''),
      () => vivo && setGlosa(''),
    );
    void lookup(palavra, lang).then(
      (r) => vivo && setVerbete(r),
      () => undefined,
    );
    return () => {
      vivo = false;
      clearTimeout(desistir);
    };
  }, [palavra, frase, lang, aoConsultar]);

  const achado = verbete?.status === 'found' ? verbete.entry : null;
  const sentido = achado?.senses[0];

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      setStatus(await aoSalvar({ palavra, frase, lang, traducao: glosa || undefined }));
    } catch {
      setStatus(t('Não deu para salvar agora.'));
    }
    setSalvando(false);
  };

  return (
    <FolhaDeBaixo
      titulo={t('Palavra: {palavra}', { palavra })}
      tituloVisivel={false}
      aoFechar={aoFechar}
      classe="folha-da-palavra"
    >
      {aoVoltar && (
        <button type="button" className="folha-voltar" onClick={aoVoltar}>
          <ArrowLeft aria-hidden /> {t('Voltar à frase')}
        </button>
      )}
      <div className="folha-pal-topo">
        <div style={{ minWidth: 0 }}>
          <p className="folha-pal" lang={lang}>
            {palavra}
          </p>
          {(achado?.ipa || sentido?.partOfSpeech) && (
            <p className="folha-ipa">{[achado?.ipa, sentido?.partOfSpeech].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <button
          type="button"
          className="folha-ouvir"
          aria-label={lenta ? t('Ouvir devagar') : t('Ouvir')}
          onClick={() => aoOuvir(palavra, lang, lenta)}
        >
          <Volume2 aria-hidden />
        </button>
      </div>
      <div className="folha-vel" role="group" aria-label={t('Velocidade da voz')}>
        <button type="button" aria-pressed={lenta} onClick={() => setLenta(true)}>
          {t('Devagar')}
        </button>
        <button type="button" aria-pressed={!lenta} onClick={() => setLenta(false)}>
          {t('Normal')}
        </button>
      </div>
      <p className="folha-glosa" aria-live="polite">
        {glosa === null ? t('Consultando…') : glosa ? <b>{glosa}</b> : t('Sem tradução para esta palavra.')}
      </p>
      {sentido?.definition && <p className="folha-def">{sentido.definition}</p>}
      {frase && (
        <p className="folha-ex" lang={lang}>
          “{frase}”
        </p>
      )}
      <div className="folha-grade">
        {!semPratica && (
          <button
            type="button"
            className="folha-acao"
            aria-pressed={praticando}
            onClick={() => {
              if (!praticando) aoPraticar?.();
              setPraticando((v) => !v);
            }}
          >
            <Mic aria-hidden /> {t('Falar eu')}
          </button>
        )}
        <button type="button" className="folha-acao pri" disabled={salvando} onClick={() => void salvar()}>
          <BookmarkPlus aria-hidden /> {t('Guardar')}
        </button>
      </div>
      {status && (
        <p className="folha-status" role="status">
          {status}
        </p>
      )}
      {nuance && (
        <Suspense fallback={null}>
          <NuanceDaPalavra
            palavra={palavra}
            lang={lang}
            glosa={glosa}
            destino={nuance.destino}
            disponivel={nuance.disponivel}
            aoConhecer={nuance.aoConhecer}
          />
        </Suspense>
      )}
      {praticando && (
        <Suspense fallback={null}>
          <SombraDaFala texto={palavra} idioma={lang} aoOuvirOriginal={() => aoOuvir(palavra, lang, lenta)} />
        </Suspense>
      )}
    </FolhaDeBaixo>
  );
}
