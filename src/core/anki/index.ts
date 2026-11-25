export { extrairCloze, extrairMidia, limparCampo } from './campo';
export { decidirIdiomaOrigem, escritaDominante, versoEhDefinicao } from './escrita';
export { hashDaEstrutura, normalizarNomeDeCampo } from './estrutura';
export type {
  Confianca,
  MapeamentoInferido,
  OpcoesDaInferencia,
  OrigemDoPalpite,
  Palpite,
  PapelNaImportacao,
} from './mapeador';
export {
  inferirMapeamento,
  mapeamentoServe,
  PAPEIS_NA_IMPORTACAO,
  preverNotas,
  textosDaNota,
  trocarPapel,
} from './mapeador';
export { indicePorNome, montarNota, PADRAO_FRENTE, PADRAO_VERSO, TETO_DE_NOTAS } from './mapeamento';
export { TETOS_DA_NOTA } from './tetos';
export { lerTextoAnki } from './texto';
export type { EstruturaLida, LeituraAnki, NotaAnki } from './tipos';
