/**
 * OS TEXTOS QUE O RESPONSÁVEL ACEITA (Fase 4) — versão para revisão jurídica, 24/09/2026.
 *
 * O texto aceito é GRAVADO junto com a versão no vínculo (`consentimento_texto`,
 * `consentimento_versao`): a prova do consentimento é o que a pessoa leu, não o que o código diz
 * hoje. Mudar o texto exige subir a VERSÃO — um aceite antigo continua apontando para o texto dele.
 *
 * Dois textos, porque a lei pede coisas diferentes:
 *  - 12 a 15 anos: VÍNCULO da conta ao responsável (ECA Digital, Lei 15.211/2025, art. 24);
 *  - menos de 12: CONSENTIMENTO ESPECÍFICO e em destaque de um dos pais ou responsável para o
 *    tratamento dos dados da criança (LGPD art. 14 §1º).
 *
 * PENDENTE DE ADVOGADO: redação final e o escopo exato do art. 24 do ECA Digital.
 */
export const VERSAO_DO_CONSENTIMENTO = 'v1-2026-09-24'

export const TEXTO_DO_VINCULO = [
  'Declaro que sou pai, mãe ou responsável legal pela pessoa que me convidou, que tem entre 12 e 15 anos,',
  'e aceito vincular a conta dela à minha no Babel Play.',
  'Entendo que: a conta dela funciona no perfil protegido (sem ranking público, sem pressão por sequência de dias,',
  'sem compras feitas por ela e com a IA restrita ao ensino de idiomas); os dados de estudo dela (sessões gravadas,',
  'palavras e progresso) passam a ser guardados no servidor para sincronizar entre aparelhos;',
  'qualquer compra ou assinatura para ela só pode ser feita por mim;',
  'e posso pedir a qualquer momento a exportação ou a exclusão desses dados pelo próprio app ou pelo e-mail do encarregado.',
].join(' ')

export const TEXTO_DO_CONSENTIMENTO_MENOR_12 = [
  'CONSENTIMENTO ESPECÍFICO (LGPD, art. 14, § 1º). Declaro que sou pai, mãe ou responsável legal pela criança',
  'que me convidou, que tem menos de 12 anos, e AUTORIZO, de forma específica e destacada, o Babel Play a tratar',
  'os dados pessoais dela estritamente para o ensino de idiomas: a conta (e-mail e data de nascimento), as sessões',
  'que ela gravar (áudio, transcrição e tradução), as palavras e o progresso de estudo.',
  'Os dados não são usados para publicidade nem para criar perfil de comportamento, não são vendidos',
  'nem compartilhados além dos fornecedores necessários para o serviço funcionar (hospedagem, login e',
  'processamento de voz e texto), e o áudio só vai para a nuvem quando esse recurso for usado.',
  'A conta dela funciona no perfil protegido (sem ranking público, sem pressão por sequência de dias, sem',
  'compras feitas por ela e com a IA restrita ao ensino de idiomas).',
  'Posso revogar este consentimento e pedir a exclusão de todos os dados a qualquer momento, pelo próprio app ou',
  'pelo e-mail do encarregado; sem o consentimento, a conta dela continua funcionando só no aparelho, sem nuvem.',
].join(' ')

export function textoParaFaixa(exigeConsentimentoEspecifico: boolean): string {
  return exigeConsentimentoEspecifico ? TEXTO_DO_CONSENTIMENTO_MENOR_12 : TEXTO_DO_VINCULO
}
