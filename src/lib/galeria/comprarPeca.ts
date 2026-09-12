import { gastarSeedsEx } from '../../data/api';
import { type ItemDaLoja, marcarPosse } from '../loja';

/** O que a compra devolve: deu certo, ou não deu e o motivo — quando o servidor diz qual é. */
export interface ResultadoDaCompra {
  ok: boolean;
  /** Seeds que faltam, quando a recusa foi por saldo. `0` em qualquer outro caso. */
  faltam: number;
}

/**
 * A COMPRA DE UMA PEÇA COM SEEDS — a transação, num lugar só.
 *
 * POR QUE ISTO SAIU DE DENTRO DA LOJA. Depois que o cartão do inventário passou a ter o botão
 * "Comprar · N" do design (antes ele só sabia mandar a pessoa para a Loja), duas telas precisavam
 * da mesma operação. Copiar as cinco linhas para a segunda tela criaria a situação que este
 * código já pagou caro uma vez: duas réguas para o mesmo fato, divergindo no primeiro ajuste.
 *
 * `spendId` FIXO POR ITEM, e é o ponto inteiro da função: comprar de novo — retry, aba duplicada,
 * clique dobrado, ou o mesmo item comprado pela Loja e pelo inventário — NÃO cobra duas vezes.
 * O id tem de continuar sendo `loja-<id>` justamente porque as duas telas compartilham o débito.
 *
 * A GUARDA DE FALHA, e por que ela é `if (!r)`. A primeira versão desta função herdou da Loja um
 * `if (r && (r as { ok?: boolean }).ok === false) return false`, e essa guarda nunca dispara:
 * `gastarSeedsEx` devolve `{ resultado: null, erro }` na recusa — `resultado` é `null`, nunca um
 * objeto com `ok: false`. Com a guarda morta, uma compra RECUSADA pelo servidor (rede fora, 402
 * saldo insuficiente, 400 preço divergente) caía direto no `marcarPosse` e voltava como sucesso:
 * a pessoa ganhava a peça de graça e a tela soltava confete. Vale pelas duas telas de uma vez.
 *
 * `gastarSeedsEx` (e não `gastarSeeds`) porque na recusa por saldo o servidor diz QUANTAS faltam,
 * que é a única informação útil naquele instante — o mesmo caminho que `Play.tsx` já usa para
 * pular rodada.
 *
 * Não celebra, não avisa, não relê saldo: quem chama decide a festa e o texto, que mudam por
 * tela. Aqui só se resolve se o item ficou sendo da pessoa.
 */
export async function comprarPecaComSeeds(item: ItemDaLoja): Promise<ResultadoDaCompra> {
  if (item.precoSeeds === undefined) return { ok: false, faltam: 0 };
  const { resultado, erro } = await gastarSeedsEx({
    spendId: `loja-${item.id}`,
    amount: item.precoSeeds,
    reason: `loja:${item.id}`,
  });
  if (!resultado) {
    return { ok: false, faltam: erro?.code === 'saldo_insuficiente' ? Number(erro.detalhes?.falta ?? 0) : 0 };
  }
  marcarPosse(item.id);
  return { ok: true, faltam: 0 };
}
