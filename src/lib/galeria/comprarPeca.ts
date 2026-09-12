import { gastarSeeds } from '../../data/api';
import { type ItemDaLoja, marcarPosse } from '../loja';

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
 * Não celebra, não avisa, não relê saldo: quem chama decide a festa e o texto, que mudam por
 * tela. Aqui só se resolve se o item ficou sendo da pessoa.
 */
export async function comprarPecaComSeeds(item: ItemDaLoja): Promise<boolean> {
  if (item.precoSeeds === undefined) return false;
  try {
    const r = await gastarSeeds({
      spendId: `loja-${item.id}`,
      amount: item.precoSeeds,
      reason: `loja:${item.id}`,
    });
    if (r && (r as { ok?: boolean }).ok === false) return false;
    marcarPosse(item.id);
    return true;
  } catch {
    return false;
  }
}
