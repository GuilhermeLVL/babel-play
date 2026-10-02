import '../../../../styles/questBiblioteca.css';

import { ArrowUpDown, BookOpen, ChevronLeft, ChevronRight, Gamepad2, LayoutGrid, Mic, Target } from 'lucide-react';
import { useState } from 'react';

import { idiomaDaInterface, numero, t, tp } from '../../../../lib/i18n';
import type { Recording } from '../../../../types';

/**
 * A BIBLIOTECA NO QUEST — a maquete aprovada pelo dono em 01/10/2026 (tela 9).
 *
 * No headset a lista não rola: são PÁGINAS de linhas de 72 px, cada gravação um alvo inteiro, uma
 * selecionada por vez. O que se faz com a gravação selecionada mora na faixa de baixo (um único botão
 * principal, "Abrir"), e não em menu de botão direito nem em ícone pequeno dentro da linha.
 *
 * Só apresentação: recebe a lista já ordenada pela `Library` e devolve a gravação escolhida a cada
 * ação. Importar, renomear, excluir, filtrar e exportar continuam na tela de sempre, que "Tela
 * completa" abre nesta visita — nada disso foi refeito aqui.
 */

export type OrdemDaBiblioteca = 'recentes' | 'palavras' | 'az';

/** Quatro linhas de 72 px cabem na janela padrão do navegador do Quest (1280 × 670) sem rolar. */
export const GRAVACOES_POR_PAGINA = 4;

const ORDENS: OrdemDaBiblioteca[] = ['recentes', 'palavras', 'az'];
const rotuloDaOrdem = (ordem: OrdemDaBiblioteca) =>
  ordem === 'palavras' ? t('Mais palavras') : ordem === 'az' ? t('A–Z') : t('Mais recentes');

/** "38 min" a partir do `durationStr` ("m:ss" ou "h:mm:ss"); documento ('-') não tem duração. */
function minutosDe(durationStr: string): string {
  const partes = durationStr.split(':').map(Number);
  if (partes.length < 2 || partes.some((n) => !Number.isFinite(n))) return '';
  const segundos = partes.reduce((soma, n) => soma * 60 + n, 0);
  return t('{n} min', { n: Math.max(1, Math.round(segundos / 60)) });
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

export default function BibliotecaDoQuest({
  gravacoes,
  ordem,
  aoTrocarOrdem,
  aoAbrir,
  aoJogar,
  aoRevisar,
  aoCapturar,
  aoTelaCompleta,
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
  /** Mostra a Biblioteca de sempre (importar, renomear, excluir, filtros) nesta visita. */
  aoTelaCompleta: () => void;
  porPagina?: number;
}) {
  const [pagina, setPagina] = useState(0);
  const [escolhida, setEscolhida] = useState<string | null>(null);

  const paginas = Math.max(1, Math.ceil(gravacoes.length / porPagina));
  // A lista pode encolher (uma exclusão na tela completa, uma troca de ordem): a página nunca passa do fim.
  const atual = Math.min(pagina, paginas - 1);
  const visiveis = gravacoes.slice(atual * porPagina, (atual + 1) * porPagina);
  // Sempre há UMA selecionada: a escolhida, se está nesta página; senão, a primeira da página.
  const selecionada = visiveis.find((g) => g.id === escolhida) ?? visiveis[0];

  const irPara = (destino: number) => {
    setPagina(destino);
    setEscolhida(null);
  };

  const cabecalho = (
    <header className="q-cab">
      <div>
        <p className="q-sobre">{tp(gravacoes.length, '{n} gravação', '{n} gravações')}</p>
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
      <button type="button" className="q-chip" onClick={aoTelaCompleta}>
        <LayoutGrid aria-hidden /> {t('Tela completa')}
      </button>
    </header>
  );

  if (!selecionada) {
    return (
      <div className="q-palco q-bib">
        {cabecalho}
        <div className="q-bib-vazia">
          <p>{t('Nada gravado ainda. O que você capturar aparece aqui, pronto para abrir, jogar e revisar.')}</p>
          <button type="button" className="q-ctl pri" onClick={aoCapturar}>
            <Mic aria-hidden /> {t('Capturar uma sessão')}
          </button>
        </div>
      </div>
    );
  }

  // Sessão que ficou no meio (sem texto, ou ainda processando) abre, mas não tem o que jogar nem revisar.
  const semTexto = selecionada.pronta === false;

  return (
    <div className="q-palco q-bib">
      {cabecalho}

      <div className="q-lista" role="group" aria-label={t('Gravações')}>
        {visiveis.map((g) => {
          const detalhes = [g.date, minutosDe(g.durationStr), nomeDoIdioma(g.idioma)].filter(Boolean).join(' · ');
          return (
            <button
              key={g.id}
              type="button"
              className="q-linha"
              aria-pressed={g.id === selecionada.id}
              onClick={() => setEscolhida(g.id)}
            >
              <span>
                <b>{g.title}</b>
                {detalhes && <small>{detalhes}</small>}
              </span>
              <span className="q-fim">
                {g.pronta === false
                  ? g.wordCount
                    ? t('Processando')
                    : t('Sem texto ainda')
                  : tp(g.wordCount, '{n} palavra', '{n} palavras', { n: numero(g.wordCount) })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="q-faixa" role="toolbar" aria-label={t('Ações da gravação selecionada')}>
        <button type="button" className="q-ctl pri" onClick={() => aoAbrir(selecionada)}>
          <BookOpen aria-hidden /> {t('Abrir')}
        </button>
        <button type="button" className="q-ctl" disabled={semTexto} onClick={() => aoJogar(selecionada)}>
          <Gamepad2 aria-hidden /> {t('Jogar com esta')}
        </button>
        <button type="button" className="q-ctl" disabled={semTexto} onClick={() => aoRevisar(selecionada)}>
          <Target aria-hidden /> {t('Revisar palavras')}
        </button>
        <span className="q-espaco" />
        <button type="button" className="q-ctl" disabled={atual === 0} onClick={() => irPara(atual - 1)}>
          <ChevronLeft aria-hidden /> {t('Anterior')}
        </button>
        {paginas > 1 && (
          <span className="q-tempo" aria-label={t('Página {n} de {total}', { n: atual + 1, total: paginas })}>
            {atual + 1} / {paginas}
          </span>
        )}
        <button type="button" className="q-ctl" disabled={atual >= paginas - 1} onClick={() => irPara(atual + 1)}>
          {t('Próxima')} <ChevronRight aria-hidden />
        </button>
      </div>
    </div>
  );
}
