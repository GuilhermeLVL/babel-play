import { expect, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * A SUPERFICIE DE CAPTURA EXISTE NOS TRES VIEWPORTS.
 *
 * Nao se grava nada aqui: o runner nao tem microfone, e o Whisper local pede modelo baixado.
 * O que se prova e o que precede a gravacao — a tela abre, o botao de iniciar esta a vista e
 * habilitado (`micEnabled` nasce ligado), e o painel de dispositivos/motor abre como dialogo
 * e diz qual motor de IA esta ativo. Um `disabled` no botao ou um painel que nao abre no
 * celular apareceria aqui antes de qualquer pessoa tentar gravar.
 */

test.describe('Transcricao (captura)', () => {
  test('a tela de captura mostra o botao de iniciar e o painel de motor', async ({ page }) => {
    test.slow()
    await abrirTela(page, '/capturar')

    /* A tela é UMA SÓ nos três tamanhos (`captura-do-prototipo`, desenho novo de 09/10/2026): abre
       pronta, com "Iniciar captura" na faixa de baixo e "Ajustes da captura" no topo. */
    const tela = page.getByTestId('captura-do-prototipo')
    const iniciar = page.getByTestId('iniciar-captura')
    await expect(iniciar, 'o gesto principal da captura deveria estar na tela').toBeVisible({ timeout: 15_000 })
    await expect(iniciar, 'o botao nasce habilitado: o microfone e a fonte padrao').toBeEnabled()
    await expect(iniciar).toHaveText(/Iniciar captura/)

    /* O botao dos ajustes e um icone: o nome acessivel vem do `aria-label`, que e o que o leitor de
       tela anuncia. */
    const abrirPainel = tela.getByRole('button', { name: 'Ajustes da captura' })
    await expect(abrirPainel).toBeVisible()
    await clicarRobusto(page, abrirPainel)

    /* O painel é o diálogo "Dispositivos e modelos de IA"; Kids e Sênior têm o título na linguagem
       do perfil. */
    const painel = page.getByRole('dialog', {
      name: /Dispositivos e modelos de IA|Ajustes de áudio|Configurações do som/,
    })
    await expect(painel).toBeVisible()
    await expect(painel.getByText('Motor de IA ativo')).toBeVisible()
    await expect(painel.getByText(/Local, no dispositivo|Nuvem \(sua chave\)/)).toBeVisible()

    await clicarRobusto(page, painel.getByRole('button', { name: 'Pronto' }))
    await expect(painel).toBeHidden()
  })

  test.skip('gravar e transcrever um trecho', () => {
    // exige microfone e modelo local
  })
})
