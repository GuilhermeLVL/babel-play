/**
 * O CLIENTE DAS ROTAS DE CONFIGURAÇÃO.
 *
 * Espelho de `src/data/efemero/rotas/settings.ts` (lá o destino é o `localStorage`).
 *
 * Rotas: GET `/api/settings`, PUT `/api/settings`.
 */
import { apiFetch } from '../funil'
import { compartilharEmVoo } from '../leituraEmVoo'

export interface AppSettings {
  id: string
  activeProfileId: string | null
  targetLanguage: string | null
  ui: string | null
}

export interface SettingsPayload {
  activeProfileId?: string | null
  targetLanguage?: string | null
  ui?: unknown
}

async function lerSettings(): Promise<AppSettings | null> {
  try {
    const res = await apiFetch('/api/settings')
    if (!res.ok) return null
    return (await res.json()) as AppSettings
  } catch {
    return null
  }
}

/* Onze módulos leem as configurações ao montar; quem pede junto recebe a mesma leitura
   (fix/rotas-caras). Uma leitura que começou antes de um `saveSettings` não é reaproveitada. */
const lerSettingsCompartilhado = compartilharEmVoo(lerSettings)

/**
 * A LEITURA DA ABERTURA, ENTREGUE A QUEM PEDE LOGO DEPOIS (auditoria do servidor de 10/10/2026, achado A2).
 *
 * Três donos leem as configurações ao abrir o app (o par de idiomas, a aparência e as preferências), e
 * não ao mesmo tempo: o segundo e o terceiro só montam depois de o primeiro ter respondido, então a
 * leitura em voo não os alcançava e o mesmo GET saía duas ou três vezes (medido no build de produção,
 * celular fraco: aos 0,9 s e aos 3,3 s da abertura).
 *
 * A PRIMEIRA leitura que dá certo na página vale por 10 segundos para quem pedir de novo. É uma janela
 * só, a da abertura: fechada, não reabre, e toda leitura volta a ir à rede (compartilhada só enquanto
 * está em voo, como sempre). Ela fecha antes da hora em duas situações em que o dado pode ter mudado:
 * qualquer gravação de configuração por esta página, e o ler-para-gravar de `patchUiSettings`, que
 * sempre lê do servidor.
 */
const JANELA_DA_ABERTURA_MS = 10_000
let daAbertura: { lida: AppSettings; ate: number } | null = null
let aberturaEncerrada = false

function fecharAbertura(): void {
  daAbertura = null
  aberturaEncerrada = true
}

async function lerDoServidor(): Promise<AppSettings | null> {
  const s = await lerSettingsCompartilhado()
  if (s && !aberturaEncerrada && !daAbertura) daAbertura = { lida: s, ate: Date.now() + JANELA_DA_ABERTURA_MS }
  return s
}

export async function fetchSettings(): Promise<AppSettings | null> {
  if (daAbertura && Date.now() >= daAbertura.ate) fecharAbertura()
  const s = daAbertura ? daAbertura.lida : await lerDoServidor()
  // Um objeto por chamada, como antes: quem pediu junto não compartilha a mesma referência.
  return s ? { ...s } : null
}

export async function saveSettings(payload: SettingsPayload): Promise<AppSettings | null> {
  fecharAbertura()
  try {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    return (await res.json()) as AppSettings
  } catch {
    return null
  }
}

/**
 * Atualiza campos do blob `ui` MESCLANDO com o que já existe (o `ui` é compartilhado
 * por onboarding, tema, persona etc.). Evita que salvar uma pref apague as outras.
 */
export async function patchUiSettings(patch: Record<string, unknown>): Promise<AppSettings | null> {
  /* Ler-para-gravar nunca usa a leitura guardada da abertura: mesclar sobre um retrato de segundos atrás
     apagaria o que outra aba gravou nesse meio-tempo. */
  fecharAbertura()
  const s = await lerSettingsCompartilhado()
  let ui: Record<string, unknown>
  try { ui = s?.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {} } catch { ui = {} }
  return saveSettings({ ui: { ...ui, ...patch } })
}
