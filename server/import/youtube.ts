/**
 * Importação de YouTube (lado SERVIDOR) — o navegador não pode baixar YouTube (CORS/ToS),
 * então o trabalho pesado fica aqui, via o binário `yt-dlp`.
 *
 * Estratégia HONESTA (decisão do usuário): legenda-PRIMEIRO, Whisper de reserva.
 *   1. `resolveYouTube` lê os metadados + as faixas de legenda disponíveis (SEM baixar o vídeo).
 *   2. `fetchCaptions` baixa e converte a legenda existente (timestamps REAIS) — preferindo a
 *      manual sobre a automática, e registrando qual foi (para o selo de procedência).
 *   3. `downloadAudio` baixa só o ÁUDIO (para ouvir/shadowing). Se NÃO houver legenda, o cliente
 *      transcreve esse áudio com o Whisper local (fora deste módulo).
 *
 * Nenhum dado é fabricado: sem legenda, retornamos `null` e deixamos o cliente decidir.
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'

// Nome do binário (sobrescrevível por env, p/ quem instala o yt-dlp fora do PATH).
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'

export interface Cue { startMs: number; endMs: number; text: string }
type TrackMap = Record<string, Array<{ ext: string; url: string }>>
export interface YtInfo {
  id: string
  title: string
  durationMs?: number
  lang?: string
  subtitles: TrackMap
  autoCaptions: TrackMap
}

interface RunResult { code: number; stdout: string; stderr: string }

/** Roda o yt-dlp com args em ARRAY (sem shell — a URL do usuário nunca é interpolada). */
function runYtDlp(args: string[], { timeoutMs = 120_000 } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('yt-dlp expirou (timeout)'))
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }) })
  })
}

/** O binário yt-dlp está acessível? (best-effort, nunca lança.) */
export async function hasYtDlp(): Promise<boolean> {
  try {
    const r = await runYtDlp(['--version'], { timeoutMs: 10_000 })
    return r.code === 0
  } catch {
    return false
  }
}

/** Metadados + faixas de legenda, SEM baixar o vídeo (`--dump-single-json`). */
export async function resolveYouTube(url: string): Promise<YtInfo> {
  const r = await runYtDlp(['--dump-single-json', '--no-playlist', '--no-warnings', url])
  if (r.code !== 0) throw new Error('yt-dlp não conseguiu ler o vídeo: ' + r.stderr.slice(-300))
  const j = JSON.parse(r.stdout)
  return {
    id: String(j.id ?? ''),
    title: String(j.title ?? 'Vídeo do YouTube'),
    durationMs: typeof j.duration === 'number' ? Math.round(j.duration * 1000) : undefined,
    lang: j.language || j.original_language || undefined,
    subtitles: (j.subtitles ?? {}) as TrackMap,
    autoCaptions: (j.automatic_captions ?? {}) as TrackMap,
  }
}

const baseLang = (code: string) => code.toLowerCase().replace(/^a\./, '').split('-')[0]

/** Escolhe a chave de idioma mais próxima da desejada (senão a 1ª disponível). */
function pickLangKey(langs: string[], wanted?: string): string | undefined {
  if (!langs.length) return undefined
  if (wanted) {
    const w = baseLang(wanted)
    const exact = langs.find((l) => baseLang(l) === w)
    if (exact) return exact
  }
  // Prefere inglês como fallback comum; senão a primeira.
  return langs.find((l) => baseLang(l) === 'en') ?? langs[0]
}

/** Converte o timedtext json3 do YouTube em cues (timestamps reais). */
function parseJson3(text: string): Cue[] {
  const j = JSON.parse(text)
  const out: Cue[] = []
  for (const e of j.events ?? []) {
    if (!e.segs) continue
    const t = e.tStartMs ?? 0
    const dur = e.dDurationMs ?? 0
    const txt = e.segs.map((s: any) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim()
    if (txt) out.push({ startMs: t, endMs: t + dur, text: txt })
  }
  return out
}

const vttTime = (s: string): number => {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/.exec(s)
  if (!m) return 0
  const h = m[1] ? parseInt(m[1], 10) : 0
  return ((h * 60 + parseInt(m[2], 10)) * 60 + parseInt(m[3], 10)) * 1000 + parseInt(m[4], 10)
}

/** Parser mínimo de WebVTT (fallback quando o json3 não está disponível). */
function parseVtt(text: string): Cue[] {
  const out: Cue[] = []
  const blocks = text.replace(/\r/g, '').split('\n\n')
  for (const b of blocks) {
    const arrow = b.split('\n').find((l) => l.includes('-->'))
    if (!arrow) continue
    const [a, z] = arrow.split('-->')
    const startMs = vttTime(a)
    const endMs = vttTime(z)
    const txt = b
      .split('\n')
      .filter((l) => !l.includes('-->') && !/^WEBVTT/.test(l) && l.trim())
      .join(' ')
      .replace(/<[^>]+>/g, '') // tags de estilo inline
      .replace(/\s+/g, ' ')
      .trim()
    if (txt) out.push({ startMs, endMs, text: txt })
  }
  return out
}

/**
 * Baixa e converte a legenda existente. Preferência: MANUAL > automática; json3 > vtt.
 * Retorna `null` quando o vídeo não tem legenda (o cliente cai no Whisper local).
 */
export async function fetchCaptions(
  info: YtInfo,
  preferLang?: string
): Promise<{ cues: Cue[]; kind: 'manual' | 'auto'; lang: string } | null> {
  const tryMap = async (map: TrackMap, kind: 'manual' | 'auto') => {
    const langKey = pickLangKey(Object.keys(map), preferLang || info.lang)
    if (!langKey) return null
    const tracks = map[langKey] || []
    const track = tracks.find((t) => t.ext === 'json3') || tracks.find((t) => t.ext === 'vtt') || tracks[0]
    if (!track?.url) return null
    try {
      // P1-10: sem timeout, um alvo lento segurava o request indefinidamente.
      const res = await fetch(track.url, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) throw new Error(`legenda respondeu HTTP ${res.status}`)
      const body = await res.text()
      const cues = track.ext === 'json3' ? parseJson3(body) : parseVtt(body)
      return cues.length ? { cues, kind, lang: baseLang(langKey) } : null
    } catch (err) {
      // P2-6: NÃO devolver null aqui. `null` significa "este vídeo não tem legenda"; uma
      // falha de rede é outra coisa — e virava sessão vazia com `needsClientStt`, mandando
      // o usuário transcrever de novo algo que existia. Quem chama decide o que fazer.
      throw new Error(`falha ao baixar a legenda (${kind}): ${String((err as Error)?.message || err).slice(0, 120)}`)
    }
  }
  return (await tryMap(info.subtitles, 'manual')) || (await tryMap(info.autoCaptions, 'auto'))
}

/**
 * Baixa APENAS o áudio para o store de áudios das sessões, nomeado pelo `id` da sessão.
 * Usa `bestaudio` progressivo (itag m4a quando existe) — assim NÃO precisa do ffmpeg para
 * mux/convert. `decodeAudioData` do Chrome toca m4a(AAC) e webm/opus.
 */
export async function downloadAudio(
  url: string,
  id: string,
  dir: string
): Promise<{ file: string; contentType: string }> {
  await mkdir(dir, { recursive: true })
  const outTemplate = path.join(dir, `${id}.%(ext)s`)
  const r = await runYtDlp(
    ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '--no-playlist', '--no-warnings', '-o', outTemplate, url],
    { timeoutMs: 300_000 }
  )
  if (r.code !== 0) throw new Error('yt-dlp falhou ao baixar o áudio: ' + r.stderr.slice(-300))
  const produced = (await readdir(dir)).filter((f) => f.startsWith(id + '.'))
  const file =
    produced.find((f) => f.endsWith('.m4a')) ||
    produced.find((f) => f.endsWith('.webm')) ||
    produced[0]
  if (!file) throw new Error('áudio baixado não foi encontrado no disco')
  const ext = file.split('.').pop()!.toLowerCase()
  const contentType =
    ext === 'm4a' || ext === 'mp4' ? 'audio/mp4'
    : ext === 'webm' ? 'audio/webm'
    : ext === 'ogg' || ext === 'opus' ? 'audio/ogg'
    : 'audio/mpeg'
  return { file, contentType }
}
