import {
  Brain,
  Check,
  ChevronRight,
  Flame,
  Gamepad2,
  GraduationCap,
  Languages,
  Mic,
  PartyPopper,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

import type { ContagensDeConteudo, FonteContada } from '../../../core/learning/contagensDeConteudo';
import type { ContagemDeFila, ResumoDosCartoes } from '../../../core/learning/resumoDosCartoes';
import {
  type Hoje as EstadoDoDia,
  porcentoDeLembradas,
  proximaAbertura,
  semanaDeEstudo,
} from '../../../lib/cartoes/estadoDeHoje';
import { type HojeDaFonte, somaDaFila } from '../../../lib/conteudo/cartoes';
import type { Conteudo, FonteDeConteudo } from '../../../lib/conteudo/estado';
import { numero, t, tp } from '../../../lib/i18n';
import { anima, contar, MOLA, MOLA_SUAVE, polido, reduz } from '../../../lib/polimento/base';
import type { OpcoesDaRevisao } from '../../../lib/revisao/preferencias';
import { iconeDaFonte, nomeDoIdioma as nomeDoIdiomaDoConteudo } from '../../conteudo/fontes';
import { CabecaDoCartao, diaCurto, Dica, Tres } from './pecas';

/**
 * A ABA "HOJE", NO MODO FAIXA — porte de `ctHoje`, `ctFaixaDeEstado`, `ctAtalhos`, `ctContinuar` e
 * `ctSemana` (`cartoes.js:212-359` do protótipo enxuto), com o dado de `GET /api/vocab/resumo` e de
 * `GET /api/vocab/conteudo`. Tudo RESPEITA O CONTEÚDO ESCOLHIDO na ficha: o número do dia, as três
 * contagens e a rodada são os da fonte (`lib/conteudo/cartoes.ts`).
 *
 * Os cinco estados (normal, vazio, primeiras palavras, dia cumprido, pilha) saem do dado
 * (`lib/cartoes/estadoDeHoje`). O que o protótipo mostra e o app não faz de verdade NÃO está aqui: o
 * tempo estimado ("uns 5 min": a revisão não mede tempo por cartão), o congelamento da sequência, o
 * "Estudo livre" fora da agenda e a volta de cada baralho ("volta amanhã com 3").
 */

export interface PedidoDeEstudo {
  /** A fonte que recorta a rodada; sem ela, o conteúdo escolhido na ficha. */
  fonte?: FonteDeConteudo;
  limite?: number;
  soNovas?: boolean;
}

/** "amanhã" ou "em N dias": quando a próxima revisão abre. */
const quando = (emDias: number): string => (emDias === 1 ? t('amanhã') : t('em {n} dias', { n: emDias }));

/** Os últimos sete dias (`ctSemana`, `cartoes.js:214-220`), pelo calendário de revisões. */
export function Semana({ resumo }: { resumo: Pick<ResumoDosCartoes, 'calendario' | 'inicioDoDia'> }) {
  const dias = semanaDeEstudo(resumo.calendario, resumo.inicioDoDia);
  const dica = { feito: t('Estudou'), fora: t('Sem estudo'), hoje: t('Hoje, ainda por estudar') };
  return (
    <ol className="ct-semana" aria-label={t('Os últimos sete dias')}>
      {dias.map(({ dia, estado }, i) => (
        <li key={i} className={estado} title={dica[estado]}>
          <i>{estado === 'feito' && <Check aria-hidden />}</i>
          <small>{diaCurto(dia)}</small>
          <span className="sr">{dica[estado]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Os atalhos sob o herói (`ctAtalhos`, `cartoes.js:262`). */
function Atalhos({
  rotulo,
  quebra = false,
  itens,
}: {
  rotulo: string;
  /** Os rótulos podem quebrar em duas linhas no celular (`ct-quebra`). */
  quebra?: boolean;
  itens: Array<{ chave: string; icone: ReactNode; rotulo: string; dica?: string; acao: () => void } | false>;
}) {
  const l = itens.filter((x): x is Exclude<typeof x, false> => !!x);
  if (!l.length) return null;
  return (
    <div className={`ct-atalhos ${quebra ? 'ct-quebra' : ''}`.trim()} role="group" aria-label={rotulo}>
      {l.map((a) => (
        <button
          key={a.chave}
          type="button"
          className="q-chip ct-atalho"
          data-ct-atalho={a.chave}
          title={a.dica}
          onClick={a.acao}
        >
          {a.icone}
          <span>{a.rotulo}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * A FAIXA DE ESTADO (`ctFaixaDeEstado`, `cartoes.js:240-252`): a chama, o anel e a barra de novas numa
 * linha. O lado da memória abre a Memória; o lado das novas abre os ajustes.
 *
 * O que cada número é, de verdade: a sequência é a ofensiva do perfil (dias de prática seguidos); o anel
 * é a retenção medida nos últimos sete dias; a barra são as novas que entram na rodada de agora, contra
 * o limite de novas das opções da revisão.
 */
function FaixaDeEstado({
  resumo,
  sequencia,
  novasNaFila,
  limiteDeNovas,
  aoMemoria,
  aoAjustes,
}: {
  resumo: ResumoDosCartoes;
  sequencia: number | null;
  novasNaFila: number;
  limiteDeNovas: number;
  aoMemoria: () => void;
  aoAjustes: () => void;
}) {
  const semana = porcentoDeLembradas(resumo.retencao.d7);
  const novas = Math.min(novasNaFila, limiteDeNovas);
  const dias = sequencia ?? 0;
  const rotuloDaMemoria = [
    tp(dias, '{n} dia seguido', '{n} dias seguidos'),
    semana === null ? t('sem revisão nos últimos sete dias') : t('{n}% lembrado na semana', { n: semana }),
  ].join(', ');
  return (
    <div
      className="q-cartao ct-estado"
      role="group"
      aria-label={t('Como está a sua memória')}
      data-testid="faixa-de-estado"
    >
      <button
        type="button"
        className="ct-estado-mem"
        aria-label={t('{resumo}. Abrir a Memória', { resumo: rotuloDaMemoria })}
        title={t('Abrir a Memória: sequência, retenção, previsão e calendário')}
        onClick={aoMemoria}
      >
        <span className="ct-estado-item ct-chama">
          <i>
            <Flame aria-hidden />
          </i>
          <b>{tp(dias, '{n} dia', '{n} dias')}</b>
        </span>
        <span className="ct-estado-item ct-ret">
          <span
            className="px-anel ct-anel-mini"
            style={{ ['--pct' as string]: semana ?? 0 }}
            data-pct={semana ?? undefined}
            aria-hidden="true"
          />
          <b data-ct-ret>{semana === null ? '—' : `${semana}%`}</b>
        </span>
        <span className="ct-estado-ir">
          <span>{t('Memória')}</span>
          <ChevronRight aria-hidden />
        </span>
      </button>
      <button
        type="button"
        className="ct-estado-teto"
        aria-label={t('{n} de {total} novas hoje. Mudar o limite do dia', { n: novas, total: limiteDeNovas })}
        title={t('Mudar o limite do dia')}
        onClick={aoAjustes}
      >
        <span
          className="q-barra"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limiteDeNovas}
          aria-valuenow={novas}
          aria-label={t('Novas de hoje')}
        >
          <span style={{ width: `${limiteDeNovas ? Math.round((novas / limiteDeNovas) * 100) : 0}%` }} />
        </span>
        <b>{t('{n} de {total}', { n: novas, total: limiteDeNovas })}</b>
        <small>{t('novas')}</small>
        <SlidersHorizontal aria-hidden />
      </button>
    </div>
  );
}

/** Uma fonte para "Continuar por baralho": o que o catálogo contou e as três fases do resumo. */
interface FonteParaContinuar {
  fonte: FonteDeConteudo;
  nome: string;
  tipo: string | null;
  /** "3 out", ou "Anki". */
  deOnde: string;
  palavras: number;
  n: ContagemDeFila;
}

const diaEMesCurto = (ms: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' }).replace('.', '')}`;
};

/**
 * AS FONTES DE "CONTINUAR POR BARALHO" (`ctContinuar`, `cartoes.js:264-266`): as duas sessões mais
 * recentes e o maior baralho do Anki. Com `soComFila`, só as que têm o que estudar agora.
 */
function fontesParaContinuar(
  contagens: ContagensDeConteudo | null,
  resumo: ResumoDosCartoes,
  soComFila: boolean,
): FonteParaContinuar[] {
  if (!contagens) return [];
  const serve = (x: FonteContada) => (soComFila ? x.paraHoje > 0 : x.palavras > 0);
  const fila = (lista: ResumoDosCartoes['baralhos']['sessoes'], x: FonteContada): ContagemDeFila => {
    const l = lista.find((b) => b.id === x.id);
    return l
      ? { novas: l.novas, aprendendo: l.aprendendo, revisar: l.revisar }
      : { novas: 0, aprendendo: 0, revisar: x.paraHoje };
  };
  const sessoes = contagens.sessoes.filter(serve).slice(0, 2);
  const anki = contagens.anki.filter(serve).slice(0, 3 - sessoes.length);
  return [
    ...sessoes.map(
      (s): FonteParaContinuar => ({
        fonte: { tipo: 'sessao', id: s.id, nome: s.nome },
        nome: s.nome || t('Sessão'),
        tipo: s.tipo,
        deOnde: diaEMesCurto(s.quando),
        palavras: s.palavras,
        n: fila(resumo.baralhos.sessoes, s),
      }),
    ),
    ...anki.map(
      (b): FonteParaContinuar => ({
        fonte: { tipo: 'anki', id: b.id, nome: b.nome },
        nome: b.nome || t('Baralho do Anki'),
        tipo: null,
        deOnde: t('Anki'),
        palavras: b.palavras,
        n: fila(resumo.baralhos.anki, b),
      }),
    ),
  ];
}

export default function Hoje({
  resumo,
  dia,
  daFonte,
  conteudo,
  contagens,
  opcoes,
  sequencia,
  aoEstudar,
  aoPraticar,
  aoMemoria,
  aoAjustes,
  aoResto,
  aoNavegar,
  aoTrilha,
  aoTrazerDoAnki,
  aoMudarIdioma,
}: {
  /** `null` no estado vazio (sem conta, ou nenhum cartão). */
  resumo: ResumoDosCartoes | null;
  dia: EstadoDoDia;
  /** O total e a fila do conteúdo escolhido. */
  daFonte: HojeDaFonte;
  conteudo: Conteudo;
  contagens: ContagensDeConteudo | null;
  opcoes: Pick<OpcoesDaRevisao, 'novas' | 'revisoes' | 'botoes'>;
  /** A ofensiva do perfil (dias de prática seguidos); `null` enquanto não chega. */
  sequencia: number | null;
  aoEstudar: (pedido?: PedidoDeEstudo) => void;
  /** "Praticar de outro jeito": a folha das práticas sobre a fonte (ou sobre o conteúdo da ficha). */
  aoPraticar: (rotulo: string, origem: 'hoje' | 'baralho', fonte?: FonteDeConteudo) => void;
  aoMemoria: () => void;
  aoAjustes: () => void;
  /** A folha "E o resto?" da pilha acumulada. */
  aoResto: () => void;
  aoNavegar: (view: string) => void;
  aoTrilha: () => void;
  aoTrazerDoAnki: () => void;
  aoMudarIdioma: (idioma: string) => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);

  /* O MOVIMENTO DE ENTRADA do que é desta aba (`ctEntrada` e `ctDepoisDePintar`, `cartoes.js:602-636`):
     o anel enche, a barra de novas se abre, os dias da semana e os atalhos entram, o número grande conta.
     Uma vez por estado e por conteúdo. */
  const chave = `${dia.estado}|${conteudo.idioma}|${conteudo.fonte.tipo}|${'id' in conteudo.fonte ? conteudo.fonte.id : ''}`;
  useEffect(() => {
    const el = raiz.current;
    if (!el || !polido() || reduz()) return;
    const anel = el.querySelector<HTMLElement>('.ct-ret .px-anel[data-pct]');
    if (anel) {
      const b = el.querySelector('[data-ct-ret]');
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
    el.querySelectorAll('.q-barra > span').forEach((s, k) =>
      anima(s, [{ clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0 0 0 round 999px)' }], {
        d: 900,
        atraso: 380 + k * 90,
      }),
    );
    el.querySelectorAll('.ct-semana li i').forEach((x, k) =>
      anima(x, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { d: 520, atraso: 300 + k * 55, e: MOLA }),
    );
    const c = el.querySelector<HTMLElement>('.ct-hoje .qv-contagem');
    if (c && /^\d+$/.test(c.textContent ?? '')) {
      const ate = Number(c.textContent);
      contar((v) => (c.textContent = String(v)), 0, ate, 900);
    }
    const chama = el.querySelector('.ct-chama i');
    if (chama)
      anima(chama, [{ transform: 'scale(0.3) rotate(-18deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
        d: 620,
        atraso: 420,
        e: MOLA,
      });
    el.querySelectorAll('.ct-atalho').forEach((x, k) =>
      anima(
        x,
        [
          { opacity: 0, transform: 'translateY(10px) scale(0.96)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { d: 420, atraso: 220 + k * 60 },
      ),
    );
    /* Dia cumprido: comemoração contida, uma vez, só no ícone. */
    const festa = el.querySelector('.ct-festa');
    if (festa)
      anima(festa, [{ transform: 'scale(0.4) rotate(-20deg)' }, { transform: 'scale(1) rotate(0deg)' }], {
        d: 760,
        atraso: 260,
        e: MOLA_SUAVE,
      });
  }, [chave]);

  const capturar = () => aoNavegar('capture');

  if (dia.estado === 'vazio' || !resumo) {
    /* `cartoes.js:306-313`. As frases dos ladrilhos dizem o que o app faz hoje. */
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="vazio">
        <div className="q-vazio ct-vazio">
          <span className="q-ic">
            <Brain aria-hidden />
          </span>
          <h2>{t('Seus cartões aparecem aqui')}</h2>
          <p>
            {t(
              'Cada palavra que você guarda vira um cartão, e o app traz de volta na hora em que você estaria esquecendo.',
            )}
          </p>
        </div>
        <div className="q-grade g3 ct-tres-caminhos">
          <button type="button" className="q-tile pri" onClick={capturar}>
            <span className="q-ic">
              <Mic aria-hidden />
            </span>
            <b>{t('Capturar uma sessão')}</b>
            <span className="q-d">
              {t('Toque numa palavra da legenda e ela vira cartão, com a frase de onde veio.')}
            </span>
          </button>
          <button type="button" className="q-tile" onClick={aoTrazerDoAnki}>
            <span className="q-ic">
              <Upload aria-hidden />
            </span>
            <b>{t('Trazer um baralho do Anki')}</b>
            <span className="q-d">{t('Arquivo .apkg. A tela diz o que vem e o que não vem.')}</span>
          </button>
          <button type="button" className="q-tile" onClick={aoTrilha}>
            <span className="q-ic">
              <GraduationCap aria-hidden />
            </span>
            <b>{t('Começar pela Trilha')}</b>
            <span className="q-d">{t('As palavras mais usadas, em ordem. As que você joga viram cartões.')}</span>
          </button>
        </div>
      </div>
    );
  }

  const n = daFonte.fila;
  const total = somaDaFila(n);
  const noConteudo = conteudo.fonte.tipo === 'tudo' ? t('As palavras de hoje') : t('As palavras de hoje deste conteúdo');
  const praticarHoje = () => aoPraticar(noConteudo, 'hoje');

  /* Quem estuda dois idiomas vê um por vez: o outro fica a um toque, com a contagem dele (`cartoes.js:297-299`). */
  const outro =
    conteudo.fonte.tipo === 'tudo' && contagens?.idioma
      ? resumo.baralhos.idiomas
          .filter((i) => i.id !== contagens.idioma)
          .map((i) => ({ id: i.id, n: i.novas + i.aprendendo + i.revisar }))
          .sort((a, b) => b.n - a.n)[0]
      : undefined;
  const outroIdioma = outro && outro.n > 0 && (
    <button type="button" className="ex-lig fs-outro-idioma" onClick={() => aoMudarIdioma(outro.id)}>
      <Languages aria-hidden />
      {t('{idioma} tem {n} para hoje', { idioma: nomeDoIdiomaDoConteudo(outro.id), n: numero(outro.n) })}
    </button>
  );

  const dificeisHoje = contagens?.dificeis.paraHoje ?? 0;
  const atalhosDoDia = (
    <Atalhos
      rotulo={t('Outros jeitos de estudar hoje')}
      itens={[
        total > 0 && {
          chave: 'so-10',
          icone: <Timer aria-hidden />,
          rotulo: t('Só 10'),
          dica: t('Só 10 agora'),
          acao: () => aoEstudar({ limite: 10 }),
        },
        conteudo.fonte.tipo !== 'dificeis' &&
          (contagens?.dificeis.palavras ?? 0) > 0 && {
            chave: 'dificeis',
            icone: <TriangleAlert aria-hidden />,
            rotulo: t('Difíceis · {n}', { n: numero(dificeisHoje) }),
            dica: t('Só as que você mais erra'),
            acao: () => aoEstudar({ fonte: { tipo: 'dificeis' } }),
          },
        {
          chave: 'praticar',
          icone: <Sparkles aria-hidden />,
          rotulo: t('Praticar de outro jeito'),
          dica: t('Ouvir, falar, escrever ou jogar com as palavras de hoje'),
          acao: praticarHoje,
        },
      ]}
    />
  );

  const faixa = (
    <FaixaDeEstado
      resumo={resumo}
      sequencia={sequencia}
      novasNaFila={n.novas}
      limiteDeNovas={opcoes.novas}
      aoMemoria={aoMemoria}
      aoAjustes={aoAjustes}
    />
  );

  /* "Continuar por baralho" (`ctContinuar`, `cartoes.js:263-280`): só com "Tudo" na ficha; a linha inteira
     é o botão, e um toque abre a rodada da fonte. No dia cumprido as linhas praticam. */
  const feito = dia.estado === 'feito';
  const continuar = conteudo.fonte.tipo === 'tudo' ? fontesParaContinuar(contagens, resumo, !feito) : [];
  const secaoContinuar = continuar.length > 0 && (
    <section className="q-secao ct-continuar" data-testid="continuar-por-baralho">
      <header>
        <div>
          <h2>{feito ? t('Praticar por baralho') : t('Continuar por baralho')}</h2>
        </div>
      </header>
      <div className="q-lista">
        {continuar.map((b) => {
          const Icone = iconeDaFonte(b.fonte, b.tipo);
          const paraHoje = somaDaFila(b.n);
          return (
            <button
              key={`${b.fonte.tipo}:${'id' in b.fonte ? b.fonte.id : ''}`}
              type="button"
              className="q-linha ct-linha-b ct-linha-estudar"
              aria-label={
                feito
                  ? t('Praticar de outro jeito com {nome}', { nome: b.nome })
                  : t('Estudar {nome}: {n} para hoje', { nome: b.nome, n: numero(paraHoje) })
              }
              onClick={() => (feito ? aoPraticar(b.nome, 'baralho', b.fonte) : aoEstudar({ fonte: b.fonte }))}
            >
              <span className="q-ic">
                <Icone aria-hidden />
              </span>
              <span>
                <b>{b.nome}</b>
                <small>
                  {[b.deOnde, tp(b.palavras, '{n} cartão', '{n} cartões', { n: numero(b.palavras) })]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              {!feito && <Tres n={b.n} />}
              <span className="q-fim ct-pilula">
                {feito ? <Sparkles aria-hidden /> : <Target aria-hidden />}
                <span>{feito ? t('Praticar') : t('Estudar')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  if (dia.estado === 'primeiro') {
    /* A primeira rodada: dez, ou todas se forem menos (`cartoes.js:314-331`). */
    const palavras = daFonte.total;
    const comecar = Math.min(10, Math.max(palavras, total));
    const todasDeSessao = resumo.baralhos.anki.length === 0 && !resumo.baralhos.trilha;
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="primeiro">
        <div className="q-cartao qv-convite ct-hoje" data-testid="convite-de-hoje">
          <span className="qv-contagem">{numero(palavras)}</span>
          <div>
            <h2>
              {todasDeSessao
                ? tp(palavras, 'Sua {n} palavra das sessões já é cartão', 'Suas {n} palavras das sessões já são cartões', {
                    n: numero(palavras),
                  })
                : tp(palavras, 'Sua {n} palavra já é cartão', 'Suas {n} palavras já são cartões', {
                    n: numero(palavras),
                  })}
            </h2>
            <p>
              {palavras > 10
                ? t('Comece por 10. Não precisa acertar tudo.')
                : t('Comece agora. Não precisa acertar tudo.')}
            </p>
          </div>
          <button
            type="button"
            className="q-ctl pri"
            disabled={!palavras}
            onClick={() => aoEstudar({ limite: comecar })}
          >
            <Target aria-hidden /> {palavras > 10 ? t('Começar por 10') : t('Começar')}
          </button>
        </div>
        <Atalhos
          rotulo={t('Outros jeitos de ganhar cartões')}
          quebra
          itens={[
            { chave: 'capturar', icone: <Mic aria-hidden />, rotulo: t('Capturar outra sessão'), acao: capturar },
            { chave: 'anki', icone: <Upload aria-hidden />, rotulo: t('Trazer do Anki'), acao: aoTrazerDoAnki },
            { chave: 'trilha', icone: <GraduationCap aria-hidden />, rotulo: t('Jogar com a Trilha'), acao: aoTrilha },
          ]}
        />
        <section className="q-cartao ct-como">
          <CabecaDoCartao titulo={t('Como funciona')} />
          <ol className="q-passos">
            <li>
              <span>1</span>
              {t('Você vê a palavra na frase de onde ela veio e tenta lembrar o que quer dizer.')}
            </li>
            <li>
              <span>2</span>
              {opcoes.botoes === 2
                ? t('Mostra a resposta e diz como foi: lembrei ou esqueci.')
                : t('Mostra a resposta e diz como foi: errei, difícil, bom ou fácil.')}
            </li>
            <li>
              <span>3</span>
              {t('A palavra volta quando estiver quase saindo da memória: amanhã, em quatro dias, em duas semanas.')}
            </li>
          </ol>
        </section>
        {secaoContinuar}
      </div>
    );
  }

  if (feito) {
    /* `cartoes.js:332-344`. */
    const proxima = proximaAbertura(resumo.previsao);
    const maisNovas = Math.min(5, resumo.guardadas);
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="feito">
        <div className="q-cartao qv-convite ct-hoje ct-feito" data-testid="convite-de-hoje">
          <span className="qv-contagem ct-festa">
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
            <Semana resumo={resumo} />
          </div>
          <button
            type="button"
            className="q-ctl pri"
            onClick={() =>
              aoPraticar(
                conteudo.fonte.tipo === 'tudo' ? t('Todas as suas palavras') : t('As palavras deste conteúdo'),
                'hoje',
              )
            }
          >
            <Sparkles aria-hidden /> {t('Praticar de outro jeito')}
          </button>
        </div>
        <Atalhos
          rotulo={t('O que mais dá para fazer hoje')}
          quebra
          itens={[
            maisNovas > 0 && {
              chave: 'mais-novas',
              icone: <Plus aria-hidden />,
              rotulo: tp(maisNovas, 'Mais {n} nova', 'Mais {n} novas'),
              acao: () => aoEstudar({ soNovas: true, limite: maisNovas }),
            },
            {
              chave: 'jogar',
              icone: <Gamepad2 aria-hidden />,
              rotulo: t('Jogar com as mesmas'),
              acao: () => aoNavegar('play'),
            },
          ]}
        />
        {faixa}
        {secaoContinuar}
      </div>
    );
  }

  if (dia.estado === 'pilha') {
    /* `cartoes.js:345-352`. As saídas da pilha moram na folha "E o resto?". */
    return (
      <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="pilha">
        <div className="q-cartao qv-convite ct-hoje" data-testid="convite-de-hoje">
          <span className="qv-contagem">{numero(dia.vencem)}</span>
          <div>
            <h2>
              {dia.rodada > 0
                ? t('Você tem {n} esperando. Vamos de {rodada} hoje?', {
                    n: numero(dia.vencem),
                    rodada: numero(dia.rodada),
                  })
                : t('Você tem {n} esperando.', { n: numero(dia.vencem) })}
            </h2>
            <p>
              {t('O resto espera sem pressa.')}{' '}
              <Dica
                texto={t(
                  'Começa pelas que venceram há mais tempo. O resto espera sem pressa: dia sem estudo não vira dívida.',
                )}
              />
            </p>
          </div>
          <div className="ct-hoje-acoes">
            <button type="button" className="q-ctl pri" onClick={() => aoEstudar()}>
              <Target aria-hidden />{' '}
              {dia.rodada > 0 ? t('Estudar {n} agora', { n: numero(dia.rodada) }) : t('Estudar agora')}
            </button>
            <button
              type="button"
              className="q-ctl ct-resto"
              title={t('Escolher o que fazer com as {n} que sobram', { n: numero(Math.max(0, dia.vencem - dia.rodada)) })}
              onClick={aoResto}
            >
              {t('E o resto?')}
              <small>{opcoes.novas === 0 ? t('sem novas') : t('fica no limite')}</small>
              <ChevronRight aria-hidden />
            </button>
          </div>
        </div>
        {atalhosDoDia}
        {outroIdioma}
        {faixa}
        {secaoContinuar}
      </div>
    );
  }

  /* `cartoes.js:353-358`. */
  return (
    <div ref={raiz} className="ct-hoje-estado" data-ct-hoje="normal">
      <div className="q-cartao qv-convite ct-hoje" data-testid="convite-de-hoje">
        <span className="qv-contagem">{numero(total)}</span>
        <div>
          <h2>{t('Para estudar agora')}</h2>
          <p>
            {t('Começa pelas que estão para sair da memória.')}{' '}
            <Dica texto={t('Quem erra revê a palavra na mesma rodada.')} />
          </p>
          <p className="ct-tags-do-dia">
            <span className="q-tag ct-rv">{t('{n} a rever', { n: numero(n.revisar) })}</span>
            <span className="q-tag ct-ap">{t('{n} aprendendo', { n: numero(n.aprendendo) })}</span>
            <span className="q-tag ct-nv">{tp(n.novas, '{n} nova', '{n} novas', { n: numero(n.novas) })}</span>
          </p>
        </div>
        <button type="button" className="q-ctl pri" disabled={!total} onClick={() => aoEstudar()}>
          <Target aria-hidden /> {total ? t('Estudar agora') : t('Nada vence aqui hoje')}
        </button>
      </div>
      {atalhosDoDia}
      {outroIdioma}
      {faixa}
      {secaoContinuar}
    </div>
  );
}
