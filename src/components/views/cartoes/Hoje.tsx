import {
  ArrowLeftRight,
  Brain,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  FileText,
  Gamepad2,
  GraduationCap,
  Headphones,
  Layers,
  Lightbulb,
  Mic,
  PartyPopper,
  Plus,
  Target,
  Timer,
  Upload,
  Youtube,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { ResumoDosCartoes } from '../../../core/learning/resumoDosCartoes';
import {
  diasAPartirDeAmanha,
  type Hoje as EstadoDoDia,
  porcentoDeLembradas,
  proximaAbertura,
} from '../../../lib/cartoes/estadoDeHoje';
import { numero, t, tp } from '../../../lib/i18n';
import { anima, contar, MOLA, MOLA_SUAVE, polido, reduz } from '../../../lib/polimento/base';
import type { AbaDeCartoes } from '../../../lib/rotas';
import type { Recording } from '../../../types';
import { CabecaDoCartao, diaCurto, Tres } from './pecas';

/**
 * A ABA "HOJE" — porte de `ctHoje` (`cartoes.js:194-298`), com o dado de `GET /api/vocab/resumo`.
 *
 * Os cinco estados do protótipo (normal, vazio, primeiras palavras, dia cumprido, pilha) saem do dado
 * (`lib/cartoes/estadoDeHoje`). O que o protótipo mostra e o app ainda não faz de verdade NÃO está aqui
 * (`fidelidade/ficou-de-fora.md`, "Cartões: fatias seguintes"): a sequência com congelamento, o teto
 * contado por dia, as quatro saídas da pilha, "Só as difíceis", o tempo estimado e o estudo livre.
 */

export interface PedidoDeEstudo {
  /** A sessão que recorta a rodada. */
  id?: string;
  limite?: number;
  soNovas?: boolean;
}

const iconeDaSessao = (tipo: Recording['type'] | undefined) =>
  tipo === 'video' ? Youtube : tipo === 'document' ? FileText : Headphones;

/** "amanhã" ou "em N dias": quando a próxima revisão abre. */
const quando = (emDias: number): string => (emDias === 1 ? t('amanhã') : t('em {n} dias', { n: emDias }));

/** O cartão da retenção da semana (`ctTresCartoes`, o do meio: `cartoes.js:209-212`). */
function Retencao({
  resumo,
  meta,
  aoVerMemoria,
}: {
  resumo: ResumoDosCartoes;
  meta: number;
  aoVerMemoria: () => void;
}) {
  const semana = porcentoDeLembradas(resumo.retencao.d7);
  const mes = porcentoDeLembradas(resumo.retencao.d30);
  const nota =
    semana === null
      ? t('Sem revisão nos últimos sete dias: o número aparece depois da próxima rodada.')
      : [
          semana >= meta
            ? t('Dentro da meta.')
            : tp(meta - semana, '{n} ponto abaixo da meta.', '{n} pontos abaixo da meta.'),
          mes === null ? '' : t('Nos últimos 30 dias ficou em {n}%.', { n: mes }),
        ]
          .filter(Boolean)
          .join(' ');
  return (
    <section className="q-cartao ct-ret" data-testid="retencao-da-semana">
      <CabecaDoCartao
        titulo={t('Retenção da semana')}
        sub={t('Do que você revisou, quanto lembrou.')}
        extra={
          <span className="q-ic" aria-hidden="true">
            <Brain />
          </span>
        }
      />
      <div className="ct-ret-corpo">
        <div className="px-anel" style={{ ['--pct' as string]: semana ?? 0 }} data-pct={semana ?? undefined}>
          <b>{semana === null ? '—' : `${semana}%`}</b>
          <span>{t('meta {n}%', { n: meta })}</span>
        </div>
        <p className="qv-nota">{nota}</p>
      </div>
      <button type="button" className="q-ctl" onClick={aoVerMemoria}>
        <ChartColumn aria-hidden /> {t('Ver a memória')}
      </button>
    </section>
  );
}

/** "Os próximos dias": sete barras a partir de amanhã (`ctPrevisao7`, `cartoes.js:219-225`). */
function Previsao7({ resumo, aoVer30 }: { resumo: ResumoDosCartoes; aoVer30: () => void }) {
  const valores = resumo.previsao.slice(1, 8);
  const dias = diasAPartirDeAmanha(resumo.inicioDoDia, valores.length).map(diaCurto);
  const maior = Math.max(1, ...valores);
  return (
    <section className="q-cartao ct-prev7" data-testid="previsao-dos-proximos-dias">
      <CabecaDoCartao
        titulo={t('Os próximos dias')}
        sub={t('Quantos cartões voltam em cada dia; a barra destacada é amanhã.')}
        extra={
          <button type="button" className="q-ctl" onClick={aoVer30}>
            <CalendarDays aria-hidden /> {t('Ver 30 dias')}
          </button>
        }
      />
      <div
        className="qv-barras"
        role="img"
        aria-label={t('Previsão: {lista}', { lista: valores.map((v, i) => `${dias[i]} ${v}`).join(', ') })}
      >
        {valores.map((v, i) => (
          <div key={i} className="qv-col">
            <b>{v}</b>
            <span
              className={`qv-barra ${i === 0 ? 'hoje' : ''}`}
              style={{ height: Math.max(4, Math.round((v / maior) * 120)) }}
            />
            <small>{dias[i]}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Os três caminhos de quem começa (`cartoes.js:241-245, 255-259`). */
function TresCaminhos({
  primeiro,
  aoCapturar,
  aoTrazer,
  aoTrilha,
}: {
  /** Já há cartões: os mesmos caminhos, com as frases de quem está continuando. */
  primeiro: boolean;
  aoCapturar: () => void;
  aoTrazer: () => void;
  aoTrilha: () => void;
}) {
  return (
    <div className="q-grade g3 ct-tres-caminhos">
      <button type="button" className={`q-tile ${primeiro ? '' : 'pri'}`} onClick={aoCapturar}>
        <span className="q-ic">
          <Mic aria-hidden />
        </span>
        <b>{primeiro ? t('Capturar outra sessão') : t('Capturar uma sessão')}</b>
        <span className="q-d">
          {primeiro
            ? t('Mais palavras, com a frase de onde vieram.')
            : t('Toque numa palavra da legenda e ela vira cartão, com a frase de onde veio.')}
        </span>
      </button>
      <button type="button" className="q-tile" onClick={aoTrazer}>
        <span className="q-ic">
          <Upload aria-hidden />
        </span>
        <b>{t('Trazer um baralho do Anki')}</b>
        <span className="q-d">
          {primeiro
            ? t('Arquivo .apkg, com o relatório do que vem.')
            : t('Arquivo .apkg. A tela diz o que vem e o que não vem.')}
        </span>
      </button>
      <button type="button" className="q-tile" onClick={aoTrilha}>
        <span className="q-ic">
          <GraduationCap aria-hidden />
        </span>
        <b>{primeiro ? t('Jogar com a Trilha') : t('Começar pela Trilha')}</b>
        <span className="q-d">{t('As palavras mais usadas, em ordem. As que você joga viram cartões.')}</span>
      </button>
    </div>
  );
}

export default function Hoje({
  resumo,
  dia,
  metaDeRetencao,
  sessoes,
  aoEstudar,
  aoIrAba,
  aoNavegar,
  aoTrilha,
}: {
  /** `null` no estado vazio (sem conta, ou nenhum cartão). */
  resumo: ResumoDosCartoes | null;
  dia: EstadoDoDia;
  metaDeRetencao: number;
  sessoes: Recording[];
  aoEstudar: (pedido?: PedidoDeEstudo) => void;
  aoIrAba: (aba: AbaDeCartoes) => void;
  aoNavegar: (view: string) => void;
  aoTrilha: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);

  /* O MOVIMENTO DE ENTRADA do que é desta aba (`ctEntrada` e `ctDepoisDePintar`, `cartoes.js:602-629`):
     as barras crescem, o anel enche e o número grande conta. Uma vez por estado. */
  useEffect(() => {
    const el = raiz.current;
    if (!el || !polido() || reduz()) return;
    const anel = el.querySelector<HTMLElement>('.ct-ret .px-anel[data-pct]');
    if (anel) {
      const b = anel.querySelector('b');
      const ate = Number(anel.dataset.pct);
      contar(
        (v) => {
          if (b) b.textContent = `${v}%`;
          anel.style.setProperty('--pct', String(v));
        },
        0,
        ate,
        1100,
      );
    }
    el.querySelectorAll('.qv-barras .qv-barra').forEach((x, k) =>
      anima(x, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
        d: 760,
        atraso: 320 + k * 60,
        e: MOLA_SUAVE,
      }),
    );
    const c = el.querySelector<HTMLElement>('.ct-hoje .qv-contagem');
    if (c && /^\d+$/.test(c.textContent ?? '')) {
      const ate = Number(c.textContent);
      contar((v) => (c.textContent = String(v)), 0, ate, 900);
    }
    /* Dia cumprido: comemoração contida, uma vez, só no ícone. */
    const festa = el.querySelector('.ct-feito .q-ic');
    if (festa)
      anima(festa, [{ transform: 'scale(0.4) rotate(-20deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
        d: 760,
        atraso: 260,
        e: MOLA,
      });
  }, [dia.estado]);

  if (dia.estado === 'vazio' || !resumo) {
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="vazio">
        <div className="q-vazio ct-vazio">
          <span className="q-ic">
            <Brain aria-hidden />
          </span>
          <h2>{t('Seus cartões aparecem aqui')}</h2>
          <p>
            {t(
              'Cada palavra que você guarda vira um cartão, e o app traz de volta na hora em que você estaria esquecendo. Há três jeitos de começar:',
            )}
          </p>
        </div>
        <TresCaminhos
          primeiro={false}
          aoCapturar={() => aoNavegar('capture')}
          aoTrazer={() => aoIrAba('trazer')}
          aoTrilha={aoTrilha}
        />
        <div className="q-aviso">
          <span className="qv-aviso-texto">
            <Lightbulb aria-hidden />
            <span>{t('Também dá para adicionar uma palavra de cada vez, em "Palavra", no alto da tela.')}</span>
          </span>
          <button type="button" className="q-ctl" onClick={() => aoIrAba('trazer')}>
            <ArrowLeftRight aria-hidden /> {t('Trazer e levar')}
          </button>
        </div>
      </div>
    );
  }

  const verMemoria = () => aoIrAba('memoria');
  const numeros = (
    <div className="q-grade g3 ct-tres-cartoes ct-ret-e-previsao">
      <Retencao resumo={resumo} meta={metaDeRetencao} aoVerMemoria={verMemoria} />
      <Previsao7 resumo={resumo} aoVer30={verMemoria} />
    </div>
  );

  if (dia.estado === 'primeiro') {
    /* A primeira rodada: dez, ou todas se forem menos. */
    const comecar = Math.min(10, resumo.total);
    const todasDeSessao = resumo.baralhos.anki.length === 0 && !resumo.baralhos.trilha;
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="primeiro">
        <div className="q-cartao qv-convite ct-hoje" data-testid="convite-de-hoje">
          <span className="qv-contagem">{numero(resumo.total)}</span>
          <div>
            <h2>
              {todasDeSessao
                ? tp(
                    resumo.total,
                    'Sua {n} palavra das sessões já é cartão',
                    'Suas {n} palavras das sessões já são cartões',
                    { n: numero(resumo.total) },
                  )
                : tp(resumo.total, 'Sua {n} palavra já é cartão', 'Suas {n} palavras já são cartões', {
                    n: numero(resumo.total),
                  })}
            </h2>
            <p>
              {resumo.total > 10
                ? t('Comece por 10. Não precisa acertar tudo.')
                : t('Comece agora. Não precisa acertar tudo.')}
            </p>
          </div>
          <button type="button" className="q-ctl pri" onClick={() => aoEstudar({ limite: comecar })}>
            <Target aria-hidden /> {resumo.total > 10 ? t('Começar por 10') : t('Começar')}
          </button>
        </div>
        <section className="q-cartao">
          <CabecaDoCartao titulo={t('Como funciona')} sub={t('Três passos, e o app cuida da agenda.')} />
          <ol className="q-passos">
            <li>
              <span>1</span>
              {t('Você vê a palavra na frase de onde ela veio e tenta lembrar o que quer dizer.')}
            </li>
            <li>
              <span>2</span>
              {t('Mostra a resposta e diz como foi: errei, difícil, bom ou fácil.')}
            </li>
            <li>
              <span>3</span>
              {t('A palavra volta quando estiver quase saindo da memória: amanhã, em quatro dias, em duas semanas.')}
            </li>
          </ol>
        </section>
        <TresCaminhos
          primeiro
          aoCapturar={() => aoNavegar('capture')}
          aoTrazer={() => aoIrAba('trazer')}
          aoTrilha={aoTrilha}
        />
      </div>
    );
  }

  if (dia.estado === 'feito') {
    const proxima = proximaAbertura(resumo.previsao);
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="feito">
        <div className="q-cartao fundo qr-fecho ct-feito" data-testid="convite-de-hoje">
          <span className="q-ic">
            <PartyPopper aria-hidden />
          </span>
          <div>
            <h2>{t('Tudo em dia')}</h2>
            <p>
              {resumo.revisadasHoje > 0
                ? tp(resumo.revisadasHoje, 'Você estudou {n} cartão hoje.', 'Você estudou {n} cartões hoje.')
                : t('Nada vence agora.')}{' '}
              {proxima
                ? t('A próxima abre {quando} com {n}.', { quando: quando(proxima.emDias), n: numero(proxima.n) })
                : t('Nada volta nos próximos 30 dias.')}
            </p>
          </div>
        </div>
        <div className="q-acoes ct-depois-do-dia">
          <button type="button" className="q-ctl pri" onClick={() => aoNavegar('play')}>
            <Gamepad2 aria-hidden /> {t('Jogar')}
          </button>
          {resumo.guardadas > 0 && (
            <button
              type="button"
              className="q-ctl"
              onClick={() => aoEstudar({ soNovas: true, limite: Math.min(5, resumo.guardadas) })}
            >
              <Plus aria-hidden /> {tp(Math.min(5, resumo.guardadas), 'Mais {n} nova', 'Mais {n} novas')}
            </button>
          )}
        </div>
        {numeros}
      </div>
    );
  }

  const tags = (
    <p className="ct-tags-do-dia">
      <span className="q-tag ct-rv">{t('{n} a rever', { n: numero(resumo.hoje.revisar) })}</span>
      <span className="q-tag ct-ap">{t('{n} aprendendo', { n: numero(resumo.hoje.aprendendo) })}</span>
      <span className="q-tag ct-nv">
        {tp(resumo.hoje.novas, '{n} nova', '{n} novas', { n: numero(resumo.hoje.novas) })}
      </span>
    </p>
  );

  if (dia.estado === 'pilha') {
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="pilha">
        <div className="q-cartao qv-convite ct-hoje" data-testid="convite-de-hoje">
          <span className="qv-contagem">{numero(dia.vencem)}</span>
          <div>
            <h2>
              {dia.rodada > 0
                ? t('Você tem {n} esperando. Vamos de {rodada} agora?', {
                    n: numero(dia.vencem),
                    rodada: numero(dia.rodada),
                  })
                : t('Você tem {n} esperando.', { n: numero(dia.vencem) })}
            </h2>
            <p>{t('Começando pelas que venceram há mais tempo. O resto espera sem pressa.')}</p>
            {tags}
          </div>
          <button type="button" className="q-ctl pri" onClick={() => aoEstudar()}>
            <Target aria-hidden />{' '}
            {dia.rodada > 0 ? t('Estudar {n} agora', { n: numero(dia.rodada) }) : t('Estudar agora')}
          </button>
        </div>
        <div className="q-acoes ct-recortes" role="group" aria-label={t('Outros jeitos de estudar hoje')}>
          <button type="button" className="q-chip" onClick={() => aoEstudar({ limite: 10 })}>
            <Timer aria-hidden /> {t('Só 10 agora')}
          </button>
          <button type="button" className="q-chip" onClick={() => aoIrAba('baralhos')}>
            <Layers aria-hidden /> {t('Escolher um baralho')}
          </button>
        </div>
        {numeros}
      </div>
    );
  }

  /* As duas sessões mais recentes que têm cartão (`ctDaLegenda`, `cartoes.js:226-233`). */
  const daLegenda = resumo.baralhos.sessoes
    .map((b) => ({ b, sessao: sessoes.find((s) => s.id === b.id) }))
    .filter((x): x is { b: typeof x.b; sessao: Recording } => !!x.sessao)
    .slice(0, 2);

  return (
    <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="normal">
      <div className="q-cartao qv-convite ct-hoje" data-testid="convite-de-hoje">
        <span className="qv-contagem">{numero(dia.vencem)}</span>
        <div>
          <h2>{t('Para estudar agora')}</h2>
          <p>{t('Começa pelas que estão para sair da memória.')}</p>
          {tags}
        </div>
        <button type="button" className="q-ctl pri" onClick={() => aoEstudar()}>
          <Target aria-hidden /> {t('Estudar agora')}
        </button>
      </div>
      <div className="q-acoes ct-recortes" role="group" aria-label={t('Outros jeitos de estudar hoje')}>
        {dia.rodada > 10 && (
          <button type="button" className="q-chip" onClick={() => aoEstudar({ limite: 10 })}>
            <Timer aria-hidden /> {t('Só 10 agora')}
          </button>
        )}
        <button type="button" className="q-chip" onClick={() => aoIrAba('baralhos')}>
          <Layers aria-hidden /> {t('Escolher um baralho')}
        </button>
      </div>
      {numeros}
      {daLegenda.length > 0 && (
        <section className="q-secao" data-testid="nasceu-da-legenda">
          <header>
            <div>
              <h2>{t('Nasceu da legenda')}</h2>
              <p>{t('O que você tocou nas últimas sessões já é cartão, com a frase de onde veio.')}</p>
            </div>
          </header>
          <div className="q-lista">
            {daLegenda.map(({ b, sessao }) => {
              const Icone = iconeDaSessao(sessao.type);
              return (
                <button key={b.id} type="button" className="q-linha ct-linha-b" onClick={() => aoEstudar({ id: b.id })}>
                  <span className="q-ic">
                    <Icone aria-hidden />
                  </span>
                  <span>
                    <b>{sessao.title}</b>
                    <small>
                      {tp(b.total, '{n} palavra virou cartão', '{n} palavras viraram cartões')} · {sessao.date}
                    </small>
                  </span>
                  <Tres n={b} />
                  <span className="q-fim">
                    {t('Estudar')} <ChevronRight aria-hidden />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
