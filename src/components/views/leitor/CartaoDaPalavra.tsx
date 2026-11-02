import { BookOpenText, Check, ChevronDown, ExternalLink, Languages, Loader2, Plus, Volume2, X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { type PosicaoDoCartao, posicaoDoCartao, type Retangulo } from '../../../core/leitura/posicaoDoCartao';
import { classeDoSentido, type ContextoDaPalavra, ordenarSentidos } from '../../../core/leitura/sentidoNoContexto';
import { type DictionaryResult, forvoUrl, lookup, wiktionaryUrl } from '../../../lib/dictionary';
import { idiomaDaInterface, t } from '../../../lib/i18n';
import type { ImagemDaPalavra } from '../../../lib/imagens/criterios';
import { baseLang, langLabel, langLabelNaUI } from '../../../lib/languages';
import { linkExternoSeguro } from '../../../lib/leitor/politicaDeRecursos';
import { glosaDoVerbete } from '../../../lib/traducaoDePalavra';
import type { VocabWord } from '../../../types';
import Provenance from '../../Provenance';
import { DE_DICIONARIO, MT_ENGINE_LABELS } from '../../VocabularyPanel';
import ExplicacaoDaFrase from '../captura/estudo/ExplicacaoDaFrase';

/** O cartão antes da primeira medida (o tamanho real chega no `useLayoutEffect`). */
const TAMANHO_ESTIMADO = { largura: 500, altura: 200 };
const VELOCIDADES = [0.75, 1] as const;

const NOME_DA_CLASSE: Record<string, string> = {
  'nome-proprio': 'nome próprio',
  substantivo: 'substantivo',
  verbo: 'verbo',
  adjetivo: 'adjetivo',
  adverbio: 'advérbio',
};

type TraducaoDaFrase = { estado: 'carregando' } | { estado: 'pronta'; texto: string } | { estado: 'erro' };

export interface CartaoDaPalavraProps {
  vocab: VocabWord;
  /** Por que não há tradução da palavra (par sem motor, MT falhou). `null` = ainda traduzindo ou já traduziu. */
  mtNote: string | null;
  /** A palavra no texto, a frase e a posição dela: escolhem a forma consultada e a ordem dos sentidos. */
  contexto: ContextoDaPalavra;
  /** A forma consultada no dicionário ("call" para o "Call" do começo da frase). */
  formaDeConsulta: string;
  /** O idioma da pessoa (BCP-47): o da tradução e o da explicação. */
  destino: string;
  /** Onde a palavra está na janela. `null` = desconhecido (vira mini-folha). */
  ancora: Retangulo | null;
  /** Aberto pelo teclado: o foco vai para o cartão. Pelo toque, o foco fica onde estava. */
  porTeclado: boolean;
  podeOuvir: boolean;
  aoOuvir: () => void;
  velocidade: number;
  aoMudarVelocidade: (v: number) => void;
  salva: boolean;
  aoSalvar: () => void;
  /** Traduz a frase (o mesmo tradutor da barra do trecho, com cache). `null` = não deu. */
  traduzirFrase: (frase: string) => Promise<string | null>;
  /** A imagem da palavra. Ausente = esta pessoa não vê imagem externa (perfil protegido). */
  imagens?: { lista: ImagemDaPalavra[]; carregando: boolean };
  /** A palavra está num link externo do livro. */
  link?: string;
  /** Um bloco a mais dentro do "Mais" (o histórico da palavra). */
  extra?: ReactNode;
  etiqueta?: string;
  aoConhecerPlanos?: () => void;
  aoFechar: () => void;
}

/**
 * O CARTÃO LEVE DA PALAVRA do leitor de livros (no lugar da folha modal do `VocabularyPanel`).
 *
 * NÃO BLOQUEIA: não é modal (sem fundo, sem prender o foco), o livro segue legível e virável por trás, e o
 * cartão não toca na narração. Fica perto da palavra (`core/leitura/posicaoDoCartao`), nunca por cima dela.
 *
 * O ESSENCIAL EM UMA OLHADA: a palavra (+ fonética, se houver, + Ouvir); a melhor tradução no contexto; as
 * ações rápidas. "Mais" abre o verbete inteiro, os links e as fontes, no próprio cartão.
 */
export default function CartaoDaPalavra(props: CartaoDaPalavraProps) {
  const { vocab, contexto, formaDeConsulta, destino } = props;
  const idioma = vocab.lang ?? contexto.idioma ?? '';
  const raiz = useRef<HTMLDivElement>(null);
  const titulo = useId();
  const [entrada, setEntrada] = useState<DictionaryResult | null>(null);
  const [aberta, setAberta] = useState<'frase' | 'sentido' | null>(null);
  const [mais, setMais] = useState(false);
  const [frase, setFrase] = useState<TraducaoDaFrase | null>(null);
  const [tamanho, setTamanho] = useState(TAMANHO_ESTIMADO);
  const [janela, setJanela] = useState(() => ({ largura: window.innerWidth, altura: window.innerHeight }));
  /* A faixa da tela que é do leitor (no celular, a barra de navegação do app fica embaixo dele). */
  const [area, setArea] = useState(() => ({ topo: 0, base: window.innerHeight }));

  /* O verbete da forma consultada (cacheado e deduplicado em `lookup`). */
  useEffect(() => {
    if (!formaDeConsulta || !idioma) return;
    let vivo = true;
    void lookup(formaDeConsulta, idioma).then((r) => {
      if (vivo) setEntrada(r);
    });
    return () => {
      vivo = false;
    };
  }, [formaDeConsulta, idioma]);

  useEffect(() => {
    const f = () => setJanela({ largura: window.innerWidth, altura: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  /* O foco só vem para o cartão quando ele foi aberto pelo teclado, e sem rolar a página. */
  useEffect(() => {
    if (props.porTeclado) raiz.current?.focus({ preventScroll: true });
  }, [props.porTeclado]);

  /* Toque fora fecha (o toque no texto do livro chega pelo leitor: o capítulo é outro documento). */
  const fecharRef = useRef(props.aoFechar);
  fecharRef.current = props.aoFechar;
  useEffect(() => {
    const f = (e: PointerEvent) => {
      if (raiz.current && e.target instanceof Node && !raiz.current.contains(e.target)) fecharRef.current();
    };
    document.addEventListener('pointerdown', f);
    return () => document.removeEventListener('pointerdown', f);
  }, []);

  /* Mede a cada render (o conteúdo cresce com a tradução, o verbete e o "Mais"); só muda o estado quando a
     medida mudou, então não entra em laço. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const largura = el.offsetWidth || TAMANHO_ESTIMADO.largura;
    const altura = el.scrollHeight || TAMANHO_ESTIMADO.altura;
    if (largura !== tamanho.largura || altura !== tamanho.altura) setTamanho({ largura, altura });
    const r = el.parentElement?.closest('.leitor')?.getBoundingClientRect();
    const topo = Math.max(0, r?.top ?? 0);
    const base = Math.min(janela.altura, r?.bottom ?? janela.altura);
    if (topo !== area.topo || base !== area.base) setArea({ topo, base });
  });

  /* A conta é feita dentro da faixa do leitor e devolvida para a janela. */
  const a = props.ancora;
  const posicao: PosicaoDoCartao = posicaoDoCartao({
    palavra: a && { ...a, top: a.top - area.topo, bottom: a.bottom - area.topo },
    janela: { largura: janela.largura, altura: area.base - area.topo },
    cartao: tamanho,
  });

  const achado = entrada?.status === 'found' ? entrada.entry : null;
  const sentidos = useMemo(() => (achado ? ordenarSentidos(contexto, achado.senses) : []), [achado, contexto]);
  const melhor = sentidos[0];
  const destinoBase = baseLang(destino);
  /* A melhor tradução no contexto: a glosa do sentido que serve aqui, quando o verbete é do idioma da pessoa;
     senão, a tradução da palavra que o app já fez. */
  const glosaNoContexto = achado
    ? glosaDoVerbete({ status: 'found', entry: { ...achado, senses: sentidos } }, destinoBase)
    : null;
  const traducao = glosaNoContexto || vocab.translation;
  const deDicionario = !!glosaNoContexto || DE_DICIONARIO.has(vocab.mtEngine ?? '');
  const ipa = achado?.ipa ?? vocab.phonetics;
  const imagem = props.imagens?.lista[0];

  const pedirFrase = async () => {
    setAberta('frase');
    if (frase?.estado === 'pronta' || frase?.estado === 'carregando') return;
    setFrase({ estado: 'carregando' });
    const r = await props.traduzirFrase(contexto.frase).catch(() => null);
    setFrase(r ? { estado: 'pronta', texto: r } : { estado: 'erro' });
  };

  const estilo =
    posicao.modo === 'ancorado'
      ? { top: posicao.top + area.topo, left: posicao.left, maxHeight: posicao.maxAltura }
      : posicao.borda === 'topo'
        ? { top: area.topo, maxHeight: posicao.maxAltura }
        : { bottom: janela.altura - area.base, maxHeight: posicao.maxAltura };

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titulo}
      tabIndex={-1}
      className="cartao-palavra"
      data-testid="folha-da-palavra"
      data-modo={posicao.modo}
      data-lado={posicao.modo === 'ancorado' ? posicao.lado : posicao.borda}
      data-etiqueta={props.etiqueta}
      style={estilo}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        props.aoFechar();
      }}
    >
      <div className="cartao-palavra-topo">
        <div className="cartao-palavra-cab">
          <p className="cartao-palavra-linha1">
            <span id={titulo} className="cartao-palavra-termo" lang={idioma || undefined}>
              {vocab.word}
            </span>
            {ipa && <span className="cartao-palavra-ipa">{ipa}</span>}
          </p>
          <p className="cartao-palavra-traducao" lang={traducao ? destino || undefined : undefined}>
            {traducao ? (
              traducao
            ) : props.mtNote ? (
              <span className="cartao-palavra-apoio">
                {t('Sem tradução para esta palavra agora. Toque em Traduzir a frase.')}
              </span>
            ) : (
              <span className="cartao-palavra-apoio" role="status">
                <Loader2 className="animate-spin" aria-hidden /> {t('Traduzindo…')}
              </span>
            )}
          </p>
        </div>
        {imagem && (
          <figure className="cartao-palavra-imagem">
            <img src={imagem.url} alt={imagem.titulo || vocab.word} loading="lazy" decoding="async" />
            {(imagem.licenca || imagem.acervo) && (
              <figcaption title={[imagem.autor, imagem.licenca, imagem.acervo].filter(Boolean).join(' · ')}>
                {imagem.pagina ? (
                  <a href={imagem.pagina} target="_blank" rel="noopener noreferrer">
                    {imagem.licenca || imagem.acervo}
                  </a>
                ) : (
                  imagem.licenca || imagem.acervo
                )}
              </figcaption>
            )}
          </figure>
        )}
        <div className="cartao-palavra-cantos">
          {props.podeOuvir && (
            <button
              type="button"
              className="leitor-botao"
              aria-label={t('Ouvir “{palavra}”', { palavra: vocab.word })}
              onClick={props.aoOuvir}
            >
              <Volume2 aria-hidden />
            </button>
          )}
          <button type="button" className="leitor-botao" aria-label={t('Fechar')} onClick={props.aoFechar}>
            <X aria-hidden />
          </button>
        </div>
      </div>

      <div className="cartao-palavra-acoes" role="group" aria-label={t('Ações da palavra')}>
        <button
          type="button"
          className="cartao-palavra-chip"
          aria-expanded={aberta === 'frase'}
          onClick={() => (aberta === 'frase' ? setAberta(null) : void pedirFrase())}
        >
          <Languages aria-hidden /> {t('Traduzir a frase')}
        </button>
        <button
          type="button"
          className="cartao-palavra-chip"
          aria-expanded={aberta === 'sentido'}
          onClick={() => setAberta(aberta === 'sentido' ? null : 'sentido')}
        >
          <BookOpenText aria-hidden /> {t('Sentido')}
        </button>
        {props.salva ? (
          <span className="cartao-palavra-chip" data-estado="salva" role="status">
            <Check aria-hidden /> {t('Salva')}
          </span>
        ) : (
          <button type="button" className="cartao-palavra-chip" onClick={props.aoSalvar}>
            <Plus aria-hidden /> {t('Salvar')}
          </button>
        )}
        {props.link && (
          <button
            type="button"
            className="cartao-palavra-chip leitor-abrir-link"
            data-testid="abrir-link"
            title={props.link}
            onClick={() => {
              const url = linkExternoSeguro(props.link ?? '');
              if (url) window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            <ExternalLink aria-hidden /> {t('Abrir link')}
            <span className="leitor-link-destino">{hostDe(props.link)}</span>
          </button>
        )}
        <button
          type="button"
          className="cartao-palavra-chip"
          aria-expanded={mais}
          data-testid="cartao-mais"
          onClick={() => setMais((m) => !m)}
        >
          <ChevronDown aria-hidden className="cartao-palavra-seta" /> {mais ? t('Menos') : t('Mais')}
        </button>
      </div>

      {aberta === 'frase' && (
        <section className="cartao-palavra-bloco" aria-label={t('Tradução da frase')} data-testid="cartao-frase">
          <p className="cartao-palavra-citacao" lang={idioma || undefined}>
            “{contexto.frase}”
          </p>
          <div aria-live="polite">
            {frase?.estado === 'carregando' && (
              <p className="cartao-palavra-apoio">
                <Loader2 className="animate-spin" aria-hidden /> {t('Traduzindo a frase…')}
              </p>
            )}
            {frase?.estado === 'pronta' && <p lang={destino || undefined}>{frase.texto}</p>}
            {frase?.estado === 'erro' && (
              <p className="cartao-palavra-apoio">
                {t('Não deu para traduzir a frase agora.')}{' '}
                <button
                  type="button"
                  className="cartao-palavra-link"
                  onClick={() => {
                    setFrase(null);
                    void (async () => {
                      setFrase({ estado: 'carregando' });
                      const r = await props.traduzirFrase(contexto.frase).catch(() => null);
                      setFrase(r ? { estado: 'pronta', texto: r } : { estado: 'erro' });
                    })();
                  }}
                >
                  {t('Tentar de novo')}
                </button>
              </p>
            )}
          </div>
        </section>
      )}

      {aberta === 'sentido' && (
        <section className="cartao-palavra-bloco" aria-label={t('Sentido neste trecho')} data-testid="cartao-sentido">
          <div aria-live="polite">
            {!entrada && idioma && (
              <p className="cartao-palavra-apoio">
                <Loader2 className="animate-spin" aria-hidden /> {t('Buscando o sentido…')}
              </p>
            )}
            {melhor && (
              <>
                {NOME_DA_CLASSE[classeDoSentido(melhor.partOfSpeech)] && (
                  <p>
                    {t('Aqui, “{palavra}” é {classe}.', {
                      palavra: formaDeConsulta,
                      classe: t(NOME_DA_CLASSE[classeDoSentido(melhor.partOfSpeech)]),
                    })}
                  </p>
                )}
                <p lang={achado?.glossLang}>{melhor.definition}</p>
              </>
            )}
            {(entrada?.status === 'not-found' || !idioma) && (
              <p className="cartao-palavra-apoio">
                {t('O dicionário não tem esta palavra. Toque em Traduzir a frase.')}
              </p>
            )}
            {entrada?.status === 'error' && (
              <p className="cartao-palavra-apoio">
                {t('Sem conexão com o dicionário agora. Tente de novo daqui a pouco.')}
              </p>
            )}
          </div>
          <ExplicacaoDaFrase
            fala={{ texto: contexto.frase, traducao: frase?.estado === 'pronta' ? frase.texto : '', lang: idioma }}
            destino={destino}
            aoConhecer={props.aoConhecerPlanos}
          />
        </section>
      )}

      {mais && (
        <section className="cartao-palavra-mais" aria-label={t('Mais sobre a palavra')} data-testid="cartao-detalhes">
          {props.podeOuvir && (
            <div className="cartao-palavra-velocidade" role="group" aria-label={t('Velocidade do áudio')}>
              {VELOCIDADES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="cartao-palavra-chip"
                  aria-pressed={props.velocidade === v}
                  onClick={() => props.aoMudarVelocidade(v)}
                >
                  {String(v).replace('.', ',')}×
                </button>
              ))}
            </div>
          )}
          {!props.podeOuvir && (
            <p className="cartao-palavra-apoio" data-testid="palavra-sem-voz">
              {idioma
                ? t('Sem voz de leitura para {idioma} neste aparelho.', { idioma: langLabel(idioma) })
                : t('Sem voz de leitura para esta palavra neste aparelho.')}
            </p>
          )}

          <h3 className="cartao-palavra-sub">{t('Dicionário')}</h3>
          {achado && achado.glossLang !== baseLang(idiomaDaInterface()) && (
            <p className="cartao-palavra-apoio">
              {t('Definição em {idioma}.', { idioma: langLabelNaUI(achado.glossLang) })}
            </p>
          )}
          {sentidos.length > 0 && (
            <ul className="cartao-palavra-sentidos" lang={achado?.glossLang}>
              {sentidos.slice(0, 3).map((s, i) => (
                <li key={i}>
                  {s.partOfSpeech && <span className="cartao-palavra-classe">{s.partOfSpeech}</span>} {s.definition}
                  {s.examples[0] && <span className="cartao-palavra-exemplo"> “{s.examples[0]}”</span>}
                </li>
              ))}
            </ul>
          )}
          {entrada?.status === 'not-found' && (
            <p className="cartao-palavra-apoio">{t('O dicionário não tem esta palavra.')}</p>
          )}
          {idioma && (
            <div className="cartao-palavra-acoes">
              <a
                className="cartao-palavra-chip"
                href={entrada?.status === 'not-found' ? entrada.sourceUrl : wiktionaryUrl(formaDeConsulta)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Wiktionary <ExternalLink aria-hidden />
              </a>
              <a
                className="cartao-palavra-chip"
                href={forvoUrl(formaDeConsulta, idioma)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('Forvo (voz humana)')} <ExternalLink aria-hidden />
              </a>
            </div>
          )}

          <h3 className="cartao-palavra-sub">{t('No livro')}</h3>
          <p className="cartao-palavra-citacao" lang={idioma || undefined}>
            “{contexto.frase}”
          </p>
          {props.extra}

          <details className="cartao-palavra-fontes">
            <summary>{t('Fontes')}</summary>
            {traducao && (
              <Provenance
                kind={deDicionario ? 'source' : 'computed'}
                origin={
                  glosaNoContexto
                    ? achado!.source.wiki
                    : t(MT_ENGINE_LABELS[vocab.mtEngine ?? ''] ?? vocab.mtEngine ?? 'guardada no seu caderno')
                }
                method={deDicionario ? t('glosa de dicionário') : t('tradução automática')}
              />
            )}
            {achado && (
              <Provenance
                kind="source"
                origin={`${achado.source.wiki} · ${achado.source.license}`}
                url={achado.source.url}
                method={t('verbete em {idioma}, definido em {outro}', {
                  idioma: langLabel(achado.lang),
                  outro: langLabel(achado.glossLang),
                })}
              />
            )}
            {imagem && (
              <p className="cartao-palavra-apoio">
                {t('Imagem')}: {[imagem.autor, imagem.licenca, imagem.acervo].filter(Boolean).join(' · ')}
              </p>
            )}
          </details>
        </section>
      )}
    </div>
  );
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
