/**
 * O DOCUMENTO OFFSCREEN: único lugar com acesso ao stream da aba (o service worker não tem
 * `getUserMedia`). Converte o som para PCM 16 kHz mono e o entrega, em quadros de 100 ms, às portas que o
 * app abriu pela ponte. SEM porta aberta, o quadro é descartado: nada é guardado, nada vai à rede.
 */
import {
  AMOSTRAS_POR_QUADRO,
  mensagemErro,
  mensagemParou,
  mensagemPcm,
  mensagemPronta,
  NOME_DA_PORTA,
  TAXA_DE_AMOSTRAS,
  validarDoApp,
} from './contrato.js';

const params = new URLSearchParams(location.search);
const streamId = params.get('stream');
const portas = new Set();
let seq = 0;
let inicio = 0;

chrome.runtime.onConnect.addListener((porta) => {
  /* Só a nossa ponte (content script desta extensão) abre porta; outra extensão ou página não entra. */
  if (porta.name !== NOME_DA_PORTA || porta.sender?.id !== chrome.runtime.id) return porta.disconnect();
  portas.add(porta);
  porta.postMessage(mensagemPronta());
  porta.onMessage.addListener((m) => {
    if (validarDoApp(m).ok && m.tipo === 'parar') chrome.runtime.sendMessage({ alvo: 'sw', tipo: 'parar' });
  });
  porta.onDisconnect.addListener(() => portas.delete(porta));
});

function entregar(mensagem) {
  for (const p of portas) p.postMessage(mensagem);
}

async function capturar() {
  if (!streamId) return entregar(mensagemErro('sem-stream'));
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });

  /* A captura de aba SILENCIA a aba para quem ouve: devolve o som ao alto-falante num contexto à parte. */
  const saida = new AudioContext();
  saida.createMediaStreamSource(stream).connect(saida.destination);

  /* O contexto de análise a 16 kHz: o navegador reamostra, e o worklet só empacota. */
  const analise = new AudioContext({ sampleRate: TAXA_DE_AMOSTRAS });
  await analise.audioWorklet.addModule('worklet-pcm.js');
  const no = new AudioWorkletNode(analise, 'frasy-pcm', {
    processorOptions: { amostrasPorQuadro: AMOSTRAS_POR_QUADRO },
  });
  inicio = performance.now();
  no.port.onmessage = (e) => {
    if (portas.size === 0) return; // retenção zero: sem ouvinte, o quadro some
    seq += 1;
    entregar(mensagemPcm(new Int16Array(e.data), seq, Math.round(performance.now() - inicio)));
  };
  analise.createMediaStreamSource(stream).connect(no);

  stream.getAudioTracks()[0].addEventListener('ended', () => {
    entregar(mensagemParou());
    chrome.runtime.sendMessage({ alvo: 'sw', tipo: 'parar' });
  });
}

capturar().catch((e) => {
  entregar(mensagemErro(e?.name ?? 'desconhecido'));
  chrome.runtime.sendMessage({ alvo: 'sw', tipo: 'parar' });
});
