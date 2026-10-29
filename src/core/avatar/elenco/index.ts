export { lexicoDoIdioma, LEXICOS } from './lexico';
export { marcarFrases } from './marcador';
export { partirNoTeto, TETO_DE_CARACTERES_DA_FRASE } from './texto';
export {
  type ChaveDoElenco,
  chaveDoElencoComoTexto,
  CONFIANCA_MINIMA,
  type Falante,
  type FraseDeEntrada,
  type FraseMarcada,
  hashDoTexto,
  type OpcoesDoMarcador,
  type TipoDeFalante,
  VERSAO_DO_MARCADOR,
} from './tipos';
export { type ItemDaIa, type ResultadoDaValidacao, validarMarcacaoDaIa } from './validacao';
export {
  atribuirVozes,
  type DistribuicaoDeVozes,
  hashDoNome,
  type OpcoesDeVozes,
  parametrosDaEmocao,
  vozDaFrase,
  type VozDisponivel,
} from './vozes';
