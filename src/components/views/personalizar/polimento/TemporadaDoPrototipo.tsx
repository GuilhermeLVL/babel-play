/* DO MODULO, e nao do barril (achado A43): a tela só precisa da régua da temporada. */
import {
  creditoDaTemporada,
  limitesDaTemporada,
  NIVEIS_DA_TEMPORADA,
  type RecompensaDaTrilha,
  recompensaDaTrilha,
  type Trilha,
  XP_POR_NIVEL_DA_TEMPORADA,
} from '@core/temporada';
import { Check, ChevronRight, Lock, Sprout, Star } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { creditarSeeds, type TemporadaNoServidor } from '../../../../data/api';
import { data, t } from '../../../../lib/i18n';
import type { ItemDaLoja } from '../../../../lib/loja';
import { centro, comemorarResgate, irParaNivel, sentirMoeda } from '../../../../lib/polimento/personalizar';
import { perfilProtegido } from '../../../../lib/protecaoDoMenor';
import { recompensasV2Ligadas } from '../../../../lib/recompensasV2';
import { hidratarTemporada } from '../../../../lib/temporadaPosse';
import { toast } from '../../../Toast';

/**
 * TEMPORADA: A TRILHA INTEIRA, DO 1 AO 30 (`telas3.js:108-160`, que substitui `telas2.js:366-383`;
 * itens D38–D41).
 *
 * O cabeçalho com o céu e o anel do nível, o cartão do fim da trilha, e a trilha de 30 degraus com as
 * duas fileiras (Grátis em cima, Assinante embaixo) e os rótulos presos à esquerda.
 *
 * O DADO É O DO SERVIDOR (`useTemporada`): o nível e o XP são os da janela da temporada, a trilha é a
 * de `core/temporada.ts`, e "resgatado" é o crédito `temporada:<id>:<nível>:<trilha>` que o servidor já
 * confirmou. Resgatar pede esse crédito ao servidor, que confere de novo.
 */
const DIA = 86_400_000;

/** `raridade()` de `telas3.js:115`, para o que não tem raridade própria (as Seeds). */
const raridadeDoNivel = (n: number, trilha: Trilha) =>
  n === 30 && trilha === 'assinante' ? 'lendario' : n > 20 ? 'epico' : n > 10 ? 'raro' : 'comum';
const NOME_DA_RARIDADE: Record<string, string> = {
  comum: 'Comum',
  raro: 'Raro',
  epico: 'Épico',
  lendario: 'Lendário',
};

const rotuloDe = (r: RecompensaDaTrilha): string => ('seeds' in r ? t('+{n} Seeds', { n: r.seeds }) : r.nome);

export default function TemporadaDoPrototipo({
  estado,
  saldo,
  aoContarSeeds,
  aoUsar,
  aoVerPlanos,
}: {
  /** O que o servidor disse (`useTemporada`): `undefined` carregando, `null` sem resposta. */
  estado: TemporadaNoServidor | null | undefined;
  saldo: number;
  /** As Seeds do cabeçalho contam de um valor a outro (`telas2.js:605-606`). */
  aoContarSeeds: (de: number, ate: number, ms: number) => void;
  /** O prêmio que já é seu: equipa (ou abre a folha "Meu visual" na seção dele). */
  aoUsar: (item: ItemDaLoja) => void;
  aoVerPlanos: () => void;
}) {
  const atual = estado?.temporada ?? null;
  const exibida = atual ?? estado?.proxima ?? null;
  const nivel = atual ? (estado?.nivel ?? 0) : 0;
  const assinante = !!estado?.assinante;
  const protegido = perfilProtegido();
  /* O que foi resgatado nesta visita soma ao que o servidor já tinha creditado. */
  const [resgatados, setResgatados] = useState<readonly string[]>([]);
  const creditados = useMemo(() => new Set([...(estado?.creditados ?? []), ...resgatados]), [estado, resgatados]);
  const [faixa, setFaixa] = useState(0);
  const [pedindo, setPedindo] = useState<string | null>(null);
  const secao = useRef<HTMLElement>(null);

  const trilha = useMemo(
    () =>
      Array.from({ length: NIVEIS_DA_TEMPORADA }, (_, i) => ({
        n: i + 1,
        g: recompensaDaTrilha(i + 1, 'gratis', exibida?.id),
        a: recompensaDaTrilha(i + 1, 'assinante', exibida?.id),
      })),
    [exibida?.id],
  );

  if (estado === undefined)
    return (
      <p className="px-nota" data-testid="temporada">
        {t('Carregando a temporada…')}
      </p>
    );
  if (!exibida)
    return (
      <section className="q-cartao px-temporada" data-testid="temporada">
        <div className="px-ceu" aria-hidden="true" />
        <div className="px-temp-texto">
          <p className="q-rotulo">{t('Temporada')}</p>
          <p>
            {estado === null ? t('Não consegui ler a temporada agora.') : t('A próxima temporada ainda não tem data.')}
          </p>
        </div>
      </section>
    );

  const doGratis = trilha.filter((x) => x.g).length;
  const doAssinante = trilha.filter((x) => x.a).length;
  const completa = nivel >= NIVEIS_DA_TEMPORADA;
  const xp = estado?.xp ?? 0;
  const noNivel = !atual
    ? 0
    : completa
      ? XP_POR_NIVEL_DA_TEMPORADA
      : Math.max(0, xp - nivel * XP_POR_NIVEL_DA_TEMPORADA);
  const pct = Math.min(100, Math.round((noNivel / XP_POR_NIVEL_DA_TEMPORADA) * 100));
  const proxima = trilha.find((x) => x.n > nivel && x.g);
  const dia = (iso: string) => data(`${iso}T12:00:00`, { day: 'numeric', month: 'long' });
  const agora = Date.now();

  let periodo: string;
  if (atual) {
    const valores = {
      inicio: dia(atual.inicio),
      fim: dia(atual.fim),
      d: Math.max(0, Math.ceil((limitesDaTemporada(atual).fim - agora) / DIA)),
    };
    periodo = protegido
      ? t('De {inicio} a {fim}. O que você ganha não expira.', valores)
      : t('De {inicio} a {fim} · termina em {d} dias. O que você ganha não expira.', valores);
  } else {
    const valores = {
      d: Math.max(1, Math.ceil((limitesDaTemporada(exibida).inicio - agora) / DIA)),
      data: dia(exibida.inicio),
    };
    periodo = protegido
      ? t('Próxima temporada em {data}.', valores)
      : t('Próxima temporada em {d} dias, em {data}.', valores);
  }

  const nota = completa
    ? t('Trilha completa. Sobe com o XP de estudo ganho na temporada.')
    : proxima?.g
      ? t(
          '{xp} / {total} XP · faltam {falta} XP · a seguir: {item}, no nível {n}. Sobe com o XP de estudo ganho na temporada.',
          {
            xp: noNivel,
            total: XP_POR_NIVEL_DA_TEMPORADA,
            falta: XP_POR_NIVEL_DA_TEMPORADA - noNivel,
            item: rotuloDe(proxima.g),
            n: proxima.n,
          },
        )
      : t('{xp} / {total} XP · faltam {falta} XP. Sobe com o XP de estudo ganho na temporada.', {
          xp: noNivel,
          total: XP_POR_NIVEL_DA_TEMPORADA,
          falta: XP_POR_NIVEL_DA_TEMPORADA - noNivel,
        });

  const fimGratis = trilha[NIVEIS_DA_TEMPORADA - 1].g;
  const fimAssinante = trilha[NIVEIS_DA_TEMPORADA - 1].a;

  const ir = (n: number) => {
    if (secao.current) irParaNivel(secao.current, n);
  };

  /** O toque num prêmio: `telas3.js:159-160` (não alcançado) e `telas2.js:593-609` (o resto). */
  const aoTocar = async (el: HTMLElement, n: number, lado: Trilha, r: RecompensaDaTrilha) => {
    const rotulo = rotuloDe(r);
    const tranca = lado === 'assinante' && !assinante;
    if (!atual || n > nivel) {
      toast.info(
        tranca
          ? t('{rotulo}: chega no nível {n}, com a assinatura.', { rotulo, n })
          : t('{rotulo}: chega no nível {n}.', { rotulo, n }),
      );
      return;
    }
    if (tranca) {
      toast.info(t('Esta recompensa vem com a assinatura.'));
      return;
    }
    const creditoId = creditoDaTemporada(atual.id, n, lado);
    /* Já resgatado: as Seeds não têm o que fazer (`telas2.js:596`); a peça se equipa pelo toque. */
    if (creditados.has(creditoId)) {
      if (!('seeds' in r)) aoUsar(r);
      return;
    }
    if (pedindo) return;
    /* O pedido de crédito da temporada mora atrás da mesma chave de `lib/temporada.ts`. */
    if (!recompensasV2Ligadas()) {
      toast.warn(t('O resgate da temporada ainda não está ligado nesta instalação.'));
      return;
    }
    const [x, y] = centro(el);
    setPedindo(creditoId);
    const c = await creditarSeeds({ creditoId });
    setPedindo(null);
    if (!c) {
      toast.warn(t('Não deu para resgatar agora. Tente de novo.'));
      return;
    }
    const todos = [...creditados, creditoId];
    setResgatados((antes) => [...antes, creditoId]);
    hidratarTemporada(todos);
    window.dispatchEvent(new CustomEvent('babel:metricas-mudaram'));
    sentirMoeda();
    toast.ok(
      t('Resgatado: {rotulo}', { rotulo }),
      'seeds' in r ? undefined : { action: { label: t('Equipar agora'), onClick: () => aoUsar(r) } },
    );
    const ganho = 'seeds' in r && !c.jaExistia ? r.seeds : 0;
    aoContarSeeds(saldo, saldo + ganho, 800);
    comemorarResgate(x, y);
  };

  const premio = (lado: Trilha, n: number, r: RecompensaDaTrilha | null) => {
    if (!r) return <span className="px-premio vazio">·</span>;
    const qual = lado === 'gratis' ? 'g' : 'a';
    const feito = !!atual && n <= nivel;
    const pego = !!atual && creditados.has(creditoDaTemporada(atual.id, n, lado));
    const tranca = lado === 'assinante' && !assinante;
    const raridade = 'seeds' in r ? raridadeDoNivel(n, lado) : r.raridade;
    const Icone = tranca ? Lock : pego ? Check : 'seeds' in r ? Sprout : Star;
    return (
      <button
        type="button"
        className={`px-premio r-${raridade}${feito ? ' feito' : ''}${pego ? ' pego' : ''}${tranca ? ' trancado' : ''}`}
        data-px-premio={`${qual}${n}`}
        data-rotulo={rotuloDe(r)}
        onClick={(e) => void aoTocar(e.currentTarget, n, lado, r)}
      >
        <Icone aria-hidden />
        <b>{rotuloDe(r)}</b>
        <small>
          {pego
            ? t('resgatado')
            : feito
              ? tranca
                ? t('com a assinatura')
                : t('resgatar')
              : t(NOME_DA_RARIDADE[raridade])}
        </small>
      </button>
    );
  };

  return (
    <>
      <section className="q-cartao px-temporada" data-testid="temporada">
        <div className="px-ceu" aria-hidden="true" />
        <div className="px-temp-texto">
          <p className="q-rotulo">{t('Temporada {n} · {nome}', { n: exibida.numero, nome: exibida.nome })}</p>
          <h2 data-testid="nivel-da-temporada">
            {t('Nível {n} de {total}', { n: nivel, total: NIVEIS_DA_TEMPORADA })}
          </h2>
          <p data-testid="faixa-da-temporada">{periodo}</p>
          {atual && (
            <>
              <span
                className="q-barra"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={XP_POR_NIVEL_DA_TEMPORADA}
                aria-valuenow={noNivel}
                aria-label={t('XP da temporada')}
              >
                <span style={{ width: `${pct}%` }} />
              </span>
              <p className="px-nota">{nota}</p>
            </>
          )}
        </div>
        <div className="px-anel" style={{ ['--pct' as string]: pct }}>
          <b>{nivel}</b>
          <span>{t('nível')}</span>
        </div>
      </section>

      {fimGratis && (
        <button type="button" className="q-linha px-final" data-px-nivel="30" onClick={() => ir(NIVEIS_DA_TEMPORADA)}>
          <span className="q-ic">
            <Star aria-hidden />
          </span>
          <span>
            <small className="q-rotulo">{t('No fim da trilha · nível {n}', { n: NIVEIS_DA_TEMPORADA })}</small>
            <b>{rotuloDe(fimGratis)}</b>
            <small>
              {fimAssinante
                ? t('Para quem estuda até o fim. Com a assinatura, também a {nome}, a única Lendária da temporada.', {
                    nome: rotuloDe(fimAssinante),
                  })
                : t('Para quem estuda até o fim.')}
            </small>
          </span>
          <span className="q-fim">
            {/* A seta do protótipo é a de produção, com a medida que veio junto (16 px). */}
            {t('Ver o fim')} <ChevronRight aria-hidden style={{ width: 16, height: 16, verticalAlign: -3 }} />
          </span>
        </button>
      )}

      <section className="q-secao" ref={secao}>
        <header>
          <div>
            <h2>{t('Trilha de recompensas')}</h2>
            <p>
              {t('{g} recompensas estudando · mais {a} com a assinatura. Dá para ver todas, até a última.', {
                g: doGratis,
                a: doAssinante,
              })}
            </p>
          </div>
          <div className="q-abas q-seg px-faixas" role="group" aria-label={t('Ir para os níveis')}>
            {[1, 11, 21].map((n, i) => (
              <button
                key={n}
                type="button"
                className="q-aba"
                aria-checked={faixa === i}
                data-px-nivel={n}
                onClick={() => {
                  setFaixa(i);
                  ir(n);
                }}
              >
                {n}–{n + 9}
              </button>
            ))}
          </div>
        </header>
        <div className="px-trilha">
          <div className="px-trilha-rotulos">
            <span>
              {t('Grátis')}
              <small>{t('estudando')}</small>
            </span>
            <span />
            <span>
              {t('Assinante')}
              <small>{t('com a assinatura')}</small>
            </span>
          </div>
          {trilha.map(({ n, g, a }) => (
            <div
              key={n}
              className={`px-degrau${atual && n <= nivel ? ' feito' : ''}${atual && n === nivel + 1 ? ' proximo' : ''}${n === NIVEIS_DA_TEMPORADA ? ' ultimo' : ''}`}
              data-nivel={n}
            >
              {premio('gratis', n, g)}
              <span className="px-no">{n}</span>
              {premio('assinante', n, a)}
            </div>
          ))}
        </div>
        {!assinante && (
          <div className="q-aviso">
            <span>
              <Lock aria-hidden />{' '}
              {t(
                'A trilha de baixo tem {a} recompensas e vem com a assinatura. O que é de uma temporada volta à Loja com Seeds um ano depois do fim.',
                { a: doAssinante },
              )}
            </span>
            <button type="button" className="q-ctl" data-px="planos" onClick={aoVerPlanos}>
              {t('Conhecer o Premium')}
            </button>
          </div>
        )}
        <p className="px-nota">{t('Não existe compra de nível: a temporada sobe só com o XP de estudo.')}</p>
      </section>
    </>
  );
}
