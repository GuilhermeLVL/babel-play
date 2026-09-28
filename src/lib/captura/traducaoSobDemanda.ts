/**
 * TRADUÇÃO SOB DEMANDA — a preferência "Tradução" da legenda ao vivo e a decisão de NÃO traduzir.
 *
 * É o degrau M0 do harness (`harness-adaptativo.md` §1.2) ligado na captura: o que não é traduzido
 * não custa nada — nem motor local, nem nuvem. Três modos, e o PADRÃO é o de sempre:
 *
 *   · `sempre` — toda fala final é traduzida (o comportamento de antes; nada muda para quem não mexe);
 *   · `pedir`  — "Só quando eu pedir": nenhuma fala é traduzida sozinha; o balão mostra "Mostrar
 *                tradução", e o toque traduz AQUELA fala pelo caminho normal (cache, memória, MT);
 *   · `novas`  — "Só frases com palavra nova": a fala em que TODA palavra já é conhecida
 *                (`core/harness/palavrasConhecidas`) não é traduzida — e continua revelável.
 *
 * O PARCIAL segue a mesma régua, em silêncio: no `pedir` nunca é traduzido; no `novas`, o parcial
 * todo conhecido não é pedido. Ele não ganha o botão — o balão espera o final, que decide.
 *
 * A preferência mora nos ajustes da legenda (`transcriptSettings.traducao`, o mesmo `localStorage`
 * e o mesmo evento que tamanho e cor), então "Voltar ao padrão" a devolve a `sempre`.
 */
import { routeMt } from '../../core/harness/roteadorDeTraducao';
import { baseLang } from '../languages';

export type ModoDeTraducao = 'sempre' | 'pedir' | 'novas';

export const MODO_DE_TRADUCAO_PADRAO: ModoDeTraducao = 'sempre';

const MODOS: readonly ModoDeTraducao[] = ['sempre', 'pedir', 'novas'];

/** Valor salvo → modo válido. Ausente (ajuste de antes deste campo) ou estranho = `sempre`. */
export function modoDeTraducao(valor: unknown): ModoDeTraducao {
  return MODOS.includes(valor as ModoDeTraducao) ? (valor as ModoDeTraducao) : MODO_DE_TRADUCAO_PADRAO;
}

/** O predicado de palavras conhecidas e o idioma a que ele responde. */
export interface ConhecidasDaFala {
  idioma: string;
  conhece: (palavra: string) => boolean;
}

/** O pedido guardado de uma fala não traduzida: é o que o toque em "Mostrar tradução" refaz. */
export interface PedidoSobDemanda {
  texto: string;
  src?: string;
  tgt?: string;
  falada?: boolean;
}

export type MotivoSemTraducao = 'pedido' | 'todas-conhecidas';

export interface EntradaSobDemanda {
  modo: ModoDeTraducao;
  texto: string;
  /** Origem efetiva da fala (já com o idioma observado da sessão); '' = desconhecida. */
  origem: string;
  destino: string;
  parcial: boolean;
  falada: boolean;
  conhecidas?: ConhecidasDaFala | null;
}

/**
 * Esta fala fica SEM tradução automática? `null` = traduz como sempre.
 *
 * No `novas` quem decide é o M0 do `routeMt`, com o predicado do aluno — e só quando o predicado é
 * do idioma da fala: sem saber o idioma, ou com o caderno de outro, nada é "conhecido" e traduz.
 */
export function motivoParaNaoTraduzir(e: EntradaSobDemanda): MotivoSemTraducao | null {
  if (e.modo === 'pedir') return 'pedido';
  if (e.modo !== 'novas' || !e.conhecidas || !e.origem) return null;
  if (baseLang(e.conhecidas.idioma) !== baseLang(e.origem)) return null;
  const rota = routeMt({
    texto: e.texto,
    palavrasConhecidas: e.conhecidas.conhece,
    ehToqueEmPalavra: false,
    parcial: e.parcial,
    // Só o M0 interessa aqui: o resto da escada é do gateway, que decide com o plano de verdade.
    pago: false,
    consentimento: false,
    disponibilidade: { tradutorNativo: false, opusMt: false, nuvem: false },
    origem: e.origem,
    destino: e.destino,
    falada: e.falada,
  });
  const primeiro = rota.degraus[0];
  return primeiro?.degrau === 'pular' && primeiro.motivo === 'todas-conhecidas' ? 'todas-conhecidas' : null;
}
