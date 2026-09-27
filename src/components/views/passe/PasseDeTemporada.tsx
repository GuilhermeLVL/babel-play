/* DO MODULO, e nao do barril: o que esta tela precisa mora em `core/temporada.ts` (auditoria de
   2026-09-07, achado A43 — importar o barril arrastava o nucleo inteiro para o grafo da tela). */
import {
  limitesDaTemporada,
  NIVEIS_DA_TEMPORADA,
  type RecompensaDaTrilha,
  recompensaDaTrilha,
  type Temporada,
  type Trilha,
  XP_POR_NIVEL_DA_TEMPORADA,
} from '@core/temporada';
// Sprout, e não Leaf: é o ícone que TODA a aplicação usa para Seeds — um conceito, um ícone.
import { CalendarClock, Check, Crown, Lock, Sprout, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { TemporadaNoServidor } from '../../../data/api';
import { type ContextoDeEquipar, equiparItem, equipavel } from '../../../lib/galeria/equipar';
import { data, t } from '../../../lib/i18n';
import { COR_DA_RARIDADE, estadoDoItem, type ItemDaLoja } from '../../../lib/loja';
import MiniaturaDoItem from '../../MiniaturaDoItem';
import { toast } from '../../Toast';

/**
 * A TEMPORADA — as duas trilhas de 30 níveis (recompensas v2, onda 5; spec 8.3).
 *
 * Substitui o Passe "lente do nível" de 100 casas. O que ficou do desenho aprovado em 01/09: uma
 * página por trecho (1–10, 11–20, 21–30), coluna por nível com o marco mais largo e a estrela, e o
 * estado no cartão (✓ o que é seu, cadeado o que falta). O que mudou:
 *
 *  · AS DUAS FILEIRAS SÃO GRÁTIS E ASSINANTE. A de baixo não vende nada nem paga Créditos: ela é
 *    da assinatura (spec 2), e a tela não oferece compra — nem de nível, que não existe.
 *  · O NÍVEL É O DA TEMPORADA, do XP ganho DENTRO da janela, somado no servidor
 *    (`GET /api/metrics/temporada`). As casas alcançadas são pedidas por `sincronizarTemporada`
 *    (`lib/temporada.ts`), e o servidor confere de novo.
 *  · FORA DAS DATAS a tela diz quando vem a próxima — com a contagem de dias só para adulto; o
 *    perfil protegido vê a data, sem relógio correndo (spec 8.3).
 */

const DIA = 86_400_000;

export default function PasseDeTemporada({
  temporada: estado,
  ctxEquipar,
  equipadoAtual,
  protegido,
}: {
  /** O que o servidor disse (`useTemporada`): `undefined` carregando, `null` sem resposta. */
  temporada: TemporadaNoServidor | null | undefined;
  ctxEquipar: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  /** Perfil protegido (`perfilProtegido()`): sem contagem regressiva. */
  protegido: boolean;
}) {
  const atual = estado?.temporada ?? null;
  const exibida: Temporada | null = atual ?? estado?.proxima ?? null;
  const nivel = atual ? (estado?.nivel ?? 0) : 0;
  const assinante = !!estado?.assinante;
  const creditados = useMemo(() => new Set(estado?.creditados ?? []), [estado]);
  const creditada = (nv: number, trilha: Trilha) => !!atual && creditados.has(`temporada:${atual.id}:${nv}:${trilha}`);
  // O trecho do nível atual é onde a pessoa quer estar quando a tela abre.
  const trechoDoNivel = Math.min(3, Math.max(1, Math.ceil((nivel + 1) / 10)));
  const [pagina, setPagina] = useState(trechoDoNivel);
  const [, force] = useState(0);
  useEffect(() => setPagina(trechoDoNivel), [trechoDoNivel]);

  const colunas = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const nv = (pagina - 1) * 10 + i + 1;
        return { nivel: nv, gratis: recompensaDaTrilha(nv, 'gratis'), assinante: recompensaDaTrilha(nv, 'assinante') };
      }),
    [pagina],
  );

  if (estado === undefined) {
    return (
      <p className="text-[12.5px] text-ink-muted" data-testid="temporada">
        {t('Carregando a temporada…')}
      </p>
    );
  }

  const aoTocar = (nv: number, trilha: Trilha, r: RecompensaDaTrilha) => {
    if (!atual || nivel < nv) {
      toast.warn(t('Nível {n} da temporada: chega com o XP de estudo ganho durante a temporada.', { n: nv }));
      return;
    }
    if (trilha === 'assinante' && !assinante) {
      toast.warn(t('Esta fileira é da assinatura.'));
      return;
    }
    if ('seeds' in r) {
      toast.ok(
        creditada(nv, trilha)
          ? t('+{n} Seeds já creditadas na sua conta.', { n: r.seeds })
          : t('+{n} Seeds — creditando; se a rede falhar, tentamos de novo na próxima visita.', { n: r.seeds }),
      );
      return;
    }
    if (!equipavel(r)) {
      toast.ok(t('{nome}: aparece no seu perfil.', { nome: r.nome }));
      return;
    }
    if (equiparItem(r, ctxEquipar)) {
      force((x) => x + 1);
      toast.ok(t('{nome} equipado.', { nome: r.nome }));
    } else {
      const { motivo } = estadoDoItem(r, ctxEquipar.nivel, ctxEquipar.saldo);
      toast.warn(`${r.nome}: ${motivo ?? t('ainda trancado')}.`);
    }
  };

  return (
    <div className="space-y-4" data-testid="temporada">
      <FaixaDaTemporada estado={estado} protegido={protegido} />

      {exibida && (
        <>
          {/* ── PAGINAÇÃO POR TRECHO — o trecho ainda não alcançado continua visitável: ver antes
                 de ter é metade da graça de uma temporada. ── */}
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={t('Trechos da temporada')}>
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                onClick={() => setPagina(p)}
                aria-current={pagina === p}
                className={`px-2.5 py-1.5 rounded-lg border font-mono font-bold text-[11.5px] cursor-pointer ${
                  pagina === p
                    ? 'bg-accent border-accent text-accent-contrast'
                    : 'bg-surface border-border-subtle text-ink-muted hover:text-ink'
                } ${nivel < (p - 1) * 10 + 1 && pagina !== p ? 'opacity-45' : ''}`}
              >
                {(p - 1) * 10 + 1}–{p * 10}
              </button>
            ))}
            {atual && (
              <span className="ms-auto text-[11.5px] text-ink-muted">
                {nivel >= NIVEIS_DA_TEMPORADA
                  ? t('Nível {n} de {total} · trilha completa', { n: nivel, total: NIVEIS_DA_TEMPORADA })
                  : t('Nível {n} de {total} · faltam {xp} XP', {
                      n: nivel,
                      total: NIVEIS_DA_TEMPORADA,
                      xp: (nivel + 1) * XP_POR_NIVEL_DA_TEMPORADA - (estado?.xp ?? 0),
                    })}
              </span>
            )}
          </div>

          <div className="flex gap-3">
            {/* As duas fileiras nomeadas. Some no celular: lá o próprio cartão diz de que fileira é. */}
            <div className="shrink-0 hidden sm:flex flex-col gap-2.5 pt-[34px] w-[84px]">
              <div className="h-[168px] rounded-xl border border-border-subtle bg-surface flex flex-col items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-ink-muted text-center px-2">
                <Check className="w-4 h-4 text-good" aria-hidden />
                {t('Grátis')}
                <span className="font-sans font-semibold normal-case tracking-normal text-[9.5px] text-ink-faint">
                  {t('estudando')}
                </span>
              </div>
              <div className="h-[168px] rounded-xl border border-premium/40 bg-premium-soft flex flex-col items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-premium-ink text-center px-2">
                <Crown className="w-4 h-4" aria-hidden />
                {t('Assinante')}
                <span className="font-sans font-semibold normal-case tracking-normal text-[9.5px] text-premium-ink/70">
                  {assinante ? t('sua') : t('com a assinatura')}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto pb-2.5 flex-1 min-w-0 custom-scrollbar">
              <div className="flex gap-2.5 min-w-min">
                {colunas.map((col) => {
                  const alcancado = !!atual && nivel >= col.nivel;
                  const proximo = !!atual && col.nivel === nivel + 1;
                  const marco = col.nivel % 10 === 0;
                  return (
                    <div
                      key={col.nivel}
                      id={`temporada-nivel-${col.nivel}`}
                      className={`shrink-0 flex flex-col gap-2.5 ${marco ? 'w-[152px]' : 'w-[132px]'}`}
                    >
                      <p
                        className={`h-[26px] flex items-center justify-center gap-1.5 rounded-lg font-mono font-bold text-[13px] ${
                          proximo
                            ? 'bg-accent text-accent-contrast'
                            : marco
                              ? 'text-warn-ink'
                              : alcancado
                                ? 'text-ink-muted'
                                : 'text-ink-faint'
                        }`}
                      >
                        {col.nivel}
                        {marco && (
                          <Star className={`w-3.5 h-3.5 ${proximo ? 'fill-current' : 'fill-warn text-warn'}`} aria-hidden />
                        )}
                        {proximo && (
                          <span className="font-sans font-black text-[9px] uppercase tracking-wider">{t('próximo')}</span>
                        )}
                      </p>
                      <Casa
                        nivel={col.nivel}
                        trilha="gratis"
                        recompensa={col.gratis}
                        aberta={alcancado}
                        creditada={creditada(col.nivel, 'gratis')}
                        equipado={!!col.gratis && 'id' in col.gratis && equipadoAtual(col.gratis)}
                        aoTocar={aoTocar}
                      />
                      <Casa
                        nivel={col.nivel}
                        trilha="assinante"
                        recompensa={col.assinante}
                        aberta={alcancado && assinante}
                        creditada={creditada(col.nivel, 'assinante')}
                        equipado={!!col.assinante && 'id' in col.assinante && equipadoAtual(col.assinante)}
                        aoTocar={aoTocar}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="text-[11.5px] text-ink-muted max-w-[72ch]">
            {t(
              'Não existe compra de nível: a temporada sobe só com o XP de estudo. O que é de uma temporada volta à Loja com Seeds um ano depois do fim.',
            )}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * A FAIXA DE DATAS. Durante a temporada, o período; fora dela, quando vem a próxima. A contagem de
 * dias só aparece para adulto — para o perfil protegido, a data e nada correndo.
 */
function FaixaDaTemporada({ estado, protegido }: { estado: TemporadaNoServidor | null; protegido: boolean }) {
  const agora = Date.now();
  const atual = estado?.temporada ?? null;
  const proxima = estado?.proxima ?? null;
  const dia = (iso: string) => data(`${iso}T12:00:00`, { day: 'numeric', month: 'long' });

  let texto: string;
  if (atual) {
    const dias = Math.max(0, Math.ceil((limitesDaTemporada(atual).fim - agora) / DIA));
    const valores = { n: atual.numero, nome: atual.nome, inicio: dia(atual.inicio), fim: dia(atual.fim), d: dias };
    texto = protegido
      ? t('Temporada {n} · {nome}: de {inicio} a {fim}.', valores)
      : t('Temporada {n} · {nome}: de {inicio} a {fim} · termina em {d} dias.', valores);
  } else if (proxima) {
    const dias = Math.max(1, Math.ceil((limitesDaTemporada(proxima).inicio - agora) / DIA));
    texto = protegido
      ? t('Próxima temporada em {data}.', { data: dia(proxima.inicio) })
      : t('Próxima temporada em {d} dias, em {data}.', { d: dias, data: dia(proxima.inicio) });
  } else {
    texto = estado === null ? t('Não consegui ler a temporada agora.') : t('A próxima temporada ainda não tem data.');
  }

  return (
    <p
      className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1 text-[12px] text-ink-muted"
      data-testid="faixa-da-temporada"
    >
      <CalendarClock className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden /> {texto}
    </p>
  );
}

/** Uma casa de uma trilha: item, Seeds, ou o vazio honesto da casa ímpar da trilha grátis. */
function Casa({
  nivel,
  trilha,
  recompensa,
  aberta,
  creditada,
  equipado,
  aoTocar,
}: {
  nivel: number;
  trilha: Trilha;
  recompensa: RecompensaDaTrilha | null;
  aberta: boolean;
  creditada: boolean;
  equipado: boolean;
  aoTocar: (nv: number, trilha: Trilha, r: RecompensaDaTrilha) => void;
}) {
  if (!recompensa) {
    return (
      <div
        className="h-[168px] rounded-xl border border-dashed border-border-subtle flex items-center justify-center text-[10px] text-ink-faint"
        aria-hidden
      >
        ·
      </div>
    );
  }
  const fileira = trilha === 'gratis' ? t('trilha grátis') : t('trilha de assinante');
  const base = `h-[168px] rounded-xl border-2 p-2.5 flex flex-col items-center justify-center gap-1 cursor-pointer relative overflow-hidden transition-transform hover:-translate-y-0.5 ${
    aberta ? '' : 'opacity-40 saturate-50'
  }`;
  if ('seeds' in recompensa) {
    const situacao = !aberta ? t('nível {n}', { n: nivel }) : creditada ? t('creditado') : t('disponível');
    return (
      <button
        onClick={() => aoTocar(nivel, trilha, recompensa)}
        className={`${base} border-good/60 bg-good-soft`}
        aria-label={t('Nível {n} da temporada, {fileira}: {q} Seeds, {situacao}', {
          n: nivel,
          fileira,
          q: recompensa.seeds,
          situacao,
        })}
      >
        <Selo ok={aberta && creditada} trancado={!aberta} />
        <Sprout className="w-8 h-8 text-good" aria-hidden />
        <b className="font-mono font-bold text-good text-[19px]">+{recompensa.seeds}</b>
        <span className="text-[10px] font-bold text-ink leading-tight text-center">Seeds</span>
        <span className="font-mono text-[8.5px] uppercase tracking-wider font-bold text-good-ink">{situacao}</span>
      </button>
    );
  }
  const cor = COR_DA_RARIDADE[recompensa.raridade];
  const fundo = trilha === 'assinante' ? 'border-premium/40 bg-premium-soft' : `${cor.borda} ${cor.fundo}`;
  return (
    <button
      onClick={() => aoTocar(nivel, trilha, recompensa)}
      title={recompensa.desc}
      className={`${base} ${fundo}`}
      aria-label={
        aberta
          ? t('Nível {n} da temporada, {fileira}: {nome}', { n: nivel, fileira, nome: recompensa.nome })
          : t('Nível {n} da temporada, {fileira}: {nome}, bloqueado', { n: nivel, fileira, nome: recompensa.nome })
      }
    >
      <Selo ok={aberta && (creditada || equipado)} trancado={!aberta} />
      <MiniaturaDoItem item={recompensa} tam="grande" />
      <span className="text-[10.5px] font-bold text-ink leading-tight text-center line-clamp-2">{recompensa.nome}</span>
      <span className="font-mono text-[8.5px] uppercase tracking-wider font-bold text-ink-faint">{cor.rotulo}</span>
    </button>
  );
}

/** O selo do canto: ✓ para o que já é seu, cadeado para o que ainda não abriu. */
function Selo({ ok, trancado }: { ok: boolean; trancado: boolean }) {
  if (ok)
    return (
      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-good flex items-center justify-center" aria-hidden>
        <Check className="w-3 h-3 text-good-soft" />
      </span>
    );
  if (trancado)
    return (
      <span
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-canvas/70 flex items-center justify-center"
        aria-hidden
      >
        <Lock className="w-3 h-3 text-ink-faint" />
      </span>
    );
  return null;
}
