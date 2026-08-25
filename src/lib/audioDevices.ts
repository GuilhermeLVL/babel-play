/**
 * Enumeração REAL de dispositivos de áudio (entrada/saída) via
 * `navigator.mediaDevices.enumerateDevices()`. Substitui os seletores falsos
 * (nomes inventados) que existiam no painel de captura. Nada é fabricado: se o
 * navegador não expõe os rótulos (permissão de mic ainda não concedida), a UI
 * mostra um estado honesto pedindo permissão.
 */
export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface AudioDeviceList {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
  /** true quando os rótulos estão disponíveis (permissão de mic concedida). */
  hasLabels: boolean;
}

const toDevice = (d: MediaDeviceInfo): AudioDevice => ({ deviceId: d.deviceId, label: d.label || '' });

export async function listDevices(): Promise<AudioDeviceList> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { inputs: [], outputs: [], hasLabels: false };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === 'audioinput').map(toDevice);
  const outputs = devices.filter(d => d.kind === 'audiooutput').map(toDevice);
  const hasLabels = [...inputs, ...outputs].some(d => !!d.label);
  return { inputs, outputs, hasLabels };
}

/**
 * Rótulos típicos de dispositivos de ENTRADA que expõem o mix do SISTEMA (loopback):
 * "Stereo Mix"/"Mixagem Estéreo" (nativo do Windows, geralmente desabilitado por padrão),
 * "What U Hear" (Creative), "Wave Out Mix", ou drivers virtuais (VB-Audio Cable, VoiceMeeter).
 * Capturados via getUserMedia como um microfone comum — é a rota confiável (nunca dá
 * NotReadableError) para transcrever Discord/jogos/o sistema inteiro dentro do navegador.
 */
const LOOPBACK_LABEL_RE =
  /stereo mix|mixagem est|what ?u ?hear|wave ?out|vb-?audio|cable output|voicemeeter|loopback|line ?1/i;

/** O rótulo deste dispositivo indica uma entrada de loopback (mix do sistema)? */
export function isLoopbackDevice(label: string): boolean {
  return LOOPBACK_LABEL_RE.test(label || '');
}

/**
 * Filtra os prováveis dispositivos de loopback entre os inputs enumerados. Se NENHUM casar
 * (rótulos ocultos por falta de permissão, ou nomes atípicos), devolve todos os inputs como
 * fallback — a UI ainda deixa o usuário escolher manualmente. `detected` diz se o match foi
 * por heurística (true) ou se é o fallback com a lista inteira (false).
 */
export function filterLoopbackDevices(inputs: AudioDevice[]): { devices: AudioDevice[]; detected: boolean } {
  const hits = inputs.filter(d => d.deviceId && isLoopbackDevice(d.label));
  if (hits.length) return { devices: hits, detected: true };
  return { devices: inputs.filter(d => d.deviceId), detected: false };
}

/** Registra um listener de mudança de dispositivos (plugar/desplugar fone). Devolve o unsubscribe. */
export function onDeviceChange(cb: () => void): () => void {
  if (!navigator.mediaDevices?.addEventListener) return () => {};
  navigator.mediaDevices.addEventListener('devicechange', cb);
  return () => navigator.mediaDevices.removeEventListener('devicechange', cb);
}

/** O navegador permite escolher o dispositivo de SAÍDA de um <audio>/<video> (setSinkId)? */
export function supportsSinkId(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

/** Aplica o dispositivo de saída a um elemento de mídia (best-effort). */
export async function applyOutputDevice(el: HTMLMediaElement | null, deviceId: string): Promise<void> {
  if (!el || !deviceId || !supportsSinkId()) return;
  try {
    await (el as any).setSinkId(deviceId);
  } catch {
    /* dispositivo indisponível/sem permissão — ignora silenciosamente */
  }
}
