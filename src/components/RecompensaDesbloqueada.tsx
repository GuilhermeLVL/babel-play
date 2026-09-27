/**
 * RECOMPENSA ENTREGUE NA HORA — o modal de resgate. Desenho: `conquista()` do protótipo aprovado
 * (`<dialog>` com `.recompensa`, confete de pixel, selos de Seeds/XP, "Resgatar e continuar" e o
 * link "Ver em Personalizar").
 *
 * Personalizar v3 (2026-08-28): subir de nível ou fechar uma conquista dava um toast de 6 s;
 * quem estava no meio de um jogo precisava lembrar de ir a Personalizar depois. Agora o que
 * abriu aparece no centro da tela, com "Equipar agora" por item — e NÃO interrompe uma rodada:
 * se há jogo em curso (`document.body[data-jogo-ativo]`), espera `babel:rodada-fechou`.
 *
 * Fila: um evento por vez. `babel.recompensas_vistas` guarda o que já foi mostrado (nível ou
 * conquista) para não repetir em recarga.
 *
 * Além do protótipo (recurso real que ele não desenha): os itens liberados, cada um com "Equipar
 * agora". O protótipo mostra uma frase sob o nome da conquista; o app não tem essa frase por
 * conquista, então no lugar dela vai o que foi liberado.
 */
import { type MinigameId, type NivelAlcancavel, PESOS_SEEDS, rotuloDaMaestria } from '@core';
import { Award, Check, Crown, Gem, Gift, Medal, Sparkles, Sprout, Trophy } from 'lucide-react';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';

import { celebrar, tocarPreviaDoEfeito } from '../lib/comemoracao';
import { TEXTOS } from '../lib/galeria/textos';
import { t } from '../lib/i18n';
import { pontosDoElemento } from '../lib/juice';
import { type ItemDaLoja, type Raridade } from '../lib/loja';
import { play } from '../lib/soundFx';
import { iconeDaConquista } from './iconesDaConquista';
import MiniaturaDoItem from './MiniaturaDoItem';
import { DialogoBase } from './ui';

export type Recompensa =
  | { tipo: 'nivel'; nivel: number; itens: ItemDaLoja[] }
  | { tipo: 'conquista'; id: string; nome: string; seeds: number; xp: number; item?: ItemDaLoja }
  /* O bau de fim de rodada. A chave e o `roundId` porque o drop e idempotente POR rodada no
     servidor: repetir o mesmo id devolve o mesmo item, entao repetir a tela seria mostrar duas
     vezes o mesmo premio. BAÚ v2: sem `item` (e com `repetido`) a faixa sorteada nao tinha peca
     nova e o bau pagou Seeds; `chances` e `proximoRaroGarantidoEm` vao para a tela como vieram. */
  | {
      tipo: 'drop';
      roundId: string;
      seeds: number;
      item?: ItemDaLoja;
      repetido?: boolean;
      raridade?: 'comum' | 'raro';
      chances?: { comum: number; raro: number };
      proximoRaroGarantidoEm?: number;
    }
  /* A MAESTRIA DE UM JOGO subiu de nível (recompensas v2, onda 3). As Seeds são as da regra
     (`nivelDeMaestria × nível`), creditadas pelo servidor depois de conferir os pontos. */
  | { tipo: 'maestria'; jogo: MinigameId; nivel: NivelAlcancavel; seeds: number; itens: ItemDaLoja[] };

/** Rotulo e frase de cada tipo, para o JSX parar de ramificar em quatro lugares. */
const CABECALHO: Record<Recompensa['tipo'], { rotulo: string; frase: string }> = {
  nivel: { rotulo: 'Subiu de nível', frase: 'Você liberou:' },
  conquista: { rotulo: 'Conquista feita', frase: 'Item exclusivo liberado:' },
  drop: { rotulo: 'Baú da rodada', frase: 'O baú abriu:' },
  maestria: { rotulo: 'Maestria', frase: 'Você liberou:' },
};

/** O ícone de cada nível de maestria — o mesmo da barra (`BarraDeMaestria`). */
const ICONE_DO_NIVEL = { 1: Medal, 2: Award, 3: Trophy, 4: Gem, 5: Crown } as const;

/** A borda do cartão do item diz a raridade — os mesmos tokens da Loja. */
const BORDA_DA_RARIDADE: Record<Raridade, string> = {
  comum: 'var(--border-subtle)',
  raro: 'var(--rare)',
  epico: 'var(--epic)',
  lendario: 'var(--warn)',
};

export const EVENTO_RODADA_FECHOU = 'babel:rodada-fechou';
/** O bau da rodada saiu. `detail` traz o que o SERVIDOR sorteou; o App resolve o id no catalogo. */
export const EVENTO_DROP_GANHO = 'babel:drop-ganho';
/** A barra de maestria cruzou um limiar. `detail`: `{ jogo, nivel }`. */
export const EVENTO_MAESTRIA_SUBIU = 'babel:maestria-subiu';
export interface DetalheDaMaestria {
  jogo: MinigameId;
  nivel: NivelAlcancavel;
}
/** A recompensa de um nível de maestria, com as Seeds da regra. */
export function recompensaDaMaestria(jogo: MinigameId, nivel: NivelAlcancavel, itens: ItemDaLoja[]): Recompensa {
  return { tipo: 'maestria', jogo, nivel, seeds: PESOS_SEEDS.nivelDeMaestria * nivel, itens };
}
export interface DetalheDoDrop {
  roundId: string;
  /** `null` = sem peça: o baú virou Seeds (`repetido`) ou o teto do dia foi alcançado (`semBau`). */
  itemId: string | null;
  seeds: number;
  repetido?: boolean;
  raridade?: 'comum' | 'raro';
  chances?: { comum: number; raro: number };
  proximoRaroGarantidoEm?: number;
  semBau?: 'teto';
  limite?: number;
}
const CHAVE_VISTAS = 'babel.recompensas_vistas';

/** As peças que se mostram inteiras no modal, como aparecem de verdade. */
const COM_PREVIA_LARGA: ReadonlySet<string> = new Set(['legenda', 'cartao', 'efeito-acerto', 'efeito-combo', 'finalizacao']);

export function chaveDaRecompensa(r: Recompensa): string {
  if (r.tipo === 'nivel') return `nivel:${r.nivel}`;
  if (r.tipo === 'drop') return `drop:${r.roundId}`;
  if (r.tipo === 'maestria') return `maestria:${r.jogo}:${r.nivel}`;
  return `conquista:${r.id}`;
}
export function recompensasVistas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTAS) || '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function marcarVista(r: Recompensa): void {
  try {
    const v = recompensasVistas();
    v.add(chaveDaRecompensa(r));
    localStorage.setItem(CHAVE_VISTAS, JSON.stringify([...v].slice(-200)));
  } catch {
    /* sem storage */
  }
}
/**
 * A fila não repete: as conquistas são reavaliadas a cada métrica nova, e antes de o usuário fechar
 * a primeira a mesma já tinha entrado de novo ("Primeira captura" voltava depois de fechada).
 */
export function enfileirarSemRepetir(fila: Recompensa[], novas: Recompensa[]): Recompensa[] {
  const ja = new Set(fila.map(chaveDaRecompensa));
  const saida = [...fila];
  for (const r of novas) {
    const chave = chaveDaRecompensa(r);
    if (ja.has(chave)) continue;
    ja.add(chave);
    saida.push(r);
  }
  return saida;
}
/** Fechar tira TODAS as cópias daquela recompensa, não só a da frente. */
export function tirarDaFila(fila: Recompensa[], r: Recompensa): Recompensa[] {
  const chave = chaveDaRecompensa(r);
  return fila.filter((x) => chaveDaRecompensa(x) !== chave);
}
/** Há uma rodada de jogo em curso? (Play marca o body enquanto joga.) */
export function jogoAtivo(): boolean {
  return typeof document !== 'undefined' && document.body.hasAttribute('data-jogo-ativo');
}

/** Os quadradinhos da marca caindo — `confete()` do protótipo. Some sozinho; nada com movimento reduzido. */
function Confete() {
  const [pecas] = useState(() =>
    Array.from({ length: 26 }, (_, i) => ({
      left: `${4 + Math.random() * 92}%`,
      background: ['var(--accent)', 'var(--warn)', 'var(--good)', 'var(--rare)'][i % 4],
      '--dx': `${(Math.random() - 0.5) * 120}px`,
      '--r': `${Math.random() * 540}deg`,
      animationDelay: `${Math.random() * 0.25}s`,
    })),
  );
  const [vivo, setVivo] = useState(
    () => typeof matchMedia === 'undefined' || !matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const t = setTimeout(() => setVivo(false), 1900);
    return () => clearTimeout(t);
  }, []);
  if (!vivo) return null;
  return (
    <div className="confete" aria-hidden>
      {pecas.map((p, i) => (
        <i key={i} style={p as CSSProperties} />
      ))}
    </div>
  );
}

interface Props {
  fila: Recompensa[];
  /** Equipa pelo caminho único (`equiparItem`); devolve `false` quando não equipa. */
  onEquipar: (item: ItemDaLoja) => boolean;
  /** Tira a recompensa da frente da fila (já marcada como vista aqui). */
  onFechar: (r: Recompensa) => void;
  onVerPersonalizar: () => void;
}

/**
 * O LOTE DE NOVIDADES (recompensas v2, spec 10.2): quando várias chegam juntas (fim de rodada com
 * baú, maestria e conquista), o modal continua abrindo uma por vez, mas diz "3 novidades · 1 de 3".
 * O lote é o que estava na fila quando a primeira abriu, mais o que entrar antes de ela esvaziar.
 */
export function posicaoNoLote(lote: readonly string[], fila: readonly Recompensa[]): { lote: string[]; posicao: number; total: number } {
  const chaves = fila.map(chaveDaRecompensa);
  const atual = chaves[0];
  if (!atual) return { lote: [], posicao: 0, total: 0 };
  const novo = lote.includes(atual) ? [...lote, ...chaves.filter((c) => !lote.includes(c))] : chaves;
  return { lote: novo, posicao: novo.indexOf(atual) + 1, total: novo.length };
}

export default function RecompensaDesbloqueada({ fila, onEquipar, onFechar, onVerPersonalizar }: Props) {
  const atual = fila[0] ?? null;
  const [pronta, setPronta] = useState(() => !jogoAtivo());
  const lote = useRef<string[]>([]);
  const grupo = posicaoNoLote(lote.current, fila);
  lote.current = grupo.lote;

  // Espera a rodada fechar; enquanto isso o modal não existe na tela.
  useEffect(() => {
    if (!atual) return;
    if (!jogoAtivo()) {
      setPronta(true);
      return;
    }
    setPronta(false);
    const ouvir = () => setPronta(true);
    window.addEventListener(EVENTO_RODADA_FECHOU, ouvir);
    return () => window.removeEventListener(EVENTO_RODADA_FECHOU, ouvir);
  }, [atual]);

  if (!atual || !pronta) return null;
  // Uma recompensa por diálogo: a próxima da fila abre um diálogo novo (e um confete novo).
  return (
    <Resgate
      key={chaveDaRecompensa(atual)}
      atual={atual}
      onEquipar={onEquipar}
      onFechar={onFechar}
      onVerPersonalizar={onVerPersonalizar}
      grupo={grupo}
    />
  );
}

/** A prévia REAL de uma peça: a legenda estilizada, o cartão, o efeito tocando (uma vez, ao abrir). */
function PreviaDaPeca({ item }: { item: ItemDaLoja }) {
  const ref = useRef<HTMLSpanElement>(null);
  const efeito = item.tipo === 'efeito-acerto' || item.tipo === 'efeito-combo' || item.tipo === 'finalizacao';
  useEffect(() => {
    if (!efeito) return;
    const id = window.setTimeout(() => tocarPreviaDoEfeito(item.tipo as 'efeito-acerto', item.alvo, ref.current), 450);
    return () => window.clearTimeout(id);
  }, [efeito, item]);
  return (
    <span ref={ref} data-previa-da-peca={item.tipo} style={{ display: 'grid', placeItems: 'center', width: '100%', minHeight: 44 }}>
      <MiniaturaDoItem item={item} tam="grande" />
    </span>
  );
}

function Resgate({
  atual,
  onEquipar,
  onFechar,
  onVerPersonalizar,
  grupo,
}: Omit<Props, 'fila'> & { atual: Recompensa; grupo: { posicao: number; total: number } }) {
  const [equipados, setEquipados] = useState<Set<string>>(new Set());
  const idTitulo = useId();
  const fechado = useRef(false);

  /* A festa de quem abre o modal, pelo motor: nível, conquista ou baú (a raridade do baú escala). */
  useEffect(() => {
    /* A maestria já foi comemorada pela barra, no instante em que cruzou o limiar: festa uma vez só. */
    if (atual.tipo === 'maestria') return;
    if (atual.tipo === 'nivel') celebrar({ tipo: 'nivel' });
    else if (atual.tipo === 'conquista') celebrar({ tipo: 'conquista' });
    else {
      // Baú v2: o repetido chega sem `item` e só com a faixa sorteada.
      const raridade = atual.item?.raridade ?? atual.raridade ?? 'comum';
      celebrar({ tipo: 'bau', raridade: raridade === 'comum' ? 'comum' : 'raro' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma festa por recompensa aberta (o `key` remonta)
  }, []);

  const itens: ItemDaLoja[] =
    atual.tipo === 'nivel' || atual.tipo === 'maestria' ? atual.itens : atual.item ? [atual.item] : [];
  const cabecalho = CABECALHO[atual.tipo];
  // Esc (o `close` nativo) e os dois botões passam por aqui; a recompensa sai da fila uma vez só.
  const fechar = () => {
    if (fechado.current) return;
    fechado.current = true;
    marcarVista(atual);
    onFechar(atual);
  };
  const equipar = (i: ItemDaLoja, el: HTMLElement | null) => {
    if (!onEquipar(i)) return;
    setEquipados((s) => new Set(s).add(i.id));
    play('select');
    pontosDoElemento(TEXTOS.emUso, el, 'bom');
  };

  const titulo =
    atual.tipo === 'nivel'
      ? `Nível ${atual.nivel}!`
      : atual.tipo === 'drop'
        ? (atual.item?.nome ?? t('Peça repetida'))
        : atual.tipo === 'maestria'
          ? rotuloDaMaestria(atual.jogo, atual.nivel)
          : atual.nome;
  const icone = { width: 44, height: 44, display: 'inline-block', color: 'var(--accent-ink)' };
  const IconeDaConquista = iconeDaConquista(atual.tipo === 'conquista' ? atual.id : '');

  return (
    <DialogoBase rotuloId={idTitulo} aoFechar={fechar}>
      <div className="recompensa">
        <Confete />
        <div className="emoji" aria-hidden>
          {atual.tipo === 'conquista' ? (
            /* O ícone lucide da grade de Desafios (`conquista.icone`): a mesma conquista com a mesma
               cara nas duas telas, e nada de emoji na interface. */
            <IconeDaConquista style={icone} />
          ) : atual.tipo === 'drop' ? (
            <Gift style={icone} />
          ) : atual.tipo === 'maestria' ? (
            (() => {
              const IconeDoNivel = ICONE_DO_NIVEL[atual.nivel];
              return <IconeDoNivel style={icone} />;
            })()
          ) : (
            <Sparkles style={icone} />
          )}
        </div>
        {grupo.total > 1 && (
          <span className="badge acc" data-novidades={grupo.total} style={{ marginBottom: 6 }}>
            {t('{n} novidades', { n: grupo.total })} · {t('{i} de {n}', { i: grupo.posicao, n: grupo.total })}
          </span>
        )}
        <span className="label-mono" style={{ color: 'var(--accent-ink)' }}>
          {cabecalho.rotulo}
        </span>
        <h2 id={idTitulo}>{titulo}</h2>
        <p className="mut">
          {atual.tipo === 'drop' && !atual.item
            ? t('Você já tem este item: +{n} Seeds', { n: atual.seeds })
            : itens.length > 0
              ? cabecalho.frase
              : atual.tipo === 'maestria'
                ? t('Novo nível de maestria neste jogo.')
                : 'Nada novo para equipar neste nível: o próximo desbloqueio vem aí.'}
        </p>

        {itens.length > 0 && (
          <ul className="pilha" style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', textAlign: 'left' }}>
            {itens.map((i) => {
              const equipado = equipados.has(i.id);
              const peca = i.tipo !== 'galeria';
              return (
                <li
                  key={i.id}
                  className="cartao"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: 12,
                    borderColor: BORDA_DA_RARIDADE[i.raridade],
                  }}
                >
                  {/* A PRÉVIA REAL (spec 10.3): legenda, cartão e efeito ocupam a largura; o resto, a miniatura. */}
                  {COM_PREVIA_LARGA.has(i.tipo) ? (
                    <span style={{ flex: '1 1 100%' }}>
                      <PreviaDaPeca item={i} />
                    </span>
                  ) : (
                    <span style={{ flex: 'none' }}>
                      <MiniaturaDoItem item={i} />
                    </span>
                  )}
                  <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 13.5 }}>{i.nome}</b>
                    <small className="mut" style={{ display: 'block', fontSize: 12 }}>
                      {i.desc}
                    </small>
                  </span>
                  {peca ? (
                    <button
                      type="button"
                      className={`btn ${equipado ? 'btn-outline' : 'btn-solid'} peq`}
                      onClick={(e) => equipar(i, e.currentTarget)}
                      disabled={equipado}
                    >
                      {equipado ? (
                        <>
                          <Check aria-hidden /> {TEXTOS.emUso}
                        </>
                      ) : (
                        TEXTOS.equiparAgora
                      )}
                    </button>
                  ) : (
                    <span className="badge neu">{TEXTOS.liberado}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="linha" style={{ justifyContent: 'center', gap: 8, margin: '16px 0 22px' }}>
          {atual.tipo !== 'nivel' && (
            <span className="badge ok">
              <Sprout aria-hidden /> +{atual.seeds} Seeds
            </span>
          )}
          {atual.tipo === 'conquista' && atual.xp > 0 && <span className="badge acc">+{atual.xp} XP</span>}
        </div>
        {/* BAÚ v2: as chances ficam à vista no próprio baú, com a garantia do raro. */}
        {atual.tipo === 'drop' && atual.chances && (
          <p className="mut" data-chances-do-bau style={{ fontSize: 12.5, margin: '-10px 0 16px' }}>
            {t('Chances: {comum}% comum · {raro}% raro', atual.chances)}
            {atual.proximoRaroGarantidoEm != null &&
              ` · ${
                atual.proximoRaroGarantidoEm <= 1
                  ? t('o próximo baú é raro garantido')
                  : t('raro garantido em {n} baús', { n: atual.proximoRaroGarantidoEm })
              }`}
          </p>
        )}

        <button type="button" className="btn btn-solid bloco" data-autofocus onClick={fechar}>
          {TEXTOS.resgatarEContinuar}
        </button>
        <button
          type="button"
          className="link"
          style={{ marginTop: 8 }}
          onClick={() => {
            fechar();
            onVerPersonalizar();
          }}
        >
          {TEXTOS.verEmPersonalizar}
        </button>
      </div>
    </DialogoBase>
  );
}
