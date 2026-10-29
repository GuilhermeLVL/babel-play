import { describe, expect, it } from 'vitest'

import { avaliarLicenca } from '../src/core/avatar/licencaVrm'

const vrm1 = (extra: Record<string, unknown> = {}) => ({
  metaVersion: '1',
  name: 'Modelo',
  authors: ['Autora'],
  licenseUrl: 'https://vrm.dev/licenses/1.0/',
  avatarPermission: 'everyone',
  commercialUsage: 'corporation',
  creditNotation: 'unnecessary',
  modification: 'allowModification',
  allowExcessivelyViolentUsage: false,
  allowExcessivelySexualUsage: false,
  allowAntisocialOrHateUsage: false,
  ...extra,
})

const vrm0 = (extra: Record<string, unknown> = {}) => ({
  metaVersion: '0',
  title: 'Modelo',
  licenseName: 'CC0',
  otherLicenseUrl: '',
  allowedUserName: 'Everyone',
  violentUssageName: 'Disallow',
  sexualUssageName: 'Disallow',
  commercialUssageName: 'Allow',
  ...extra,
})

describe('VRM 1.0', () => {
  it('licença explícita que proíbe uso sexual e violento: aceita para adulto e para menor', () => {
    for (const perfil of ['adulto', 'menor'] as const) {
      const r = avaliarLicenca(vrm1(), perfil)
      expect(r.versao).toBe('vrm1')
      expect(r.decisao).toBe('aceita')
      expect(r.bloqueios).toEqual([])
      expect(r.urlDaLicenca).toBe('https://vrm.dev/licenses/1.0/')
    }
  })

  it('uso sexual permitido: aviso para adulto, recusa para menor', () => {
    const a = avaliarLicenca(vrm1({ allowExcessivelySexualUsage: true }), 'adulto')
    expect(a.decisao).toBe('aceita')
    expect(a.avisos).toContain('uso_sexual')
    const m = avaliarLicenca(vrm1({ allowExcessivelySexualUsage: true }), 'menor')
    expect(m.decisao).toBe('recusada')
    expect(m.bloqueios).toContain('uso_sexual')
  })

  it('uso violento NÃO declarado também recusa o menor', () => {
    const m = avaliarLicenca(vrm1({ allowExcessivelyViolentUsage: undefined }), 'menor')
    expect(m.decisao).toBe('recusada')
    expect(m.bloqueios).toEqual(['uso_violento'])
  })

  it('antissocial/ódio não proibido recusa o menor', () => {
    expect(avaliarLicenca(vrm1({ allowAntisocialOrHateUsage: true }), 'menor').bloqueios).toContain('uso_odio')
  })

  it('onlyAuthor: adulto confirma, menor é recusado', () => {
    const a = avaliarLicenca(vrm1({ avatarPermission: 'onlyAuthor' }), 'adulto')
    expect(a.decisao).toBe('confirmar')
    expect(a.confirmacoes).toEqual(['uso_restrito'])
    expect(avaliarLicenca(vrm1({ avatarPermission: 'onlySeparatelyLicensedPerson' }), 'menor').decisao).toBe('recusada')
  })

  it('sem endereço de licença: não declarada', () => {
    const m = avaliarLicenca(vrm1({ licenseUrl: '' }), 'menor')
    expect(m.bloqueios).toContain('licenca_nao_declarada')
    expect(avaliarLicenca(vrm1({ licenseUrl: 'javascript:alert(1)' }), 'adulto').decisao).toBe('confirmar')
  })

  it('crédito obrigatório, uso comercial proibido e modificação proibida viram aviso', () => {
    const r = avaliarLicenca(
      vrm1({ creditNotation: 'required', commercialUsage: 'personalNonProfit', modification: 'prohibited' }),
      'adulto',
    )
    expect(r.credito).toBe('obrigatorio')
    expect(r.avisos).toEqual(
      expect.arrayContaining(['credito_obrigatorio', 'comercial_proibido', 'modificacao_proibida']),
    )
    expect(r.decisao).toBe('aceita')
  })
})

describe('VRM 0.x', () => {
  it('CC0 que proíbe uso sexual e violento: aceita para menor', () => {
    const r = avaliarLicenca(vrm0(), 'menor')
    expect(r.versao).toBe('vrm0')
    expect(r.decisao).toBe('aceita')
  })

  it('o padrão do exportador (Allow/Allow) é aviso para adulto e recusa para menor importando', () => {
    const meta = vrm0({ violentUssageName: 'Allow', sexualUssageName: 'Allow' })
    expect(avaliarLicenca(meta, 'adulto').avisos).toEqual(expect.arrayContaining(['uso_sexual', 'uso_violento']))
    expect(avaliarLicenca(meta, 'menor').decisao).toBe('recusada')
  })

  it('licença "Other" sem endereço não conta como declarada', () => {
    expect(avaliarLicenca(vrm0({ licenseName: 'Other' }), 'adulto').confirmacoes).toContain('licenca_nao_declarada')
    expect(
      avaliarLicenca(vrm0({ licenseName: 'Other', otherLicenseUrl: 'https://exemplo.dev/l' }), 'adulto').decisao,
    ).toBe('aceita')
  })

  it('OnlyAuthor e ExplicitlyLicensedPerson restringem', () => {
    expect(avaliarLicenca(vrm0({ allowedUserName: 'OnlyAuthor' }), 'adulto').confirmacoes).toContain('uso_restrito')
    expect(avaliarLicenca(vrm0({ allowedUserName: 'ExplicitlyLicensedPerson' }), 'menor').decisao).toBe('recusada')
  })

  it('detecta a versão pelos campos quando falta metaVersion', () => {
    const { metaVersion: _a, ...sem0 } = vrm0()
    const { metaVersion: _b, ...sem1 } = vrm1()
    expect(avaliarLicenca(sem0, 'adulto').versao).toBe('vrm0')
    expect(avaliarLicenca(sem1, 'adulto').versao).toBe('vrm1')
  })
})

describe('sem meta', () => {
  it('adulto confirma direitos; menor é recusado', () => {
    for (const meta of [undefined, null, {}, 'texto', 42, [], { qualquer: 1 }]) {
      const a = avaliarLicenca(meta, 'adulto')
      expect(a.versao).toBe('sem_meta')
      expect(a.decisao).toBe('confirmar')
      expect(a.confirmacoes).toContain('licenca_nao_declarada')
      const m = avaliarLicenca(meta, 'menor')
      expect(m.decisao).toBe('recusada')
      expect(m.bloqueios).toContain('licenca_nao_declarada')
    }
  })
})

describe('coleção curada pelo Frasy', () => {
  const toxsam = vrm0({ violentUssageName: 'Allow', sexualUssageName: 'Allow' })

  it('é isenta da regra de meta para menores (colecao e familia)', () => {
    for (const origem of ['colecao', 'familia'] as const) {
      const r = avaliarLicenca(toxsam, 'menor', origem)
      expect(r.decisao).toBe('aceita')
      expect(r.bloqueios).toEqual([])
    }
    expect(avaliarLicenca(undefined, 'menor', 'colecao').decisao).toBe('aceita')
  })

  it('mantém o aviso de crédito obrigatório', () => {
    const r = avaliarLicenca(vrm1({ creditNotation: 'required' }), 'menor', 'colecao')
    expect(r.avisos).toContain('credito_obrigatorio')
  })

  it('importado nunca é isento', () => {
    expect(avaliarLicenca(toxsam, 'menor', 'importado').decisao).toBe('recusada')
  })
})

describe('entradas hostis', () => {
  it('campos de tipo errado, textos enormes e protótipo não derrubam', () => {
    const hostil = vrm1({
      licenseUrl: 'https://x.dev/' + 'a'.repeat(1_048_576),
      avatarPermission: { toString: () => 'everyone' },
      allowExcessivelySexualUsage: 'false',
    })
    const r = avaliarLicenca(hostil, 'menor')
    expect(r.decisao).toBe('recusada')
    expect(r.urlDaLicenca).toBe('')
    expect(() => avaliarLicenca(JSON.parse('{"__proto__":{"avatarPermission":"everyone"}}'), 'menor')).not.toThrow()
    expect(avaliarLicenca(JSON.parse('{"__proto__":{"avatarPermission":"everyone"}}'), 'menor').decisao).toBe(
      'recusada',
    )
  })

  it('perfil que não é exatamente adulto falha fechado (tratado como menor)', () => {
    expect(avaliarLicenca(undefined, 'qualquer' as never).decisao).toBe('recusada')
  })
})
