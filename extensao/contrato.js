/**
 * O CONTRATO DE MENSAGENS entre a extensão e o app (versão 1). Módulo puro: sem `chrome`, sem DOM além de
 * `btoa`/`atob`. É a única fonte da verdade: o offscreen, a ponte, o app e o teste importam daqui.
 *
 * O caminho do áudio:  aba -> offscreen (PCM 16 kHz mono, Int16) -> porta `frasy-pcm` -> ponte (content
 * script na página do app) -> `window.postMessage` -> app. Nada passa por servidor, e nada é guardado:
 * sem uma porta aberta pelo app, os quadros são descartados na hora (retenção zero).
 */

export const VERSAO = 1;
/** Quem assina cada lado: o app confere `fonte` e `event.origin` antes de aceitar qualquer coisa. */
export const FONTE_EXTENSAO = 'frasy-extensao';
export const FONTE_APP = 'frasy-app';
/** O nome da porta que a ponte abre com o offscreen. */
export const NOME_DA_PORTA = 'frasy-pcm';
/** O formato do áudio entregue: o mesmo que o VAD e o STT do app esperam. */
export const TAXA_DE_AMOSTRAS = 16000;
/** 100 ms por quadro: 1600 amostras Int16 = 3200 bytes (~4,3 KB em base64). */
export const AMOSTRAS_POR_QUADRO = 1600;

/** Extensão -> app. */
export const TIPOS_DA_EXTENSAO = ['pronta', 'pcm', 'parou', 'erro'];
/** App -> extensão. */
export const TIPOS_DO_APP = ['pedir', 'parar'];

/** Int16Array -> base64. (Mensagens de runtime do Chrome são JSON: um ArrayBuffer não atravessa.) */
export function codificarPcm(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** base64 -> Int16Array (cópia alinhada). */
export function decodificarPcm(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}

/** Int16 -> Float32 em [-1, 1): o que o pipeline do app consome. */
export function paraFloat32(int16) {
  const f = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f[i] = int16[i] / 32768;
  return f;
}

/** Float32 [-1, 1] -> Int16 (com limite, para o pico não dar a volta). */
export function paraInt16(float32) {
  const o = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const v = Math.max(-1, Math.min(1, float32[i]));
    o[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return o;
}

const base = (tipo) => ({ fonte: FONTE_EXTENSAO, versao: VERSAO, tipo });

export const mensagemPronta = () => ({
  ...base('pronta'),
  sr: TAXA_DE_AMOSTRAS,
  amostrasPorQuadro: AMOSTRAS_POR_QUADRO,
});
export const mensagemParou = () => base('parou');
export const mensagemErro = (codigo) => ({ ...base('erro'), codigo: String(codigo) });
/** `seq` cresce de 1 em 1 (o app detecta quadro perdido); `t` = ms desde o início da captura. */
export const mensagemPcm = (int16, seq, t) => ({
  ...base('pcm'),
  seq,
  t,
  sr: TAXA_DE_AMOSTRAS,
  pcm: codificarPcm(int16),
});
export const mensagemDoApp = (tipo) => ({ fonte: FONTE_APP, versao: VERSAO, tipo });

const recusa = (motivo) => ({ ok: false, motivo });

/** O app valida o que diz vir da extensão (já conferiu `event.source === window` e `event.origin`). */
export function validarDaExtensao(m) {
  if (!m || typeof m !== 'object') return recusa('não é objeto');
  if (m.fonte !== FONTE_EXTENSAO) return recusa('fonte');
  if (m.versao !== VERSAO) return recusa('versão');
  if (!TIPOS_DA_EXTENSAO.includes(m.tipo)) return recusa('tipo');
  if (m.tipo === 'pcm') {
    if (!Number.isInteger(m.seq) || m.seq < 0) return recusa('seq');
    if (m.sr !== TAXA_DE_AMOSTRAS) return recusa('taxa');
    if (typeof m.pcm !== 'string' || m.pcm.length === 0 || m.pcm.length > 16384) return recusa('pcm');
  }
  return { ok: true };
}

/** A ponte (e o offscreen) validam o que vem da página: só pedir e parar, nada mais. */
export function validarDoApp(m) {
  if (!m || typeof m !== 'object') return recusa('não é objeto');
  if (m.fonte !== FONTE_APP) return recusa('fonte');
  if (m.versao !== VERSAO) return recusa('versão');
  if (!TIPOS_DO_APP.includes(m.tipo)) return recusa('tipo');
  return { ok: true };
}
