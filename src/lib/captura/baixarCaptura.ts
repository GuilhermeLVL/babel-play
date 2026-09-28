/**
 * "BAIXAR ESTA SESSÃO" — a saída do fim da captura que não depende de servidor nem de conta
 * (relato do dono, 2026-09-28). Quando a captura não pode ser guardada (teto sem conta, rede fora),
 * a pessoa leva a transcrição num arquivo de texto legível, cada fala com o tempo, quem falou e a
 * tradução, e o áudio num segundo arquivo quando houver. É texto, não um formato do app: abre em
 * qualquer lugar, e ninguém precisa do Babel Play para ler o que gravou.
 */
import type { RascunhoDaCaptura } from './rascunhoDaCaptura';

const mmss = (ms = 0) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function textoDaCaptura(r: RascunhoDaCaptura): string {
  const linhas = [r.titulo, `${new Date(r.criadoEm).toISOString().slice(0, 16).replace('T', ' ')} · ${mmss(r.durationMs)}`, ''];
  for (const u of r.utterances) {
    const quem = u.speakerName || (u.source === 'system' ? 'Outros' : 'Você');
    linhas.push(`[${mmss(u.tStartMs)}] ${quem}: ${(u.sourceText ?? '').trim()}`);
    if ((u.translatedText ?? '').trim()) linhas.push(`  → ${u.translatedText!.trim()}`);
  }
  return linhas.join('\n') + '\n';
}

export function nomeDoArquivo(r: RascunhoDaCaptura, extensao: string): string {
  const base =
    r.titulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'captura';
  return `babel-play-${base}-${new Date(r.criadoEm).toISOString().slice(0, 10)}.${extensao}`;
}

function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const extensaoDoAudio = (tipo: string) =>
  tipo.includes('ogg') ? 'ogg' : tipo.includes('webm') ? 'webm' : tipo.includes('wav') ? 'wav' : tipo.includes('mp4') ? 'm4a' : 'audio';

/** Baixa a transcrição (.txt) e, quando houver, o áudio da captura. */
export function baixarCaptura(r: RascunhoDaCaptura, audio?: Blob | null): void {
  baixar(new Blob([textoDaCaptura(r)], { type: 'text/plain;charset=utf-8' }), nomeDoArquivo(r, 'txt'));
  if (audio && audio.size) baixar(audio, nomeDoArquivo(r, extensaoDoAudio(audio.type || '')));
}
