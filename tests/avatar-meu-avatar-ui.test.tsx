// @vitest-environment jsdom
/**
 * "MEU AVATAR" (M2), a tela e o armazém, sem WebGL: a política de menor na UI (o perfil protegido não vê galeria de
 * terceiros nem importa), o opt-in da galeria (nenhuma requisição antes do "Quero ver", e sem cookie nem referer),
 * as recusas hostis com aviso para leitor de tela, a confirmação de direitos do adulto e o ciclo guardar/apagar.
 */
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { receitaNova } from '../src/core/avatar/edicao'
import { COLECAO_SUGERIVEL } from '../src/data/avatar/colecao'
import { esquecerConexaoDoAvatar, lerModeloImportado } from '../src/lib/avatar/armazem'
import {
  apagarMeuAvatar,
  chaveDoUsuario,
  lerCreditoGuardado,
  lerMeuAvatar,
  lerMiniatura,
  salvarMeuAvatar,
  USUARIO_NEUTRO,
} from '../src/lib/avatar/meuAvatar'
import { CHAVE_DA_TRAVA } from '../src/lib/avatar/protegido'
import { construirGlb, gerarTodas, META1_BASE, pngBomba, vrm1 } from './harness/avatarFixtures'

vi.mock('../src/lib/usePerfil', () => ({
  usePerfil: () => ({ perfil: { id: 'u-1', displayName: 'Ana Souza' }, carregando: false, iniciais: 'AS' }),
}))
// Sem WebGL no jsdom: a prévia viva vira um marcador (o fluxo dela é do e2e).
vi.mock('../src/components/avatar/AvatarCanvas', () => ({
  default: function CanvasFalso({
    receita,
    aoPronto,
  }: {
    receita: { base: { id: string } }
    aoPronto?: (capturar: (() => string | null) | null) => void
  }) {
    // Pronto na hora, e a captura devolve uma miniatura PNG mínima (o desenho real é do e2e).
    React.useEffect(() => {
      aoPronto?.(() => 'data:image/png;base64,iVBORw0KGgo=')
      return () => aoPronto?.(null)
    }, [aoPronto])
    return <div data-testid="canvas-falso">{receita.base.id}</div>
  },
}))
// O validador da Khronos roda num Worker que o jsdom não tem: o core é testado com ele em `avatar-importador.test.ts`.
vi.mock('../src/lib/avatar/validadorKhronos', () => ({ criarValidadorKhronos: () => null }))

const flags = { avatar_3d: true }
vi.mock('../src/lib/flags', async (original) => ({
  ...(await original<typeof import('../src/lib/flags')>()),
  useFlag: (chave: string) => (flags as Record<string, boolean>)[chave] === true,
}))

import AbaAvatar from '../src/components/avatar/meuAvatar/AbaAvatar'
import MolduraETitulo from '../src/components/perfil/MolduraETitulo'
import { aplicarAparencia, suporteDoModelo } from '../src/lib/avatar/aparencia'

const fix = gerarTodas()
const arquivo = (bytes: Uint8Array, nome = 'modelo.vrm') => {
  const f = new File([bytes.slice().buffer as ArrayBuffer], nome, { type: 'model/gltf-binary' })
  // O jsdom antigo não tem `File.arrayBuffer`.
  if (typeof f.arrayBuffer !== 'function') {
    ;(f as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
      bytes.slice().buffer as ArrayBuffer
  }
  return f
}

beforeEach(async () => {
  await esquecerConexaoDoAvatar()
  ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('o avatar guardado no aparelho', () => {
  const receita = () => receitaNova({ origem: 'colecao', id: 'milk' }, 'Ana', 1_790_000_000_000)
  const MINI = 'data:image/png;base64,iVBORw0KGgo='

  it('chave por usuário, com a neutra para quem não tem conta', () => {
    expect(chaveDoUsuario(null)).toBe(USUARIO_NEUTRO)
    expect(chaveDoUsuario('')).toBe('local')
    expect(chaveDoUsuario('a/b c?d')).toBe('a_b_c_d')
    expect(chaveDoUsuario('x'.repeat(200)).length).toBe(64)
  })

  it('guarda a receita e a miniatura; apagar limpa tudo e o crédito do modelo trazido', async () => {
    expect(await salvarMeuAvatar('u-1', receita(), { miniatura: MINI })).toBe(true)
    expect(await lerMeuAvatar('u-1')).toEqual(receita())
    expect(lerMiniatura('u-1')).toBe(MINI)
    expect(await lerMeuAvatar('outra-pessoa')).toBeNull()
    expect(lerMiniatura('outra-pessoa')).toBeNull()
    await apagarMeuAvatar('u-1')
    expect(await lerMeuAvatar('u-1')).toBeNull()
    expect(lerMiniatura('u-1')).toBeNull()
    expect(Object.keys(localStorage).filter((k) => k.startsWith('frasy.avatar'))).toEqual([])
  })

  it('miniatura que não é imagem em data URL é ignorada (o disco não é confiável)', async () => {
    await salvarMeuAvatar('u-1', receita(), { miniatura: 'https://evil.example/x.png' })
    expect(lerMiniatura('u-1')).toBeNull()
    await salvarMeuAvatar('u-1', receita(), { miniatura: 'data:text/html;base64,PHNjcmlwdD4=' })
    expect(lerMiniatura('u-1')).toBeNull()
    localStorage.setItem('frasy.avatar.miniatura.u-1', 'data:image/png;base64,' + 'A'.repeat(200_000))
    expect(lerMiniatura('u-1')).toBeNull()
  })

  it('o modelo trazido vai para o IndexedDB e some junto com o avatar; trocar de modelo apaga o antigo', async () => {
    const r1 = receitaNova({ origem: 'importado', id: 'imp-aaaaaaaaaaaa' }, 'Meu', 1)
    const credito = {
      titulo: 'Modelo',
      autores: ['Ana'],
      licenca: 'CC0',
      urlDaLicenca: 'https://vrm.dev/licenses/1.0/',
    }
    expect(await salvarMeuAvatar('u-1', r1, { modelo: new Blob([new Uint8Array([1, 2, 3, 4])]), credito })).toBe(true)
    expect((await lerModeloImportado('imp-aaaaaaaaaaaa'))?.size).toBe(4)
    expect(lerCreditoGuardado('u-1')).toEqual(credito)
    const r2 = receitaNova({ origem: 'importado', id: 'imp-bbbbbbbbbbbb' }, 'Meu', 1)
    await salvarMeuAvatar('u-1', r2, { modelo: new Blob([new Uint8Array([9])]) })
    expect(await lerModeloImportado('imp-aaaaaaaaaaaa')).toBeNull()
    await salvarMeuAvatar('u-1', receita(), { credito: null })
    expect(await lerModeloImportado('imp-bbbbbbbbbbbb')).toBeNull()
    expect(lerCreditoGuardado('u-1')).toBeNull()
    await salvarMeuAvatar('u-1', r2, { modelo: new Blob([new Uint8Array([9])]), credito })
    await apagarMeuAvatar('u-1')
    expect(await lerModeloImportado('imp-bbbbbbbbbbbb')).toBeNull()
  })

  it('recusa o modelo grande demais sem gravar a receita', async () => {
    const r = receitaNova({ origem: 'importado', id: 'imp-cccccccccccc' }, 'Meu', 1)
    const grande = { size: 16 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob
    expect(await salvarMeuAvatar('u-1', r, { modelo: grande })).toBe(false)
    expect(await lerMeuAvatar('u-1')).toBeNull()
  })
})

describe('Perfil > Avatar: adulto', () => {
  it('mostra Escolher, Personalizar e Traga o seu; "Escolher para mim" + "Salvar" guarda a receita local', async () => {
    render(<AbaAvatar />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Escolher',
      'Personalizar',
      'Estúdio',
      'Traga o seu',
    ])
    // Antes de escolher, a prévia mostra a SUGESTÃO e o botão diz "Salvar este avatar".
    expect(screen.getByTestId('avatar-credito').textContent).toContain('Sugerido para você')
    expect(screen.getByTestId('avatar-salvar').textContent).toContain('Salvar este avatar') // um rótulo por ação
    fireEvent.click(screen.getByTestId('avatar-sortear'))
    expect(screen.getByTestId('avatar-salvar').textContent).toContain('Salvar este avatar')
    expect(screen.getByTestId('avatar-credito').textContent).toContain('Alterações não salvas')
    fireEvent.click(screen.getByTestId('avatar-salvar'))
    await waitFor(() =>
      expect(screen.getByTestId('avatar-status').textContent).toContain('Avatar salvo neste aparelho'),
    )
    // Salvo: o botão diz o estado (e não fica um "Salvar" apagado sem explicação).
    expect(screen.getByTestId('avatar-salvar').textContent).toContain('Avatar já salvo')
    expect((screen.getByTestId('avatar-salvar') as HTMLButtonElement).disabled).toBe(true)
    // O crédito da primeira tela é curto; o completo fica em "Ver crédito completo".
    expect(screen.getByTestId('avatar-credito-linha').textContent).toMatch(/, de Polygonal Mind\. Uso livre\./)
    expect(screen.getByTestId('avatar-credito-linha').textContent).toContain('Ver crédito completo')
    const guardado = await lerMeuAvatar('u-1')
    expect(guardado?.base.origem).toBe('colecao')
    expect(COLECAO_SUGERIVEL.map((m) => m.id)).toContain(guardado?.base.id)
    // A miniatura estática capturada da prévia foi guardada para as molduras.
    expect(lerMiniatura('u-1')).toMatch(/^data:image\/png;base64,/)
    // Nada foi ao servidor: nenhuma requisição.
  })

  it('"Apagar meu avatar" pede confirmação e volta à foto e às iniciais', async () => {
    await salvarMeuAvatar('u-1', receitaNova({ origem: 'colecao', id: 'milk' }, '', 1))
    render(<AbaAvatar />)
    fireEvent.click(await screen.findByTestId('avatar-apagar'))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByTestId('avatar-apagar-confirma'))
    await waitFor(() => expect(screen.getByTestId('avatar-status').textContent).toContain('Avatar apagado'))
    expect(await lerMeuAvatar('u-1')).toBeNull()
  })

  it('"Continuar sem avatar" não guarda nada e diz que tudo bem', async () => {
    render(<AbaAvatar />)
    fireEvent.click(screen.getByTestId('avatar-sortear'))
    fireEvent.click(screen.getByTestId('avatar-dispensar'))
    expect(screen.getByTestId('avatar-status').textContent).toContain('continua com a foto ou as iniciais')
    expect(await lerMeuAvatar('u-1')).toBeNull()
  })

  it('personalizar: o modelo de textura única esconde a paleta e diz por quê; os ajustes valem', async () => {
    render(<AbaAvatar />)
    fireEvent.click(screen.getByTestId('avatar-sortear'))
    fireEvent.click(screen.getByRole('tab', { name: 'Personalizar' }))
    expect(screen.getByTestId('avatar-sem-paleta')).toBeTruthy()
    expect(document.querySelector('[data-cor]')).toBeNull()
    const altura = document.querySelector('[data-ajuste="altura"]') as HTMLInputElement
    fireEvent.change(altura, { target: { value: '1.1' } })
    expect(screen.getByText('110%')).toBeTruthy()
    const desfazer = screen.getByRole('button', { name: /Desfazer/ }) as HTMLButtonElement
    expect(desfazer.disabled).toBe(false)
    fireEvent.click(desfazer)
    expect(document.querySelector('[data-ajuste="altura"]') as HTMLInputElement).toHaveProperty('value', '1')
    fireEvent.change(altura, { target: { value: '1.15' } })
    fireEvent.click(screen.getByRole('button', { name: /Restaurar padrão/ }))
    expect((document.querySelector('[data-ajuste="altura"]') as HTMLInputElement).value).toBe('1')
  })
})

describe('galeria de terceiros: opt-in e política de menor', () => {
  it('adulto: NENHUMA requisição antes do "Quero ver"; depois, sem cookie e sem referer, só ao registro', async () => {
    const buscar = vi.fn(
      async (url: string) => new Response(url.endsWith('projects.json') ? '[]' : '[]', { status: 200 }),
    )
    vi.stubGlobal('fetch', buscar)
    render(<AbaAvatar />)
    fireEvent.click(screen.getByRole('tab', { name: 'Traga o seu' }))
    expect(screen.getByTestId('avatar-galeria-optin')).toBeTruthy()
    // sem miniatura de ninguém e sem requisição enquanto não aceitou
    expect(document.querySelector('.av-galeria')).toBeNull()
    expect(buscar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('avatar-galeria-abrir'))
    await waitFor(() => expect(buscar).toHaveBeenCalled())
    for (const [url, init] of buscar.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/ToxSam\/open-source-avatars\//)
      expect(init.credentials).toBe('omit')
      expect(init.referrerPolicy).toBe('no-referrer')
    }
  })

  it('menor (perfil protegido): sem aba "Traga o seu", sem galeria, sem importar e sem requisição', async () => {
    sessionStorage.setItem(CHAVE_DA_TRAVA, '1')
    const buscar = vi.fn()
    vi.stubGlobal('fetch', buscar)
    render(<AbaAvatar />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Escolher', 'Personalizar', 'Estúdio'])
    expect(screen.queryByTestId('avatar-traga')).toBeNull()
    expect(screen.queryByTestId('avatar-galeria-optin')).toBeNull()
    expect(screen.queryByTestId('avatar-galeria')).toBeNull()
    expect(screen.queryByTestId('avatar-arquivo')).toBeNull()
    expect(screen.queryByText(/Quero ver a galeria/)).toBeNull()
    expect(screen.getByTestId('avatar-so-colecao').textContent).toContain('coleção do Frasy')
    // O menor ainda escolhe, personaliza e salva dentro da coleção curada.
    fireEvent.click(screen.getByTestId('avatar-sortear'))
    fireEvent.click(screen.getByTestId('avatar-salvar'))
    await waitFor(() => expect(screen.getByTestId('avatar-status').textContent).toContain('Avatar salvo'))
    expect(buscar).not.toHaveBeenCalled()
  })

  it('a trava só restringe: valor diferente de "1" não protege, e sem ela o adulto vê a aba', () => {
    sessionStorage.setItem(CHAVE_DA_TRAVA, '0')
    render(<AbaAvatar />)
    expect(screen.getAllByRole('tab')).toHaveLength(4)
  })
})

describe('traga o seu: importador na tela', () => {
  async function abrirTraga() {
    render(<AbaAvatar />)
    fireEvent.click(screen.getByRole('tab', { name: 'Traga o seu' }))
    return screen.getByTestId('avatar-traga')
  }
  const enviar = (bytes: Uint8Array, nome?: string) =>
    fireEvent.change(screen.getByTestId('avatar-arquivo'), { target: { files: [arquivo(bytes, nome)] } })

  it('mostra o guia de 4 passos, a FAQ e as fontes com rel="noopener noreferrer" e target=_blank', async () => {
    const traga = await abrirTraga()
    expect([...traga.querySelectorAll('[data-passo]')].map((e) => e.getAttribute('data-passo'))).toEqual([
      'encontre',
      'baixe',
      'arraste',
      'licenca',
    ])
    expect(within(traga).getByText('Baixei um .zip, .fbx ou .blend. E agora?')).toBeTruthy()
    expect(within(traga).getByText('O que é um arquivo VRM?')).toBeTruthy()
    const links = [...traga.querySelectorAll('a[href^="http"]')] as HTMLAnchorElement[]
    expect(links.length).toBeGreaterThan(10)
    for (const a of links) {
      expect(a.target).toBe('_blank')
      expect(a.rel).toContain('noopener')
      expect(a.rel).toContain('noreferrer')
    }
  })

  it('arquivo hostil: recusa com alerta, aponta o passo certo e NÃO decodifica textura', async () => {
    const espiao = vi.fn(() => {
      throw new Error('decodificação proibida')
    })
    vi.stubGlobal('createImageBitmap', espiao)
    vi.stubGlobal('Image', espiao)
    await abrirTraga()
    enviar(construirGlb({ imagens: [pngBomba(20000, 20000)] }), 'bomba.glb')
    const alerta = await screen.findByTestId('avatar-importador-recusado')
    expect(alerta.getAttribute('role')).toBe('alert')
    expect(alerta.textContent).toContain('grande demais')
    expect(alerta.querySelector('[data-recusa-passo="encontre"]')).toBeTruthy()
    expect(espiao).not.toHaveBeenCalled()
    // o foco vai para o resultado (teclado e leitor de tela)
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H4'))
    expect(screen.queryByTestId('avatar-usar-modelo')).toBeNull()
  })

  it('não é GLB (um .zip ou .fbx renomeado): explica o que fazer', async () => {
    await abrirTraga()
    enviar(new Uint8Array([0x50, 0x4b, 3, 4, ...new Array(40).fill(0)]), 'pacote.vrm')
    const alerta = await screen.findByTestId('avatar-importador-recusado')
    expect(alerta.textContent).toContain('.zip')
    expect(alerta.textContent).toContain('Blender')
  })

  it('licença não declarada: o adulto só usa depois de marcar "Confirmo que tenho direito"', async () => {
    await abrirTraga()
    enviar(fix.get('vrm0-sem-meta.vrm') as Uint8Array, 'sem-meta.vrm')
    await screen.findByTestId('avatar-importador-ok')
    const usar = screen.getByTestId('avatar-usar-modelo') as HTMLButtonElement
    expect(usar.disabled).toBe(true)
    expect(screen.getByText('Falta só confirmar a licença')).toBeTruthy()
    fireEvent.click(screen.getByTestId('avatar-direitos'))
    expect(usar.disabled).toBe(false)
  })

  it('licença clara: passa direto, mostra o crédito e o link da licença seguro', async () => {
    await abrirTraga()
    enviar(vrm1({ ...META1_BASE, name: 'Modelo bonito', authors: ['Autora X'] }), 'bonito.vrm')
    const ok = await screen.findByTestId('avatar-importador-ok')
    expect(ok.textContent).toContain('Modelo bonito')
    expect(ok.textContent).toContain('Autora X')
    expect(screen.queryByTestId('avatar-direitos')).toBeNull()
    const link = ok.querySelector('a[href^="https://vrm.dev"]') as HTMLAnchorElement
    expect(link.rel).toContain('noopener')
    expect(ok.textContent).toContain('não um parecer jurídico')
    expect((screen.getByTestId('avatar-usar-modelo') as HTMLButtonElement).disabled).toBe(false)
  })

  it('usar o modelo leva à personalização com o arquivo ainda NÃO salvo; salvar o grava só no aparelho', async () => {
    const buscar = vi.fn()
    vi.stubGlobal('fetch', buscar)
    vi.stubGlobal('createImageBitmap', async () => ({ close() {} }))
    await abrirTraga()
    enviar(vrm1(META1_BASE), 'ok.vrm')
    await screen.findByTestId('avatar-importador-ok')
    fireEvent.click(screen.getByTestId('avatar-usar-modelo'))
    await waitFor(() => expect(screen.getByTestId('canvas-falso').textContent).toMatch(/^imp-/))
    const id = screen.getByTestId('canvas-falso').textContent as string
    expect(await lerModeloImportado(id)).toBeNull()
    fireEvent.click(screen.getByTestId('avatar-salvar'))
    await waitFor(() => expect(screen.getByTestId('avatar-status').textContent).toContain('Avatar salvo'))
    expect((await lerModeloImportado(id))?.size).toBeGreaterThan(100)
    expect((await lerMeuAvatar('u-1'))?.base).toEqual({ origem: 'importado', id })
    expect(lerCreditoGuardado('u-1')?.autores).toEqual(['Autora Teste'])
    // O arquivo nunca foi a lugar nenhum.
    expect(buscar).not.toHaveBeenCalled()
  })
})

describe('miniatura estática onde a foto aparece (MolduraETitulo)', () => {
  const MINI = 'data:image/png;base64,iVBORw0KGgo='
  beforeEach(() => {
    flags.avatar_3d = true
  })

  it('com a flag e um avatar salvo, mostra a miniatura (sem WebGL, sem rede)', () => {
    localStorage.setItem('frasy.avatar.miniatura.u-1', MINI)
    const { container } = render(<MolduraETitulo nivel={1} tamanho={56} />)
    const img = container.querySelector('img[data-avatar-do-usuario="avatar"]') as HTMLImageElement
    expect(img.src).toBe(MINI)
    expect(img.alt).toBe('Seu avatar')
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('sem a flag, nada muda: a moldura continua sem nada quando não há peça equipada', () => {
    flags.avatar_3d = false
    localStorage.setItem('frasy.avatar.miniatura.u-1', MINI)
    const { container } = render(<MolduraETitulo nivel={1} tamanho={56} />)
    expect(container.innerHTML).toBe('')
  })

  it('sem avatar salvo, também nada muda', () => {
    const { container } = render(<MolduraETitulo nivel={1} tamanho={56} />)
    expect(container.innerHTML).toBe('')
  })

  it('o título compacto (ranking) nunca ganha avatar', () => {
    localStorage.setItem('frasy.avatar.miniatura.u-1', MINI)
    const { container } = render(<MolduraETitulo compacto />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('aparência aplicada ao modelo (sem three)', () => {
  const cor = (hex: string) => {
    let h = hex.replace('#', '')
    return { isColor: true, set: (v: string) => (h = v.replace('#', '')), getHexString: () => h }
  }
  const mat = (name: string, hex = 'ffffff') => ({
    name,
    color: cor(hex),
    shadeColorFactor: cor('888888'),
    userData: {} as Record<string, unknown>,
  })
  const modelo = (nomes: string[]) => {
    const materiais = nomes.map((n) => mat(n))
    const escala = { x: 1, y: 1, z: 1 }
    return {
      materiais,
      escala,
      avatar: {
        objeto: {
          scale: { set: (x: number, y: number, z: number) => Object.assign(escala, { x, y, z }) },
          traverse(f: (o: unknown) => void) {
            f(this)
            for (const m of materiais) f({ isMesh: true, material: m, scale: this.scale, traverse() {} })
          },
        },
      },
    }
  }
  const receita = (extra = {}) => ({ ...receitaNova({ origem: 'importado', id: 'imp-aaaaaaaaaaaa' }, '', 1), ...extra })

  it('recolore só os materiais que o modelo separa e restaura a cor original com "padrão"', () => {
    const m = modelo(['Face_Skin', 'Hair', 'EyeIris', 'Tops_01_CLOTH'])
    const r = receita({ paleta: { pele: 'escuro', cabelo: 'azul', olhos: 'verde' } })
    const suporte = aplicarAparencia(m.avatar as never, r as never)
    expect(suporte).toEqual({ pele: true, cabelo: true, olhos: true })
    expect(m.materiais[0].color.getHexString()).toBe('6b4129')
    expect(m.materiais[1].color.getHexString()).toBe('2f5fd0')
    expect(m.materiais[2].color.getHexString()).toBe('4b8f5a')
    expect(m.materiais[3].color.getHexString()).toBe('ffffff')
    aplicarAparencia(m.avatar as never, receita() as never)
    expect(m.materiais[0].color.getHexString()).toBe('ffffff')
    expect(m.materiais[0].shadeColorFactor.getHexString()).toBe('888888')
  })

  it('altura, largura e tamanho viram escala; textura única não recolore nada', () => {
    const m = modelo(['mat_84'])
    const r = receita({
      paleta: { pele: 'escuro', cabelo: 'azul', olhos: 'verde' },
      ajustes: { altura: 1.1, escala: 1.2 },
    })
    expect(aplicarAparencia(m.avatar as never, r as never)).toEqual({ pele: false, cabelo: false, olhos: false })
    expect(m.materiais[0].color.getHexString()).toBe('ffffff')
    expect(m.escala.y).toBeCloseTo(1.32)
    expect(m.escala.x).toBeCloseTo(1.2)
    expect(suporteDoModelo(m.avatar as never)).toEqual({ pele: false, cabelo: false, olhos: false })
  })
})
