import type { FullConfig } from '@playwright/test';

/**
 * ESTADO INICIAL DA SUITE E2E: um servidor que acabou de nascer.
 *
 * No runner da CI o banco e criado do zero a cada run, e um banco vazio abre a app no ONBOARDING
 * (`App.tsx`: `setOnboarded(!!ui?.onboarded)`), que nao tem `<main>`. Toda suite que comeca por
 * `expect(page.getByRole('main')).toBeVisible()` falhava ali — 20 de 26 testes — e a CI nunca
 * chegou a ficar verde no e2e (todas as 30 runs visiveis em 08/09 sao vermelhas). Na maquina de
 * desenvolvimento o banco real ja tem `onboarded: true`, e por isso ninguem via.
 *
 * O que se faz aqui e o que o Onboarding faz ao terminar (`Onboarding.tsx` `persistChoice`):
 * gravar `settings.ui.onboarded` no servidor, com o provedor local, que e o unico que nao pede
 * credencial. So isto: nenhum baralho, nenhuma sessao — os testes que dependem de dados dizem
 * "condicional" no titulo e tratam a ausencia.
 *
 * Roda DEPOIS de o `webServer` subir (ordem do Playwright), contra o mesmo `baseURL`.
 */
export default async function globalSetup(config: FullConfig) {
  const base = (config.projects[0]?.use?.baseURL as string | undefined) ?? process.env.BASE_URL ?? 'http://localhost:3100';
  const res = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ui: { onboarded: true, providerMode: 'local', credentialId: null } }),
  });
  if (!res.ok) {
    throw new Error(`globalSetup: PUT /api/settings devolveu ${res.status} — a suite abriria no Onboarding`);
  }
}
