import '../../../../styles/questBiblioteca.css';

import {
  ArrowUpDown,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileAudio,
  FileText,
  Gamepad2,
  LayoutGrid,
  Library,
  Mic,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Target,
  Trash2,
  Youtube,
} from 'lucide-react';
import { useState } from 'react';

import { idiomaDaInterface, numero, t, tp } from '../../../../lib/i18n';
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
 * ação. O formulário de importar, a capa, os filtros finos e a exportação continuam na tela de sempre,
 * que "Tela completa" abre nesta visita.
 */

export type OrdemDaBiblioteca = 'recentes' | 'palavras' | 'az';
type Tipo = Recording['type'];

/** Quatro linhas de 72 px cabem na janela padrão do navegador do Quest (1280 × 670) sem rolar. */
export const GRAVACOES_POR_PAGINA = 4;

const ORDENS: OrdemDaBiblioteca[] = ['recentes', 'palavras', 'az'];
const rotuloDaOrdem = (ordem: OrdemDaBiblioteca) =>
  ordem === 'palavras' ? t('Mais palavras') : ordem === 'az' ? t('A–Z') : t('Mais recentes');

const TIPOS: Tipo[] = ['audio', 'video', 'document'];
const ICONE_DO_TIPO = { audio: FileAudio, video: Youtube, document: FileText } as const;
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
    return new Intl.DisplayNames([idiomaDaInterface()], { type: 'language' }).of(base) ?? base;
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
  ordem,
  aoTrocarOrdem,
  aoAbrir,
  aoJogar,
  aoRevisar,
  aoCapturar,
  aoTelaCompleta,
  aoImportar,
  aoFixar,
  aoRenomear,
  aoExcluir,
  porPagina = GRAVACOES_POR_PAGINA,
}: {
  /** Já na ordem em que aparecem (fixadas primeiro, como na tela de sempre). */
  gravacoes: readonly Recording[];
  ordem: OrdemDaBiblioteca;
  aoTrocarOrdem: (ordem: OrdemDaBiblioteca) => void;
  aoAbrir: (gravacao: Recording) => void;
  aoJogar: (gravacao: Recording) => void;
  aoRevisar: (gravacao: Recording) => void;
  aoCapturar: () => void;
  /** Mostra a Biblioteca de sempre (capa, filtros finos, exportar) nesta visita. */
  aoTelaCompleta: () => void;
  /** Abre o formulário de importar (YouTube, documento, link, áudio, texto colado). */
  aoImportar?: () => void;
  aoFixar?: (gravacao: Recording) => void;
  aoRenomear?: (gravacao: Recording) => void;
  /** Quem recebe oferece o "Desfazer": aqui o toque já tira a gravação da lista. */
  aoExcluir?: (gravacao: Recording) => void;
  porPagina?: number;
}) {
  const [pagina, setPagina] = useState(0);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [tipoPedido, setTipoPedido] = useState<Tipo | 'todas'>('todas');

  const quantas = (tipo: Tipo) => gravacoes.filter((g) => g.type === tipo).length;
  const tiposPresentes = TIPOS.filter((tipo) => quantas(tipo) > 0);
  // O tipo filtrado pode esvaziar (a última gravação dele foi excluída): a lista volta a mostrar todas.
  const tipo = tipoPedido !== 'todas' && quantas(tipoPedido) > 0 ? tipoPedido : 'todas';
  const filtradas = tipo === 'todas' ? gravacoes : gravacoes.filter((g) => g.type === tipo);

  const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  // A lista pode encolher (uma exclusão, uma troca de ordem ou de tipo): a página nunca passa do fim.
  const atual = Math.min(pagina, paginas - 1);
  const visiveis = filtradas.slice(atual * porPagina, (atual + 1) * porPagina);
  // Sempre há UMA selecionada: a escolhida, se está nesta página; senão, a primeira da página.
  const selecionada = visiveis.find((g) => g.id === escolhida) ?? visiveis[0];

  const irPara = (destino: number) => {
    setPagina(destino);
    setEscolhida(null);
  };

  const minutos = Math.round(gravacoes.reduce((soma, g) => soma + segundosDe(g.durationStr), 0) / 60);
  const palavras = gravacoes.reduce((soma, g) => soma + (g.wordCount || 0), 0);
  const resumo = [
    gravacoes.length ? tp(gravacoes.length, '{n} gravação', '{n} gravações') : t('Nenhuma gravação'),
    minutos > 0 && t('{n} min', { n: numero(minutos) }),
    palavras > 0 && tp(palavras, '{n} palavra', '{n} palavras', { n: numero(palavras) }),
  ]
    .filter(Boolean)
    .join(' · ');

  const cabecalho = (
    <header className="q-cab">
      <div>
        <p className="q-sobre">{resumo}</p>
        <h1>{t('Biblioteca')}</h1>
      </div>
      {gravacoes.length > 1 && (
        <button
          type="button"
          className="q-chip"
          aria-label={t('Ordem: {ordem}. Trocar a ordem', { ordem: rotuloDaOrdem(ordem) })}
          onClick={() => {
            aoTrocarOrdem(ORDENS[(ORDENS.indexOf(ordem) + 1) % ORDENS.length]);
            irPara(0);
          }}
        >
          <ArrowUpDown aria-hidden /> {rotuloDaOrdem(ordem)}
        </button>
      )}
      {aoImportar && gravacoes.length > 0 && (
        <button type="button" className="q-chip" onClick={aoImportar}>
          <Plus aria-hidden /> {t('Importar')}
        </button>
      )}
      <button type="button" className="q-chip" onClick={aoTelaCompleta}>
        <LayoutGrid aria-hidden /> {t('Tela completa')}
      </button>
    </header>
  );

  if (!selecionada) {
    return (
      <div className="q-palco q-bib">
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

  // Sessão que ficou no meio (sem texto, ou ainda processando) abre, mas não tem o que jogar nem revisar.
  const semTexto = selecionada.pronta === false;
  const IconeDaSelecionada = ICONE_DO_TIPO[selecionada.type] ?? FileAudio;
  const fatos: [string, string][] = [
    [t('Palavras'), selecionada.wordCount ? numero(selecionada.wordCount) : '—'],
    [t('Duração'), minutosDe(selecionada.durationStr) || '—'],
    [t('Idioma'), nomeDoIdioma(selecionada.idioma) || '—'],
    [t('Data'), selecionada.date || '—'],
  ];
  // Na última página sobra lugar: o convite de capturar outra ocupa o que ficou vazio na coluna.
  const sobraLinha = atual === paginas - 1 && visiveis.length < porPagina;

  return (
    <div className="q-palco q-bib">
      {cabecalho}

      {tiposPresentes.length > 1 && (
        <div className="q-abas" role="group" aria-label={t('Tipo de gravação')}>
          <button
            type="button"
            className="q-aba"
            aria-pressed={tipo === 'todas'}
            onClick={() => {
              setTipoPedido('todas');
              irPara(0);
            }}
          >
            {t('Todas')} <span className="n">{gravacoes.length}</span>
          </button>
          {tiposPresentes.map((cada) => {
            const Icone = ICONE_DO_TIPO[cada];
            return (
              <button
                key={cada}
                type="button"
                className="q-aba"
                aria-pressed={tipo === cada}
                onClick={() => {
                  setTipoPedido(cada);
                  irPara(0);
                }}
              >
                <Icone aria-hidden /> {rotuloDoTipo(cada)} <span className="n">{quantas(cada)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="q-bib-corpo">
        <div className="q-bib-col">
          <div className="q-lista" role="group" aria-label={t('Gravações')}>
            {visiveis.map((g) => {
              const Icone = ICONE_DO_TIPO[g.type] ?? FileAudio;
              const detalhes = [g.date, minutosDe(g.durationStr), nomeDoIdioma(g.idioma)].filter(Boolean).join(' · ');
              return (
                <button
                  key={g.id}
                  type="button"
                  className="q-linha"
                  aria-pressed={g.id === selecionada.id}
                  onClick={() => setEscolhida(g.id)}
                >
                  <span className="q-ic" aria-hidden>
                    <Icone />
                  </span>
                  <span>
                    <b>{g.title}</b>
                    {detalhes && <small>{detalhes}</small>}
                  </span>
                  <span className="q-fim">
                    {g.pinned && <Pin aria-label={t('Fixada')} />}
                    {palavrasDe(g)}
                  </span>
                </button>
              );
            })}
          </div>

          {sobraLinha && (
            <button type="button" className="q-linha q-bib-nova" onClick={aoCapturar}>
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
          )}

          {paginas > 1 && (
            <div className="q-faixa q-bib-paginas" role="group" aria-label={t('Páginas da biblioteca')}>
              <button type="button" className="q-ctl" disabled={atual === 0} onClick={() => irPara(atual - 1)}>
                <ChevronLeft aria-hidden /> {t('Anterior')}
              </button>
              <span className="q-espaco" />
              <span className="q-tempo" aria-label={t('Página {n} de {total}', { n: atual + 1, total: paginas })}>
                {atual + 1} / {paginas}
              </span>
              <span className="q-espaco" />
              <button type="button" className="q-ctl" disabled={atual >= paginas - 1} onClick={() => irPara(atual + 1)}>
                {t('Próxima')} <ChevronRight aria-hidden />
              </button>
            </div>
          )}
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
              <h2 title={selecionada.title}>{selecionada.title}</h2>
            </div>
          </div>

          <dl className="q-bib-fatos">
            {fatos.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt>{rotulo}</dt>
                <dd title={valor}>{valor}</dd>
              </div>
            ))}
          </dl>

          <div className="q-bib-acoes" role="toolbar" aria-label={t('Ações da gravação selecionada')}>
            <button type="button" className="q-ctl pri" onClick={() => aoAbrir(selecionada)}>
              <BookOpen aria-hidden /> {t('Abrir')}
            </button>
            <div className="q-acoes">
              <button type="button" className="q-ctl" disabled={semTexto} onClick={() => aoJogar(selecionada)}>
                <Gamepad2 aria-hidden /> {t('Jogar com esta')}
              </button>
              <button type="button" className="q-ctl" disabled={semTexto} onClick={() => aoRevisar(selecionada)}>
                <Target aria-hidden /> {t('Revisar palavras')}
              </button>
            </div>
            {(aoFixar || aoRenomear || aoExcluir) && (
              <div className="q-acoes q-bib-cuidar">
                {aoFixar && (
                  <button type="button" className="q-ctl" onClick={() => aoFixar(selecionada)}>
                    {selecionada.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                    {selecionada.pinned ? t('Desafixar') : t('Fixar no topo')}
                  </button>
                )}
                {aoRenomear && (
                  <button type="button" className="q-ctl" onClick={() => aoRenomear(selecionada)}>
                    <Pencil aria-hidden /> {t('Renomear')}
                  </button>
                )}
                {aoExcluir && (
                  <button type="button" className="q-ctl perigo" onClick={() => aoExcluir(selecionada)}>
                    <Trash2 aria-hidden /> {t('Excluir')}
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
