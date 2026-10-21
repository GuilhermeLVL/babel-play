/**
 * A BANCADA DOS ANÚNCIOS NO NAVEGADOR (Task 6 do estado 3, rulings R32 e R35) — o quadro da página de
 * anúncios dentro do app ISOLADO (COOP/COEP do Express), sem rede de anúncio nenhuma.
 *
 * Duas origens: o app (`localhost:3127`, login de verdade no Supabase falso) e a página de anúncios servida
 * como o Worker `frasy-anuncios` a serviria (`_anuncios-estatico.mjs`, `127.0.0.1:3128`, build SEM código da
 * rede). A flag `anuncios` é ligada NA PÁGINA (`/api/flags`), como os outros e2e fazem, e a conta é pintada
 * como Grátis com mais de três dias (`contaCriadaEm`): a política em si tem teste unitário próprio.
 *
 * A CSP DO APP: quem abre `frame-src` para a origem de anúncios é o WORKER (`cspComAnuncios`, `worker.ts`);
 * o Express não sobrepõe (decisão do R31, `docs/deploy.md` §Anúncios) e em dev a CSP é Report-Only. Aqui a
 * sobreposição é a MESMA função do Worker aplicada ao cabeçalho que o Express mandou, na resposta do
 * documento. O staging real foi provado à parte (`docs/auditoria/2026-10-21-anuncios-bancada.md`).
 *
 * O que se prova:
 *  - com a sobreposição: `frame-src` tem a origem de anúncios, a folha de consentimento aparece no espaço
 *    do Início, e depois do "Aceitar" entra um `<iframe credentialless sandbox>` para ela, SEM violação de
 *    CSP e sem bloqueio de COEP; a página avisa no console que não tem rede e posta `vazio`, e o espaço some;
 *  - sem a sobreposição (a CSP do build): o navegador acusa `frame-src` e o espaço some também — é por isso
 *    que o Worker precisa sobrepor.
 *
 *   npx playwright test -c playwright.publico.config.ts bancada-anuncios
 */
import { expect, type Page, test } from '@playwright/test'

import { cspComAnuncios } from '../../server/http/csp'
import { chegarEm, clicar, entrar } from './_nuance'

const APP = `http://localhost:${process.env.PORTA_E2E_PUBLICO || 3127}`
const ANUNCIOS = `http://127.0.0.1:${process.env.PORTA_ANUNCIOS_E2E || 3128}`
const DEZ_DIAS = 10 * 24 * 60 * 60_000

interface Registro {
  mensagens: Array<{ origem: string; dados: unknown }>
  quadros: Array<{ src: string; sandbox: string | null; credentialless: boolean }>
  violacoes: Array<{ diretiva: string; bloqueada: string; disposicao: string }>
}

/** Grava, desde o primeiro script da página, as mensagens, os quadros que entram e as violações de CSP. */
async function gravar(page: Page) {
  await page.addInitScript(() => {
    const r = { mensagens: [], quadros: [], violacoes: [] } as unknown as {
      mensagens: Array<{ origem: string; dados: unknown }>
      quadros: Array<{ src: string; sandbox: string | null; credentialless: boolean }>
      violacoes: Array<{ diretiva: string; bloqueada: string; disposicao: string }>
    }
    ;(window as unknown as { __bancada: typeof r }).__bancada = r
    window.addEventListener('message', (e) => r.mensagens.push({ origem: e.origin, dados: e.data }))
    document.addEventListener('securitypolicyviolation', (e) =>
      r.violacoes.push({ diretiva: e.violatedDirective, bloqueada: e.blockedURI, disposicao: e.disposition }),
    )
    new MutationObserver((lista) => {
      for (const m of lista)
        for (const n of m.addedNodes) {
          const quadros =
            n instanceof HTMLIFrameElement ? [n] : n instanceof Element ? [...n.querySelectorAll('iframe')] : []
          for (const q of quadros)
            r.quadros.push({
              src: q.src,
              sandbox: q.getAttribute('sandbox'),
              credentialless: (q as unknown as { credentialless?: boolean }).credentialless === true,
            })
        }
    }).observe(document, { childList: true, subtree: true })
  })
}

const registro = (page: Page) => page.evaluate(() => (window as unknown as { __bancada: Registro }).__bancada)

/** A flag ligada e a conta Grátis com mais de três dias (só a pintura do cliente). */
async function prepararConta(page: Page) {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { anuncios: { ligada: true } } } }))
  await page.route('**/api/me/entitlements', async (r) => {
    const resposta = await r.fetch()
    const corpo = (await resposta.json()) as Record<string, unknown>
    await r.fulfill({ response: resposta, json: { ...corpo, teste: null, contaCriadaEm: Date.now() - DEZ_DIAS } })
  })
}

/**
 * Os documentos do app saem com a CSP sobreposta como o Worker faria com a flag ligada. Um documento entregue
 * pelo `route.fulfill` perde o espaço de endereço "loopback" no Chrome (Local Network Access), e aí o login no
 * Supabase falso e o quadro em `127.0.0.1` seriam barrados por isso, não pela CSP: a permissão devolve o que o
 * documento servido direto já teria.
 */
async function sobreporCspComoOWorker(page: Page): Promise<string[]> {
  await page.context().grantPermissions(['local-network-access'])
  const vistas: string[] = []
  await page.route(
    (url) => url.origin === APP,
    async (r) => {
      if (r.request().resourceType() !== 'document') return r.fallback()
      const resposta = await r.fetch()
      const cabecalhos = resposta.headers()
      for (const nome of ['content-security-policy', 'content-security-policy-report-only']) {
        if (cabecalhos[nome]) {
          cabecalhos[nome] = cspComAnuncios(cabecalhos[nome], ANUNCIOS)
          vistas.push(cabecalhos[nome])
        }
      }
      await r.fulfill({ response: resposta, headers: cabecalhos })
    },
  )
  return vistas
}

/**
 * Chega ao Início livre e espera a folha de consentimento (ou o quadro, se o banco reaproveitado do e2e já
 * guarda o "sim"); aparecendo a folha, aceita.
 */
async function aceitarAnuncios(page: Page) {
  await chegarEm(page, page.locator('nav.q-trilho'))
  const folha = page.getByRole('region', { name: 'Anúncios no plano Grátis' })
  await expect
    .poll(async () => (await folha.isVisible().catch(() => false)) || (await registro(page)).quadros.length > 0, {
      timeout: 30_000,
    })
    .toBe(true)
  if (await folha.isVisible().catch(() => false)) await clicar(page, folha.getByRole('button', { name: 'Aceitar' }))
}

test.describe('bancada dos anúncios', () => {
  /* O primeiro teste paga a compilação a frio do Vite. */
  test.describe.configure({ timeout: 120_000 })

  test('com a CSP do Worker: o quadro credentialless entra sem violação e a página sem rede posta vazio', async ({
    page,
  }) => {
    const consoles: string[] = []
    page.on('console', (m) => consoles.push(`${m.type()}: ${m.text()}`))
    await gravar(page)
    await prepararConta(page)
    const csps = await sobreporCspComoOWorker(page)
    await entrar(page, { premium: false })

    /* A folha só aparece para o adulto com a flag ligada; depois do "Aceitar", o quadro. */
    await aceitarAnuncios(page)

    await expect.poll(async () => (await registro(page)).quadros.length, { timeout: 30_000 }).toBeGreaterThan(0)
    await expect
      .poll(async () => (await registro(page)).mensagens.filter((m) => m.origem === ANUNCIOS).map((m) => m.dados), {
        timeout: 30_000,
      })
      .toContainEqual({ tipo: 'frasy:anuncio', evento: 'vazio' })

    const r = await registro(page)
    expect(csps.length).toBeGreaterThan(0)
    for (const csp of csps) {
      expect(csp).toMatch(new RegExp(`frame-src [^;]*${ANUNCIOS.replace(/[.:/]/g, '\\$&')}`))
      expect(csp).not.toMatch(/script-src [^;]*(127\.0\.0\.1:\d+|doubleclick|googlesyndication)/)
    }
    const [quadro] = r.quadros
    expect(new URL(quadro.src).origin).toBe(ANUNCIOS)
    expect(new URL(quadro.src).searchParams.get('espaco')).toBe('inicio-nativo')
    expect(quadro.sandbox).toBe('allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox')
    expect(quadro.credentialless).toBe(true)
    /* O Vite de dev viola a CSP Report-Only do app (script em linha, o WebSocket do HMR): isso é do modo dev, não
       do quadro. Do quadro (frame-src, ou qualquer coisa da origem de anúncios) não pode haver nada. */
    expect(
      r.violacoes.filter((v) => /^(frame|child)-src/.test(v.diretiva) || v.bloqueada.startsWith(ANUNCIOS)),
    ).toEqual([])
    expect(
      consoles.filter(
        (c) =>
          /Cross-Origin-Embedder-Policy|ERR_BLOCKED_BY_RESPONSE|frame-src|frame-ancestors/i.test(c) ||
          (c.includes(ANUNCIOS) && /violat|blocked/i.test(c)),
      ),
    ).toEqual([])
    expect(consoles.some((c) => c.startsWith('warning:') && c.includes('sem código da rede'))).toBe(true)
    /* `vazio` = nada a mostrar: o espaço some (nada de moldura vazia). */
    await expect(page.locator('aside[data-ad="inicio-nativo"]')).toHaveCount(0)
  })

  test('sem a sobreposição do Worker: frame-src acusa a origem de anúncios e o espaço some', async ({ page }) => {
    await gravar(page)
    await prepararConta(page)
    await entrar(page, { premium: false })
    await aceitarAnuncios(page)

    await expect
      .poll(async () => (await registro(page)).violacoes.filter((v) => v.diretiva.startsWith('frame-src')).length, {
        timeout: 30_000,
      })
      .toBeGreaterThan(0)
    const v = (await registro(page)).violacoes.find((x) => x.diretiva.startsWith('frame-src'))!
    expect(v.bloqueada.startsWith(ANUNCIOS)).toBe(true)
    await expect(page.locator('aside[data-ad="inicio-nativo"]')).toHaveCount(0)
  })
})
