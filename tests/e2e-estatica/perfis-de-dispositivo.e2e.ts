import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirAjustesDaCaptura, controlesDaGravacao, fecharModelos, modeloAnunciado, naTelaDoCelular } from './_captura'
import { aplicarCpu, DISPOSITIVOS, scriptDoAparelho } from './_dispositivos.mjs'

/**
 * PERFIS DE DISPOSITIVO NA EDIÇÃO ESTÁTICA (auditoria 2026-09-26).
 *
 * Em cada aparelho emulado (Quest, Pixel 7, iPhone 14 — ver `_dispositivos.mjs` para o que é e o que
 * não é emulado): o perfil detectado, o modelo escolhido e o tamanho anunciado, a captura SEM a opção
 * de áudio do sistema (com o texto explicando o microfone), o botão Iniciar habilitado e do tamanho
 * mínimo, o aviso de download ANTES do primeiro byte, e nenhum erro de console. Não baixa modelo
 * nenhum: todo aviso é recusado ("Agora não"). A captura com áudio real é de `medir.mjs --dispositivo`.
 *
 * DUAS TELAS. O Quest usa a tela do computador; os celulares, a captura mobile-first (29/09), onde o
 * modelo mora em Opções → Modelos no aparelho e o Iniciar é o microfone grande da doca (`_captura.ts`
 * diz onde cada coisa está).
 *
 * DOIS AVISOS DE DOWNLOAD, desde a folha do início (28/09, `lib/captura/inicioDaCaptura.ts`). Na
 * primeira vez, o toque em Iniciar abre "Como transcrever a sua voz?": a pergunta do motor JÁ É o
 * aviso — cada opção diz o que baixa, e nada baixa antes da escolha. Com a escolha guardada
 * (Privado), o toque abre só a confirmação do download, "Baixar os modelos desta captura?", acima de
 * 100 MB no celular e no Quest. Os dois são conferidos, e têm que dizer o MESMO total.
 *
 * Roda uma vez (no projeto desktop-1280; cada teste monta o próprio contexto do aparelho).
 * Screenshots em `SCREENSHOTS_DISPOSITIVOS` (ou `test-results/dispositivos/`).
 */
const PASTA = process.env.SCREENSHOTS_DISPOSITIVOS || path.join('test-results', 'dispositivos')

/** Os pedidos que seriam bytes de modelo: os pesos do Hub e o Bergamot servido do próprio domínio. */
const BYTES_DE_MODELO = /\.onnx(\?|$)|huggingface\.co\/.+\/resolve\/|\/modelos\/bergamot\//

async function abrirCaptura(page: Page) {
  await page.goto('/capturar')
  await expect(page.getByRole('heading', { name: 'Capturar', level: 1 })).toBeVisible({ timeout: 60_000 })
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) await pular.click()
}

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
    // Desde o primeiro carregamento: nem a tela aberta pode puxar modelo.
    const bytesDeModelo: string[] = []
    page.on('request', (r) => BYTES_DE_MODELO.test(r.url()) && bytesDeModelo.push(r.url()))

    await abrirCaptura(page)

    // 1. Perfil detectado por capacidade (o tipo e o modo leve se corrigem quando o requestAdapter() responde).
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dispositivo)).toMatch(d.esperado.tipo)
    const tipo = (await page.evaluate(() => document.documentElement.dataset.dispositivo)) ?? ''
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.modoLeve))
      .toBe(tipo === 'quest' || tipo === 'celular-fraco' ? 'true' : 'false')
    // A tela certa para o perfil: a do celular só no celular (o Quest fica com a do computador).
    const celular = tipo.startsWith('celular')
    expect(await naTelaDoCelular(page)).toBe(celular)

    // 2. Modelo escolhido: nada de small nem do base híbrido de 209 MB fora do desktop.
    const modelo = await modeloAnunciado(page)
    // 80 = base q8; 67/32 = moonshine
    await expect(modelo).toContainText(/\b(80|67|32) MB/)
    await expect(modelo).not.toContainText(/209 MB|589 MB/)
    const anunciado = (await modelo.innerText()).replace(/\s+/g, ' ').trim()
    const mbDoModelo = Number(/\b(80|67|32) MB/.exec(anunciado)?.[1])
    if (celular) await page.screenshot({ path: path.join(PASTA, `${nome}-modelos.png`) })
    await fecharModelos(page)

    // 3. Sem áudio do sistema: o aviso explica o microfone; o Iniciar está habilitado.
    const semAudio = page.getByTestId('aviso-sem-audio-do-sistema')
    await expect(semAudio).toBeVisible()
    await expect(semAudio).toContainText(/a legenda vem do microfone/)
    if (tipo === 'quest') await expect(semAudio).toContainText('Meta Quest')
    /* No computador, a fonte é o interruptor do microfone ao lado do Iniciar. No celular o microfone
       grande É o Iniciar (o interruptor de mudo só existe gravando), e o aviso acima é o que diz. */
    if (!celular) await expect(page.getByRole('switch', { name: /Microfone ativo|Minha voz entra/ })).toBeVisible()
    const iniciar = page.getByRole('button', { name: 'Iniciar captura' })
    await expect(iniciar).toBeEnabled()

    // 4. Alvo mínimo (56 px no Quest, 48 no celular) nos botões que conduzem a gravação.
    const altura = (await iniciar.boundingBox())?.height ?? 0
    expect(altura).toBeGreaterThanOrEqual(d.esperado.alvo)
    const controles = await controlesDaGravacao(page)
    expect(await controles.count()).toBeGreaterThan(0)
    const menor = await controles.evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)))
    expect(menor).toBeGreaterThanOrEqual(d.esperado.alvo)
    await page.screenshot({ path: path.join(PASTA, `${nome}-capturar.png`), fullPage: false })

    // 5. Os ajustes da captura não oferecem rota de áudio do sistema, e dizem por quê.
    const ajustes = await abrirAjustesDaCaptura(page)
    await expect(ajustes.getByRole('radiogroup', { name: 'Como capturar o áudio do sistema' })).toHaveCount(0)
    await expect(ajustes.getByText(/getDisplayMedia não existe/)).toBeVisible()
    await page.screenshot({ path: path.join(PASTA, `${nome}-ajustes.png`) })
    await page.keyboard.press('Escape')
    await expect(ajustes).toBeHidden()

    // 6a. Primeira vez (perfil novo, nada em cache): a folha do início pergunta o motor e diz o
    //     download de cada opção ANTES do primeiro byte. "Agora não" cancela sem baixar nada.
    await iniciar.click()
    const folha = page.getByTestId('escolha-do-microfone')
    await expect(folha).toBeVisible({ timeout: 15_000 })
    const privado = folha.getByRole('button', { name: /Privado/ })
    // O Privado anuncia o mesmo modelo de transcrição do passo 2.
    await expect(privado).toContainText(`cerca de ${mbDoModelo} MB`)
    await privado.click()
    const baixaAgora = page.getByTestId('download-da-escolha')
    await expect(baixaAgora).toContainText(/cerca de \d+ MB/)
    const totalDaFolha = Number(/cerca de (\d+) MB/.exec((await baixaAgora.textContent()) ?? '')?.[1])
    expect(totalDaFolha).toBeGreaterThanOrEqual(mbDoModelo)
    await page.screenshot({ path: path.join(PASTA, `${nome}-folha-do-inicio.png`) })
    await page.getByRole('button', { name: 'Agora não' }).click()
    await expect(folha).toBeHidden()

    // 6b. Com a escolha guardada (Privado), a folha é só a confirmação: o mesmo total, antes do
    //     primeiro byte, acima dos 100 MB do perfil (`confirmarDownloadAcimaDeMb`).
    await page.evaluate(() => localStorage.setItem('babel.preferencias', JSON.stringify({ micEscolhido: true })))
    await abrirCaptura(page)
    await page.getByRole('button', { name: 'Iniciar captura' }).click()
    const aviso = page.getByTestId('aviso-de-download')
    await expect(aviso).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('escolha-do-microfone')).toHaveCount(0)
    const textoDoAviso = ((await aviso.textContent()) ?? '').trim()
    expect(textoDoAviso).toMatch(/cerca de \d+ MB/)
    expect(Number(/cerca de (\d+) MB/.exec(textoDoAviso)?.[1])).toBe(totalDaFolha)
    await page.screenshot({ path: path.join(PASTA, `${nome}-aviso-download.png`) })
    await page.getByRole('button', { name: 'Agora não' }).click()
    await expect(aviso).toBeHidden()
    await page.waitForTimeout(1000)
    expect(bytesDeModelo, 'baixou modelo antes do sim').toEqual([])

    info.annotations.push({ type: 'dispositivo', description: `${nome}: ${tipo} · ${anunciado} · ${textoDoAviso}` })
    console.log(`[${nome}] tipo=${tipo} | modelo="${anunciado}" | folha=${totalDaFolha} MB | aviso="${textoDoAviso}"`)
    expect(erros).toEqual([])
    await ctx.close()
  })
}
