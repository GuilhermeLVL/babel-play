/**
 * OS ESQUEMAS DE SAÍDA (JSON Schema) das funções de IA que respondem JSON — explicação, resumo, "Outras formas" e
 * polimento (Fase B do plano de qualidade da IA paga, item 2).
 *
 * POR QUE. Sem esquema, o modelo às vezes devolve cerca de código, texto em volta ou campo trocado, e a rota responde
 * 502 `resposta_invalida` — DEPOIS de o provedor cobrar, e com o uso já consumido. Com `response_format: json_schema`
 * `strict`, o provedor que suporta saída estruturada restringe a geração ao esquema.
 *
 * O ESQUEMA NÃO SUBSTITUI A LEITURA. Os leitores `ler*` (`promptDaExplicacao.ts`, `promptDoResumo.ts`,
 * `promptDasAlternativas.ts`, `promptDoPolimento.ts`) continuam defensivos: a reserva da cascata pode não aplicar o
 * esquema (provedor fora do OpenRouter, ou endpoint sem suporte), e os tetos de tamanho e a régua de qualidade
 * continuam sendo deles.
 *
 * O FORMATO É O DO MODO ESTRITO (OpenAI/OpenRouter, "Structured Outputs"): todo objeto com `additionalProperties:
 * false` e TODAS as chaves em `required`; nada de palavra-chave que algum provedor recuse (`minItems`, `pattern`).
 * Módulo puro, sem imports: o servidor e a bancada (`scripts/eval-ia/`) o leem igual.
 */

/** O que vai em `response_format.json_schema`: o nome (só `[a-zA-Z0-9_-]`) e o esquema. */
export interface FormatoDeSaida {
  nome: string;
  esquema: Readonly<Record<string, unknown>>;
}

const texto = { type: 'string' } as const;

const objeto = (propriedades: Record<string, unknown>) => ({
  type: 'object',
  properties: propriedades,
  required: Object.keys(propriedades),
  additionalProperties: false,
});

/** `{"porQue", "gramatica", "registro", "girias": [{"termo", "sentido"}]}` — `lerExplicacao`. */
export const SAIDA_DA_EXPLICACAO: FormatoDeSaida = {
  nome: 'explicacao',
  esquema: objeto({
    porQue: texto,
    gramatica: texto,
    registro: texto,
    girias: { type: 'array', items: objeto({ termo: texto, sentido: texto }) },
  }),
};

/** `{"pontos": [3 textos], "cartoes": [{"fala", "palavra", "verso"}]}` — `lerResumo` e `cartoesDoResumo`. */
export const SAIDA_DO_RESUMO: FormatoDeSaida = {
  nome: 'resumo',
  esquema: objeto({
    pontos: { type: 'array', items: texto },
    cartoes: { type: 'array', items: objeto({ fala: { type: 'integer' }, palavra: texto, verso: texto }) },
  }),
};

/** `{"opcoes": [textos], "nota"}` — `lerAlternativas`. */
export const SAIDA_DAS_ALTERNATIVAS: FormatoDeSaida = {
  nome: 'alternativas',
  esquema: objeto({ opcoes: { type: 'array', items: texto }, nota: texto }),
};

/** `{"linhas": [{"n", "traducao"}]}` — `lerPolimento`. */
export const SAIDA_DO_POLIMENTO: FormatoDeSaida = {
  nome: 'polimento',
  esquema: objeto({ linhas: { type: 'array', items: objeto({ n: { type: 'integer' }, traducao: texto }) } }),
};
