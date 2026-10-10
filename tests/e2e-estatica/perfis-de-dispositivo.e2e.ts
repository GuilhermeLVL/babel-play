import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirAjustesDaCaptura, capturaPronta, controlesDaCaptura, megasAnunciados, modeloAnunciado } from './_captura'
import { aplicarCpu, DISPOSITIVOS, scriptDoAparelho } from './_dispositivos.mjs'

/**
 * PERFIS DE DISPOSITIVO NA EDIÇÃO ESTÁTICA (auditoria 2026-09-26).
 *
 * Em cada aparelho emulado (Pixel 7, iPhone 14 — ver `_dispositivos.mjs` para o que é e o que não é
 * emulado): o perfil detectado, o modelo escolhido e o tamanho anunciado, a captura SEM a opção de
 * áudio do sistema (com o texto explicando o microfone), o botão Iniciar habilitado e do tamanho
 * mínimo, o aviso de download ANTES do primeiro byte, e nenhum erro de console. Não baixa modelo
 * nenhum: todo aviso é recusado ("Agora não"). A captura com áudio real é de `medir.mjs --dispositivo`.
 *
 * DESENHO NOVO (09/10/2026). A tela da captura é uma só em todo aparelho (`_captura.ts`). No celular:
 *  - o selo do modelo não aparece no topo; o modelo e o tamanho são ditos na folha do início (a opção
 *    "Privado" diz "cerca de N MB") — é ali que este teste os lê;
 *  - a faixa "sem áudio do sistema" (`aviso-sem-audio-do-sistema`) não existe mais: a tela pronta diz
 *    "deixe o celular perto do som", e "Dispositivos e modelos de IA" diz que a captura usa só o
 *    microfone e por quê;
 *  - o modo leve não liga mais sozinho no aparelho fraco (decisão do dono, 08/10/2026,
 *    `reduzirEfeitosAutomatico` em `lib/dispositivo/perfil.ts`): os efeitos valem em todo aparelho e só
 *    a escolha manual os desliga. O teste confere o que vale agora (`data-modo-leve="false"`).
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
  return capturaPronta(page)
}

for (const [nome, d] of Object.entries(DISPOSITIVOS)) {
  test(`${nome}: perfil, modelo, captura só por microfone e aviso de download`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'cada teste monta o contexto do próprio aparelho')
    // Desde a medida no Quest 3 (01/10/2026) o headset usa o áudio do sistema: este roteiro é só do microfone.
    test.skip(nome === 'quest', 'o Quest usa o compartilhamento (som do headset), não só o microfone')
    mkdirSync(PASTA, { recursive: true })
    const ctx = await browser.newContext({ ...d.contexto, baseURL: info.project.use.baseURL })
    const page = await ctx.newPage()
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
    await page.addInitScript({ content: scriptDoAparelho(d.sinais) })
    await page.addInitScript(() => {
      /* Onde `getDisplayMedia` existir, o app não pode chamá-lo num aparelho que só usa o microfone.
         Conta as chamadas (onde a API existe). */
      const w = window as unknown as { __chamadasDeTela: number }
      w.__chamadasDeTela = 0
      const md = navigator.mediaDevices as MediaDevices | undefined
      if (md && typeof md.getDisplayMedia === 'function') {
        const original = md.getDisplayMedia.bind(md)
        md.getDisplayMedia = (...a: Parameters<MediaDevices['getDisplayMedia']>) => {
          w.__chamadasDeTela += 1
          return original(...a)
        }
      }
    })
    await aplicarCpu(page, d.cpu)
    // Desde o primeiro carregamento: nem a tela aberta pode puxar modelo.
    const bytesDeModelo: string[] = []
    page.on('request', (r) => BYTES_DE_MODELO.test(r.url()) && bytesDeModelo.push(r.url()))

    const iniciar = await abrirCaptura(page)

    // 1. Perfil detectado por capacidade (o tipo se corrige quando o requestAdapter() responde).
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.dispositivo)).toMatch(d.esperado.tipo)
    const tipo = (await page.evaluate(() => document.documentElement.dataset.dispositivo)) ?? ''
    // O modo leve não liga mais sozinho (08/10/2026): os efeitos valem em todo aparelho.
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.modoLeve)).toBe('false')

    // 2. Celular: a folha do estado não tem a linha do modelo (o tamanho é dito na folha do início, passo 6a).
    expect(await modeloAnunciado(page)).toBe('')

    // 3. Sem áudio do sistema: a tela pronta diz de onde vem o som, o microfone está ligado e o
    //    Iniciar, habilitado.
    await expect(page.getByTestId('captura-do-prototipo')).toContainText('deixe o celular perto do som')
    await expect(page.getByRole('switch', { name: 'Microfone ativo' })).toBeChecked()
    await expect(iniciar).toBeEnabled()

    // 4. Alvo mínimo (48 px no celular) em tudo o que conduz a captura: o topo e a faixa de baixo.
    const altura = (await iniciar.boundingBox())?.height ?? 0
    expect(altura).toBeGreaterThanOrEqual(d.esperado.alvo)
    const controles = controlesDaCaptura(page)
    expect(await controles.count()).toBeGreaterThan(1)
    const menor = await controles.evaluateAll((els) =>
      Math.min(...els.map((e) => Math.min(e.getBoundingClientRect().height, e.getBoundingClientRect().width))),
    )
    expect(menor).toBeGreaterThanOrEqual(d.esperado.alvo)
    await page.screenshot({ path: path.join(PASTA, `${nome}-capturar.png`), fullPage: false })

    // 5. Os ajustes da captura não oferecem rota de áudio do sistema, e dizem por quê.
    const ajustes = await abrirAjustesDaCaptura(page)
    await expect(ajustes.getByRole('radiogroup', { name: 'Como capturar o áudio do sistema' })).toHaveCount(0)
    await expect(ajustes.getByText(/getDisplayMedia não existe/)).toBeVisible()
    await expect(ajustes.getByText(/A captura usa só o microfone/)).toBeVisible()
    await page.screenshot({ path: path.join(PASTA, `${nome}-ajustes.png`) })
    await page.keyboard.press('Escape')
    await expect(ajustes).toBeHidden()

    // 6a. Primeira vez (perfil novo, nada em cache): a folha do início pergunta o motor e diz o
    //     download de cada opção ANTES do primeiro byte. "Agora não" cancela sem baixar nada.
    await iniciar.click()
    const folha = page.getByTestId('escolha-do-microfone')
    await expect(folha).toBeVisible({ timeout: 15_000 })
    const privado = folha.getByRole('button', { name: /Privado/ })
    // O modelo escolhido: nada de small nem do base híbrido de 209 MB fora do desktop.
    // 80 = base q8; 67/32 = moonshine
    await expect(privado).toContainText(/cerca de (80|67|32) MB/)
    await expect(privado).not.toContainText(/209 MB|589 MB/)
    const mbDoModelo = await megasAnunciados(privado)
    await privado.click()
    const baixaAgora = page.getByTestId('download-da-escolha')
    const totalDaFolha = await megasAnunciados(baixaAgora)
    expect(totalDaFolha).toBeGreaterThanOrEqual(mbDoModelo)
    await page.screenshot({ path: path.join(PASTA, `${nome}-folha-do-inicio.png`) })
    await page.getByRole('button', { name: 'Agora não' }).click()
    await expect(folha).toBeHidden()

    // 6b. Com a escolha guardada (Privado), a folha é só a confirmação: o mesmo total, antes do
    //     primeiro byte, acima dos 100 MB do perfil (`confirmarDownloadAcimaDeMb`).
    await page.evaluate(() => localStorage.setItem('babel.preferencias', JSON.stringify({ micEscolhido: true })))
    await (await abrirCaptura(page)).click()
    const aviso = page.getByTestId('aviso-de-download')
    await expect(aviso).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('escolha-do-microfone')).toHaveCount(0)
    const textoDoAviso = ((await aviso.textContent()) ?? '').trim()
    expect(await megasAnunciados(aviso)).toBe(totalDaFolha)
    await page.screenshot({ path: path.join(PASTA, `${nome}-aviso-download.png`) })
    await page.getByRole('button', { name: 'Agora não' }).click()
    await expect(aviso).toBeHidden()
    await page.waitForTimeout(1000)
    expect(bytesDeModelo, 'baixou modelo antes do sim').toEqual([])
    expect(
      await page.evaluate(() => (window as unknown as { __chamadasDeTela: number }).__chamadasDeTela),
      'pediu o compartilhamento de tela num aparelho que só usa o microfone',
    ).toBe(0)

    info.annotations.push({
      type: 'dispositivo',
      description: `${nome}: ${tipo} · privado ${mbDoModelo} MB · ${textoDoAviso}`,
    })
    console.log(`[${nome}] tipo=${tipo} | modelo=${mbDoModelo} MB | folha=${totalDaFolha} MB | aviso="${textoDoAviso}"`)
    expect(erros).toEqual([])
    await ctx.close()
  })
}
