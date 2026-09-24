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
import { Check, Gift, Sparkles, Sprout } from 'lucide-react';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';

import { TEXTOS } from '../lib/galeria/textos';
import { comemorar } from '../lib/juice';
import { type ItemDaLoja, type Raridade } from '../lib/loja';
import MiniaturaDoItem from './MiniaturaDoItem';
import { DialogoBase } from './ui';

export type Recompensa =
  | { tipo: 'nivel'; nivel: number; itens: ItemDaLoja[] }
  | { tipo: 'conquista'; id: string; nome: string; emoji: string; seeds: number; xp: number; item?: ItemDaLoja }
  /* O bau de fim de rodada. A chave e o `roundId` porque o drop e idempotente POR rodada no
     servidor: repetir o mesmo id devolve o mesmo item, entao repetir a tela seria mostrar duas
     vezes o mesmo premio. */
  | { tipo: 'drop'; roundId: string; seeds: number; item: ItemDaLoja };

/** Rotulo e frase de cada tipo, para o JSX parar de ramificar em quatro lugares. */
const CABECALHO: Record<Recompensa['tipo'], { rotulo: string; frase: string }> = {
  nivel: { rotulo: 'Subiu de nível', frase: 'Você liberou:' },
  conquista: { rotulo: 'Conquista feita', frase: 'Item exclusivo liberado:' },
  drop: { rotulo: 'Baú da rodada', frase: 'O baú abriu:' },
};

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
export interface DetalheDoDrop {
  roundId: string;
  itemId: string;
  seeds: number;
}
const CHAVE_VISTAS = 'babel.recompensas_vistas';

export function chaveDaRecompensa(r: Recompensa): string {
  if (r.tipo === 'nivel') return `nivel:${r.nivel}`;
  if (r.tipo === 'drop') return `drop:${r.roundId}`;
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

export default function RecompensaDesbloqueada({ fila, onEquipar, onFechar, onVerPersonalizar }: Props) {
  const atual = fila[0] ?? null;
  const [pronta, setPronta] = useState(() => !jogoAtivo());

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
    />
  );
}

function Resgate({ atual, onEquipar, onFechar, onVerPersonalizar }: Omit<Props, 'fila'> & { atual: Recompensa }) {
  const [equipados, setEquipados] = useState<Set<string>>(new Set());
  const idTitulo = useId();
  const fechado = useRef(false);

  useEffect(() => {
    comemorar('subiuNivel', null, { tremer: true });
  }, []);

  const itens: ItemDaLoja[] = atual.tipo === 'nivel' ? atual.itens : atual.item ? [atual.item] : [];
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
    comemorar('acerto', el, { texto: TEXTOS.emUso });
  };

  const titulo =
    atual.tipo === 'nivel' ? `Nível ${atual.nivel}!` : atual.tipo === 'drop' ? atual.item.nome : atual.nome;
  const icone = { width: 44, height: 44, display: 'inline-block', color: 'var(--accent-ink)' };

  return (
    <DialogoBase rotuloId={idTitulo} aoFechar={fechar}>
      <div className="recompensa">
        <Confete />
        <div className="emoji" aria-hidden>
          {atual.tipo === 'conquista' ? (
            atual.emoji
          ) : atual.tipo === 'drop' ? (
            <Gift style={icone} />
          ) : (
            <Sparkles style={icone} />
          )}
        </div>
        <span className="label-mono" style={{ color: 'var(--accent-ink)' }}>
          {cabecalho.rotulo}
        </span>
        <h2 id={idTitulo}>{titulo}</h2>
        <p className="mut">
          {itens.length > 0 ? cabecalho.frase : 'Nada novo para equipar neste nível: o próximo desbloqueio vem aí.'}
        </p>

        {itens.length > 0 && (
          <ul className="pilha" style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', textAlign: 'left' }}>
            {itens.map((i) => {
              const equipado = equipados.has(i.id);
              const peca = i.tipo !== 'galeria' && i.tipo !== 'aprimoramento';
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
                  <span style={{ flex: 'none' }}>
                    <MiniaturaDoItem item={i} />
                  </span>
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
