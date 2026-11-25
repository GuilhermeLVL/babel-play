// @vitest-environment jsdom
/**
 * ARMAZÉNS DO APARELHO QUE SÃO DA CONTA (pendências da auditoria `docs/auditoria/2026-11-25-dados-locais-por-conta.md`):
 * Meus livros, memória de tradução, desenhos, cosméticos da galeria, marcadores de gamificação, foto e avatar.
 * Cada conjunto é conferido em: conta -> conta, recarga com outra conta, sair, "esquecer este navegador" e o visitante
 * que entra numa conta (fica pendente até a pessoa escolher "trazer" ou "apagar").
 */
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn(async () => ({})) } },
  authRequired: true,
  carregarSupabase: async () => ({ auth: { signOut: vi.fn(async () => ({})) } }),
}))

import { limparTudo } from '../src/data/efemero/store'
import {
  _lerMarcador,
  apagarDadosDoVisitante,
  CHAVE_DO_DONO,
  CONJUNTOS,
  EVENTO_DE_ARMAZENS_LIMPOS,
  temDadosDoVisitante,
  trazerDadosDoVisitante,
  visitantePendente,
} from '../src/lib/armazensDoAparelhoDaConta'
import { _reiniciarGuardaDosArmazensLocais, iniciarGuardaDosArmazensLocais } from '../src/lib/guardaDosArmazensLocais'
import { _reiniciarIdentidade, definirDonoDaConta, definirIdentidade } from '../src/lib/identidade'
import { guardarMeuLivro, lerMeusLivros } from '../src/lib/livros/meusLivros'

const espera = () => new Promise((r) => setTimeout(r, 40))
const entrar = (id: string) => {
  definirDonoDaConta(id)
  definirIdentidade('conta')
}
const sair = () => {
  definirDonoDaConta(null)
  definirIdentidade('anonimo')
}

const guardarNoBanco = (nome: string, loja: string): Promise<void> =>
  new Promise((ok, falha) => {
    const r = indexedDB.open(nome, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(loja)
    r.onsuccess = () => {
      const tx = r.result.transaction(loja, 'readwrite')
      tx.objectStore(loja).put({ x: 1 }, 'k')
      tx.oncomplete = () => {
        r.result.close()
        ok()
      }
      tx.onerror = () => falha(tx.error)
    }
    r.onerror = () => falha(r.error)
  })

const linhasNoBanco = async (nome: string, loja: string): Promise<number> => {
  /* Não abre o que não existe: abrir criaria o banco vazio e sujaria o que o teste confere. */
  if (!(await indexedDB.databases()).some((d) => d.name === nome)) return 0
  return new Promise((ok) => {
    const r = indexedDB.open(nome)
    r.onerror = () => ok(-1)
    r.onsuccess = () => {
      const db = r.result
      if (!db.objectStoreNames.contains(loja)) {
        db.close()
        return ok(0)
      }
      const c = db.transaction(loja).objectStore(loja).count()
      c.onsuccess = () => {
        db.close()
        ok(c.result)
      }
    }
  })
}

const nomesDeBancos = async () => (await indexedDB.databases()).map((d) => d.name)

/** Um exemplo de cada conjunto: o que gravar e como saber se ainda está lá. */
interface Caso {
  conjunto: string
  gravar(): Promise<void>
  existe(): Promise<boolean>
  banco?: string
}

const casos: Caso[] = [
  {
    conjunto: 'meus-livros',
    gravar: async () => {
      guardarMeuLivro({ id: 'meu-1', titulo: 'Segredo da A', origem: 'arquivo' })
      localStorage.setItem('leitor:posicao:meu-1', '{}')
      await guardarNoBanco('frasy-livros', 'conteudo')
    },
    existe: async () =>
      lerMeusLivros().length > 0 ||
      localStorage.getItem('frasy.livros.meus.v1') !== null ||
      localStorage.getItem('leitor:posicao:meu-1') !== null ||
      (await linhasNoBanco('frasy-livros', 'conteudo')) > 0,
    banco: 'frasy-livros',
  },
  {
    conjunto: 'memória de tradução',
    gravar: () => guardarNoBanco('babel-memoria-de-traducao', 'traducoes'),
    existe: async () => (await linhasNoBanco('babel-memoria-de-traducao', 'traducoes')) > 0,
    banco: 'babel-memoria-de-traducao',
  },
  {
    conjunto: 'desenhos por sessão',
    gravar: async () => {
      localStorage.setItem('babel.desenho.sessao:s1', '{}')
      await guardarNoBanco('babel-desenhos', 'sessoes')
    },
    existe: async () =>
      localStorage.getItem('babel.desenho.sessao:s1') !== null ||
      (await linhasNoBanco('babel-desenhos', 'sessoes')) > 0,
    banco: 'babel-desenhos',
  },
  {
    conjunto: 'cosméticos da galeria',
    gravar: async () => {
      localStorage.setItem('babel.perfis', '["x"]')
      localStorage.setItem('babel.croma_equipado', 'ouro')
    },
    existe: async () =>
      localStorage.getItem('babel.perfis') !== null || localStorage.getItem('babel.croma_equipado') !== null,
  },
  {
    conjunto: 'marcadores de gamificação',
    gravar: async () => {
      localStorage.setItem('babel.conquistas', '["a"]')
      localStorage.setItem('babel.recompensas_vistas', '["r"]')
    },
    existe: async () =>
      localStorage.getItem('babel.conquistas') !== null || localStorage.getItem('babel.recompensas_vistas') !== null,
  },
  {
    conjunto: 'foto e avatar',
    gravar: async () => {
      localStorage.setItem('babel.fotoDoPerfil.A', 'data:image/jpeg;base64,AA')
      localStorage.setItem('frasy.avatar.miniatura.A', 'data:image/png;base64,AA')
      await guardarNoBanco('frasy-avatar', 'receitas')
    },
    existe: async () =>
      localStorage.getItem('babel.fotoDoPerfil.A') !== null ||
      localStorage.getItem('frasy.avatar.miniatura.A') !== null ||
      (await linhasNoBanco('frasy-avatar', 'receitas')) > 0,
    banco: 'frasy-avatar',
  },
]

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  _reiniciarIdentidade()
  _reiniciarGuardaDosArmazensLocais()
})
afterEach(() => {
  _reiniciarGuardaDosArmazensLocais()
  _reiniciarIdentidade()
})

describe('os conjuntos cobrem o que a auditoria deixou pendente', () => {
  it('cada armazém pendente tem um conjunto', () => {
    expect(CONJUNTOS.map((c) => c.nome).sort()).toEqual(
      [
        'cosmeticos-da-galeria',
        'desenhos',
        'foto-e-avatar',
        'marcadores-de-gamificacao',
        'meus-livros',
        'memoria-de-traducao',
      ].sort(),
    )
  })
})

describe.each(casos)('$conjunto', (c) => {
  it('conta -> conta: a B não vê o que a A guardou', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    await c.gravar()
    expect(await c.existe()).toBe(true)
    definirDonoDaConta('B')
    await espera()
    expect(await c.existe()).toBe(false)
    expect(_lerMarcador()).toBe('B')
  })

  it('recarga com outra conta: o que a A deixou sai na partida, sem ninguém abrir a tela', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    await c.gravar()
    // recarrega: o disco fica, o módulo de identidade e a guarda nascem de novo
    _reiniciarIdentidade()
    _reiniciarGuardaDosArmazensLocais()
    entrar('B')
    iniciarGuardaDosArmazensLocais()
    await espera()
    expect(await c.existe()).toBe(false)
  })

  it('recarga com a MESMA conta: o que é dela continua', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    await c.gravar()
    _reiniciarIdentidade()
    _reiniciarGuardaDosArmazensLocais()
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    expect(await c.existe()).toBe(true)
  })

  it('sair apaga; entrar de novo não traz nada', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    await c.gravar()
    sair()
    await espera()
    expect(await c.existe()).toBe(false)
    entrar('A')
    await espera()
    expect(await c.existe()).toBe(false)
  })

  it('"esquecer este navegador" destrói o banco e as chaves, mesmo com o conjunto de outra conta', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    await c.gravar()
    await limparTudo()
    expect(await c.existe()).toBe(false)
    if (c.banco) expect(await nomesDeBancos()).not.toContain(c.banco)
  })
})

describe('a guarda não cria banco onde ninguém gravou nada', () => {
  it('iniciar, trocar de conta e sair não deixam nenhum banco IndexedDB', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    definirDonoDaConta('B')
    await espera()
    sair()
    await espera()
    expect(await nomesDeBancos()).toEqual([])
  })
})

describe('dado de antes da regra (sem marcador)', () => {
  it('é adotado por quem está aqui na primeira abertura, e depois a regra vale', async () => {
    localStorage.setItem('babel.perfis', '["x"]')
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    expect(localStorage.getItem('babel.perfis')).not.toBeNull()
    expect(_lerMarcador()).toBe('A')
    definirDonoDaConta('B')
    await espera()
    expect(localStorage.getItem('babel.perfis')).toBeNull()
  })

  it('sem dono conhecido (identidade carregando) a guarda não mexe em nada', async () => {
    localStorage.setItem(CHAVE_DO_DONO, 'A')
    localStorage.setItem('babel.perfis', '["x"]')
    definirIdentidade('conta') // conta sem id informado ainda: não se sabe de quem é
    iniciarGuardaDosArmazensLocais()
    await espera()
    expect(localStorage.getItem('babel.perfis')).not.toBeNull()
  })
})

describe('o visitante que entra numa conta: fica pendente até a pessoa escolher', () => {
  const comoVisitante = async () => {
    definirIdentidade('anonimo')
    iniciarGuardaDosArmazensLocais()
    await espera()
    localStorage.setItem('babel.perfis', '["do visitante"]')
    guardarMeuLivro({ id: 'meu-v', titulo: 'Livro do visitante', origem: 'arquivo' })
    await guardarNoBanco('frasy-livros', 'conteudo')
    expect(_lerMarcador()).toBe('anonimo')
  }

  it('ao entrar, nada é apagado nem adotado sozinho, e o aviso aparece', async () => {
    await comoVisitante()
    entrar('A')
    await espera()
    expect(localStorage.getItem('babel.perfis')).not.toBeNull()
    expect(_lerMarcador()).toBe('anonimo')
    expect(visitantePendente()).toBe(true)
    expect(await temDadosDoVisitante()).toBe(true)
  })

  it('"trazer para esta conta": passa a ser da conta e some quando ela sai', async () => {
    await comoVisitante()
    entrar('A')
    await espera()
    trazerDadosDoVisitante()
    expect(_lerMarcador()).toBe('A')
    expect(visitantePendente()).toBe(false)
    expect(localStorage.getItem('babel.perfis')).not.toBeNull()
    sair()
    await espera()
    expect(localStorage.getItem('babel.perfis')).toBeNull()
    expect(await linhasNoBanco('frasy-livros', 'conteudo')).toBe(0)
  })

  it('"apagar": tudo o que o visitante deixou sai, inclusive o conteúdo dos livros, e a lista na tela', async () => {
    await comoVisitante()
    expect(lerMeusLivros()).toHaveLength(1)
    entrar('A')
    await espera()
    const limpou = vi.fn()
    window.addEventListener(EVENTO_DE_ARMAZENS_LIMPOS, limpou)
    await apagarDadosDoVisitante()
    window.removeEventListener(EVENTO_DE_ARMAZENS_LIMPOS, limpou)
    expect(limpou).toHaveBeenCalled()
    expect(localStorage.getItem('babel.perfis')).toBeNull()
    expect(lerMeusLivros()).toHaveLength(0)
    expect(await linhasNoBanco('frasy-livros', 'conteudo')).toBe(0)
    expect(await temDadosDoVisitante()).toBe(false)
    expect(_lerMarcador()).toBe('A')
  })

  it('"agora não": a conta sai e o que era do visitante continua pendente para a próxima vez', async () => {
    await comoVisitante()
    entrar('A')
    await espera()
    sair()
    await espera()
    expect(_lerMarcador()).toBe('anonimo')
    expect(localStorage.getItem('babel.perfis')).not.toBeNull()
  })

  it('a foto e o avatar da conta (por usuário) saem ao sair, mesmo com o visitante pendente', async () => {
    await comoVisitante()
    entrar('A')
    await espera()
    localStorage.setItem('babel.fotoDoPerfil.A', 'data:image/jpeg;base64,AA')
    sair()
    await espera()
    expect(localStorage.getItem('babel.fotoDoPerfil.A')).toBeNull()
    expect(localStorage.getItem('babel.perfis')).not.toBeNull()
  })

  it('sem nada do visitante, não há aviso', async () => {
    definirIdentidade('anonimo')
    iniciarGuardaDosArmazensLocais()
    await espera()
    entrar('A')
    await espera()
    expect(await temDadosDoVisitante()).toBe(false)
  })

  it('o visitante que só abriu o app: a conta adota, e o que ela grava depois não faz o aviso aparecer', async () => {
    definirIdentidade('anonimo')
    iniciarGuardaDosArmazensLocais()
    await espera()
    localStorage.setItem('babel.presenca_dia', '2026-11-25')
    localStorage.setItem('babel.nivel_visto', '1')
    entrar('A')
    await espera()
    expect(_lerMarcador()).toBe('A')
    localStorage.setItem('babel.conquistas', '[]')
    expect(visitantePendente()).toBe(false)
    expect(await temDadosDoVisitante()).toBe(false)
  })
})

describe('"Meus livros": a lista na memória se esquece quando o conjunto é apagado', () => {
  it('sair esvazia a lista que a tela lê', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await espera()
    guardarMeuLivro({ id: 'meu-1', titulo: 'Segredo da A', origem: 'arquivo' })
    expect(lerMeusLivros()).toHaveLength(1)
    sair()
    await espera()
    expect(lerMeusLivros()).toHaveLength(0)
  })
})
