import '../../../../styles/questSessao.css';
/* A folha da frase (`FolhasDoPrototipo`) é desenhada por estes dois arquivos, que hoje só a tela de
   Capturar importa: sem eles, quem abre a sessão sem ter passado pela captura vê a folha sem estilo. */
import '../../../../styles/capturaNoCelular.css';
import '../../../../styles/polimentoCaptura.css';

import { ArrowLeft, ArrowLeftRight, Download } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { numero, t } from '../../../../lib/i18n';
import { repintarSessao } from '../../../../lib/polimento/sessao';
import type { Recording } from '../../../../types';

/** Uma aba da sessão, como a `Analysis` já as monta (`abasDaSessao`). O ícone não aparece aqui. */
interface AbaDaSessao {
  id: string;
  rotulo: string;
  icone?: ReactNode;
  contagem?: number;
}

/** Os minutos do `durationStr` ("m:ss" ou "h:mm:ss"), no mínimo 1; sem duração, 0. */
function minutosDa(gravacao: Recording): number {
  const partes = gravacao.durationStr.split(':').map(Number);
  if (partes.length < 2 || partes.some((n) => !Number.isFinite(n))) return 0;
  const segundos = partes.reduce((soma, n) => soma * 60 + n, 0);
  return segundos ? Math.max(1, Math.round(segundos / 60)) : 0;
}

/** `telas3.js:99`: "Sessão de áudio · 38 min"; sem duração, "· texto". */
function sobrancelhaDa(gravacao: Recording): string {
  const min = gravacao.type === 'document' ? 0 : minutosDa(gravacao);
  const quanto = min ? t('{n} min', { n: numero(min) }) : t('texto');
  if (gravacao.type === 'document') return t('Sessão de texto · {quanto}', { quanto });
  return gravacao.type === 'video'
    ? t('Sessão de vídeo · {quanto}', { quanto })
    : t('Sessão de áudio · {quanto}', { quanto });
}

/**
 * A SESSÃO ABERTA NO DESENHO NOVO — a casca: cabeçalho, as quatro abas e o painel da aba aberta.
 *
 * A marcação é a de `htmlDaSessao()` do protótipo (`telas3.js:95-104`, item D50 de
 * `fidelidade/casca-e-telas.md`). A troca de aba entra pelo lado da aba escolhida (`repintar()`,
 * `telas3.js:164-170`), em `lib/polimento/sessao.ts`.
 *
 * Só apresentação: a `Analysis` continua dona do estado e entrega aqui o que já calcula.
 */
export default function SessaoDoQuest({
  gravacao,
  abas,
  abaAtiva,
  aoTrocarAba,
  aoVoltar,
  aoExportar,
  repintar = 0,
  children,
}: {
  gravacao: Recording;
  abas: readonly AbaDaSessao[];
  abaAtiva: string;
  aoTrocarAba: (id: string) => void;
  /** Volta para a Biblioteca: o "voltar" e o "Trocar de sessão" (`telas3.js:163`). */
  aoVoltar: () => void;
  aoExportar: () => void;
  /**
   * Muda quando o painel trocou por dentro (as seções da Visão geral): o miolo entra de novo, pela
   * direita (`telas3.js:171`).
   */
  repintar?: number;
  children: ReactNode;
}) {
  const palco = useRef<HTMLDivElement>(null);
  const antes = useRef({ aba: abaAtiva, repintar });
  /* `telas3.js:164-171`: depois de o React pintar o painel novo, ele entra pelo lado da aba. */
  useLayoutEffect(() => {
    const de = antes.current;
    antes.current = { aba: abaAtiva, repintar };
    if (de.aba === abaAtiva && de.repintar === repintar) return;
    const i = abas.findIndex((a) => a.id === abaAtiva);
    const iDeAntes = abas.findIndex((a) => a.id === de.aba);
    repintarSessao(palco.current, de.aba !== abaAtiva && i < iDeAntes ? -1 : 1);
  }, [abaAtiva, repintar, abas]);

  return (
    <div className="q-palco qs px-sessao" data-testid="sessao-do-quest" ref={palco}>
      <header className="q-cab">
        <button
          type="button"
          className="q-ctl q-voltar"
          aria-label={t('Voltar à Biblioteca')}
          data-px="voltar-bib"
          onClick={aoVoltar}
        >
          <ArrowLeft aria-hidden />
        </button>
        <div className="qs-titulo">
          <p className="q-sobre">{sobrancelhaDa(gravacao)}</p>
          <h1>{gravacao.title}</h1>
          <p className="qs-sub">{t('Análise do texto, prática ativa e exercícios criados a partir desta mídia.')}</p>
        </div>
        <button type="button" className="q-chip" data-px="voltar-bib" onClick={aoVoltar}>
          <ArrowLeftRight aria-hidden /> {t('Trocar de sessão')}
        </button>
        <button type="button" className="q-ctl" aria-haspopup="dialog" onClick={aoExportar}>
          <Download aria-hidden /> {t('Exportar')}
        </button>
      </header>

      <div className="q-abas qs-abas px-abas-sessao" role="tablist" aria-label={t('Sessão')}>
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`aba-${aba.id}`}
            className="q-aba"
            aria-selected={aba.id === abaAtiva}
            aria-controls={`painel-${aba.id}`}
            data-px-sessao-aba={aba.id}
            onClick={() => aoTrocarAba(aba.id)}
          >
            {aba.rotulo}
            {aba.contagem != null && (
              <>
                {' '}
                <span className="n">{aba.contagem}</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="qs-painel" role="tabpanel" id={`painel-${abaAtiva}`} aria-labelledby={`aba-${abaAtiva}`}>
        {children}
      </div>
    </div>
  );
}
