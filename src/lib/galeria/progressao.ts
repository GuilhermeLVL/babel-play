/**
 * PROGRESSÃO — o mapa de "o que eu tenho, o que compro, o que só vem por conquista, o que vem
 * por nível". Puro: recebe o catálogo e o estado (nível, saldo) e classifica.
 *
 * Personalizar v3 (2026-08-28): as quatro áreas da tela (Meu visual · Loja · Conquistas ·
 * Progressão) leem daqui, e o modal de resgate lista TUDO que um nível abriu — antes
 * `recompensasDoNivel` (desbloqueios) só sabia de tema/posição/estúdio, e as partículas, packs,
 * cursores e galeria que o mesmo nível libera ficavam de fora do "você destravou".
 */
import { CATALOGO_DA_LOJA, estadoDoItem, possuidos, type ItemDaLoja } from '../loja'
import { CONQUISTAS } from '@core'

/** Itens que abrem por nível (sem exclusivo), agrupados: nível → itens. Ordenado por nível. */
export function itensPorNivel(catalogo: ReadonlyArray<ItemDaLoja> = CATALOGO_DA_LOJA): Map<number, ItemDaLoja[]> {
  const m = new Map<number, ItemDaLoja[]>()
  for (const i of catalogo) {
    if (i.exclusivoDe) continue
    const lista = m.get(i.nivel) ?? []
    lista.push(i)
    m.set(i.nivel, lista)
  }
  return new Map([...m.entries()].sort((a, b) => a[0] - b[0]))
}

export interface ProximaRecompensa {
  nivel: number
  itens: ItemDaLoja[]
  /** O 1º item, para caber numa linha ("próximo: 🎁 Nome"). */
  destaque: ItemDaLoja
}

/** O menor nível acima do atual que libera algo. `null` quando não há mais nada por nível. */
export function proximaRecompensa(nivelAtual: number, catalogo: ReadonlyArray<ItemDaLoja> = CATALOGO_DA_LOJA): ProximaRecompensa | null {
  const proximos = catalogo.filter((i) => !i.exclusivoDe && i.nivel > nivelAtual)
  if (!proximos.length) return null
  const nivel = Math.min(...proximos.map((i) => i.nivel))
  const itens = proximos.filter((i) => i.nivel === nivel)
  // O destaque é o mais raro daquele nível — é o que se mostra numa linha só.
  const peso = { lendario: 4, epico: 3, raro: 2, comum: 1 } as const
  const destaque = [...itens].sort((a, b) => peso[b.raridade] - peso[a.raridade])[0]
  return { nivel, itens, destaque }
}

export interface EstadoDaColecao {
  /** Já é seu (nível alcançado, comprado, ou conquista feita) — equipável. */
  possuidos: ItemDaLoja[]
  /**
   * OS MESMOS `possuidos`, separados por COMO foram conseguidos (mudança
   * economia-legivel-e-moedas). Três origens caíam num balde só e a coleção deixava de contar a
   * própria história: o tema que você ganhou subindo de nível ficava idêntico ao que você
   * comprou e ao que você conquistou. `possuidos` continua sendo a união, porque metade das
   * telas só quer saber "é meu?".
   */
  ganhosPorNivel: ItemDaLoja[]
  compradosComSeeds: ItemDaLoja[]
  conquistados: ItemDaLoja[]
  /** Dá para comprar agora com o saldo. */
  compraveis: ItemDaLoja[]
  /** Ainda trancado por nível (compra possível, mas o saldo não chega, ou sem preço). */
  porNivel: ItemDaLoja[]
  /** Só por conquista (e ainda não feita). */
  porConquista: ItemDaLoja[]
}

/** Classifica cada item do catálogo numa das quatro áreas. Aprimoramentos ficam fora (têm régua própria). */
export function estadoDaColecao(nivel: number, saldo: number, catalogo: ReadonlyArray<ItemDaLoja> = CATALOGO_DA_LOJA): EstadoDaColecao {
  const r: EstadoDaColecao = {
    possuidos: [], ganhosPorNivel: [], compradosComSeeds: [], conquistados: [],
    compraveis: [], porNivel: [], porConquista: [],
  }
  const comprados = possuidos()
  for (const i of catalogo) {
    if (i.tipo === 'aprimoramento') continue
    const { estado } = estadoDoItem(i, nivel, saldo)
    if (estado === 'equipavel') {
      r.possuidos.push(i)
      // A ordem importa: conquista ganha de compra, e compra ganha de nível — um item comprado
      // ANTES de o nível chegar continua sendo "eu comprei", que é o que a pessoa lembra.
      if (i.exclusivoDe) r.conquistados.push(i)
      else if (comprados.has(i.id)) r.compradosComSeeds.push(i)
      else r.ganhosPorNivel.push(i)
    }
    else if (i.exclusivoDe) r.porConquista.push(i)
    else if (estado === 'compravel') r.compraveis.push(i)
    else r.porNivel.push(i)
  }
  return r
}

/** TUDO que o nível `n` abre (Loja + galeria), para o modal de resgate. */
export function recompensasDoNivelCompleto(n: number, catalogo: ReadonlyArray<ItemDaLoja> = CATALOGO_DA_LOJA): ItemDaLoja[] {
  return catalogo.filter((i) => !i.exclusivoDe && i.nivel === n && i.tipo !== 'aprimoramento')
}

/** O item exclusivo que uma conquista libera, se houver. */
export function itemDaConquista(conquistaId: string, catalogo: ReadonlyArray<ItemDaLoja> = CATALOGO_DA_LOJA): ItemDaLoja | undefined {
  const c = CONQUISTAS.find((x) => x.id === conquistaId)
  const id = c?.recompensa.cosmetico
  return (id ? catalogo.find((i) => i.id === id) : undefined) ?? catalogo.find((i) => i.exclusivoDe === conquistaId)
}


/** Emoji/ícone textual de um item, para linhas compactas ("🎁 Nome"). */
export function emojiDoItem(item: ItemDaLoja): string {
  /* O TIPO MANDA, e a descrição é só o desempate.
     Antes era o contrário: o primeiro emoji da descrição, por regex, virava o ícone — então o
     ícone dependia do texto que alguém escreveu, e dois cursores tinham símbolos diferentes
     enquanto um tema e um pack podiam ter o mesmo. Não era um sistema, era um acidente por item.
     Agora o tipo dá o ícone estável, e só os tipos que se distinguem PELO conteúdo (packs e
     cursores, onde o emoji É o produto) continuam lendo a descrição. */
  const ehDoConteudo = item.tipo === 'pack' || item.tipo === 'cursor' || item.tipo === 'rastro'
  const m = ehDoConteudo ? item.desc.match(/\p{Extended_Pictographic}/u) : null
  if (m) return m[0]
  switch (item.tipo) {
    case 'tema': return '🎨'
    case 'fonte': return '🔤'
    case 'posicao': return '🧭'
    case 'estudio': return '🪄'
    case 'particulas': return '✨'
    case 'pack': return '😀'
    case 'cursor': return '🖱️'
    case 'rastro': return '💫'
    case 'galeria': return '🖼️'
    default: return '🎁'
  }
}
