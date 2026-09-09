import { expect,test } from '@playwright/test';

import { clicarRobusto,fecharSobreposicoes } from './_helpers';

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
    test.slow();
    await page.goto('/capturar');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    const iniciar = page.getByRole('button', { name: /Iniciar a gravação de áudio|Iniciar captura|Começar a gravar/ });
    await expect(iniciar, 'o gesto principal da captura deveria estar na tela').toBeVisible({ timeout: 15_000 });
    await expect(iniciar, 'o botao nasce habilitado: o microfone e a fonte padrao').toBeEnabled();

    /* O rotulo do botao muda por perfil (senior: "Configurações Simples"); o dialogo que ele abre
       tem um `aria-label` unico. */
    const abrirPainel = page.getByRole('button', { name: /Configurações Simples|Configurações de Dispositivos & IA|Ajustes de Áudio/ });
    await expect(abrirPainel).toBeVisible();
    await clicarRobusto(page, abrirPainel);

    const painel = page.getByRole('dialog', { name: 'Configurações de dispositivos e modelos de IA' });
    await expect(painel).toBeVisible();
    await expect(painel.getByText('Motor de IA ativo')).toBeVisible();
    await expect(painel.getByText(/Local, no dispositivo|Nuvem \(sua chave\)/)).toBeVisible();

    await clicarRobusto(page, painel.getByRole('button', { name: 'Fechar configurações' }));
    await expect(painel).toBeHidden();
  });

  test.skip('gravar e transcrever um trecho', () => {
    // exige microfone e modelo local
  });
});
