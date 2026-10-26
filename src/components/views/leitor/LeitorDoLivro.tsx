import { makeCloze } from '@core';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Highlighter, ListTree, Type, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type AnotacaoDeLeitura,
  citacaoDe,
  type CorDeAnotacao,
  novaAnotacao,
  type TipoDeAnotacao,
} from '../../../core/leitura/anotacao';
import { diagnosticarPdf } from '../../../core/leitura/diagnosticoDoPdf';
import {
  colecaoW3C,
  nomeDeArquivo,
  paraCsvDePlanilha,
  paraMarkdown,
  paraTextoDoAnki,
} from '../../../core/leitura/exportar';
import { CORES_DOS_TEMAS } from '../../../core/leitura/perfilDeLeitura';
import { criarArmazemDePosicoes } from '../../../core/leitura/posicao';
import { ancorar } from '../../../core/leitura/reancorar';
import { fetchDeck } from '../../../data/api';
import { buildGateway } from '../../../gateway';
import { getActiveProfile } from '../../../gateway/activeProfile';
import { ficharCartao } from '../../../lib/adicionarAoDeck';
import { consentiuNuvem } from '../../../lib/consentimentoDeNuvem';
import { baixar, baixarTexto } from '../../../lib/exportacao/baixar';
import { t } from '../../../lib/i18n';
import { useLangConfig } from '../../../lib/langConfig';
import { baseLang, toBcp47 } from '../../../lib/languages';
import type { Localizacao } from '../../../lib/leitor/foliate/view.js';
import { type InfoDoLivro, MotorDoLeitor } from '../../../lib/leitor/motor';
import {
  citacaoDoRange,
  fraseDoRange,
  ouvintesDoDocumentoFuncionam,
  palavraNoPonto,
  selecaoDoDocumento,
  vigiarSelecao,
} from '../../../lib/leitor/selecao';
import { lerAnotacoes } from '../../../lib/leitura/anotacaoDaFrase';
import { anotacoesDoLivro, type EstadoDaSincronizacao } from '../../../lib/livros/anotacoesDoLivro';
import type { LivroGuardado } from '../../../lib/livros/armazem';
import { livroParaOMotor } from '../../../lib/livros/fontesDoLivro';
import { speak } from '../../../lib/tts';
import { buildVocabWord, mtNoteFor, resolveWord } from '../../../lib/vocabWord';
import { haVozPara } from '../../../lib/voz/haVoz';
import type { VocabWord } from '../../../types';
import { toast } from '../../Toast';
import VocabularyPanel from '../../VocabularyPanel';
import BarraDaSelecao, { type TrechoSelecionado } from './BarraDaSelecao';
import { etiquetaDaPalavra, HistoricoNaFolha } from './ganchosDaPalavra';
import PainelDeAnotacoes, { type FormatoDeExportacao } from './PainelDeAnotacoes';
import PainelDeTipografia from './PainelDeTipografia';
import PainelDoSumario from './PainelDoSumario';
import { usePerfilDeLeitura } from './usePerfilDeLeitura';

type Painel = 'sumario' | 'tipografia' | 'anotacoes';

interface Selecao {
  trecho: TrechoSelecionado;
  cfi: string;
  citacao: AnotacaoDeLeitura['alvo']['citacao'];
  capitulo: string;
}

interface PalavraAberta {
  vocab: VocabWord;
  mtNote: string | null;
  frase: string;
  idioma: string;
  cfi: string;
  citacao: AnotacaoDeLeitura['alvo']['citacao'];
  capitulo: string;
}

const posicoes = criarArmazemDePosicoes({
  ler: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  gravar: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sem armazenamento: a posição vale só nesta abertura */
    }
  },
  apagar: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* idem */
    }
  },
});

const novoId = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(
    /[^A-Za-z0-9_-]/g,
    '',
  );

const ehCampo = (alvo: EventTarget | null) =>
  alvo instanceof Element && !!alvo.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

/** O id que o deck recebe como origem (`origin_kind = 'livro'`); acima de 64 caracteres o servidor não aceita. */
const origemNoDeck = (livroId: string) => (`livro:${livroId}`.length <= 64 ? `livro:${livroId}` : undefined);

/**
 * O LEITOR DE UM LIVRO (L2): o motor (foliate-js/PDF.js), a barra de cima (voltar, sumário e busca,
 * aparência, anotações), o pé (página anterior/seguinte, progresso), a barra do trecho selecionado e a
 * folha da palavra. Posição por CFI a cada virada; anotações no aparelho e, com conta, na nuvem.
 */
export default function LeitorDoLivro({
  livroId,
  aoVoltar,
  aoConhecerPlanos,
}: {
  livroId: string;
  aoVoltar: () => void;
  aoConhecerPlanos?: () => void;
}) {
  const hospedeiro = useRef<HTMLDivElement>(null);
  const motorRef = useRef<MotorDoLeitor | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'sem-livro' | 'erro'>('carregando');
  const [info, setInfo] = useState<InfoDoLivro | null>(null);
  const [guardado, setGuardado] = useState<LivroGuardado | null>(null);
  const [idioma, setIdioma] = useState('');
  const [local, setLocal] = useState<Localizacao | null>(null);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [perfil, mudarPerfil, restaurarPerfil] = usePerfilDeLeitura();
  const [anotacoes, setAnotacoes] = useState<AnotacaoDeLeitura[]>([]);
  const [naoLocalizadas, setNaoLocalizadas] = useState<Set<string>>(new Set());
  const [sinc, setSinc] = useState<EstadoDaSincronizacao | 'carregando'>('carregando');
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [palavra, setPalavra] = useState<PalavraAberta | null>(null);
  const [noDeck, setNoDeck] = useState<Set<string>>(new Set());
  const [avisoPdf, setAvisoPdf] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [ttsSpeed, setTtsSpeed] = useState(1);
  const langConfig = useLangConfig();
  const gateway = useMemo(() => buildGateway({ profile: getActiveProfile(), cloudConsent: consentiuNuvem }), []);
  const repo = useMemo(() => anotacoesDoLivro(livroId), [livroId]);
  const idiomaRef = useRef('');
  idiomaRef.current = idioma || baseLang(langConfig.studying);
  const toqueEmAnotacao = useRef(0);
  const capituloRef = useRef('');
  capituloRef.current = local?.tocItem?.label?.trim() ?? '';

  /* ── anotações: ancorar (CFI → citação → "não localizada") e desenhar ── */
  const ancorarEDesenhar = useCallback(
    async (lista: AnotacaoDeLeitura[]) => {
      const motor = motorRef.current;
      if (!motor) return;
      let textos: string[] | null = null;
      const perdidas = new Set<string>();
      const reancoradas: AnotacaoDeLeitura[] = [];
      for (const a of lista) {
        const atual = a.alvo.cfi ? await motor.textoDoCfi(a.alvo.cfi) : null;
        const r = ancorar(a, () => atual, textos ?? []);
        if (r.como === 'cfi') continue;
        textos ??= await motor.textosDasSecoes();
        const r2 = ancorar(a, () => atual, textos);
        if (r2.como === 'citacao') {
          const cfi = await motor.cfiDoTrecho(r2.secao, r2.trecho.inicio, r2.trecho.fim);
          if (cfi) {
            reancoradas.push({ ...a, alvo: { ...a.alvo, cfi } });
            continue;
          }
        }
        if (r2.como !== 'cfi') perdidas.add(a.id);
      }
      for (const a of reancoradas) await repo.reancorar(a.id, a.alvo.cfi);
      const finais = lista.map((a) => reancoradas.find((r) => r.id === a.id) ?? a);
      setNaoLocalizadas(perdidas);
      setAnotacoes(finais);
      await motor.desenharAnotacoes(
        finais.filter((a) => !perdidas.has(a.id)).map((a) => ({ cfi: a.alvo.cfi, tipo: a.tipo, cor: a.cor })),
      );
    },
    [repo],
  );

  const recarregarAnotacoes = useCallback(async () => {
    await ancorarEDesenhar(await repo.vivas());
  }, [ancorarEDesenhar, repo]);

  const sincronizar = useCallback(async () => {
    const r = await repo.sincronizar().catch(() => ({ estado: 'erro' as const, recusadas: 0 }));
    setSinc(r.estado);
    if (r.recusadas) toast.warn(t('Algumas anotações passaram do limite e ficaram só neste aparelho.'));
    await recarregarAnotacoes();
  }, [repo, recarregarAnotacoes]);

  /* ── abrir o livro ── */
  useEffect(() => {
    let cancelado = false;
    const el = hospedeiro.current;
    if (!el) return;
    setEstado('carregando');
    (async () => {
      const fonte = await livroParaOMotor(livroId, t('Parte')).catch(() => null);
      if (cancelado) return;
      if (!fonte) {
        setEstado('sem-livro');
        return;
      }
      setGuardado(fonte.guardado);
      try {
        const { motor, info } = await MotorDoLeitor.abrir(el, fonte.entrada, {
          aoMudarDePosicao: (l) => {
            setLocal(l);
            posicoes.gravar({
              livroId,
              cfi: l.cfi,
              secao: l.section?.current ?? 0,
              fracao: l.fraction ?? 0,
              capitulo: l.tocItem?.label?.trim() || undefined,
              atualizadaEm: Date.now(),
            });
          },
          aoCarregarSecao: (doc, indice) => ligarDocumento(doc, indice),
          aoTocarAnotacao: () => {
            toqueEmAnotacao.current = Date.now();
            setPainel('anotacoes');
          },
        });
        if (cancelado) {
          motor.fechar();
          return;
        }
        motorRef.current = motor;
        setInfo(info);
        setIdioma(baseLang(fonte.idioma || info.idioma || ''));
        motor.aplicarPerfil(perfil);
        await motor.comecar(posicoes.ler(livroId));
        /* As fontes do perfil chegam DEPOIS do texto (o capítulo é um documento à parte): o livro só aparece
           com elas, senão o paginador repagina na frente da pessoa (e o Lighthouse mede o salto). Teto de 1,5 s. */
        await Promise.race([
          Promise.all(motor.documentos().map(({ doc }) => doc.fonts?.ready)),
          new Promise((ok) => window.setTimeout(ok, 1500)),
        ]);
        if (cancelado) return;
        setEstado('pronto');
        if (info.ehPdf) {
          const amostra = await motor.livro.amostraDeTexto?.().catch(() => null);
          const d = amostra ? diagnosticarPdf(amostra) : null;
          if (d?.escaneado)
            setAvisoPdf(t('Este PDF parece escaneado (imagem sem texto): não dá para tocar nas palavras nem grifar.'));
          else if (d?.duasColunas)
            setAvisoPdf(t('Este PDF tem duas colunas: a ordem do texto ao selecionar pode sair trocada.'));
        }
        if (fonte.falas) await migrarAnotacoesDaLeitura(fonte.falas);
        await recarregarAnotacoes();
        void sincronizar();
      } catch (err) {
        console.error(err);
        if (!cancelado) setEstado('erro');
      }
    })();
    return () => {
      cancelado = true;
      const m = motorRef.current;
      const l = m?.posicao;
      if (l)
        posicoes.gravar({
          livroId,
          cfi: l.cfi,
          secao: l.section?.current ?? 0,
          fracao: l.fraction ?? 0,
          capitulo: l.tocItem?.label?.trim() || undefined,
          atualizadaEm: Date.now(),
        });
      m?.fechar();
      motorRef.current = null;
    };
    // O livro abre uma vez por id; o perfil é aplicado no efeito de baixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livroId]);

  useEffect(() => {
    if (estado === 'pronto') motorRef.current?.aplicarPerfil(perfil);
  }, [perfil, estado]);

  useEffect(() => {
    fetchDeck()
      .then((d) => setNoDeck(new Set(d.map((c) => c.word.toLowerCase()))))
      .catch(() => {});
  }, []);

  /* A posição falada para o leitor de tela (uma vez por parada, não a cada pixel de rolagem). */
  useEffect(() => {
    if (!local) return;
    const id = window.setTimeout(() => {
      const pct = Number.isFinite(local.fraction) ? Math.round(local.fraction * 100) : 0;
      const cap = local.tocItem?.label?.trim();
      setAnuncio(cap ? t('{cap}, {pct}% do livro', { cap, pct }) : t('{pct}% do livro', { pct }));
    }, 600);
    return () => window.clearTimeout(id);
  }, [local]);

  /* ── a Leitura antiga: as anotações por frase (no localStorage) migram uma vez, reancoradas pela citação ── */
  async function migrarAnotacoesDaLeitura(falas: string[]) {
    const sessionId = livroId.replace(/^sessao:/, '');
    const marca = `leitor:migrou:${sessionId}`;
    try {
      if (localStorage.getItem(marca)) return;
      const antigas = lerAnotacoes(localStorage.getItem(`readingAnnotations:${sessionId}`));
      const agora = Date.now();
      for (const a of antigas) {
        const frase = falas[a.textIndex];
        if (!frase) continue;
        const tipo: TipoDeAnotacao = a.content || a.type === 'note' ? 'nota' : 'grifo';
        await repo.gravar(
          novaAnotacao({
            id: novoId(),
            livroId,
            tipo,
            cfi: '',
            citacao: citacaoDe(frase, 0, frase.length),
            nota: a.content ?? '',
            agora: a.createdAt || agora,
          }),
        );
      }
      localStorage.setItem(marca, '1');
    } catch {
      /* sem armazenamento: nada a migrar */
    }
  }

  /* ── o documento de cada seção: teclado, seleção e toque na palavra ── */
  function ligarDocumento(doc: Document, indice: number) {
    /* WEBKIT (Safari): o iframe sem `allow-scripts` não entrega eventos nem ao app (bug 218086). A seleção e o
       toque são lidos de fora, pela seleção do documento (`vigiarSelecao`). */
    if (!ouvintesDoDocumentoFuncionam(doc)) {
      vigiarSelecao(
        doc,
        {
          aoSelecionar: (r) => {
            const motor = motorRef.current;
            if (!motor) return;
            setPalavra(null);
            setSelecao({
              trecho: {
                texto: r.toString().trim(),
                frase: fraseDoRange(r, idiomaRef.current),
                idioma: idiomaRef.current,
              },
              cfi: motor.cfiDe(indice, r),
              citacao: citacaoDoRange(r),
              capitulo: capituloRef.current,
            });
          },
          aoTocar: (r) => {
            const palavra = r.toString();
            if (!/\p{L}/u.test(palavra) || palavra.length < 2) return;
            void abrirPalavra(palavra, r, indice);
          },
        },
        () => !!document.activeElement && !!hospedeiro.current?.contains(document.activeElement),
      );
      return;
    }
    doc.addEventListener('keydown', aoTeclar);
    const conferirSelecao = () =>
      window.setTimeout(() => {
        const r = selecaoDoDocumento(doc);
        const motor = motorRef.current;
        if (!r || !motor) return;
        setPalavra(null);
        setSelecao({
          trecho: { texto: r.toString().trim(), frase: fraseDoRange(r, idiomaRef.current), idioma: idiomaRef.current },
          cfi: motor.cfiDe(indice, r),
          citacao: citacaoDoRange(r),
          capitulo: capituloRef.current,
        });
      }, 0);
    doc.addEventListener('pointerup', conferirSelecao);
    doc.addEventListener('keyup', (e) => {
      if (e.shiftKey) conferirSelecao();
    });
    doc.addEventListener('click', (e) => {
      if (selecaoDoDocumento(doc)) return;
      if ((e.target as Element | null)?.closest?.('a[href]')) return;
      const { clientX, clientY } = e;
      window.setTimeout(() => {
        if (Date.now() - toqueEmAnotacao.current < 300) return;
        const p = palavraNoPonto(doc, clientX, clientY, idiomaRef.current);
        const motor = motorRef.current;
        if (!p || !motor || !/\p{L}/u.test(p.palavra) || p.palavra.length < 2) return;
        void abrirPalavra(p.palavra, p.range, indice);
      }, 0);
    });
  }

  async function abrirPalavra(texto: string, range: Range, indice: number) {
    const motor = motorRef.current;
    if (!motor) return;
    const frase = fraseDoRange(range, idiomaRef.current);
    const base: PalavraAberta = {
      vocab: { word: texto, translation: '', example: frase, lang: idiomaRef.current || undefined },
      mtNote: null,
      frase,
      idioma: idiomaRef.current,
      cfi: motor.cfiDe(indice, range),
      citacao: citacaoDoRange(range),
      capitulo: capituloRef.current,
    };
    setSelecao(null);
    setPalavra(base);
    const { vocab, resolved } = await buildVocabWord(
      { word: texto, context: frase, declaredLang: idiomaRef.current || undefined, config: langConfig },
      gateway.mt,
    );
    setPalavra((atual) =>
      atual && atual.cfi === base.cfi ? { ...atual, vocab, mtNote: mtNoteFor(resolved, vocab.translation) } : atual,
    );
  }

  /* ── teclado (ACE07): ← → PageUp PageDown viram a página; "/" abre a busca; Esc fecha ── */
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || ehCampo(e.target)) return;
    if (document.querySelector('dialog[open]')) return;
    const m = motorRef.current;
    if (!m) return;
    if (e.key === 'ArrowLeft') void m.esquerda();
    else if (e.key === 'ArrowRight') void m.direita();
    else if (e.key === 'PageDown') void m.proxima();
    else if (e.key === 'PageUp') void m.anterior();
    else if (e.key === '/') setPainel('sumario');
    else if (e.key === 'Escape') {
      setPainel(null);
      setSelecao(null);
      return;
    } else return;
    e.preventDefault();
  };
  const teclarRef = useRef(aoTeclar);
  teclarRef.current = aoTeclar;
  useEffect(() => {
    const f = (e: KeyboardEvent) => teclarRef.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  /* ── criar, editar e apagar anotações ── */
  const criar = async (
    tipo: TipoDeAnotacao,
    extra: { cor?: CorDeAnotacao; nota?: string; palavra?: string },
    alvo: Selecao | PalavraAberta,
  ) => {
    /* A seleção sai JÁ (e não depois de gravar): a pessoa pode estar selecionando o próximo trecho. */
    motorRef.current?.desmarcar();
    const a = novaAnotacao({
      id: novoId(),
      livroId,
      tipo,
      cfi: alvo.cfi,
      citacao: alvo.citacao,
      capitulo: alvo.capitulo || undefined,
      ...extra,
      agora: Date.now(),
    });
    await repo.gravar(a);
    await recarregarAnotacoes();
    setAnuncio(tipo === 'nota' ? t('Nota salva.') : tipo === 'palavra' ? t('Palavra salva.') : t('Trecho grifado.'));
    void sincronizar();
  };

  const editarNota = async (a: AnotacaoDeLeitura, nota: string) => {
    await repo.gravar({ ...a, nota, tipo: a.tipo === 'grifo' && nota ? 'nota' : a.tipo, atualizadoEm: Date.now() });
    await recarregarAnotacoes();
    void sincronizar();
  };

  const apagar = async (a: AnotacaoDeLeitura) => {
    await repo.apagar(a.id);
    await recarregarAnotacoes();
    setAnuncio(t('Anotação apagada.'));
    void sincronizar();
  };

  const salvarNoDeck = async (w: VocabWord) => {
    if (!palavra) return;
    const origem = {
      word: w.word,
      context: palavra.frase,
      declaredLang: palavra.idioma || undefined,
      config: langConfig,
    };
    const resolved = await resolveWord(origem);
    const criados = await ficharCartao({
      word: w.word,
      back: w.translation || '',
      sentence: palavra.frase,
      resolved,
      cloze: palavra.frase ? makeCloze(palavra.frase, w.word) : null,
      sessionId: origemNoDeck(livroId),
    });
    if (criados.length) {
      setNoDeck((s) => new Set([...s, w.word.toLowerCase()]));
      toast.ok(t('"{palavra}" foi para o deck, com a frase do livro.', { palavra: w.word }));
      await criar('palavra', { palavra: w.word, nota: w.translation || '' }, palavra);
    }
  };

  const traduzir = async (texto: string): Promise<string | null> => {
    const de = idiomaRef.current;
    const para = baseLang(langConfig.mine);
    if (!de || de === para) return texto;
    try {
      return (await gateway.mt.translate(texto, de, para)).text || null;
    } catch {
      return null;
    }
  };

  /* ── exportações (todas no navegador) ── */
  const livroDaExportacao = () => ({
    id: livroId,
    titulo: info?.titulo || guardado?.titulo || t('Livro'),
    autor: info?.autor || guardado?.autor,
    fonte: guardado?.credito,
  });
  const dominioPublico = !!guardado?.dominioPublico && guardado.origem === 'catalogo';
  const exportar = async (f: FormatoDeExportacao) => {
    const livro = livroDaExportacao();
    const todas = await repo.vivas();
    if (f === 'markdown') {
      baixarTexto(
        paraMarkdown(livro, todas, {
          agora: Date.now(),
          rotulos: {
            semCapitulo: t('Sem capítulo'),
            nota: t('Nota'),
            palavra: t('Palavra'),
            abrirNoFrasy: t('abrir no Frasy'),
            exportadoEm: (d) => t('Exportado em {data}', { data: d }),
          },
        }),
        nomeDeArquivo(livro.titulo, 'md'),
        'text/markdown',
      );
    } else if (f === 'json') {
      baixarTexto(
        JSON.stringify(colecaoW3C(livro, todas), null, 2),
        nomeDeArquivo(livro.titulo, 'jsonld'),
        'application/ld+json',
      );
    } else if (f === 'anki') {
      baixarTexto(paraTextoDoAnki(livro, todas), nomeDeArquivo(`${livro.titulo}-anki`, 'txt'), 'text/plain');
    } else if (f === 'planilha') {
      baixarTexto(paraCsvDePlanilha(livro, todas), nomeDeArquivo(livro.titulo, 'csv'), 'text/csv');
    } else if (f === 'texto' && dominioPublico && motorRef.current) {
      const textos = await motorRef.current.textosDasSecoes();
      const credito = guardado?.credito ? `\n\n${guardado.credito}\n` : '';
      baixarTexto(
        `${livro.titulo}\n\n${textos
          .map((x) => x.trim())
          .filter(Boolean)
          .join('\n\n')}${credito}`,
        nomeDeArquivo(livro.titulo, 'txt'),
        'text/plain',
      );
    } else if (f === 'epub' && dominioPublico && guardado?.formato === 'epub') {
      baixar(guardado.arquivo, nomeDeArquivo(livro.titulo, 'epub'));
    }
  };

  /* ── desenho ── */
  const cores = CORES_DOS_TEMAS[perfil.tema];
  const estilo = {
    '--leitor-fundo': cores.fundo,
    '--leitor-texto': cores.texto,
    '--leitor-suave': cores.suave,
    '--leitor-link': cores.link,
  } as CSSProperties;
  const pct = Number.isFinite(local?.fraction) ? Math.round((local!.fraction ?? 0) * 100) : 0;
  const titulo = info?.titulo || guardado?.titulo || '';
  const abrirPainel = (p: Painel) => setPainel((atual) => (atual === p ? null : p));
  const TITULO_DO_PAINEL: Record<Painel, string> = {
    sumario: t('Sumário e busca'),
    tipografia: t('Aparência'),
    anotacoes: t('Anotações'),
  };

  return (
    <div
      className="leitor"
      data-tema={perfil.tema}
      data-esquema={cores.esquema}
      data-modo={perfil.modo}
      style={estilo}
      data-testid="leitor"
      data-estado={estado}
    >
      <header className="leitor-topo">
        <button type="button" className="leitor-botao" onClick={aoVoltar}>
          <ArrowLeft aria-hidden />
          <span>{t('Estante')}</span>
        </button>
        <h1 className="leitor-titulo" title={titulo}>
          {titulo}
        </h1>
        <nav className="leitor-ferramentas" aria-label={t('Ferramentas do leitor')}>
          <button
            type="button"
            className="leitor-botao"
            aria-expanded={painel === 'sumario'}
            aria-controls={painel === 'sumario' ? 'leitor-painel' : undefined}
            onClick={() => abrirPainel('sumario')}
          >
            <ListTree aria-hidden />
            <span>{t('Sumário')}</span>
          </button>
          <button
            type="button"
            className="leitor-botao"
            aria-expanded={painel === 'tipografia'}
            aria-controls={painel === 'tipografia' ? 'leitor-painel' : undefined}
            onClick={() => abrirPainel('tipografia')}
          >
            <Type aria-hidden />
            <span>{t('Aparência')}</span>
          </button>
          <button
            type="button"
            className="leitor-botao"
            aria-expanded={painel === 'anotacoes'}
            aria-controls={painel === 'anotacoes' ? 'leitor-painel' : undefined}
            onClick={() => abrirPainel('anotacoes')}
          >
            <Highlighter aria-hidden />
            <span>
              {t('Anotações')}
              {anotacoes.length ? <span className="leitor-contagem"> {anotacoes.length}</span> : null}
            </span>
          </button>
        </nav>
      </header>

      {avisoPdf && (
        <p className="leitor-aviso" role="note">
          {avisoPdf}
        </p>
      )}

      <div className="leitor-miolo">
        <section className="leitor-pagina" aria-label={t('Texto do livro')} aria-busy={estado === 'carregando'}>
          <div ref={hospedeiro} className="leitor-motor" />
          {estado === 'carregando' && (
            <p className="leitor-estado" role="status">
              <BookOpen aria-hidden /> {t('Abrindo o livro…')}
            </p>
          )}
          {estado === 'sem-livro' && (
            <div className="leitor-estado" role="alert">
              <p>{t('Este livro não está neste aparelho. Abra o arquivo de novo pela estante.')}</p>
              <button type="button" className="btn btn-solid leitor-alvo" onClick={aoVoltar}>
                {t('Ir para a estante')}
              </button>
            </div>
          )}
          {estado === 'erro' && (
            <div className="leitor-estado" role="alert">
              <p>{t('Não deu para abrir este livro. O arquivo pode estar corrompido ou protegido (DRM).')}</p>
              <button type="button" className="btn btn-solid leitor-alvo" onClick={aoVoltar}>
                {t('Ir para a estante')}
              </button>
            </div>
          )}
        </section>

        {painel && motorRef.current && (
          <aside id="leitor-painel" className="leitor-painel" aria-labelledby="leitor-painel-titulo">
            <div className="leitor-painel-cab">
              <h2 id="leitor-painel-titulo">{TITULO_DO_PAINEL[painel]}</h2>
              <button
                type="button"
                className="leitor-botao"
                aria-label={t('Fechar o painel')}
                onClick={() => setPainel(null)}
              >
                <X aria-hidden />
              </button>
            </div>
            <div className="leitor-painel-corpo">
              {painel === 'sumario' && (
                <PainelDoSumario
                  motor={motorRef.current}
                  sumario={info?.sumario ?? []}
                  atual={local?.tocItem?.href}
                  aoIr={() => {
                    if (window.matchMedia?.('(max-width: 900px)').matches) setPainel(null);
                  }}
                />
              )}
              {painel === 'tipografia' && (
                <PainelDeTipografia
                  perfil={perfil}
                  mudar={mudarPerfil}
                  restaurar={restaurarPerfil}
                  ehPdf={!!info?.ehPdf}
                />
              )}
              {painel === 'anotacoes' && (
                <PainelDeAnotacoes
                  anotacoes={anotacoes}
                  naoLocalizadas={naoLocalizadas}
                  estado={sinc}
                  podeBaixarTexto={dominioPublico}
                  podeBaixarEpub={dominioPublico && guardado?.formato === 'epub'}
                  aoIr={(a) => {
                    void motorRef.current?.ir(a.alvo.cfi);
                    if (window.matchMedia?.('(max-width: 900px)').matches) setPainel(null);
                  }}
                  aoEditarNota={(a, n) => void editarNota(a, n)}
                  aoApagar={(a) => void apagar(a)}
                  aoExportar={(f) => void exportar(f)}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {selecao && (
        <BarraDaSelecao
          key={selecao.cfi}
          trecho={selecao.trecho}
          destino={toBcp47(langConfig.mine)}
          traduzir={traduzir}
          aoGrifar={(cor) => {
            const s = selecao;
            setSelecao(null);
            void criar('grifo', { cor }, s);
          }}
          aoAnotar={(nota) => {
            const s = selecao;
            setSelecao(null);
            void criar(nota ? 'nota' : 'grifo', { nota }, s);
          }}
          aoFechar={() => {
            setSelecao(null);
            motorRef.current?.desmarcar();
          }}
          aoConhecerPlanos={aoConhecerPlanos}
        />
      )}

      <footer className="leitor-pe">
        <button
          type="button"
          className="leitor-botao leitor-virar"
          aria-label={t('Página anterior')}
          disabled={estado !== 'pronto'}
          onClick={() => void motorRef.current?.esquerda()}
        >
          <ChevronLeft aria-hidden />
        </button>
        <div className="leitor-progresso">
          <label className="sr" htmlFor="leitor-posicao">
            {t('Posição no livro')}
          </label>
          <input
            id="leitor-posicao"
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            disabled={estado !== 'pronto'}
            aria-valuetext={t('{pct}% do livro', { pct })}
            onChange={(e) => void motorRef.current?.irParaFracao(Number(e.target.value) / 100)}
          />
          <span className="leitor-onde-esta" data-testid="leitor-progresso">
            {local?.tocItem?.label?.trim() ? `${local.tocItem.label.trim()} · ` : ''}
            {pct}%
          </span>
        </div>
        <button
          type="button"
          className="leitor-botao leitor-virar"
          aria-label={t('Próxima página')}
          disabled={estado !== 'pronto'}
          onClick={() => void motorRef.current?.direita()}
        >
          <ChevronRight aria-hidden />
        </button>
      </footer>

      <p className="sr" aria-live="polite" role="status">
        {anuncio}
      </p>

      {palavra && (
        <VocabularyPanel
          emFolha
          viewKey="reading"
          word={palavra.vocab}
          mtNote={palavra.mtNote}
          onClose={() => setPalavra(null)}
          onSpeak={(w) => speak(w, { lang: toBcp47(palavra.idioma || langConfig.studying), rate: ttsSpeed })}
          onAddToDeck={(w) => void salvarNoDeck(w)}
          isAdded={noDeck.has(palavra.vocab.word.toLowerCase())}
          ttsSpeed={ttsSpeed}
          setTtsSpeed={setTtsSpeed}
          podeOuvir={!!palavra.idioma && haVozPara(palavra.idioma)}
          etiqueta={etiquetaDaPalavra(palavra.vocab.word, palavra.idioma)}
          extra={<HistoricoNaFolha palavra={palavra.vocab.word} idioma={palavra.idioma} />}
        />
      )}
    </div>
  );
}
