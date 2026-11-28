/**
 * Tarefa 0.1 da change `leitura-assistida`: as implementações reais das fatias cumprem as assinaturas do contrato
 * (`src/core/leitura/leituraAssistida.ts`). O `satisfies` falha no typecheck se alguma assinatura divergir.
 */
import { describe, expect, it } from 'vitest'

import { abrirAjustarNivel } from '../src/components/views/leitor/PainelAjustarNivel'
import type { AbrirAjustarNivelFn, LerEmVozAltaFn, StatusDaPalavraFn } from '../src/core/leitura/leituraAssistida'
import { statusDaPalavra } from '../src/lib/leitor/forcaDaPalavra'
import { lerEmVozAlta } from '../src/lib/leitor/lerEmVoz'

describe('contrato da leitura assistida', () => {
  it('as fatias publicam as funções do contrato', () => {
    const c = {
      statusDaPalavra: statusDaPalavra satisfies StatusDaPalavraFn,
      abrirAjustarNivel: abrirAjustarNivel satisfies AbrirAjustarNivelFn,
      lerEmVozAlta: lerEmVozAlta satisfies LerEmVozAltaFn,
    }
    for (const f of Object.values(c)) expect(typeof f).toBe('function')
  })
})
