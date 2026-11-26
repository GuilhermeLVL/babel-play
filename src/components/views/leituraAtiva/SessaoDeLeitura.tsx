import { makeCloze } from '@core';
import { ArrowLeft, BookOpen, Mic, Volume2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { MB_DO_MOTOR_LOCAL, type MotorDaSombra, motorDaSombra, motorEhLocal } from '../../../core/fala/motorDaSombra';
import {
  aplicarParcial,
  criarAlinhador,
  estadoDaPalavra,
  type EstadoDoAlinhador,
  frasesConcluidas,
  palavrasPorMinuto,
  palavrasPuladas,
  reposicionar,
  temEstrela,
} from '../../../core/leitura/alinhadorDeLeitura';
import { coberturaDoTexto, rotuloDaCobertura } from '../../../core/leitura/coberturaDoTexto';
import type { FichaDeTexto } from '../../../core/leitura/fichaDeTexto';
import { NARRACAO_PARADA, narrar } from '../../../core/leitura/narracao';
import { palavrasParaPraticar } from '../../../core/leitura/palavrasParaPraticar';
import type { Retangulo } from '../../../core/leitura/posicaoDoCartao';
import { leituraValeAMissao, rodadaDaLeitura } from '../../../core/leitura/rodadaDaLeitura';
import { type ContextoDaPalavra, formaDeConsulta } from '../../../core/leitura/sentidoNoContexto';
import { chavesDeLema, mesmoLema } from '../../../core/leitura/textoDaLeitura';
import { FLAG_LEITURA_VOZ_LOCAL } from '../../../core/planos';
import { chaveAtiva } from '../../../core/texto/chaveAtiva';
import { lerMissoes, salvarRodada } from '../../../data/api';
import { creditoDoTexto } from '../../../data/leitura/acervo';
import { buildGateway } from '../../../gateway';
import { getActiveProfile } from '../../../gateway/activeProfile';
import { ficharCartao } from '../../../lib/adicionarAoDeck';
import { consentiuNuvem } from '../../../lib/consentimentoDeNuvem';
import { perfilDoDispositivo } from '../../../lib/dispositivo/perfil';
import { marcarSalva, useEtiquetador } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { aceitouBaixar, guardarAceite } from '../../../lib/fala/consentimentoDaSombra';
import { useFlag } from '../../../lib/flags';
import { t, tp } from '../../../lib/i18n';
import { useLangConfig } from '../../../lib/langConfig';
import { toBcp47 } from '../../../lib/languages';
import {
  abrirOuvinteLocal,
  definirMoonshineLocal,
  type FalhaDoOuvinte,
  ouvinteDisponivel,
  type OuvinteLocal,
  WEB_SPEECH_LOCAL,
} from '../../../lib/leituraAtiva/ouvinteLocal';
import {
  avisoDoMicrofoneVisto,
  lembrarModo,
  marcarAvisoDoMicrofoneVisto,
  type ModoDeLeitura,
  modoPreferido,
} from '../../../lib/leituraAtiva/preferencias';
import { cancelSpeech, falar } from '../../../lib/tts';
import { buildVocabWord, mtNoteFor } from '../../../lib/vocabWord';
import { haVozPara } from '../../../lib/voz/haVoz';
import type { VocabWord } from '../../../types';
import CartaoDaPalavra from '../leitor/CartaoDaPalavra';
import AvisoDoMicrofone from './AvisoDoMicrofone';
import EscritaDoTexto, { acessoDaEscrita } from './EscritaDoTexto';
import PerguntaDoTexto, { type ResultadoDaPergunta } from './PerguntaDoTexto';
import ResumoDaLeitura, { type FatosDaLeitura } from './ResumoDaLeitura';
import { minutosDoTexto, nomeDaCategoria, rotuloDoNivel, SELO_DE_ORIGEM } from './rotulos';
import TextoComPalavras from './TextoComPalavras';
import { type Conhecimento, IDIOMA_DOS_TEXTOS } from './useConhecimento';

type Fase = 'antes' | 'lendo' | 'perguntas' | 'escrita' | 'resumo';
/** O microfone na voz alta. Começa desligado; só `ouvindo` tem o motor aberto. */
type Microfone = 'desligado' | 'ouvindo' | 'pausado' | 'fora' | FalhaDoOuvinte;

/** Cursor parado com fala ativa por este tempo = "O Frasy se perdeu um pouco". */
const PERDIDO_MS = 4000;
const LANG_DA_FALA = 'en-US';

interface PalavraAberta {
  vocab: VocabWord;
  mtNote: string | null;
  contexto: ContextoDaPalavra;
  forma: string;
  ancora: Retangulo | null;
  porTeclado: boolean;
  pulada: boolean;
  frase: string;
}

/**
 * UM TEXTO DA LEITURA ATIVA, do "antes de ler" ao resumo (ux T2–T6). Os três modos numa tela só: "Ouvir primeiro"
 * (a voz do aparelho lê frase a frase, `narrar`), "Ler em voz alta" (o ouvido local + o alinhador) e "Ler em
 * silêncio". O toque na palavra abre o cartão de sempre (`CartaoDaPalavra`) sem pausar nada.
 */
export default function SessaoDeLeitura(props: {
  ficha: FichaDeTexto;
  conhecimento: Conhecimento;
  protegido: boolean;
  aoVoltar: () => void;
  aoTerminar: (id: string) => void;
}) {
  const { ficha, conhecimento, protegido } = props;
  const langConfig = useLangConfig();
  const gateway = useMemo(() => buildGateway({ profile: getActiveProfile(), cloudConsent: consentiuNuvem }), []);
  const etiquetador = useEtiquetador({ langDaPessoa: langConfig.mine, idiomas: [IDIOMA_DOS_TEXTOS] });

  const [fase, setFase] = useState<Fase>('antes');
  /* VOZ LOCAL (openspec `leitura-ativa-com-moonshine`): sem Web Speech local, e com a flag `leitura_voz_local`, o
     Moonshine ouve no aparelho (só inglês). Com Web Speech local, ele segue sendo o preferido e nada é baixado. */
  const flagVozLocal = useFlag(FLAG_LEITURA_VOZ_LOCAL);
  const perfil = perfilDoDispositivo();
  const escolhaLocal = motorDaSombra({
    webSpeechExiste: false,
    webSpeechPermitido: false,
    idioma: IDIOMA_DOS_TEXTOS,
    aparelhoFraco: perfil.tipo === 'celular-fraco' || perfil.tipo === 'quest',
    economiaDeDados: perfil.sinais.economiaDeDados,
    flag: flagVozLocal,
  });
  const motorMoonshine: MotorDaSombra | null = motorEhLocal(escolhaLocal.motor) ? escolhaLocal.motor : null;
  definirMoonshineLocal(motorMoonshine !== null);
  const webSpeechLocal = useMemo(() => ouvinteDisponivel([WEB_SPEECH_LOCAL]), []);
  const vozAltaPossivel = webSpeechLocal || motorMoonshine !== null;
  const usaMoonshine = !webSpeechLocal && motorMoonshine !== null;
  /* O modelo local: `null` = não pedido; número = % baixado; 'falhou'. */
  const [preparo, setPreparo] = useState<number | 'falhou' | null>(null);
  const usouMoonshine = useRef(false);
  const [modo, setModo] = useState<ModoDeLeitura>(() => {
    const m = modoPreferido();
    return m === 'vozAlta' && !vozAltaPossivel ? 'ouvir' : m;
  });
  const [avisoAberto, setAvisoAberto] = useState(false);
  const [alinhador, setAlinhador] = useState<EstadoDoAlinhador>(() => criarAlinhador(ficha.texto, IDIOMA_DOS_TEXTOS));
  const [narracao, setNarracao] = useState(() => ({ ...NARRACAO_PARADA, total: alinhador.frases.length }));
  const [frasesOuvidas, setFrasesOuvidas] = useState(0);
  const [mic, setMic] = useState<Microfone>('desligado');
  const [perdido, setPerdido] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const [palavra, setPalavra] = useState<PalavraAberta | null>(null);
  const [tocadas, setTocadas] = useState<string[]>([]);
  const [resultados, setResultados] = useState<ResultadoDaPergunta[]>([]);
  const [missaoFeita, setMissaoFeita] = useState(false);
  const inicio = useRef(0);
  const [duracao, setDuracao] = useState(0);
  const ouvinte = useRef<OuvinteLocal | null>(null);
  const ultimaFala = useRef(0);
  const ultimoAvanco = useRef(0);

  const cobertura = useMemo(
    () => coberturaDoTexto(ficha.texto, IDIOMA_DOS_TEXTOS, conhecimento.conhecidas),
    [ficha.texto, conhecimento.conhecidas],
  );
  const rotulo = rotuloDaCobertura({
    porcentagem: cobertura.porcentagem,
    sessoes: conhecimento.sessoes,
    temConta: conhecimento.temConta,
  });
  /* As palavras-alvo que a pessoa ainda não conhece: "Palavras que podem ser novas" e o fim da lista de prática. */
  const alvoDesconhecidas = useMemo(
    () =>
      ficha.palavrasAlvo.filter((a) => !chavesDeLema(a, IDIOMA_DOS_TEXTOS).some((c) => conhecimento.conhecidas.has(c))),
    [ficha.palavrasAlvo, conhecimento.conhecidas],
  );

  /* A tela montada e a fase corrente, para quem responde depois (o fim de uma fala). */
  const montada = useRef(true);
  const faseAtual = useRef<Fase>(fase);
  useEffect(() => {
    faseAtual.current = fase;
  }, [fase]);
  /**
   * O pedido de "Ouvir esta frase" que pode religar o microfone no fim da fala (`null` = nenhum). Qualquer outro
   * gesto (pausar, continuar, terminar, sair, a aba em segundo plano) o esquece: o microfone só liga por toque.
   */
  const religarAoFimDaFala = useRef<number | null>(null);
  const pedidosDeFala = useRef(0);

  /* ── o modelo do Moonshine (baixado só depois do aceite; sem aceite não há requisição ao Hub) ── */
  const prepararMoonshine = async (): Promise<boolean> => {
    if (!motorMoonshine) return true;
    usouMoonshine.current = true;
    setPreparo(0);
    try {
      const m = await import('../../../lib/fala/transcritorDaSombra');
      await m.prepararSombraLocal(motorMoonshine, (f) => montada.current && setPreparo(Math.round(f * 100)));
      if (montada.current) setPreparo(null);
      return true;
    } catch {
      if (montada.current) setPreparo('falhou');
      return false;
    }
  };

  /* ── o ouvido local ── */
  const pararMic = () => {
    religarAoFimDaFala.current = null;
    ouvinte.current?.parar();
    ouvinte.current = null;
  };
  const ligarMic = () => {
    pararMic();
    setPerdido(false);
    ultimoAvanco.current = Date.now();
    ouvinte.current = abrirOuvinteLocal({
      lang: LANG_DA_FALA,
      aoParcial: (texto, final) => {
        ultimaFala.current = Date.now();
        setAlinhador((s) => aplicarParcial(s, texto, { final }));
      },
      aoFalhar: (f) => {
        ouvinte.current = null;
        setMic(f);
      },
    });
    if (ouvinte.current) setMic('ouvindo');
  };
  /* Sair da tela solta o microfone e a voz (e o cancelamento da fala não religa nada). */
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
      religarAoFimDaFala.current = null;
      ouvinte.current?.parar();
      ouvinte.current = null;
      cancelSpeech();
      /* Solta o worker do modelo; a próxima leitura o recria do cache. */
      if (usouMoonshine.current)
        void import('../../../lib/fala/transcritorDaSombra').then((m) => m.liberarSombraLocal());
    };
  }, []);
  /* Aba em segundo plano: o microfone para na hora (e a fala de "Ouvir esta frase" não o religa); só volta com o
     toque em "Continuar". */
  useEffect(() => {
    const f = () => {
      if (document.visibilityState === 'hidden' && (ouvinte.current || religarAoFimDaFala.current !== null)) {
        pararMic();
        setMic('fora');
      }
    };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  /* Fim de frase (o alinhador atravessou uma): solta o áudio dela e anuncia uma vez, só no fim da frase. */
  const concluidas = frasesConcluidas(alinhador);
  const jaConcluidas = useRef(0);
  const cursorAnterior = useRef(alinhador.cursor);
  useEffect(() => {
    if (alinhador.cursor !== cursorAnterior.current) {
      cursorAnterior.current = alinhador.cursor;
      ultimoAvanco.current = Date.now();
      setPerdido(false);
    }
    if (concluidas.length <= jaConcluidas.current) return;
    jaConcluidas.current = concluidas.length;
    const ultima = concluidas[concluidas.length - 1];
    setAnuncio(
      temEstrela(alinhador, ultima)
        ? t('Frase {n} concluída, com estrela.', { n: ultima + 1 })
        : t('Frase {n} concluída.', { n: ultima + 1 }),
    );
    if (alinhador.cursor >= alinhador.palavras.length) {
      pararMic();
      setMic('desligado');
    } else ouvinte.current?.descartar();
  }, [alinhador, concluidas]);

  /* "O Frasy se perdeu um pouco": o cursor parado há 4 s enquanto a pessoa fala. */
  useEffect(() => {
    if (mic !== 'ouvindo') return;
    const id = window.setInterval(() => {
      const agora = Date.now();
      if (agora - ultimoAvanco.current > PERDIDO_MS && agora - ultimaFala.current < 1500) setPerdido(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [mic]);

  /* ── a narração ("Ouvir primeiro"): a voz do aparelho lê a frase da vez e avança no fim dela ── */
  useEffect(() => {
    if (narracao.fase !== 'tocando') return;
    const vez = narracao.vez;
    const frase = alinhador.frases[narracao.indice];
    setFrasesOuvidas((n) => Math.max(n, narracao.indice + 1));
    const falou = falar(frase.texto, IDIOMA_DOS_TEXTOS, {
      onEnd: () => setNarracao((e) => narrar(e, { tipo: 'fimDaFrase', vez })),
      onError: () => setNarracao((e) => narrar(e, { tipo: 'erro', vez })),
    });
    if (!falou) setNarracao((e) => narrar(e, { tipo: 'erro', vez }));
    // A fala nova só quando a narração muda de vez (`vez` muda a cada evento que fala).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narracao.vez]);
  useEffect(() => {
    if (narracao.fase === 'pausada' || narracao.fase === 'parada') cancelSpeech();
  }, [narracao.fase]);

  /* ── começar, terminar ── */
  const comecar = (m: ModoDeLeitura) => {
    lembrarModo(m);
    inicio.current = Date.now();
    setFase('lendo');
    if (m === 'ouvir') setNarracao((e) => narrar(e, { tipo: 'tocar', indice: 0 }));
    if (m === 'vozAlta') ligarMic();
  };
  const aoComecar = () => {
    const faltaAceite = usaMoonshine && motorMoonshine !== null && !aceitouBaixar(motorMoonshine);
    if (modo === 'vozAlta' && (protegido || !avisoDoMicrofoneVisto() || faltaAceite)) setAvisoAberto(true);
    else if (modo === 'vozAlta' && usaMoonshine) void prepararEComecar();
    else comecar(modo);
  };
  /* Aquece o modelo na INTENÇÃO: quem já aceitou o download e escolhe "Ler em voz alta" começa a carregá-lo do cache
     agora, para o "Começar" não esperar. Sem aceite, nada é pedido. */
  const escolherModo = (m: ModoDeLeitura) => {
    setModo(m);
    if (m === 'vozAlta' && usaMoonshine && motorMoonshine !== null && aceitouBaixar(motorMoonshine) && preparo === null)
      void prepararMoonshine();
  };
  const prepararEComecar = async () => {
    if (await prepararMoonshine()) comecar('vozAlta');
  };
  const terminei = () => {
    pararMic();
    setMic('desligado');
    cancelSpeech();
    setNarracao((e) => narrar(e, { tipo: 'parar' }));
    setDuracao(Date.now() - inicio.current);
    setPalavra(null);
    setFase(ficha.perguntas.length ? 'perguntas' : 'escrita');
    if (!ficha.perguntas.length) props.aoTerminar(ficha.id);
  };
  const lerDeNovo = () => {
    setAlinhador(criarAlinhador(ficha.texto, IDIOMA_DOS_TEXTOS));
    jaConcluidas.current = 0;
    setNarracao({ ...NARRACAO_PARADA, total: alinhador.frases.length });
    setFrasesOuvidas(0);
    setTocadas([]);
    setResultados([]);
    setFase('antes');
  };

  /* ── o toque na palavra ── */
  const fraseDaPalavra = (i: number) => alinhador.frases[alinhador.palavras[i].frase]?.texto ?? '';
  const abrirPalavra = (i: number, alvo: HTMLElement, porTeclado: boolean) => {
    if (fase === 'lendo' && modo === 'vozAlta' && perdido) {
      setAlinhador((s) => reposicionar(s, i));
      setPerdido(false);
      ultimoAvanco.current = Date.now();
      return;
    }
    const p = alinhador.palavras[i];
    const limpa = p.texto.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    setTocadas((ts) => (ts.includes(limpa) ? ts : [...ts, limpa]));
    abrirCartao(limpa, fraseDaPalavra(i), alvo, porTeclado, estadoDaPalavra(alinhador, i) === 'pulada');
  };
  const abrirCartao = (texto: string, frase: string, alvo: HTMLElement, porTeclado: boolean, pulada = false) => {
    const contexto: ContextoDaPalavra = { palavra: texto, frase, idioma: IDIOMA_DOS_TEXTOS };
    const forma = formaDeConsulta(contexto);
    const r = alvo.getBoundingClientRect();
    const base: PalavraAberta = {
      vocab: { word: forma, translation: '', example: frase, lang: IDIOMA_DOS_TEXTOS },
      mtNote: null,
      contexto,
      forma,
      ancora: r.width || r.height ? { top: r.top, left: r.left, bottom: r.bottom, right: r.right } : null,
      porTeclado,
      pulada,
      frase,
    };
    setPalavra(base);
    const origem = { word: forma, context: frase, declaredLang: IDIOMA_DOS_TEXTOS, config: langConfig };
    void buildVocabWord(origem, gateway.mt)
      .then(({ vocab, resolved }) =>
        setPalavra((atual) =>
          atual && atual.forma === forma && atual.frase === frase
            ? { ...atual, vocab, mtNote: mtNoteFor(resolved, vocab.translation) }
            : atual,
        ),
      )
      .catch(() => {
        /* sem tradução: o cartão diz por quê */
      });
  };
  const traduzirFrase = async (frase: string): Promise<string | null> => {
    try {
      return (await gateway.mt.translate(frase, IDIOMA_DOS_TEXTOS, langConfig.mine)).text || null;
    } catch {
      return null;
    }
  };

  /* ── o resultado das perguntas vira uma rodada `leituraAtiva` (só com conta): XP de sempre e a missão "Leia 1
     texto". Só o acerto de cada pergunta sai; depois, a missão do dia é relida para o resumo dizer se fechou. ── */
  const gravarRodada = (todos: ResultadoDaPergunta[]) => {
    /* Sem conta, nada sai; rápido demais para ter lido (o teto de palavras por minuto), a missão não conta. */
    if (!conhecimento.temConta || !leituraValeAMissao(alinhador.palavras.length, duracao)) return;
    void salvarRodada(
      rodadaDaLeitura({
        textoId: ficha.id,
        resultados: todos,
        roundId: `leitura-${ficha.id}-${inicio.current || Date.now()}`,
        duracaoMs: Date.now() - (inicio.current || Date.now()),
      }),
    )
      .then((g) => (g.ok ? lerMissoes() : null))
      .then((estado) => {
        const leitura = estado?.missoes.find((m) => m.tipo === 'leitura');
        if (leitura && leitura.atual >= leitura.alvo) setMissaoFeita(true);
      })
      .catch(() => {
        /* best-effort: o resumo segue sem a linha da missão */
      });
  };

  /* ── salvar as palavras para praticar (o caminho de salvar palavra do leitor) ── */
  const salvarPalavras = async (lista: string[]): Promise<number> => {
    let n = 0;
    for (const w of lista) {
      if (conhecimento.noCaderno(chaveAtiva(w, IDIOMA_DOS_TEXTOS))) continue;
      const p = alinhador.palavras.find((x) => mesmoLema(x.texto, w, IDIOMA_DOS_TEXTOS));
      const frase = p ? alinhador.frases[p.frase].texto : '';
      try {
        const { vocab, resolved } = await buildVocabWord(
          { word: w, context: frase, declaredLang: IDIOMA_DOS_TEXTOS, config: langConfig },
          gateway.mt,
        );
        const criados = await ficharCartao({
          word: vocab.word,
          back: vocab.translation || '',
          sentence: frase,
          resolved,
          cloze: frase ? makeCloze(frase, w) : null,
        });
        if (criados.length) {
          marcarSalva(w, IDIOMA_DOS_TEXTOS);
          n++;
        }
      } catch {
        /* uma palavra que falhou não segura as outras */
      }
    }
    return n;
  };

  const vozAlta = modo === 'vozAlta' && fase !== 'antes';
  const estrelas = useMemo(
    () => (vozAlta ? new Set(concluidas.filter((f) => temEstrela(alinhador, f))) : new Set<number>()),
    [vozAlta, concluidas, alinhador],
  );
  const etiqueta = etiquetador ? (w: string) => etiquetador.etiqueta(w, IDIOMA_DOS_TEXTOS) : undefined;
  const texto = (
    <TextoComPalavras
      texto={ficha.texto}
      dividido={alinhador}
      leitura={vozAlta ? (i) => estadoDaPalavra(alinhador, i) : undefined}
      fraseAtual={modo === 'ouvir' && narracao.fase !== 'parada' && fase === 'lendo' ? narracao.indice : null}
      estrelas={estrelas}
      etiqueta={etiqueta}
      aoTocar={abrirPalavra}
    />
  );

  const cartao = palavra && (
    <CartaoDaPalavra
      vocab={palavra.vocab}
      mtNote={palavra.mtNote}
      contexto={palavra.contexto}
      formaDeConsulta={palavra.forma}
      destino={toBcp47(langConfig.mine)}
      ancora={palavra.ancora}
      porTeclado={palavra.porTeclado}
      podeOuvir={haVozPara(IDIOMA_DOS_TEXTOS)}
      aoOuvir={() => falar(palavra.vocab.word, IDIOMA_DOS_TEXTOS)}
      velocidade={1}
      aoMudarVelocidade={() => {}}
      salva={conhecimento.noCaderno(chaveAtiva(palavra.vocab.word, IDIOMA_DOS_TEXTOS))}
      aoSalvar={() =>
        void salvarPalavras([palavra.vocab.word]).then((n) => {
          if (n) setPalavra((p) => (p ? { ...p } : p));
        })
      }
      traduzirFrase={traduzirFrase}
      etiqueta={etiqueta?.(palavra.vocab.word)}
      destaque={
        palavra.pulada ? (
          <p className="la-meta" data-testid="praticar-no-fim">
            ✓ {t('Praticar esta palavra no fim')}
          </p>
        ) : undefined
      }
      aoFechar={() => setPalavra(null)}
    />
  );

  /* ── as fases ── */
  if (fase === 'resumo') {
    const praticar = palavrasParaPraticar({
      puladas: modo === 'vozAlta' ? palavrasPuladas(alinhador) : [],
      tocadas,
      alvoDesconhecidas,
      noCaderno: conhecimento.noCaderno,
      lang: IDIOMA_DOS_TEXTOS,
    });
    const lidas = alinhador.marcas.filter((m) => m === 'lida').length;
    const fatos: FatosDaLeitura = {
      frasesLidas: modo === 'vozAlta' ? concluidas.length : modo === 'ouvir' ? frasesOuvidas : alinhador.frases.length,
      totalDeFrases: alinhador.frases.length,
      ms: duracao,
      estrelas: modo === 'vozAlta' ? estrelas.size : null,
      certas: resultados.filter((r) => r === 'primeira' || r === 'segunda').length,
      totalDePerguntas: ficha.perguntas.length,
      palavrasPorMinuto: modo === 'vozAlta' && !protegido ? palavrasPorMinuto(lidas, duracao) : null,
    };
    return (
      <div className="q-palco la" data-testid="leitura-ativa">
        <ResumoDaLeitura
          titulo={ficha.titulo}
          fatos={fatos}
          palavras={praticar}
          temConta={conhecimento.temConta}
          missaoFeita={missaoFeita}
          aoPraticar={salvarPalavras}
          aoLerOutro={props.aoVoltar}
          aoLerDeNovo={lerDeNovo}
        />
      </div>
    );
  }

  const cabecalho = (
    <header className="q-cab">
      <button type="button" className="q-ctl q-voltar" onClick={props.aoVoltar} aria-label={t('Voltar às leituras')}>
        <ArrowLeft aria-hidden />
      </button>
      <div>
        <p className="q-sobre">
          {nomeDaCategoria(ficha.categoria)} · {rotuloDoNivel(ficha)} · {minutosDoTexto(ficha.texto)}
        </p>
        <h1 lang="en">{ficha.titulo}</h1>
      </div>
    </header>
  );

  if (fase === 'antes') {
    const modos: { id: ModoDeLeitura; icone: ReactNode; nome: string; sobre: string; ok: boolean }[] = [
      {
        id: 'ouvir',
        icone: <Volume2 aria-hidden />,
        nome: t('Ouvir primeiro'),
        sobre: t('O Frasy lê e destaca cada frase.'),
        ok: true,
      },
      {
        id: 'vozAlta',
        icone: <Mic aria-hidden />,
        nome: t('Ler em voz alta'),
        sobre: vozAltaPossivel
          ? usaMoonshine
            ? t('O Frasy acompanha sua voz neste aparelho e acende cada palavra.')
            : t('O Frasy acompanha sua voz e acende cada palavra.')
          : t(
              'Este navegador ainda não consegue ouvir você sem mandar a voz para fora. Use o Chrome ou o Edge no computador.',
            ),
        ok: vozAltaPossivel,
      },
      {
        id: 'silencio',
        icone: <BookOpen aria-hidden />,
        nome: t('Ler em silêncio'),
        sobre: t('Só você e o texto.'),
        ok: true,
      },
    ];
    return (
      <div className="q-palco la" data-testid="leitura-ativa">
        {cabecalho}
        <div className="la-coluna">
          {rotulo && (
            <p className="la-cobertura">
              {t('Você já sabe {n}% deste texto', { n: rotulo.porcentagem })}
              {cobertura.desconhecidas.length > 0 &&
                ` · ${tp(cobertura.desconhecidas.length, 'cerca de {n} palavra nova', 'cerca de {n} palavras novas')}`}
            </p>
          )}
          {alvoDesconhecidas.length > 0 && (
            <section className="q-secao" aria-labelledby="la-novas">
              <header>
                <h2 id="la-novas">{t('Palavras que podem ser novas')}</h2>
              </header>
              <ul className="la-novas">
                {alvoDesconhecidas.slice(0, 5).map((w) => {
                  const p = alinhador.palavras.find((x) => mesmoLema(x.texto, w, IDIOMA_DOS_TEXTOS));
                  return (
                    <li key={w}>
                      <button
                        type="button"
                        className="q-chip"
                        lang="en"
                        onClick={(e) =>
                          abrirCartao(w, p ? alinhador.frases[p.frase].texto : '', e.currentTarget, e.detail === 0)
                        }
                      >
                        {w}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <div className="la-modos" role="radiogroup" aria-label={t('Como você quer ler?')}>
            {modos.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                className="la-modo"
                aria-checked={modo === m.id}
                aria-disabled={!m.ok || undefined}
                data-modo={m.id}
                onClick={() => m.ok && escolherModo(m.id)}
              >
                <strong>
                  {m.icone} {m.nome}
                </strong>
                <span>{m.sobre}</span>
              </button>
            ))}
          </div>
          <div className="q-acoes">
            <button type="button" className="q-ctl pri" onClick={aoComecar}>
              {t('Começar')}
            </button>
          </div>
          <p className="la-credito">
            {SELO_DE_ORIGEM()} · {creditoDoTexto(ficha)}
          </p>
        </div>
        {cartao}
        {avisoAberto && (
          <AvisoDoMicrofone
            protegido={protegido}
            downloadMb={
              usaMoonshine && motorMoonshine !== null
                ? MB_DO_MOTOR_LOCAL[motorMoonshine as keyof typeof MB_DO_MOTOR_LOCAL]
                : undefined
            }
            aoLigar={() => {
              setAvisoAberto(false);
              if (!protegido) marcarAvisoDoMicrofoneVisto();
              if (usaMoonshine && motorMoonshine !== null) {
                guardarAceite(motorMoonshine);
                void prepararEComecar();
              } else comecar('vozAlta');
            }}
            aoRecusar={() => setAvisoAberto(false)}
          />
        )}
        {preparo !== null && (
          <p className="la-credito" role="status" data-testid="preparo-do-moonshine">
            {preparo === 'falhou'
              ? t('Não deu para baixar o modelo agora. Tente de novo ou leia em silêncio.')
              : t('Baixando o ajudante que ouve você: {n}%', { n: preparo })}
          </p>
        )}
      </div>
    );
  }

  if (fase === 'escrita') {
    return (
      <div className="q-palco la" data-testid="leitura-ativa">
        {cabecalho}
        <div className="la-coluna">
          <EscritaDoTexto
            ficha={ficha}
            acesso={acessoDaEscrita(protegido)}
            protegido={protegido}
            aoTerminar={() => setFase('resumo')}
          />
        </div>
      </div>
    );
  }

  if (fase === 'perguntas') {
    const i = resultados.length;
    return (
      <div className="q-palco la" data-testid="leitura-ativa">
        {cabecalho}
        <div className="la-coluna">
          {texto}
          <PerguntaDoTexto
            key={i}
            pergunta={ficha.perguntas[i]}
            numero={i + 1}
            total={ficha.perguntas.length}
            bilingue={ficha.nivel === 'A1'}
            aoTerminar={(r) => {
              const todos = [...resultados, r];
              setResultados(todos);
              if (todos.length >= ficha.perguntas.length) {
                props.aoTerminar(ficha.id);
                gravarRodada(todos);
                setFase('escrita');
              }
            }}
          />
        </div>
        {cartao}
      </div>
    );
  }

  /* fase === 'lendo' */
  const total = alinhador.frases.length;
  const fraseNoCursor = Math.min(
    total - 1,
    alinhador.palavras[Math.min(alinhador.cursor, alinhador.palavras.length - 1)]?.frase ?? 0,
  );
  /* A pausa para ouvir faz parte do toque em "Ouvir esta frase": o microfone volta só no FIM da fala, e só se nada
     mudou (a mesma fala, a tela aberta, ainda lendo, a aba visível). Erro ou cancelamento deixa o "Continuar". */
  const ouvirEstaFrase = () => {
    pararMic();
    setMic('pausado');
    const pedido = ++pedidosDeFala.current;
    religarAoFimDaFala.current = pedido;
    const aindaVale = () =>
      religarAoFimDaFala.current === pedido &&
      montada.current &&
      faseAtual.current === 'lendo' &&
      document.visibilityState === 'visible';
    const falou = falar(alinhador.frases[fraseNoCursor].texto, IDIOMA_DOS_TEXTOS, {
      onEnd: () => {
        if (aindaVale()) ligarMic();
      },
      onError: () => {
        if (religarAoFimDaFala.current === pedido) religarAoFimDaFala.current = null;
      },
    });
    if (!falou) religarAoFimDaFala.current = null;
  };
  return (
    <div className="q-palco la" data-testid="leitura-ativa">
      {cabecalho}
      <div className="la-coluna">
        {modo === 'vozAlta' && concluidas.length === 0 && mic === 'ouvindo' && (
          <p className="la-aviso">{t('Leia no seu ritmo. As palavras acendem quando o Frasy ouve você.')}</p>
        )}
        {perdido && (
          <p className="la-aviso" role="status" data-testid="frasy-se-perdeu">
            {t('O Frasy se perdeu um pouco. Toque na palavra onde você está.')}
          </p>
        )}
        {texto}
        {modo === 'vozAlta' && (
          <p className="la-legenda" aria-hidden>
            <span>▔ {t('lida')}</span>
            <span>▓ {t('atual')}</span>
            <span>┄ {t('não ouvi bem')}</span>
          </p>
        )}
        <p className="sr-only" aria-live="polite" role="status">
          {anuncio}
        </p>
        <div className="la-barra" data-testid="leitura-ativa-barra">
          {modo === 'vozAlta' && <BarraDaVoz mic={mic} protegido={protegido} />}
          {modo === 'vozAlta' && mic === 'ouvindo' && (
            <>
              <button
                type="button"
                className="q-ctl"
                onClick={() => {
                  pararMic();
                  setMic('pausado');
                }}
              >
                {t('Pausar')}
              </button>
              <button type="button" className="q-ctl" onClick={ouvirEstaFrase}>
                <Volume2 aria-hidden /> {t('Ouvir esta frase')}
              </button>
            </>
          )}
          {modo === 'vozAlta' && (mic === 'pausado' || mic === 'fora') && (
            <button type="button" className="q-ctl pri" onClick={ligarMic}>
              {t('Continuar')}
            </button>
          )}
          {modo === 'vozAlta' && mic !== 'ouvindo' && mic !== 'pausado' && mic !== 'fora' && mic !== 'desligado' && (
            <>
              <button type="button" className="q-ctl pri" onClick={ligarMic}>
                {t('Ligar de novo')}
              </button>
              <button
                type="button"
                className="q-ctl"
                onClick={() => {
                  setModo('silencio');
                  setMic('desligado');
                }}
              >
                {t('Seguir em silêncio')}
              </button>
            </>
          )}
          {modo === 'ouvir' && (
            <>
              <span className="la-estado">
                {t('Frase {n} de {total}', { n: Math.min(narracao.indice + 1, total), total })}
              </span>
              <button
                type="button"
                className="q-ctl"
                onClick={() => setNarracao((e) => narrar(e, { tipo: 'anterior' }))}
              >
                {t('Anterior')}
              </button>
              <button
                type="button"
                className="q-ctl"
                onClick={() =>
                  setNarracao((e) =>
                    e.fase === 'virando'
                      ? narrar({ ...e, fase: 'parada' }, { tipo: 'tocar', indice: 0 })
                      : narrar(e, { tipo: 'alternar' }),
                  )
                }
              >
                {narracao.fase === 'tocando' ? t('Pausar') : t('Tocar')}
              </button>
            </>
          )}
          {modo === 'silencio' && <span className="la-estado">{t('{n} frases', { n: total })}</span>}
          <button type="button" className="q-ctl pri" onClick={terminei} data-testid="terminei">
            {t('Terminei')}
          </button>
        </div>
      </div>
      {cartao}
    </div>
  );
}

/** O estado do microfone em palavras (o ponto é sempre visível enquanto ele ouve; maior no perfil protegido). */
function BarraDaVoz({ mic, protegido }: { mic: Microfone; protegido: boolean }) {
  const texto: Record<Microfone, string> = {
    ouvindo: t('Ouvindo · sua voz fica neste aparelho'),
    pausado: t('Microfone pausado'),
    fora: t('Pausamos enquanto você estava fora.'),
    desligado: t('Microfone desligado'),
    parou: t('O microfone parou.'),
    'sem-motor-local': t('O microfone parou.'),
    negado: t('O microfone está bloqueado para o Frasy. Libere nas permissões do navegador ou leia em silêncio.'),
    'sem-microfone': t('Não achamos um microfone. Conecte um fone com microfone ou leia em silêncio.'),
  };
  return (
    <span className="la-estado" role="status" data-testid="estado-do-microfone" data-mic={mic}>
      {mic === 'ouvindo' && <span className={`la-ponto${protegido ? ' grande' : ''}`} aria-hidden />}
      {texto[mic]}
    </span>
  );
}
