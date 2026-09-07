/**
 * AS LISTAS DE NÍVEL, DO LADO DO SERVIDOR.
 *
 * O PROBLEMA QUE ISTO RESOLVE (auditoria de 2026-09-07, achado A39). `nivelCefr` responde a partir
 * de um índice que precisa ser REGISTRADO antes (`registrarNiveis`). Quem registrava era
 * `precarregarNiveis`, em `src/data/trilha/carregar.ts` — e aquele módulo usa `import.meta.glob`,
 * que só existe sob o Vite. Ou seja: no navegador as dezesseis listas entravam sob demanda, e no
 * servidor NENHUMA entrava. Só o inglês respondia, porque `cefrWordlist` o importa estaticamente.
 *
 * A consequência era silenciosa e persistente: `bulkAdd` e a ativação de baralhos Anki chamavam
 * `nivelCefr(palavra, srcLang ?? 'en')`, o índice do idioma não existia, e o cartão era GRAVADO com
 * `cefr_level = null` e procedência `ausente`. Um cartão em espanhol nascia sem nível para sempre,
 * e nada na tela dizia por quê — o filtro por nível e a fluência simplesmente não viam aquele
 * acervo.
 *
 * COMO ISTO É CARREGADO. Os JSONs entram por import estático: o servidor é empacotado por esbuild
 * (`dist-server/server.cjs`, `--packages=external`), então ler do disco exigiria copiar os arquivos
 * para a imagem e resolver caminho em três ambientes (dev, teste, Docker) — três lugares para o
 * mesmo dado sumir sem aviso. Empacotados, eles não podem faltar.
 *
 * O CUSTO É PAGO SOB DEMANDA. O import inline os coloca no bundle, mas `montar()` (que quebra as
 * listas em Map, dezenas de milhares de entradas somando todos os idiomas) só roda para o idioma
 * que alguém de fato pedir — `garantirNiveis` é chamado no caminho de gravação de cartão, e
 * `registrarNiveis` é idempotente.
 */
import { registrarNiveis } from '../../src/core/learning/cefrWordlist'
import { baseDoIdioma } from '../../src/data/trilha/indice'

import ar from '../../src/data/trilha/niveis/ar.json'
import de from '../../src/data/trilha/niveis/de.json'
import en from '../../src/data/trilha/niveis/en.json'
import es from '../../src/data/trilha/niveis/es.json'
import fr from '../../src/data/trilha/niveis/fr.json'
import he from '../../src/data/trilha/niveis/he.json'
import hi from '../../src/data/trilha/niveis/hi.json'
import it from '../../src/data/trilha/niveis/it.json'
import ja from '../../src/data/trilha/niveis/ja.json'
import ko from '../../src/data/trilha/niveis/ko.json'
import nl from '../../src/data/trilha/niveis/nl.json'
import pl from '../../src/data/trilha/niveis/pl.json'
import ru from '../../src/data/trilha/niveis/ru.json'
import sv from '../../src/data/trilha/niveis/sv.json'
import tr from '../../src/data/trilha/niveis/tr.json'
import zh from '../../src/data/trilha/niveis/zh.json'

type Niveis = Record<string, string>

const LISTAS: Record<string, Niveis> = {
  ar, de, en, es, fr, he, hi, it, ja, ko, nl, pl, ru, sv, tr, zh,
}

/** Os idiomas para os quais o servidor tem lista. A ausência é resposta, não falha. */
export function idiomasComNiveis(): string[] {
  return Object.keys(LISTAS).sort()
}

/**
 * Garante que a lista do idioma esteja registrada antes de perguntar o nível de uma palavra.
 *
 * Idioma sem lista não é erro: `nivelCefr` responde `ausente`, que é a resposta honesta e já era o
 * comportamento previsto pelo núcleo.
 */
export function garantirNiveis(lang: string | null | undefined): void {
  const idioma = baseDoIdioma(lang ?? '')
  const lista = LISTAS[idioma]
  if (lista) registrarNiveis(idioma, lista)
}
