/* A folha traz o próprio CSS: ela abre também na Sessão, sem passar por Capturar. */
import '../../../../styles/capturaNoCelular.css';
import '../../../../styles/polimentoCaptura.css';

import { ArrowLeft, Check, Copy, Gauge, Languages, Lock, Mic, Plus, Sparkles, Volume2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { type DictionaryResult, lookup } from '../../../../lib/dictionary';
import { t } from '../../../../lib/i18n';
import { direcaoDoTexto } from '../../../../lib/languages';
import { comemorarGuardada, entrarFolha } from '../../../../lib/polimento/captura';
import { haVozPara } from '../../../../lib/voz/haVoz';
import { toast } from '../../../Toast';
import { type FalaTocada, type NuanceNaFolhaDaFrase, palavrasDaFrase } from './FolhaDaFrase';
import FolhaDeBaixo from './FolhaDeBaixo';

const SombraDaFala = lazy(() => import('../../analise/SombraDaFala'));
const NuanceDaFrase = lazy(() => import('../nuance/NuanceDaFrase'));

/** Sem resposta nisto (MT fora, rede lenta), a folha diz "sem tradução" em vez de esperar para sempre. */
const PACIENCIA_MS = 8000;
/** A resposta do fichamento quando a palavra entrou (`lib/captura/palavraDaFala.ts`: "adicionado ao seu deck"). */
const ENTROU = /adicionad/i;

/**
 * A FOLHA DA FRASE DO DESENHO NOVO — `abrirFrase()` de `telas.js:197-222` (itens D14 e D15 de
 * `fidelidade/casca-e-telas.md`): a frase, a tradução, cinco ações, a Nuance e as palavras como botões.
 *
 * A subida, a cascata e a descida são de `lib/polimento/dialogos.ts` (`telas.js:163-188`).
 * As ações são as de verdade (voz, repetir, copiar), as mesmas de `FolhaDaFrase`.
 */
function CorpoDaFrase({
  fala,
  aoOuvir,
  audioReal,
  semPratica = false,
  aoTocarPalavra,
  ehNova,
  guardada,
  aoPraticar,
  nuance,
}: {
  fala: FalaTocada;
  aoOuvir: (texto: string, lang: string, lenta: boolean) => void;
  /** Toca o áudio REAL da fala, onde não há voz de leitura (o Quest) e a fala foi guardada. */
  audioReal?: (lenta: boolean) => void;
  /** Sem "Repetir eu": a nota da repetição usa o reconhecimento de voz do navegador. */
  semPratica?: boolean;
  aoTocarPalavra: (palavra: string) => void;
  ehNova?: (palavra: string) => boolean;
  /** A palavra já está no caderno. */
  guardada?: (palavra: string) => boolean;
  aoPraticar?: () => void;
  nuance?: NuanceNaFolhaDaFrase;
}) {
  const [praticando, setPraticando] = useState(false);
  const palavras = palavrasDaFrase(fala.texto, fala.lang);
  const temTraducao = !!fala.traducao && fala.traducao !== '…';
  const vozDoOriginal = haVozPara(fala.lang);

  const copiar = () => {
    const texto = fala.traducao ? `${fala.texto}\n${fala.traducao}` : fala.texto;
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(texto))
      .then(
        () => toast.info(t('Frase copiada')),
        () => toast.warn(t('Não deu para copiar neste navegador.')),
      );
  };

  return (
    <>
      <p className="folha-frase" lang={fala.lang} dir={direcaoDoTexto(fala.lang)}>
        {fala.texto}
      </p>
      {temTraducao && (
        <p
          className="folha-frase-trad"
          lang={fala.langDaTraducao}
          dir={fala.langDaTraducao ? direcaoDoTexto(fala.langDaTraducao) : undefined}
        >
          {fala.traducao}
        </p>
      )}
      <div className="folha-grade">
        <button
          type="button"
          className="folha-acao pri"
          data-precisa={audioReal || vozDoOriginal ? undefined : 'voz'}
          data-sfx={audioReal ? 'none' : undefined}
          onClick={() => (audioReal ? audioReal(false) : aoOuvir(fala.texto, fala.lang, false))}
        >
          <Volume2 aria-hidden /> {t('Ouvir')}
        </button>
        <button
          type="button"
          className="folha-acao"
          data-precisa={audioReal || vozDoOriginal ? undefined : 'voz'}
          data-sfx={audioReal ? 'none' : undefined}
          onClick={() => (audioReal ? audioReal(true) : aoOuvir(fala.texto, fala.lang, true))}
        >
          <Gauge aria-hidden /> {t('Ouvir devagar')}
        </button>
        {temTraducao && fala.langDaTraducao && (
          <button
            type="button"
            className="folha-acao"
            data-precisa={haVozPara(fala.langDaTraducao) ? undefined : 'voz'}
            onClick={() => aoOuvir(fala.traducao, fala.langDaTraducao!, false)}
          >
            <Languages aria-hidden /> {t('Ouvir tradução')}
          </button>
        )}
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
            <Mic aria-hidden /> {t('Repetir eu')}
          </button>
        )}
        <button type="button" className="folha-acao" onClick={copiar}>
          <Copy aria-hidden /> {t('Copiar')}
        </button>
      </div>
      {praticando && (
        <Suspense fallback={null}>
          <SombraDaFala
            texto={fala.texto}
            idioma={fala.lang}
            aoOuvirOriginal={() => aoOuvir(fala.texto, fala.lang, false)}
          />
        </Suspense>
      )}
      {/* `nuanceDaFrase()` de `telas.js:190-196`: no Grátis, com cadeado e um exemplo desfocado. */}
      {nuance && !nuance.disponivel && (
        <div className="q-aviso px-nuance">
          <span>
            <b>
              <Lock aria-hidden /> {t('Outras formas de dizer')}
            </b>
            <span className="px-nuance-previa" aria-hidden>
              <i>{t('Formal')}</i> {t('Vamos concluir a entrega ainda hoje?')} <i>{t('Informal')}</i>{' '}
              {t('E aí, sai hoje?')}
            </span>
            {t('Sua legenda já usa a Tradução rápida ao vivo, sem esperar.')}
          </span>
          {nuance.aoConhecer && (
            <button type="button" className="q-ctl" data-px="planos" onClick={nuance.aoConhecer}>
              {t('Conhecer o Premium')}
            </button>
          )}
        </div>
      )}
      {/* No Premium a Nuance é a de verdade: as formas vêm da nuvem, a pedido. */}
      {nuance?.disponivel && (
        <>
          <div className="q-aviso px-nuance">
            <span>
              <b>
                <Sparkles aria-hidden /> {t('Outras formas de dizer')}
              </b>
            </span>
          </div>
          <Suspense fallback={null}>
            <NuanceDaFrase
              fala={fala}
              destino={nuance.destino}
              contexto={nuance.contexto}
              falada={nuance.falada}
              disponivel
              aoConhecer={nuance.aoConhecer}
              aoEscolher={nuance.aoEscolher}
            />
          </Suspense>
        </>
      )}
      {palavras.length > 0 && (
        <>
          <p className="folha-rotulo">{t('Toque numa palavra')}</p>
          {/* A fila segue a ordem de leitura da frase: em árabe, a primeira palavra fica à direita. */}
          <div className="folha-palavras" dir={direcaoDoTexto(fala.lang)}>
            {palavras.map((p) => {
              const ja = !!guardada?.(p);
              return (
                <button
                  key={p}
                  type="button"
                  lang={fala.lang}
                  dir={direcaoDoTexto(fala.lang)}
                  data-nova={!ja && ehNova?.(p) ? '' : undefined}
                  data-aprendida={ja ? '' : undefined}
                  onClick={() => aoTocarPalavra(p)}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/**
 * A FOLHA DA PALAVRA DO DESENHO NOVO — `abrirPalavra()` de `telas.js:223-255` (item D16): voltar à
 * frase, a palavra, a pronúncia escrita, a tradução, três ações e o que o caderno respondeu.
 *
 * "Guardar" ficha a palavra de verdade (o mesmo fichamento de `FolhaDaPalavra`); quando entra, o
 * botão vira "Guardada" e sai a faísca.
 */
function CorpoDaPalavra({
  palavra,
  frase,
  lang,
  jaGuardada = false,
  aoConsultar,
  aoOuvir,
  aoSalvar,
  aoVoltar,
  aoPraticar,
  semPratica = false,
}: {
  palavra: string;
  frase: string;
  lang: string;
  jaGuardada?: boolean;
  aoConsultar: (palavra: string, frase: string, lang?: string) => Promise<{ traducao: string }>;
  aoOuvir: (texto: string, lang: string, lenta: boolean) => void;
  aoSalvar: (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => Promise<string>;
  aoVoltar?: () => void;
  aoPraticar?: () => void;
  semPratica?: boolean;
}) {
  const [glosa, setGlosa] = useState<string | null>(null);
  const [verbete, setVerbete] = useState<DictionaryResult | null>(null);
  const [status, setStatus] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [guardada, setGuardada] = useState(jaGuardada);
  const [praticando, setPraticando] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const acabouDeGuardar = useRef(false);

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

  /* `telas.js:248-253`: depois que o botão já mostra "Guardada" (o ícone novo é o que gira). */
  useLayoutEffect(() => {
    if (!guardada || !acabouDeGuardar.current || !botao.current) return;
    acabouDeGuardar.current = false;
    comemorarGuardada(botao.current);
  }, [guardada]);

  const ipa = verbete?.status === 'found' ? verbete.entry.ipa : '';

  const guardar = async () => {
    if (salvando || guardada) return;
    setSalvando(true);
    try {
      const resposta = await aoSalvar({ palavra, frase, lang, traducao: glosa || undefined });
      /* O fichamento responde com uma frase; só comemora o que ENTROU no caderno. A que ele recusou
         (repetida, sem tradução) mostra o motivo dele, sem faísca. */
      if (ENTROU.test(resposta)) {
        acabouDeGuardar.current = true;
        setGuardada(true);
        setStatus(t('No seu caderno. Ela volta nos jogos e na revisão.'));
      } else setStatus(resposta);
    } catch {
      setStatus(t('Não deu para salvar agora.'));
    }
    setSalvando(false);
  };

  return (
    <>
      {aoVoltar && (
        <button type="button" className="folha-voltar q-chip" data-px="voltar" onClick={aoVoltar}>
          <ArrowLeft aria-hidden /> {t('Voltar à frase')}
        </button>
      )}
      <p className="folha-pal" lang={lang} dir={direcaoDoTexto(lang)}>
        {palavra}
      </p>
      {ipa && <p className="folha-ipa">{ipa}</p>}
      <p className="folha-glosa">
        {glosa === null ? t('Consultando…') : glosa || t('Sem tradução para esta palavra.')}
      </p>
      <div className="folha-grade">
        <button type="button" className="folha-acao" onClick={() => aoOuvir(palavra, lang, false)}>
          <Volume2 aria-hidden /> {t('Ouvir')}
        </button>
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
        <button
          ref={botao}
          type="button"
          className="folha-acao pri"
          data-px="guardar"
          data-sfx={guardada ? undefined : 'none'}
          onClick={() => void guardar()}
        >
          {guardada ? (
            <>
              <Check key="ok" aria-hidden /> {t('Guardada')}
            </>
          ) : (
            <>
              <Plus key="mais" aria-hidden /> {t('Guardar')}
            </>
          )}
        </button>
      </div>
      <p className="folha-status" role="status">
        {status}
      </p>
      {praticando && (
        <Suspense fallback={null}>
          <SombraDaFala texto={palavra} idioma={lang} aoOuvirOriginal={() => aoOuvir(palavra, lang, false)} />
        </Suspense>
      )}
    </>
  );
}

/** A palavra aberta, no que a folha precisa. */
export interface PalavraNaFolha {
  palavra: string;
  frase: string;
  lang: string;
}

/**
 * AS DUAS FOLHAS DO DESENHO NOVO NUM `<dialog>` SÓ. No protótipo, ir da frase para a palavra (e
 * voltar) tira a folha antiga na hora e a nova sobe de baixo (`folhaDeBaixo()` de `telas.js:173-188`).
 * Aqui é o mesmo diálogo que troca de conteúdo e refaz a subida: dois diálogos fariam a antiga sair
 * devagar por baixo da nova.
 */
export default function FolhasDoPrototipo({
  fala,
  palavra,
  aoOuvir,
  audioReal,
  semPratica = false,
  ehNova,
  guardada,
  aoPraticar,
  aoTocarPalavra,
  aoVoltar,
  aoConsultar,
  aoSalvar,
  aoFechar,
  nuance,
}: {
  /** A fala tocada; ausente quando a palavra não veio de uma frase. */
  fala: FalaTocada | null;
  /** A palavra aberta por cima da frase. */
  palavra: PalavraNaFolha | null;
  aoOuvir: (texto: string, lang: string, lenta: boolean) => void;
  audioReal?: (lenta: boolean) => void;
  semPratica?: boolean;
  ehNova?: (palavra: string) => boolean;
  guardada?: (palavra: string) => boolean;
  aoPraticar?: () => void;
  aoTocarPalavra: (palavra: string) => void;
  /** Volta da palavra para a frase. Ausente = a palavra não veio de uma frase. */
  aoVoltar?: () => void;
  aoConsultar: (palavra: string, frase: string, lang?: string) => Promise<{ traducao: string }>;
  aoSalvar: (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => Promise<string>;
  aoFechar: () => void;
  nuance?: NuanceNaFolhaDaFrase;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const qual = palavra ? `palavra:${palavra.palavra}` : 'frase';
  const anterior = useRef(qual);
  useLayoutEffect(() => {
    if (anterior.current === qual) return;
    anterior.current = qual;
    if (dialogo.current) entrarFolha(dialogo.current);
  }, [qual]);

  if (!palavra && !fala) return null;
  return (
    <FolhaDeBaixo
      titulo={palavra ? t('Palavra: {palavra}', { palavra: palavra.palavra }) : t('Ações')}
      aoFechar={aoFechar}
      classe={palavra ? 'folha-da-palavra' : 'folha-da-frase'}
      refDaFolha={dialogo}
      doPrototipo
    >
      {palavra ? (
        <CorpoDaPalavra
          key={palavra.palavra}
          palavra={palavra.palavra}
          frase={palavra.frase}
          lang={palavra.lang}
          jaGuardada={!!guardada?.(palavra.palavra)}
          aoConsultar={aoConsultar}
          aoOuvir={aoOuvir}
          aoSalvar={aoSalvar}
          aoVoltar={aoVoltar}
          aoPraticar={aoPraticar}
          semPratica={semPratica}
        />
      ) : (
        fala && (
          <CorpoDaFrase
            fala={fala}
            aoOuvir={aoOuvir}
            audioReal={audioReal}
            semPratica={semPratica}
            aoTocarPalavra={aoTocarPalavra}
            ehNova={ehNova}
            guardada={guardada}
            aoPraticar={aoPraticar}
            nuance={nuance}
          />
        )
      )}
    </FolhaDeBaixo>
  );
}
