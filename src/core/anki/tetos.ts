/**
 * TETOS DE UMA NOTA NO FIO — fonte ÚNICA (revisão final da Fase 3, R13).
 *
 * Quem lê daqui: o schema do servidor (`notaRecebidaSchema`, `server/validation.ts`), que RECUSA
 * acima destes valores, e o mapeamento do cliente (`notaParaOFio`, `src/data/apiAnki.ts`), que CORTA
 * nestes mesmos valores antes de mandar. Os dois lados lendo o mesmo número é o que garante que uma
 * nota legítima do leitor (`montarNota` nunca corta) nunca volte 400 e deixe o import parado no meio.
 */
export const TETOS_DA_NOTA = {
  frente: 2_000,
  verso: 4_000,
  exemplo: 4_000,
  campoBruto: 50_000,
  chavesDeCamposBrutos: 60,
  campos: 60,
  nomeDeCampo: 200,
  tags: 200,
  tag: 200,
  midia: 100,
  nomeDeMidia: 400,
  lacunas: 100,
  lacuna: 2_000,
  notetype: 200,
  guid: 64,
} as const;
