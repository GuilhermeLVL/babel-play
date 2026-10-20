/**
 * IDENTIDADE DE UMA NOTA DO ANKI no acervo: o `guid` que faz um reimport atualizar em vez de duplicar,
 * e o hash da estrutura do note type. Fica num módulo próprio porque o protocolo em lotes
 * (`server/routes/ankiImports.ts`) a usa, e a identidade tem de ser calculada do MESMO jeito em todo import.
 */
import { createHash } from 'node:crypto'

/**
 * A IDENTIDADE DA NOTA — de onde vem, e por que a diferença importa.
 *
 * O `.apkg` traz `notes.guid`, o id estável do Anki: o mesmo entre exportações e entre máquinas. É
 * ele que faz um reimport ATUALIZAR a nota em vez de criar outra, inclusive quando o autor do
 * baralho corrigiu uma tradução. Esse é o caso que importa, e é justamente onde uma chave derivada
 * do conteúdo falha: o conteúdo mudou, a chave mudou, e a nota corrigida entraria como uma segunda
 * nota, ao lado da antiga.
 *
 * Arquivo de TEXTO (`.txt/.csv/.tsv`) não tem identidade nenhuma — quem o gerou não guardou id. Aí
 * sim resta derivar do conteúdo, e a limitação é real e declarada: editar a linha cria uma nota
 * nova. Preferimos isso a inventar um id que fingiria uma estabilidade que o formato não tem.
 */
export function guidDaNota(n: { guid?: string; notetype?: string | null; frente: string; verso: string }): string {
  if (n.guid) return n.guid
  return guidDerivadoDoConteudo(n)
}

function guidDerivadoDoConteudo(n: { notetype?: string | null; frente: string; verso: string }): string {
  return createHash('sha256')
    .update(`${n.notetype ?? ''}\x1f${n.frente}\x1f${n.verso}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}

/**
 * HASH DA ESTRUTURA do note type — reconhece "já vi este tipo de nota antes" para reaplicar um
 * mapeamento de campos salvo, sem depender do NOME do modelo (que a pessoa pode ter renomeado).
 *
 * Normaliza antes de gerar o hash: minúsculas, sem acento, espaços/hífen/underscore colapsados —
 * senão `Front-Text` e `front_text` (mesmo campo, grafias diferentes) virariam tipos "novos" a
 * cada exportação. A ORDEM entra no hash de propósito: campos iguais em ordem diferente mapeiam
 * para frente/verso diferentes, então são estruturas distintas de verdade.
 */
export function hashDaEstrutura(campos: string[]): string {
  const normalizados = (campos ?? []).map((c) =>
    (c ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[\s_-]+/g, ' '),
  )
  return createHash('sha256').update(normalizados.join('|'), 'utf8').digest('hex').slice(0, 16)
}
