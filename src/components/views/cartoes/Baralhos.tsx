import '../../../styles/questBiblioteca.css';
import '../../../styles/capturaNoCelular.css';

import { FILTRO_PADRAO } from '@core';
import {
  BookOpen,
  CalendarCheck,
  Download,
  ExternalLink,
  Gamepad2,
  GraduationCap,
  Languages,
  Layers,
  type LucideIcon,
  Mic,
  Monitor,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  Upload,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { ContagemDeFila, ResumoDosCartoes } from '../../../core/learning/resumoDosCartoes';
import { ativarNotasDoBaralho, type BaralhoAnkiResumo, listarBaralhosAnki } from '../../../data/apiAnki';
import { gravarFiltro } from '../../../lib/filtroDaPratica';
import { numero, t, tp } from '../../../lib/i18n';
import { anima, polido, reduz } from '../../../lib/polimento/base';
import { celular } from '../../../lib/polimento/celular';
import type { AbaDeCartoes } from '../../../lib/rotas';
import type { Recording } from '../../../types';
import { toast } from '../../Toast';
import FolhaDeBaixo from '../captura/celular/FolhaDeBaixo';
import type { PedidoDeEstudo } from './Hoje';
import { nomeDoIdioma, Tres } from './pecas';

/**
 * A ABA "BARALHOS" — porte de `ctBaralhos`, `ctLinhaDoBaralho` e `ctDetalheDoBaralho`
 * (`cartoes.js:300-341`). Os baralhos se montam sozinhos: "Tudo", um por idioma, um por sessão com
 * cartão, a Trilha e cada baralho trazido do Anki (que morava em `BaralhosAnki.tsx`, com o desenho
 * antigo). As contagens vêm de `GET /api/vocab/resumo`; a lista do Anki, de `GET /api/anki/decks`.
 *
 * FORA DESTA FATIA (`fidelidade/ficou-de-fora.md`): "Revisar este" para idioma, Trilha e Anki (a
 * revisão só aceita o recorte por sessão), o grupo "Para cuidar" (difíceis e suspensas: o catálogo não
 * filtra por estado), a retenção e a próxima revisão de cada baralho, "Mapear campos" e as opções por
 * baralho.
 */

type Grupo = 'tudo' | 'idioma' | 'sessao' | 'trilha' | 'anki';

interface Baralho {
  id: string;
  g: Grupo;
  tipo: string;
  nome: string;
  sub: string;
  Icone: LucideIcon;
  total: number;
  /** Notas no arquivo do Anki: o baralho tem `total` de `de` ativadas. */
  de?: number;
  n: ContagemDeFila;
  idioma?: string;
  /** Quantas notas do Anki ainda dá para ativar. */
  porAtivar?: number;
}

/** A janela está na largura de celular (até 720 px, o corte de `cartoes.css:316`)? Muda ao girar. */
function useEstreito(): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      const mq = window.matchMedia?.('(max-width: 720px)');
      mq?.addEventListener?.('change', aoMudar);
      return () => mq?.removeEventListener?.('change', aoMudar);
    },
    celular,
    () => false,
  );
}

const ZERO: ContagemDeFila = { novas: 0, aprendendo: 0, revisar: 0 };
const dataCurta = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** A linha de um baralho (`ctLinhaDoBaralho`, `cartoes.js:301-303`). */
function Linha({ b, escolhido, aoEscolher }: { b: Baralho; escolhido: boolean; aoEscolher: () => void }) {
  return (
    <button
      type="button"
      className="q-linha ct-linha-b"
      aria-pressed={escolhido}
      onClick={aoEscolher}
      data-ct-baralho={b.id}
    >
      <span className="q-ic">
        <b.Icone aria-hidden />
      </span>
      <span>
        <b>{b.nome}</b>
        <small>
          {b.g === 'tudo' || b.g === 'idioma'
            ? [tp(b.total, '{n} cartão', '{n} cartões', { n: numero(b.total) }), b.sub].filter(Boolean).join(' · ')
            : b.sub}
        </small>
      </span>
      <Tres n={b.n} />
    </button>
  );
}

export default function Baralhos({
  resumo,
  sessoes,
  aoEstudar,
  aoIrAba,
  aoNavegar,
  aoGerenciarAnki,
  aoMudou,
}: {
  /** `null` = estado vazio (sem conta, ou nenhum cartão). */
  resumo: ResumoDosCartoes | null;
  sessoes: Recording[];
  aoEstudar: (pedido?: PedidoDeEstudo) => void;
  aoIrAba: (aba: AbaDeCartoes) => void;
  aoNavegar: (view: string, dado?: Record<string, unknown>) => void;
  /** Abre a tela de gerenciar baralhos do Anki (notas, desativar, apagar), que já existe. */
  aoGerenciarAnki: () => void;
  /** Uma ativação mudou o baralho: as contagens precisam ser lidas de novo. */
  aoMudou: () => void;
}) {
  const [doAnki, setDoAnki] = useState<BaralhoAnkiResumo[]>([]);
  const [escolhido, setEscolhido] = useState('tudo');
  const [folha, setFolha] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const estreito = useEstreito();
  const detalhe = useRef<HTMLElement>(null);
  const temCartoes = !!resumo && resumo.total > 0;

  useEffect(() => {
    if (!resumo) return;
    let vivo = true;
    listarBaralhosAnki()
      .then((l) => vivo && setDoAnki(l))
      .catch(() => vivo && setDoAnki([]));
    return () => {
      vivo = false;
    };
  }, [resumo]);

  const baralhos = useMemo<Baralho[]>(() => {
    if (!resumo) return [];
    const lista: Baralho[] = [
      {
        id: 'tudo',
        g: 'tudo',
        tipo: t('Automático'),
        nome: t('Tudo'),
        sub: t('Todos os idiomas e todas as origens'),
        Icone: Layers,
        total: resumo.total,
        n: resumo.hoje,
      },
    ];
    /* Com um idioma só, o baralho do idioma seria o "Tudo" repetido. */
    if (resumo.baralhos.idiomas.length > 1)
      for (const i of resumo.baralhos.idiomas)
        lista.push({
          id: `idioma:${i.id}`,
          g: 'idioma',
          tipo: t('Idioma'),
          nome: nomeDoIdioma(i.id),
          sub: '',
          Icone: Languages,
          total: i.total,
          n: i,
          idioma: i.id,
        });
    for (const s of resumo.baralhos.sessoes) {
      const sessao = sessoes.find((x) => x.id === s.id);
      /* Sessão apagada: os cartões continuam em "Tudo", mas não há mais o que abrir. */
      if (!sessao) continue;
      lista.push({
        id: `sessao:${s.id}`,
        g: 'sessao',
        tipo:
          sessao.type === 'video'
            ? t('Sessão de vídeo')
            : sessao.type === 'document'
              ? t('Texto')
              : t('Sessão de áudio'),
        nome: sessao.title,
        sub: [sessao.date, sessao.durationStr, sessao.idioma ? nomeDoIdioma(sessao.idioma) : '']
          .filter(Boolean)
          .join(' · '),
        Icone: sessao.type === 'video' ? Monitor : sessao.type === 'document' ? BookOpen : Mic,
        total: s.total,
        n: s,
        idioma: sessao.idioma,
      });
    }
    if (resumo.baralhos.trilha)
      lista.push({
        id: 'trilha',
        g: 'trilha',
        tipo: t('Trilha'),
        nome: t('Trilha de vocabulário'),
        sub: tp(resumo.baralhos.trilha.total, '{n} palavra ativada', '{n} palavras ativadas'),
        Icone: GraduationCap,
        total: resumo.baralhos.trilha.total,
        n: resumo.baralhos.trilha,
      });
    for (const d of doAnki) {
      if (d.estado !== 'ativo') continue;
      const noResumo = resumo.baralhos.anki.find((x) => x.id === d.id);
      lista.push({
        id: `anki:${d.id}`,
        g: 'anki',
        tipo: 'Anki',
        nome: d.nome,
        sub: t('{ativas} de {total} notas ativadas · trazido em {data}', {
          ativas: numero(d.ativas),
          total: numero(d.total),
          data: dataCurta(d.createdAt),
        }),
        Icone: WalletCards,
        total: noResumo?.total ?? d.ativas,
        de: d.total,
        n: noResumo ?? ZERO,
        idioma: d.idiomaOrigem ?? undefined,
        porAtivar: Math.max(0, d.total - d.ativas - d.descartadas - d.ausentes),
      });
    }
    return lista;
  }, [resumo, sessoes, doAnki]);

  const b = baralhos.find((x) => x.id === escolhido) ?? baralhos[0];

  /* O detalhe troca com o mesmo movimento do protótipo (`cartoes.js:943-946`). */
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const det = detalhe.current;
    if (!det || !polido() || reduz()) return;
    anima(
      det,
      [
        { opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
      ],
      { d: 460 },
    );
    det.querySelectorAll('.q-bib-fatos > div, .q-bib-acoes > *').forEach((x, i) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { d: 420, atraso: 60 + i * 45 },
      ),
    );
  }, [escolhido]);

  if (!temCartoes || !resumo || !b) {
    return (
      <div className="q-vazio">
        <span className="q-ic">
          <Layers aria-hidden />
        </span>
        <h2>{t('Os baralhos se montam sozinhos')}</h2>
        <p>
          {t(
            'Um por idioma, um por sessão gravada, a Trilha e cada baralho que você trouxer do Anki. Você não precisa criar nem arrumar nada.',
          )}
        </p>
        <button type="button" className="q-ctl pri" onClick={() => aoIrAba('hoje')}>
          <CalendarCheck aria-hidden /> {t('Ver como começar')}
        </button>
      </div>
    );
  }

  const idDe = (x: Baralho) => x.id.slice(x.id.indexOf(':') + 1);
  const jogarCom = (x: Baralho) => {
    setFolha(false);
    if (x.g === 'sessao') return aoNavegar('play', { id: idDe(x) });
    gravarFiltro(
      x.g === 'anki'
        ? { ...FILTRO_PADRAO, fontes: ['baralho'], baralhos: [idDe(x)] }
        : x.g === 'trilha'
          ? { ...FILTRO_PADRAO, fontes: ['trilha'] }
          : x.g === 'idioma'
            ? { ...FILTRO_PADRAO, idiomas: [idDe(x)] }
            : FILTRO_PADRAO,
    );
    aoNavegar('play');
  };
  const ativarMais = async (x: Baralho) => {
    const quantas = Math.min(20, x.porAtivar ?? 0);
    if (!quantas) return;
    setAtivando(true);
    try {
      const r = await ativarNotasDoBaralho(idDe(x), quantas);
      toast.ok(
        tp(r.ativadas, '{n} nota de “{nome}” entrou como nova.', '{n} notas de “{nome}” entraram como novas.', {
          nome: x.nome,
        }),
      );
      setDoAnki(await listarBaralhosAnki());
      aoMudou();
    } catch (e) {
      toast.error(t('Não consegui ativar as notas.'), { detail: e });
    } finally {
      setAtivando(false);
    }
  };

  /** O detalhe do baralho escolhido (`ctDetalheDoBaralho`, `cartoes.js:304-319`). */
  const corpoDoDetalhe = (x: Baralho) => {
    const soma = x.n.novas + x.n.aprendendo + x.n.revisar;
    /* A revisão aceita dois recortes hoje: o baralho inteiro e uma sessão. */
    const revisavel = x.g === 'tudo' || x.g === 'sessao';
    const fatos: Array<[string, string]> = [
      [t('Cartões'), x.de ? t('{n} de {total}', { n: numero(x.total), total: numero(x.de) }) : numero(x.total)],
      [t('A revisar'), numero(x.n.revisar)],
      [t('Aprendendo'), numero(x.n.aprendendo)],
      [t('Novas hoje'), numero(x.n.novas)],
    ];
    const botaoDeJogar = (pri: boolean) => (
      <button type="button" className={`q-ctl ${pri ? 'pri' : ''}`} onClick={() => jogarCom(x)}>
        <Gamepad2 aria-hidden /> {t('Jogar com este')}
      </button>
    );
    const verCartoes =
      x.g === 'tudo' ? (
        <button type="button" className="q-ctl" onClick={() => aoIrAba('palavras')}>
          <BookOpen aria-hidden /> {t('Ver cartões')}
        </button>
      ) : x.g === 'anki' ? (
        <button type="button" className="q-ctl" onClick={aoGerenciarAnki}>
          <BookOpen aria-hidden /> {t('Ver cartões')}
        </button>
      ) : null;
    return (
      <>
        <div className="q-bib-topo">
          <span className="q-ic">
            <x.Icone aria-hidden />
          </span>
          <div>
            <p className="q-bib-tags">
              <span className="q-tag">{x.tipo}</span>
              {x.idioma && x.g !== 'idioma' && <span className="q-tag off">{nomeDoIdioma(x.idioma)}</span>}
            </p>
            <h2>{x.nome}</h2>
          </div>
        </div>
        <dl className="q-bib-fatos">
          {fatos.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="q-bib-acoes" role="toolbar" aria-label={t('O que fazer com este baralho')}>
          {revisavel ? (
            <button
              type="button"
              className="q-ctl pri"
              disabled={!soma}
              onClick={() => {
                setFolha(false);
                aoEstudar(x.g === 'sessao' ? { id: idDe(x) } : undefined);
              }}
            >
              <Target aria-hidden /> {soma ? t('Revisar este · {n}', { n: numero(soma) }) : t('Nada vence aqui hoje')}
            </button>
          ) : (
            botaoDeJogar(true)
          )}
          {(revisavel || verCartoes) && (
            <div className="q-acoes">
              {revisavel && botaoDeJogar(false)}
              {/* "Praticar de outro jeito" sobre este baralho (`ctOutroJeito`, `cartoes.js:195`): a folha das
                  práticas abre na revisão com o recorte (`lib/revisao/pratica.ts`). */}
              {revisavel && (
                <button
                  type="button"
                  className="q-ctl"
                  onClick={() => {
                    setFolha(false);
                    aoNavegar('study', {
                      praticar: {
                        origem: 'baralho',
                        rotulo: x.nome,
                        ...(x.g === 'sessao' ? { sessionId: idDe(x) } : {}),
                      },
                    });
                  }}
                >
                  <Sparkles aria-hidden /> {t('Praticar de outro jeito')}
                </button>
              )}
              {verCartoes}
            </div>
          )}
          <div className="q-acoes q-bib-cuidar">
            {x.g === 'anki' && !!x.porAtivar && (
              <button type="button" className="q-ctl" disabled={ativando} onClick={() => void ativarMais(x)}>
                <Plus aria-hidden /> {t('Ativar mais {n}', { n: Math.min(20, x.porAtivar) })}
              </button>
            )}
            {x.g === 'sessao' && (
              <button type="button" className="q-ctl" onClick={() => aoNavegar('analysis', { id: idDe(x) })}>
                <ExternalLink aria-hidden /> {t('Abrir a sessão')}
              </button>
            )}
            {x.g === 'anki' && (
              <button type="button" className="q-ctl" onClick={aoGerenciarAnki}>
                <SlidersHorizontal aria-hidden /> {t('Gerenciar')}
              </button>
            )}
            {x.g === 'tudo' && (
              <button type="button" className="q-ctl" onClick={() => aoIrAba('trazer')}>
                <Download aria-hidden /> {t('Exportar')}
              </button>
            )}
          </div>
        </div>
      </>
    );
  };

  const grupo = (g: Grupo, titulo: string, sub: string, extra?: React.ReactNode) => {
    const l = baralhos.filter((x) => x.g === g);
    if (!l.length) return null;
    return (
      <section className="q-secao ct-grupo">
        <header>
          <div>
            <h3>{titulo}</h3>
            {sub && <p>{sub}</p>}
          </div>
          {extra}
        </header>
        <div className="q-lista">
          {l.map((x) => (
            <Linha key={x.id} b={x} escolhido={x.id === b.id} aoEscolher={() => escolher(x.id)} />
          ))}
        </div>
      </section>
    );
  };
  const escolher = (id: string) => {
    setEscolhido(id);
    /* No celular o detalhe sobe como folha: o painel ao lado não cabe (`ctFolhaDoBaralho`, `cartoes.js:1051`). */
    if (estreito) setFolha(true);
  };
  const dasSessoes = baralhos
    .filter((x) => x.g === 'sessao')
    .reduce<ContagemDeFila>(
      (s, x) => ({
        novas: s.novas + x.n.novas,
        aprendendo: s.aprendendo + x.n.aprendendo,
        revisar: s.revisar + x.n.revisar,
      }),
      ZERO,
    );

  return (
    <>
      <div className="q-acoes ct-legenda">
        <span className="q-rotulo">{t('Em cada linha')}</span>
        <span className="q-tag ct-nv">{t('novas')}</span>
        <span className="q-tag ct-ap">{t('aprendendo')}</span>
        <span className="q-tag ct-rv">{t('a revisar')}</span>
        <span className="q-espaco" />
        <button type="button" className="q-chip" onClick={() => aoIrAba('trazer')}>
          <Upload aria-hidden /> {t('Trazer do Anki')}
        </button>
      </div>
      <div className="ct-bar-corpo">
        <div className="ct-bar-col">
          <div className="q-lista">
            <Linha b={baralhos[0]} escolhido={b.id === 'tudo'} aoEscolher={() => escolher('tudo')} />
          </div>
          {grupo('idioma', t('Por idioma'), '')}
          {grupo(
            'sessao',
            t('Das minhas sessões'),
            t('Cada gravação vira um baralho, com a frase de cada palavra.'),
            <span className="q-chip ct-chip-tres">
              <Tres n={dasSessoes} />
            </span>,
          )}
          {grupo('trilha', t('Trilha'), '')}
          {grupo('anki', t('Do Anki'), t('Trazidos de arquivos .apkg. A agenda recomeça aqui.'))}
          <button type="button" className="q-linha q-bib-nova ct-novo-baralho" onClick={() => aoIrAba('trazer')}>
            <span className="q-bib-nova-dentro">
              <span className="q-ic">
                <Upload aria-hidden />
              </span>
              <span>
                <b>{t('Trazer outro baralho')}</b>
                <small>{t('Arquivo .apkg do Anki, texto ou CSV.')}</small>
              </span>
            </span>
          </button>
        </div>
        <section
          ref={detalhe}
          className="q-cartao q-bib-det ct-bar-det"
          aria-label={t('Baralho selecionado')}
          data-testid="baralho-selecionado"
        >
          {corpoDoDetalhe(b)}
        </section>
      </div>
      {folha && estreito && (
        <FolhaDeBaixo titulo={b.nome} doPrototipo classe="ct-folha-baralho" aoFechar={() => setFolha(false)}>
          <div className="ct-bar-det ct-na-folha">{corpoDoDetalhe(b)}</div>
        </FolhaDeBaixo>
      )}
    </>
  );
}
