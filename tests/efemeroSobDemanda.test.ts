/**
 * O SERVIDOR EM MEMÓRIA SOB DEMANDA SEM CASCATA (auditoria de performance do frontend, 26/09/2026).
 *
 * Ele saiu do chunk de entrada (`data/funil.ts`), mas quem VAI usá-lo não pode pagar uma ida a mais
 * à rede depois de o React montar: na edição estática o chunk vem como `modulepreload` no HTML
 * (`scripts/vite/preCarregarEfemero.ts`), e no modo público sem sessão guardada o funil começa a
 * baixá-lo na própria carga do módulo. Quem tem conta ou roda self-host não baixa nada.
 */
import { describe, expect, it } from 'vitest'

import { arquivosDoModulo, linksQueFaltam } from '../scripts/vite/preCarregarEfemero'
import { deveAdiantarServidorEfemero } from '../src/data/funil'

describe('quem adianta o download do servidor em memória', () => {
  it('a edição estática sempre', () => {
    expect(deveAdiantarServidorEfemero({ estatica: true, authRequired: false, chaves: [] })).toBe(true)
  })
  it('self-host nunca (a identidade é o dono local)', () => {
    expect(deveAdiantarServidorEfemero({ estatica: false, authRequired: false, chaves: [] })).toBe(false)
  })
  it('modo público: sem sessão guardada do Supabase, sim; com sessão, não', () => {
    expect(deveAdiantarServidorEfemero({ estatica: false, authRequired: true, chaves: ['babel.tema'] })).toBe(true)
    expect(
      deveAdiantarServidorEfemero({ estatica: false, authRequired: true, chaves: ['sb-abcd1234-auth-token'] }),
    ).toBe(false)
  })
})

describe('modulepreload do servidor em memória na edição estática', () => {
  const bundle = {
    'assets/index-A.js': { type: 'chunk' as const, fileName: 'assets/index-A.js', facadeModuleId: '/r/src/main.tsx', imports: [] },
    'assets/servidor-B.js': {
      type: 'chunk' as const,
      fileName: 'assets/servidor-B.js',
      facadeModuleId: 'C:\\r\\src\\data\\efemero\\servidor.ts',
      imports: ['assets/index-A.js', 'assets/idb-C.js'],
    },
    'assets/idb-C.js': { type: 'chunk' as const, fileName: 'assets/idb-C.js', facadeModuleId: null, imports: [] },
    'assets/x.css': { type: 'asset' as const, fileName: 'assets/x.css' },
  }
  it('acha o chunk do servidor e o que ele importa', () => {
    expect(arquivosDoModulo(bundle, 'src/data/efemero/servidor.ts').sort()).toEqual([
      'assets/idb-C.js',
      'assets/index-A.js',
      'assets/servidor-B.js',
    ])
    expect(arquivosDoModulo(bundle, 'src/nao/existe.ts')).toEqual([])
  })
  it('não repete o que o HTML já pede', () => {
    const html = '<script type="module" crossorigin src="/assets/index-A.js"></script>'
    expect(linksQueFaltam(html, ['assets/index-A.js', 'assets/servidor-B.js'], '/')).toEqual(['/assets/servidor-B.js'])
  })
})
