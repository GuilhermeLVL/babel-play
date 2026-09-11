/**
 * Núcleo isomórfico do Babel Play (TS puro, sem DOM/Node/react).
 * Módulos liftados verbatim do app desktop (`../Tradutor`) — ver `docs/estrategia-reuso-web.md`.
 */

export * from './learning/cloze'
export * from './learning/conquistas'
export * from './learning/contract'
export * from './learning/due'
export * from './learning/economia'
export * from './learning/etapas'
export * from './learning/fluencia'
export * from './learning/interesses'
export * from './learning/previsaoDeIntervalo'
export * from './learning/quality'
export * from './learning/scheduler'
export * from './learning/trilha'
export * from './learning/xp'
/* Reexporte NOMEADO, e não `export *`: `cefrWordlist` também declara `CefrLevel` e `NIVEIS`, que
   já vêm de `contract` e de `trilha`. Um `export *` criaria ambiguidade no barril e o TypeScript
   recusaria, melhor escolher aqui do que renomear tipos que meia dúzia de arquivos já importa. */
export { coberturaDaWordlist, escalaDe, type NivelCefr, nivelCefr, type ProcedenciaCefr } from './learning/cefrWordlist'

/* Vocabulario compartilhado das notas de Anki (estado, filtro, cursor de paginacao): cliente,
   schema Zod e repositorio passam a ler a MESMA definicao — os tres discordavam (achado A21). */
export * from './economiaAutoridade'
export * from './gateway/budget'
export * from './gateway/gateway'
export * from './gateway/llm-types'
export * from './gateway/profile'
export {
cursorDeNotas,   type EstadoDeNotaAnki,   ESTADOS_DE_NOTA_ANKI, type FiltroDeNotaAnki,
FILTROS_DE_NOTA_ANKI, lerCursorDeNotas,
} from './learning/contract'
export * from './learning/fillers'
export * from './learning/keywords'
export * from './learning/memoriaDeItens'
export * from './learning/passive-voice'
export * from './learning/pronunciation'
export * from './learning/sobreposicao'
export * from './learning/text-stats'
export * from './loja'
export * from './minigames/autoDificuldade'
export * from './minigames/bingo'
export * from './minigames/desbloqueio'
export * from './minigames/duracao'
export * from './minigames/escuta'
export * from './minigames/estadoDosJogos'
export * from './minigames/fases'
export * from './minigames/filtro'
export * from './minigames/grade'
export * from './minigames/itemSource'
export * from './minigames/painelDaPratica'
export * from './minigames/revelavel'
export * from './minigames/scramble'
export * from './minigames/sequencia'
export * from './minigames/source'
export * from './minigames/termo'
export * from './minigames/termoLayout'
export * from './minigames/types'
export * from './minigames/wordsearch'
export * from './passe'
export * from './robustness'
export * from './tetoAnonimo'
