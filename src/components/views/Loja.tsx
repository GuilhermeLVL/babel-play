/**
 * PERSONALIZAR — a tela é a do protótipo aprovado (`fidelidade/casca-e-telas.md`, 4.6): as cinco abas
 * (Coleção, Maestria, Temporada, Conquistas, Loja), com Coleção, Temporada e Loja redesenhadas.
 *
 * Comprar e equipar passam pelo mesmo `equiparItem` (lib/galeria/equipar), o único caminho que equipa
 * no app. As abas válidas e os apelidos antigos de endereço (`/loja/passe`, `/loja/loja`) moram em
 * `lib/rotas`.
 */
import type { LojaProps } from './loja/propsDaLoja';
import PersonalizarDoPrototipo from './personalizar/polimento/PersonalizarDoPrototipo';

export default function Loja(props: LojaProps) {
  return <PersonalizarDoPrototipo {...props} />;
}
