import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { aplicarCpu, DISPOSITIVOS, scriptDoAparelho } from './_dispositivos.mjs'

/**
 * PERFIS DE DISPOSITIVO NA EDIÇÃO ESTÁTICA (auditoria 2026-09-26).
 *
 * Em cada aparelho emulado (Quest, Pixel 7, iPhone 14 — ver `_dispositivos.mjs` para o que é e o que
 * não é emulado): o perfil detectado, o modelo escolhido e o tamanho anunciado, a captura SEM a opção
 * de áudio do sistema (com o texto explicando o microfone), o botão Iniciar habilitado e do tamanho
 * mínimo, o aviso de download ANTES do primeiro byte, e nenhum erro de console. Não baixa modelo
 * nenhum: o aviso é recusado ("Agora não"). A captura com áudio real é de `medir.mjs --dispositivo`.
 *
 * Roda uma vez (no projeto desktop-1280; cada teste monta o próprio contexto do aparelho).
 * Screenshots em `SCREENSHOTS_DISPOSITIVOS` (ou `test-results/dispositivos/`).
 */
const PASTA = process.env.SCREENSHOTS_DISPOSITIVOS || path.join('test-results', 'dispositivos')

for (const [nome, d] of Object.entries(DISPOSITIVOS)) {
  test(`${nome}: perfil, modelo, captura só por microfone e aviso de download`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'cada teste monta o contexto do próprio aparelho')
    mkdirSync(PASTA, { recursive: true })
    const ctx = await browser.newContext({ ...d.contexto, baseURL: info.project.use.baseURL })
    const page = await ctx.newPage()
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
    await page.addInitScript({ content: scriptDoAparelho(d.sinais) })
    await page.addInitScript(() => {
      try {
        localStorage.setItem('babel_tour_blitz', '1')
      } catch {
        /* storage bloqueado */
      }
    })
    await aplicarCpu(page, d.cpu)

    await page.goto('/capturar')
    await expect(page.getByRole('heading', { name: 'Capturar', level: 1 })).toBeVisible({ timeout: 60_000 })
    const pular = page.getByRole('button', { name: 'Pular apresentação' })
    if (await pular.isVisible().catch(() => false)) await pular.click()

    // 1. Perfil detectado por capacidade (o tipo e o modo leve se corrigem quando o requestAdapter() responde).
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dispositivo)).toMatch(d.esperado.tipo)
    const tipo = await page.evaluate(() => document.documentElement.dataset.dispositivo)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.modoLeve))
      .toBe(tipo === 'quest' || tipo === 'celular-fraco' ? 'true' : 'false')

    // 2. Modelo escolhido: nada de small nem do base híbrido de 209 MB fora do desktop.
    const selo = page.getByRole('button', { name: /Modelo no dispositivo/ })
    await expect(selo).toBeVisible()
    const rotuloDoSelo = (await selo.getAttribute('aria-label')) ?? ''
    expect(rotuloDoSelo).not.toMatch(/209 MB|589 MB/)
    // 80 = base q8; 67/32 = moonshine
    expect(rotuloDoSelo).toMatch(/\b(80|67|32) MB/)

    // 3. Sem áudio do sistema: o aviso explica o microfone; o Iniciar está habilitado.
    await expect(page.getByTestId('aviso-sem-audio-do-sistema')).toBeVisible()
    if (tipo === 'quest') await expect(page.getByTestId('aviso-sem-audio-do-sistema')).toContainText('Meta Quest')
    await expect(page.getByRole('switch', { name: /Microfone ativo|Minha voz entra/ })).toBeVisible()
    const iniciar = page.getByRole('button', { name: 'Iniciar captura' })
    await expect(iniciar).toBeEnabled()

    // 4. Alvo mínimo (56 px no Quest, 48 no celular) nos botões do Espaço de gravação.
    const altura = (await iniciar.boundingBox())?.height ?? 0
    expect(altura).toBeGreaterThanOrEqual(d.esperado.alvo)
    const menor = await page
      .locator('.estudio .btn')
      .evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)))
    expect(menor).toBeGreaterThanOrEqual(d.esperado.alvo)
    await page.screenshot({ path: path.join(PASTA, `${nome}-capturar.png`), fullPage: false })

    // 5. A gaveta não oferece rota de áudio do sistema.
    await page.getByRole('button', { name: 'Ajustes da captura' }).click()
    await expect(page.getByRole('radiogroup', { name: 'Como capturar o áudio do sistema' })).toHaveCount(0)
    await expect(page.getByText(/getDisplayMedia não existe/)).toBeVisible()
    await page.screenshot({ path: path.join(PASTA, `${nome}-ajustes.png`) })
    await page.keyboard.press('Escape')

    // 6. Aviso de download antes do primeiro byte (perfil novo: nada em cache).
    const pedidosAoHub: string[] = []
    page.on('request', (r) => /huggingface\.co|hf\.co/.test(r.url()) && pedidosAoHub.push(r.url()))
    await iniciar.click()
    const aviso = page.getByTestId('aviso-de-download')
    await expect(aviso).toBeVisible({ timeout: 15_000 })
    const textoDoAviso = (await aviso.textContent()) ?? ''
    expect(textoDoAviso).toMatch(/cerca de \d+ MB/)
    await page.screenshot({ path: path.join(PASTA, `${nome}-aviso-download.png`) })
    await page.getByRole('button', { name: 'Agora não' }).click()
    expect(pedidosAoHub.filter((u) => /\.onnx/.test(u))).toEqual([])

    info.annotations.push({ type: 'dispositivo', description: `${nome}: ${tipo} · ${rotuloDoSelo} · ${textoDoAviso}` })
    console.log(`[${nome}] tipo=${tipo} | selo="${rotuloDoSelo}" | aviso="${textoDoAviso.trim()}"`)
    expect(erros).toEqual([])
    await ctx.close()
  })
}
