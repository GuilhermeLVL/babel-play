import '../../../../styles/questBiblioteca.css';

import {
  ArrowUpDown,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Gamepad2,
  Library,
  Mic,
  Monitor,
  Plus,
  Search,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { idiomaDaInterface, numero, t, tp } from '../../../../lib/i18n';
import { type ComoRedesenhar, redesenharBib } from '../../../../lib/polimento/biblioteca';
import type { Recording } from '../../../../types';

/**
 * A BIBLIOTECA NO QUEST — a maquete aprovada pelo dono em 01/10/2026 (tela 9), refeita em 02/10/2026
 * para ocupar a tela: a lista de um lado, a gravação selecionada inteira do outro.
 *
 * No headset a lista não rola: são PÁGINAS de linhas de 72 px, cada gravação um alvo inteiro, uma
 * selecionada por vez. O painel ao lado diz o que ela é (tipo, palavras, duração, idioma, data) e traz
 * tudo o que se faz com ela, com um único botão principal ("Abrir"). Nada de menu de botão direito nem
 * de ícone pequeno dentro da linha.
 *
 * Só apresentação: recebe a lista já ordenada pela `Library` e devolve a gravação escolhida a cada
 * ação.
 *
 * A MARCAÇÃO É A DO PROTÓTIPO (`htmlDaBib()` e `detalheDaBib()` de `telas.js:396-434`, itens D48 e
 * D49 de `fidelidade/casca-e-telas.md`): os mesmos elementos, classes e textos, com as gravações de
 * verdade. O movimento (`redesenharBib()`, `telas.js:436-454`) está em `lib/polimento/biblioteca.ts`.
 */

export type OrdemDaBiblioteca = 'recentes' | 'palavras' | 'az';
type Tipo = Recording['type'];

/** Quatro linhas de 72 px cabem na janela padrão do navegador do Quest (1280 × 670) sem rolar. */
export const GRAVACOES_POR_PAGINA = 4;

const ORDENS: OrdemDaBiblioteca[] = ['recentes', 'palavras', 'az'];
const rotuloDaOrdem = (ordem: OrdemDaBiblioteca) =>
  ordem === 'palavras' ? t('Mais palavras') : ordem === 'az' ? t('A–Z') : t('Mais recentes');

const TIPOS: Tipo[] = ['audio', 'video', 'document'];
/* Os ícones do protótipo (`telas.js:386-391`): microfone, monitor e livro. */
const ICONE_DO_TIPO = { audio: Mic, video: Monitor, document: BookOpen } as const;
const rotuloDoTipo = (tipo: Tipo) => (tipo === 'video' ? t('Vídeo') : tipo === 'document' ? t('Texto') : t('Áudio'));

/** Os segundos do `durationStr` ("m:ss" ou "h:mm:ss"); documento ('-') não tem duração. */
function segundosDe(durationStr: string): number {
  const partes = durationStr.split(':').map(Number);
  if (partes.length < 2 || partes.some((n) => !Number.isFinite(n))) return 0;
  return partes.reduce((soma, n) => soma * 60 + n, 0);
}

function minutosDe(durationStr: string): string {
  const segundos = segundosDe(durationStr);
  return segundos ? t('{n} min', { n: Math.max(1, Math.round(segundos / 60)) }) : '';
}

/** "inglês": o idioma do conteúdo, escrito no idioma da interface. Sem idioma gravado, nada. */
function nomeDoIdioma(codigo?: string): string {
  const base = (codigo ?? '').split('-')[0].toLowerCase();
  if (!base) return '';
  try {
    const nome = new Intl.DisplayNames([idiomaDaInterface()], { type: 'language' }).of(base) ?? base;
    /* "Inglês", com a inicial maiúscula, como no protótipo (`telas.js:386`). */
    return nome.charAt(0).toLocaleUpperCase() + nome.slice(1);
  } catch {
    return base;
  }
}

const palavrasDe = (g: Recording) =>
  g.pronta === false
    ? g.wordCount
      ? t('Processando')
      : t('Sem texto ainda')
    : tp(g.wordCount, '{n} palavra', '{n} palavras', { n: numero(g.wordCount) });

export default function BibliotecaDoQuest({
  gravacoes,
  total = gravacoes,
  ordem,
  aoTrocarOrdem,
  aoAbrir,
  aoJogar,
  aoRevisar,
  aoCapturar,
  aoImportar,
  aoFixar,
  aoRenomear,
  aoExcluir,
  aoExportar,
  aoRetomar,
  busca,
  aoBuscar,
  duploCliqueAbre = false,
  porPagina = GRAVACOES_POR_PAGINA,
}: {
  /** Já na ordem em que aparecem (fixadas primeiro) e já filtradas pela busca. */
  gravacoes: readonly Recording[];
  /**
   * A biblioteca INTEIRA, sem a busca: é dela que saem a sobrancelha e as contagens das abas, que no
   * protótipo não mudam enquanto se digita (`telas.js:417, 420`). Ausente = `gravacoes`.
   */
  total?: readonly Recording[];
  ordem: OrdemDaBiblioteca;
  aoTrocarOrdem: (ordem: OrdemDaBiblioteca) => void;
  aoAbrir: (gravacao: Recording) => void;
  aoJogar: (gravacao: Recording) => void;
  aoRevisar: (gravacao: Recording) => void;
  aoCapturar: () => void;
  /** Abre o formulário de importar (YouTube, documento, link, áudio, texto colado). */
  aoImportar?: () => void;
  aoFixar?: (gravacao: Recording) => void;
  aoRenomear?: (gravacao: Recording) => void;
  /** Quem recebe oferece o "Desfazer": aqui o toque já tira a gravação da lista. */
  aoExcluir?: (gravacao: Recording) => void;
  /*
   * O QUE O COMPUTADOR TRAZ PARA DENTRO DESTA TELA (02/10/2026). No headset estas quatro props não vêm;
   * quem decide é a `Library`, pelo aparelho.
   */
  /** "Exportar transcrição" da gravação selecionada (o diálogo de sempre). */
  aoExportar?: (gravacao: Recording) => void;
  /** "Retomar captura": só as sessões de áudio têm captura para retomar. */
  aoRetomar?: (gravacao: Recording) => void;
  /** A busca por título. Com `aoBuscar`, o campo aparece; `gravacoes` já chega filtrada por ela. */
  busca?: string;
  aoBuscar?: (texto: string) => void;
  /** Com o mouse, o duplo clique numa linha abre a gravação (o clique simples seleciona). */
  duploCliqueAbre?: boolean;
  porPagina?: number;
}) {
  const [pagina, setPagina] = useState(0);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo | 'todas'>('todas');

  /* `redesenharBib()` roda depois de o React pintar o que o toque pediu (`telas.js:436-454`). */
  const palco = useRef<HTMLDivElement>(null);
  const movimento = useRef<{ como: ComoRedesenhar; dir: number } | null>(null);
  const redesenhar = (como: ComoRedesenhar, dir = 1) => {
    movimento.current = { como, dir };
  };
  useLayoutEffect(() => {
    const m = movimento.current;
    if (!m) return;
    movimento.current = null;
    redesenharBib(palco.current, m.como, m.dir);
  });

  const quantas = (qual: Tipo) => total.filter((g) => g.type === qual).length;
  const filtradas = tipo === 'todas' ? gravacoes : gravacoes.filter((g) => g.type === tipo);

  const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  // A lista pode encolher (uma exclusão, uma troca de ordem ou de tipo): a página nunca passa do fim.
  const atual = Math.min(pagina, paginas - 1);
  const visiveis = filtradas.slice(atual * porPagina, (atual + 1) * porPagina);
  /* Sempre há UMA selecionada, e ela continua selecionada ao mudar de página (`telas.js:414`). */
  const selecionada = filtradas.find((g) => g.id === escolhida) ?? filtradas[0];

  /* `telas.js:541, 550-556`: filtro e busca voltam para a primeira gravação da primeira página. */
  const recomecar = () => {
    setPagina(0);
    setEscolhida(null);
    redesenhar('lista');
  };

  const segundos = total.reduce((soma, g) => soma + segundosDe(g.durationStr), 0);
  const palavras = total.reduce((soma, g) => soma + (g.wordCount || 0), 0);
  /* `telas.js:417`: "{n} gravações · {min} min · {palavras} palavras". */
  const resumo = [
    tp(total.length, '{n} gravação', '{n} gravações'),
    t('{n} min', { n: numero(Math.round(segundos / 60)) }),
    tp(palavras, '{n} palavra', '{n} palavras', { n: numero(palavras) }),
  ].join(' · ');

  const buscando = !!busca?.trim();
  const semNada = total.length === 0 && !buscando;

  const cabecalho = (
    <header className="q-cab">
      <div>
        <p className="q-sobre">{resumo}</p>
        <h1>{t('Biblioteca')}</h1>
      </div>
      <button
        type="button"
        className="q-chip"
        aria-label={t('Ordem: {ordem}. Trocar a ordem', { ordem: rotuloDaOrdem(ordem) })}
        onClick={() => {
          aoTrocarOrdem(ORDENS[(ORDENS.indexOf(ordem) + 1) % ORDENS.length]);
          setPagina(0);
        }}
      >
        <ArrowUpDown aria-hidden /> {rotuloDaOrdem(ordem)}
      </button>
      {aoImportar && (
        <button type="button" className="q-chip" onClick={aoImportar}>
          <Plus aria-hidden /> {t('Importar')}
        </button>
      )}
    </header>
  );

  const campoDeBusca = aoBuscar && !semNada && (
    <label className="q-campo q-bib-busca">
      <Search aria-hidden />
      <input
        type="search"
        autoComplete="off"
        placeholder={t('Buscar por título')}
        aria-label={t('Buscar por título')}
        value={busca ?? ''}
        onChange={(e) => {
          aoBuscar(e.target.value);
          recomecar();
        }}
      />
    </label>
  );

  /* `telas.js:420`: as quatro abas, sempre, com a contagem da biblioteca inteira. */
  const abas = !semNada && (
    <div className="q-abas" role="group" aria-label={t('Tipo de gravação')}>
      {(['todas', ...TIPOS] as const).map((cada) => {
        const n = cada === 'todas' ? total.length : quantas(cada);
        return (
          <button
            key={cada}
            type="button"
            role="radio"
            className="q-aba"
            data-px-tipo={cada}
            aria-checked={tipo === cada}
            /* Um tipo sem nenhuma gravação não tem o que mostrar (no protótipo todos têm). */
            disabled={n === 0 && tipo !== cada}
            onClick={() => {
              setTipo(cada);
              recomecar();
            }}
          >
            {cada === 'todas' ? t('Todas') : rotuloDoTipo(cada)} <span className="n">{n}</span>
          </button>
        );
      })}
    </div>
  );

  /* A biblioteca vazia de verdade (o protótipo nasce com seis gravações e não tem este estado). */
  if (semNada) {
    return (
      <div className="q-palco q-bib" ref={palco}>
        {cabecalho}
        <div className="q-vazio q-bib-vazia">
          <span className="q-ic" aria-hidden>
            <Library />
          </span>
          <h2>{t('Sua biblioteca começa aqui')}</h2>
          <p>{t('Nada gravado ainda. O que você capturar aparece aqui, pronto para abrir, jogar e revisar.')}</p>
          <div className="q-acoes">
            <button type="button" className="q-ctl pri" onClick={aoCapturar}>
              <Mic aria-hidden /> {t('Capturar uma sessão')}
            </button>
            {aoImportar && (
              <button type="button" className="q-ctl" onClick={aoImportar}>
                <Plus aria-hidden /> {t('Importar')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* `telas.js:431`: nada com este título (ou deste tipo, com a busca ligada). */
  if (!selecionada) {
    return (
      <div className="q-palco q-bib" ref={palco}>
        {cabecalho}
        {campoDeBusca}
        {abas}
        <div className="q-vazio" data-testid="busca-sem-resultado">
          <h2>{t('Nenhum resultado')}</h2>
          <p>{t('Nenhuma gravação tem “{busca}” no título.', { busca: busca?.trim() ?? '' })}</p>
          <button
            type="button"
            className="q-ctl"
            data-px="limpar"
            onClick={() => {
              aoBuscar?.('');
              setTipo('todas');
              recomecar();
            }}
          >
            {t('Limpar a busca')}
          </button>
        </div>
      </div>
    );
  }

  // Sessão que ficou no meio (sem texto, ou ainda processando) abre, mas não tem o que jogar nem revisar.
  const semTexto = selecionada.pronta === false;
  const IconeDaSelecionada = ICONE_DO_TIPO[selecionada.type] ?? Mic;
  const fatos: [string, string][] = [
    [t('Palavras'), selecionada.wordCount ? numero(selecionada.wordCount) : '—'],
    [t('Duração'), minutosDe(selecionada.durationStr) || '—'],
    [t('Idioma'), nomeDoIdioma(selecionada.idioma) || '—'],
    [t('Data'), selecionada.date || '—'],
  ];
  // Retomar captura: só sessões de áudio têm captura (documento e vídeo importado não).
  const podeRetomar = !!aoRetomar && selecionada.type === 'audio';

  return (
    <div className="q-palco q-bib" ref={palco}>
      {cabecalho}
      {campoDeBusca}
      {abas}

      <div className="q-bib-corpo">
        <div className="q-bib-col">
          <div className="q-lista" role="group" aria-label={t('Gravações')}>
            {visiveis.map((g) => {
              const Icone = ICONE_DO_TIPO[g.type] ?? Mic;
              const detalhes = [g.date, minutosDe(g.durationStr), nomeDoIdioma(g.idioma)].filter(Boolean).join(' · ');
              return (
                <button
                  key={g.id}
                  type="button"
                  className="q-linha"
                  data-px-grav={g.id}
                  aria-pressed={g.id === selecionada.id}
                  onClick={() => {
                    setEscolhida(g.id);
                    redesenhar('detalhe');
                  }}
                  onDoubleClick={duploCliqueAbre ? () => aoAbrir(g) : undefined}
                >
                  <span className="q-ic" aria-hidden>
                    <Icone />
                  </span>
                  <span>
                    <b>{g.title}</b>
                    <small>{detalhes}</small>
                  </span>
                  <span className="q-fim">{palavrasDe(g)}</span>
                </button>
              );
            })}
          </div>

          <button type="button" className="q-linha q-bib-nova" data-px="capturar" onClick={aoCapturar}>
            <span className="q-bib-nova-dentro">
              <span className="q-ic" aria-hidden>
                <Mic />
              </span>
              <span>
                <b>{t('Capturar outra sessão')}</b>
                <small>{t('O que você ouvir vira texto, palavras e jogos.')}</small>
              </span>
            </span>
          </button>

          <div className="q-faixa q-bib-paginas">
            <button
              type="button"
              className="q-ctl"
              data-px-pag="-1"
              disabled={atual === 0}
              onClick={() => {
                setPagina(atual - 1);
                redesenhar('lista', -1);
              }}
            >
              <ChevronLeft aria-hidden /> {t('Anterior')}
            </button>
            <span className="q-espaco" />
            <span className="q-tempo" aria-label={t('Página {n} de {total}', { n: atual + 1, total: paginas })}>
              {atual + 1} / {paginas}
            </span>
            <span className="q-espaco" />
            <button
              type="button"
              className="q-ctl"
              data-px-pag="1"
              disabled={atual >= paginas - 1}
              onClick={() => {
                setPagina(atual + 1);
                redesenhar('lista', 1);
              }}
            >
              {/* No protótipo esta seta sai menor que a de "Anterior" (16 px, `telas.js:428`). */}
              {t('Próxima')} <ChevronRight aria-hidden style={{ width: 16, height: 16, verticalAlign: -3 }} />
            </button>
          </div>
        </div>

        <section className="q-cartao q-bib-det" aria-label={t('Gravação selecionada')}>
          <div className="q-bib-topo">
            <span className="q-ic" aria-hidden>
              <IconeDaSelecionada />
            </span>
            <div>
              <p className="q-bib-tags">
                <span className="q-tag">{rotuloDoTipo(selecionada.type)}</span>
                {selecionada.pinned && <span className="q-tag">{t('Fixada')}</span>}
                {semTexto && <span className="q-tag off">{palavrasDe(selecionada)}</span>}
              </p>
              <h2>{selecionada.title}</h2>
            </div>
          </div>

          <dl className="q-bib-fatos">
            {fatos.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt>{rotulo}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>

          <div className="q-bib-acoes" role="toolbar" aria-label={t('Ações da gravação selecionada')}>
            <button type="button" className="q-ctl pri" onClick={() => aoAbrir(selecionada)}>
              <BookOpen aria-hidden /> {t('Abrir')}
            </button>
            <div className="q-acoes">
              <button
                type="button"
                className="q-ctl"
                data-px="jogar"
                disabled={semTexto}
                onClick={() => aoJogar(selecionada)}
              >
                <Gamepad2 aria-hidden /> {t('Jogar com esta')}
              </button>
              <button type="button" className="q-ctl" disabled={semTexto} onClick={() => aoRevisar(selecionada)}>
                {t('Revisar palavras')}
              </button>
            </div>
            {(aoExportar || aoRetomar) && (
              <div className="q-acoes q-bib-cuidar q-bib-levar">
                {aoExportar && (
                  <button
                    type="button"
                    className="q-ctl"
                    aria-haspopup="dialog"
                    onClick={() => aoExportar(selecionada)}
                  >
                    <Download aria-hidden /> {t('Exportar transcrição')}
                  </button>
                )}
                {aoRetomar && (
                  <button
                    type="button"
                    className="q-ctl"
                    disabled={!podeRetomar}
                    onClick={() => aoRetomar(selecionada)}
                  >
                    {t('Retomar captura')}
                  </button>
                )}
              </div>
            )}
            {(aoFixar || aoRenomear || aoExcluir) && (
              <div className="q-acoes q-bib-cuidar">
                {aoFixar && (
                  <button type="button" className="q-ctl" onClick={() => aoFixar(selecionada)}>
                    {selecionada.pinned ? t('Desafixar') : t('Fixar no topo')}
                  </button>
                )}
                {aoRenomear && (
                  <button type="button" className="q-ctl" onClick={() => aoRenomear(selecionada)}>
                    {t('Renomear')}
                  </button>
                )}
                {aoExcluir && (
                  <button type="button" className="q-ctl perigo" onClick={() => aoExcluir(selecionada)}>
                    {t('Excluir')}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
