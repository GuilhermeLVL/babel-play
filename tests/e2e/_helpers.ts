import { expect,type Locator, type Page } from '@playwright/test';

/**
 * Helpers compartilhados entre as suítes de `/jogar` (`baralhos.e2e.ts`, `facetas.e2e.ts`).
 * Extraídos de `baralhos.e2e.ts` sem mudar comportamento — só um lugar único para não divergir.
 */

/**
 * Fecha diálogos que podem aparecer sobrepostos: o de recompensa/conquista (`RecompensaDesbloqueada`,
 * título "Conquista feita" ou "Nível N!", botão com `aria-label="Fechar"`) entra ANIMADO, então
 * pode não estar visível ainda no instante do `goto` — por isso isso é chamado mais de uma vez, não
 * só logo após a navegação.
 */
export async function fecharSobreposicoes(page: Page) {
  const dialogoRecompensa = page.locator('div[role="dialog"][aria-labelledby="recompensa-titulo"]');
  const fecharRecompensa = dialogoRecompensa.getByRole('button', { name: 'Fechar' });
  for (let i = 0; i < 40; i++) {
    if (await fecharRecompensa.isVisible().catch(() => false)) {
      await fecharRecompensa.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(100);
    } else {
      break;
    }
  }

  // O modal "O que você vai praticar" pode ou não abrir (só abre quando há mais de uma fonte e
  // nenhuma preferência salva ainda) — trata os dois casos sem falhar.
  /* O CLIQUE PRECISA DE TIMEOUT, e a falta dele custou 90 segundos de teste travado: o diálogo de
     recompensa pode estar POR CIMA deste botão, e um `click()` sem prazo fica esperando a
     interceptação sumir até o teste inteiro estourar — sem dizer que o problema era o overlay.
     Com prazo curto e falha engolida, quem chama tenta de novo depois de fechar as sobreposições,
     que é exatamente o laço de `irParaPraticar`. */
  const fecharSemMudar = page.getByRole('button', { name: 'Fechar sem mudar nada' });
  if (await fecharSemMudar.isVisible().catch(() => false)) {
    await fecharSemMudar.click({ timeout: 2000 }).catch(() => {});
  }
}

/**
 * Clica robusto a diálogos de recompensa que continuam surgindo (fila de conquistas, uma por
 * vez, cada uma animando com atraso) — tenta clicar, e se um overlay interceptar o clique, fecha
 * overlays e tenta de novo, em vez de deixar o Playwright martelar o mesmo clique por 30s.
 */
export async function clicarRobusto(page: Page, locator: Locator) {
  for (let i = 0; i < 10; i++) {
    try {
      await locator.click({ timeout: 3000 });
      return;
    } catch {
      await fecharSobreposicoes(page);
      await page.waitForTimeout(200);
    }
  }
  await locator.click();
}

export async function irParaPraticar(page: Page) {
  await page.goto('/jogar');
  await expect(page.getByRole('main')).toBeVisible();

  // Tanto a recompensa quanto "O que você vai praticar" podem animar/entrar em momentos
  // diferentes do primeiro `main` visível — repete até a faixa do lobby (botão "Anki") aparecer
  // ou esgotar as tentativas.
  //
  // 20 tentativas · 400ms (8s de orçamento) — não 6·300ms (1.8s) — porque sob a suíte inteira
  // rodando em paralelo (vários workers batendo no mesmo `dev:local`) o primeiro carregamento da
  // tela pode legitimamente demorar mais que isso; um orçamento curto aqui produzia falso-negativo
  // ("Anki" não apareceu) que não era sobre o app, era sobre o teste não ter esperado o bastante.
  /* O MARCO DE "LOBBY PRONTO" MUDOU: o botão do Anki desceu para dentro da gaveta do seletor
     (redesenho de 02/09), então esperar por ele aqui esperaria por algo que não está mais na
     tela de partida. O «Trocar» do seletor é o que sempre existe no lobby, e é o novo marco. */
  const botaoAnki = page.getByRole('button', { name: 'Fonte' });
  for (let i = 0; i < 20; i++) {
    await fecharSobreposicoes(page);
    if (await botaoAnki.isVisible().catch(() => false)) break;
    await page.waitForTimeout(400);
  }
}

/**
 * O BOTÃO APARECE DEPOIS DO DADO CHEGAR, e é isso que separa um pulo honesto de um teste decorativo.
 * Ver docblock original em `baralhos.e2e.ts` (git history) para o raciocínio completo.
 */
export async function apareceEmAte(alvo: Locator, ms = 5000): Promise<boolean> {
  return alvo.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
}

/**
 * QUEM DECIDE SE HÁ BARALHO É O SERVIDOR, não a ausência de um botão na tela — ver docblock
 * original em `baralhos.e2e.ts` (git history).
 */
export async function baralhosNoServidor(page: Page): Promise<{ quantos: number; porque: string }> {
  const r = await page.request.get('/api/anki/decks').catch((e) => ({ erro: String(e) }) as never);
  if (!('ok' in r)) return { quantos: 0, porque: `a chamada a /api/anki/decks falhou: ${(r as { erro: string }).erro}` };
  if (!r.ok()) return { quantos: 0, porque: `/api/anki/decks respondeu HTTP ${r.status()}` };
  const corpo = await r.text().catch(() => '');
  let decks: unknown;
  try { decks = JSON.parse(corpo); } catch { return { quantos: 0, porque: `/api/anki/decks devolveu algo que não é JSON: ${corpo.slice(0, 120)}` }; }
  if (!Array.isArray(decks)) return { quantos: 0, porque: `/api/anki/decks devolveu ${typeof decks}, não uma lista` };
  return { quantos: decks.length, porque: decks.length ? '' : 'o servidor não tem nenhum baralho importado' };
}

/**
 * ABRE A GAVETA DO SELETOR e devolve. As ações de material (Anki, baralhos, gravações) vivem no
 * rodapé dela desde o redesenho: elas pertencem à decisão "de onde vem o que eu jogo", e ficavam
 * soltas acima da tela parecendo navegação.
 */
export async function abrirSeletor(page: Page): Promise<void> {
  const trocar = page.getByRole('button', { name: 'Fonte' });
  await trocar.waitFor({ state: 'visible', timeout: 15_000 });
  if ((await trocar.getAttribute('aria-expanded')) !== 'true') {
    await clicarRobusto(page, trocar);
  }
  await trocar.evaluate((el) => el.getAttribute('aria-expanded'));
}
