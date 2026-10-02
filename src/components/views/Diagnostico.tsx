import '../../styles/questInstitucional.css';

import {
  Activity,
  Check,
  ClipboardCopy,
  Cloud,
  Cpu,
  Gauge,
  KeyRound,
  LayoutPanelTop,
  Loader2,
  Mic,
  MonitorUp,
  Stethoscope,
  Timer,
  TriangleAlert,
  Vibrate,
  Volume2,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { encodeWav } from '../../gateway/audio/wav';
import { CHAVE_DA_ULTIMA_CAPTURA } from '../../gateway/capture/captureMetrics';
import { medirBenchmark, type PontuacaoDoBenchmark } from '../../lib/dispositivo/benchmark';
import {
  coletarSinaisDoDiagnostico,
  medirModelo,
  MODELO_DA_GPU,
  MODELOS_DA_CPU,
  nivelDoAudio,
  type ResultadoDoModelo,
  resumirModelo,
  type SinaisDoDiagnostico,
  URL_DO_TRECHO_DE_FALA,
  veredictoDoModelo,
  vigiarQuadros,
} from '../../lib/dispositivo/diagnostico';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { type ProvaDetalhadaDeVibracao, provarVibracaoEmDetalhe } from '../../lib/dispositivo/respostaAoApontar';
import { definirTelaNovaDoQuest, telaNovaDoQuest, useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../lib/i18n';
import { irPara } from '../../lib/irPara';
import { cabecalhoDoDono, CHAVE_DO_DONO_NO_APARELHO, ENDPOINT_DA_NUVEM_DO_QUEST } from '../../lib/nuvemDoQuest';
import { CabecalhoDeTela, Tela, TituloDeSecao } from '../ui';
import AbasDoQuest from './ajustes/quest/AbasDoQuest';
import { type NivelDaProva, textoDaProva, tocarSomDoApontar } from './ajustes/quest/vibracao';

/**
 * DIAGNÓSTICO DO APARELHO (`/diagnostico`) — o que ESTE aparelho entrega, medido nele mesmo.
 *
 * Feita para o Meta Quest (relato do dono, 01/10/2026: o headset inteiro trava ao capturar), mas serve
 * a qualquer aparelho. Quatro medidas, cada uma a pedido e com o próprio botão — nada roda sozinho além
 * da leitura dos sinais, que é barata:
 *
 *   1. o que o navegador entrega (núcleos, memória, GPU, Web Speech, compartilhar tela…);
 *   2. o microfone, com e sem o processamento de voz (o eco cancelado apaga o som do alto-falante?);
 *   3. o compartilhamento de tela: traz áudio? o áudio sobrevive sem o vídeo? quanto pesa?
 *   4. a velocidade real de cada modelo de transcrição, e quantos quadros a tela perde enquanto roda.
 *
 * O resultado fica legível na tela (para um print) e num JSON com o botão Copiar. Nada aqui muda a
 * captura. O visual é o das telas de suporte (Ajuda): cabeçalho, seções e cartões, sem peça nova.
 */

interface NivelMedido {
  rmsDb: number;
  picoDb: number;
  config: Record<string, unknown>;
}

interface ResultadoDoMicrofone {
  comProcessamento: NivelMedido | null;
  semProcessamento: NivelMedido | null;
  erro: string | null;
}

interface ResultadoDoCompartilhamento {
  superficie: string | null;
  temAudio: boolean;
  configDoAudio: Record<string, unknown> | null;
  nivelComVideo: { rmsDb: number; picoDb: number } | null;
  /** Depois de parar a faixa de vídeo: a de áudio continuou viva, e com som? */
  audioSemVideo: { vivo: boolean; rmsDb: number; picoDb: number } | null;
  quadrosAntes: { longos: number; piorMs: number } | null;
  quadrosDurante: { longos: number; piorMs: number } | null;
  erro: string | null;
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const erroEmTexto = (e: unknown): string => {
  const err = e as { name?: string; message?: string };
  return [err?.name, err?.message].filter(Boolean).join(': ') || String(e);
};

/** As constraints que valeram numa faixa de áudio (só as que interessam ao diagnóstico). */
function configDaFaixa(faixa: MediaStreamTrack): Record<string, unknown> {
  const s = faixa.getSettings() as Record<string, unknown>;
  const campos = ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'sampleRate', 'channelCount'];
  return Object.fromEntries(campos.filter((c) => c in s).map((c) => [c, s[c]]));
}

/** Ouve `ms` de uma trilha e devolve o nível. O contexto é fechado no fim. */
async function ouvirNivel(stream: MediaStream, ms: number): Promise<{ rmsDb: number; picoDb: number }> {
  const ctx = new AudioContext();
  try {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analisador);
    const pedacos: Float32Array[] = [];
    const fim = performance.now() + ms;
    while (performance.now() < fim) {
      const quadro = new Float32Array(analisador.fftSize);
      analisador.getFloatTimeDomainData(quadro);
      pedacos.push(quadro);
      await esperar(40);
    }
    const tudo = new Float32Array(pedacos.length * analisador.fftSize);
    pedacos.forEach((p, i) => tudo.set(p, i * analisador.fftSize));
    return nivelDoAudio(tudo);
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function medirMicrofone(): Promise<ResultadoDoMicrofone> {
  const r: ResultadoDoMicrofone = { comProcessamento: null, semProcessamento: null, erro: null };
  for (const ligado of [true, false]) {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: ligado, noiseSuppression: ligado, autoGainControl: ligado },
      });
      const config = configDaFaixa(stream.getAudioTracks()[0]);
      const nivel = await ouvirNivel(stream, 5000);
      r[ligado ? 'comProcessamento' : 'semProcessamento'] = { ...nivel, config };
    } catch (e) {
      r.erro = erroEmTexto(e);
      break;
    } finally {
      stream?.getTracks().forEach((f) => f.stop());
    }
  }
  return r;
}

async function medirCompartilhamento(): Promise<ResultadoDoCompartilhamento> {
  const r: ResultadoDoCompartilhamento = {
    superficie: null,
    temAudio: false,
    configDoAudio: null,
    nivelComVideo: null,
    audioSemVideo: null,
    quadrosAntes: null,
    quadrosDurante: null,
    erro: null,
  };
  // A régua: dois segundos de quadros sem compartilhamento nenhum.
  const antes = vigiarQuadros();
  await esperar(2000);
  const a = antes.parar();
  r.quadrosAntes = { longos: a.longos, piorMs: a.piorMs };
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { max: 1 }, width: { max: 640 }, height: { max: 360 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include',
    } as MediaStreamConstraints);
    const video = stream.getVideoTracks()[0];
    const audio = stream.getAudioTracks()[0];
    r.superficie = ((video?.getSettings() as { displaySurface?: string })?.displaySurface ?? null) || null;
    r.temAudio = !!audio;
    const durante = vigiarQuadros();
    if (audio) {
      r.configDoAudio = configDaFaixa(audio);
      r.nivelComVideo = await ouvirNivel(new MediaStream([audio]), 5000);
    } else await esperar(5000);
    const d = durante.parar();
    r.quadrosDurante = { longos: d.longos, piorMs: d.piorMs };
    if (audio) {
      // Só o áudio interessa: sem a faixa de vídeo, ele continua?
      stream.getVideoTracks().forEach((f) => f.stop());
      await esperar(1000);
      const vivo = audio.readyState === 'live';
      const nivel = vivo ? await ouvirNivel(new MediaStream([audio]), 3000) : { rmsDb: -100, picoDb: -100 };
      r.audioSemVideo = { vivo, ...nivel };
    }
  } catch (e) {
    r.erro = erroEmTexto(e);
  } finally {
    stream?.getTracks().forEach((f) => f.stop());
  }
  return r;
}

/** O trecho de fala das medidas, em 16 kHz mono (o formato que os modelos recebem). */
async function carregarTrechoDeFala(): Promise<Float32Array> {
  const resposta = await fetch(URL_DO_TRECHO_DE_FALA);
  if (!resposta.ok) throw new Error(`o trecho de fala não baixou (${resposta.status})`);
  const bytes = await resposta.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decodificado = await ctx.decodeAudioData(bytes);
    const offline = new OfflineAudioContext(1, Math.ceil(decodificado.duration * 16000), 16000);
    const fonte = offline.createBufferSource();
    fonte.buffer = decodificado;
    fonte.connect(offline.destination);
    fonte.start();
    return (await offline.startRendering()).getChannelData(0).slice();
  } finally {
    await ctx.close().catch(() => {});
  }
}

interface ResultadoDaNuvem {
  /** Ida e volta, do envio ao texto (ms). */
  totalMs: number | null;
  /** Só a transcrição, medida na função (ms). */
  servidorMs: number | null;
  status: number | null;
  texto: string;
  erro: string | null;
}

/** Manda o trecho de fala à função do site e mede a ida e volta. */
async function medirNuvem(pcm: Float32Array): Promise<ResultadoDaNuvem> {
  const r: ResultadoDaNuvem = { totalMs: null, servidorMs: null, status: null, texto: '', erro: null };
  try {
    const t0 = performance.now();
    const res = await fetch(ENDPOINT_DA_NUVEM_DO_QUEST, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav', 'x-language': 'en', ...cabecalhoDoDono() },
      body: encodeWav(pcm, 16000),
    });
    r.status = res.status;
    const corpo = (await res.json().catch(() => ({}))) as { text?: string; ms?: number; code?: string; erro?: string };
    r.totalMs = Math.round(performance.now() - t0);
    r.servidorMs = typeof corpo.ms === 'number' ? corpo.ms : null;
    r.texto = corpo.text ?? '';
    if (!res.ok) r.erro = [corpo.code, corpo.erro].filter(Boolean).join(': ') || `HTTP ${res.status}`;
  } catch (e) {
    r.erro = erroEmTexto(e);
  }
  return r;
}

/** O resumo da última captura (`guardarUltimaCaptura`): só números. */
interface UltimaCaptura {
  quando: number;
  duracaoS: number;
  count: number;
  finalLatencyMs: { p50: number; p95: number };
  rtf: { p50: number; p95: number };
  mtLatencyMs: { p50: number; p95: number; engines: string[] } | null;
  maxQueueDepth: number;
  porMotor: Record<string, { falas: number; minutosDeFala: number; finalMs: { p50: number; p95: number } }>;
  nuvem: { minutos: number; custoUsd: number };
}

function lerUltimaCaptura(): UltimaCaptura | null {
  try {
    const bruto = localStorage.getItem(CHAVE_DA_ULTIMA_CAPTURA);
    return bruto ? (JSON.parse(bruto) as UltimaCaptura) : null;
  } catch {
    return null;
  }
}

/** O nome do motor como a pessoa entende. */
const nomeDoMotor = (id: string): string =>
  id === 'groq-whisper' ? t('Nuvem') : id === 'whisper-local' ? t('Neste aparelho') : id;

/**
 * O resultado de um teste de vibração, como o JSON de "Copiar o resultado" sempre trouxe: o que o
 * `navigator.vibrate` respondeu (o caminho do celular) e, por controle, se tem motor e se o pedido foi
 * aceito. Vem de `provarVibracaoEmDetalhe` (`respostaAoApontar.ts`), que tenta os dois caminhos.
 */
interface ResultadoDaVibracao extends ProvaDetalhadaDeVibracao {
  /** O que foi testado: um pulso suave, um forte, ou o som que o app toca no lugar do pulso. */
  teste: NivelDaProva | 'som';
}

/** Os controles que a página enxerga agora. Só lê: não pede pulso nenhum. */
function controlesAVista(): ResultadoDaVibracao['controles'] {
  try {
    return [...(navigator.getGamepads?.() ?? [])]
      .filter((c): c is Gamepad => !!c)
      .map((c) => ({
        id: c.id,
        temMotor: !!c.vibrationActuator || !!(c as Gamepad & { hapticActuators?: unknown[] }).hapticActuators?.length,
        vibrou: false,
      }));
  } catch {
    return [];
  }
}

const algoVibrou = (v: ProvaDetalhadaDeVibracao): boolean => v.vibrate === true || v.controles.some((c) => c.vibrou);

/** Um teste de vibração (precisa de um toque: o navegador só vibra com ativação da pessoa). */
async function testarVibracao(teste: ResultadoDaVibracao['teste']): Promise<ResultadoDaVibracao> {
  if (teste === 'som') {
    tocarSomDoApontar();
    return { teste, vibrate: null, controles: controlesAVista() };
  }
  const prova = await provarVibracaoEmDetalhe(teste);
  // Nada aceitou o pedido: toca o som que o app usa no lugar, como ao apontar.
  if (!algoVibrou(prova)) tocarSomDoApontar();
  return { teste, ...prova };
}

const resultadoDaVibracaoEmTexto = (v: ResultadoDaVibracao): string =>
  v.teste === 'som'
    ? t('Tocou o som que o app usa no lugar da vibração. Com os sons do app desligados, ele não toca.')
    : v.vibrate === true
      ? t('O navegador aceitou o pedido de vibração do aparelho.')
      : textoDaProva({
          controles: v.controles.length,
          comMotor: v.controles.filter((c) => c.temMotor).length,
          pediu: v.controles.some((c) => c.vibrou),
        });

const vibrateEmTexto = (v: ResultadoDaVibracao): string =>
  v.vibrate == null ? t('não existe aqui') : simNao(v.vibrate);

const controlesEmTexto = (v: ResultadoDaVibracao): string =>
  v.controles.length
    ? v.controles
        .map(
          (c) =>
            `${c.id.slice(0, 28)}: ${c.vibrou ? t('vibrou') : c.temMotor ? t('tem motor, não vibrou') : t('sem motor')}`,
        )
        .join(' · ')
    : t('nenhum');

const ROTULO_DO_VEREDICTO: Record<ReturnType<typeof veredictoDoModelo>, string> = {
  folga: 'Com folga',
  justo: 'No limite',
  lento: 'Lento',
  falhou: 'Falhou',
};

const simNao = (v: boolean) => (v ? t('sim') : t('não'));

/** Uma medida no desenho do headset: o que é, e o valor em destaque (`.q-medidas` > `.q-medida`). */
function Dado({ rotulo, valor, id }: { rotulo: string; valor: React.ReactNode; id?: string }) {
  return (
    <div className="q-medida" data-testid={id}>
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function Linha({ rotulo, valor, id }: { rotulo: string; valor: React.ReactNode; id?: string }) {
  return (
    <div className="entre atalho" data-testid={id}>
      <span>{rotulo}</span>
      <b>{valor}</b>
    </div>
  );
}

const nivelEmTexto = (n: { rmsDb: number; picoDb: number } | null) =>
  n ? t('volume médio {rms} dB, pico {pico} dB', { rms: n.rmsDb, pico: n.picoDb }) : t('não mediu');

export default function Diagnostico() {
  // No Quest com as telas novas, o desenho é o do headset (abas); desligada a chave, a tela de sempre.
  const questNovo = useQuestNovo();
  const [aba, setAba] = useState('aparelho');
  const [noQuest] = useState(() => perfilDoDispositivo().tipo === 'quest');
  const [sinais, setSinais] = useState<SinaisDoDiagnostico | null>(null);
  const [microfone, setMicrofone] = useState<ResultadoDoMicrofone | null>(null);
  const [compartilhamento, setCompartilhamento] = useState<ResultadoDoCompartilhamento | null>(null);
  const [benchmark, setBenchmark] = useState<PontuacaoDoBenchmark | null>(null);
  const [modelos, setModelos] = useState<ResultadoDoModelo[]>([]);
  const [nuvem, setNuvem] = useState<ResultadoDaNuvem | null>(null);
  const [ultima] = useState<UltimaCaptura | null>(lerUltimaCaptura);
  const [telaNova, setTelaNova] = useState(telaNovaDoQuest);
  const [vibracao, setVibracao] = useState<ResultadoDaVibracao | null>(null);
  const [chaveDeDono, setChaveDeDono] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_DO_DONO_NO_APARELHO) ?? '';
    } catch {
      return '';
    }
  });
  const [ocupado, setOcupado] = useState<null | 'microfone' | 'tela' | 'modelos' | 'gpu' | 'nuvem'>(null);
  const [andamento, setAndamento] = useState('');
  const [erroDosModelos, setErroDosModelos] = useState('');
  const [copiado, setCopiado] = useState(false);
  /** No Quest: a área de transferência recusou, e o texto ficou selecionado para copiar à mão. */
  const [copiaFalhou, setCopiaFalhou] = useState(false);
  const trechoRef = useRef<Float32Array | null>(null);
  const caixaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let vivo = true;
    void coletarSinaisDoDiagnostico().then((s) => vivo && setSinais(s));
    return () => {
      vivo = false;
    };
  }, []);

  const relatorio = useMemo(
    () =>
      JSON.stringify(
        { sinais, microfone, compartilhamento, benchmark, modelos, nuvem, ultima, vibracao, telaNova },
        null,
        1,
      ),
    [sinais, microfone, compartilhamento, benchmark, modelos, nuvem, ultima, vibracao, telaNova],
  );

  const rodar = async (qual: NonNullable<typeof ocupado>, tarefa: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(qual);
    try {
      await tarefa();
    } finally {
      setOcupado(null);
      setAndamento('');
    }
  };

  const medirOsModelos = (lista: readonly (typeof MODELOS_DA_CPU)[number][], comBenchmark: boolean) => async () => {
    setErroDosModelos('');
    try {
      if (comBenchmark) {
        setAndamento(t('Comparando o processador com a placa de vídeo…'));
        setBenchmark(await medirBenchmark());
      }
      setAndamento(t('Baixando o trecho de fala do teste…'));
      trechoRef.current ??= await carregarTrechoDeFala();
      for (const m of lista) {
        const onde = m.backend === 'webgpu' ? t('placa de vídeo') : t('{n} thread(s)', { n: m.threads });
        setAndamento(t('Medindo {modelo} ({onde})…', { modelo: m.rotulo, onde }));
        const r = await medirModelo(m, trechoRef.current, {
          aoProgredir: (p) =>
            setAndamento(t('Baixando {modelo}: {pct}%', { modelo: m.rotulo, pct: Math.round(p <= 1 ? p * 100 : p) })),
        });
        setModelos((antes) => [...antes.filter((x) => x.id !== r.id), r]);
      }
    } catch (e) {
      setErroDosModelos(erroEmTexto(e));
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(relatorio);
      setCopiaFalhou(false);
    } catch {
      /* QUEST: o texto mora na aba Resultado, e texto num painel escondido não se seleciona nem se
         copia. Abre a aba, seleciona (no efeito abaixo, depois de o painel aparecer) e diz a verdade:
         nada de "Copiado". */
      if (questNovo) {
        setAba('resultado');
        setCopiaFalhou(true);
        return;
      }
      // Sem a API da área de transferência: seleciona o texto para a pessoa copiar à mão.
      caixaRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };
  useEffect(() => {
    if (!copiaFalhou || aba !== 'resultado') return;
    caixaRef.current?.focus();
    caixaRef.current?.select();
  }, [copiaFalhou, aba]);
  const provar = (teste: ResultadoDaVibracao['teste']) => void testarVibracao(teste).then(setVibracao);

  const mbDaCpu = [...new Map(MODELOS_DA_CPU.map((m) => [m.modelo, m.mb])).values()].reduce((a, b) => a + b, 0);
  const s = sinais;

  /* As ações da tela, com nome: a tela de sempre e a do headset chamam as mesmas. */
  const testarMicrofone = () => rodar('microfone', async () => setMicrofone(await medirMicrofone()));
  const testarCompartilhamento = () => rodar('tela', async () => setCompartilhamento(await medirCompartilhamento()));
  const medirNoProcessador = () => rodar('modelos', medirOsModelos(MODELOS_DA_CPU, true));
  const medirNaPlacaDeVideo = () => rodar('gpu', medirOsModelos([MODELO_DA_GPU], false));
  const medirNaNuvem = () =>
    rodar('nuvem', async () => {
      setErroDosModelos('');
      try {
        setAndamento(t('Baixando o trecho de fala do teste…'));
        trechoRef.current ??= await carregarTrechoDeFala();
        setAndamento(t('Enviando à nuvem…'));
        setNuvem(await medirNuvem(trechoRef.current));
      } catch (e) {
        setErroDosModelos(erroEmTexto(e));
      }
    });
  const alternarTelaNova = () => {
    definirTelaNovaDoQuest(!telaNova);
    setTelaNova(!telaNova);
  };
  const mudarChaveDeDono = (v: string) => {
    setChaveDeDono(v);
    try {
      if (v.trim()) localStorage.setItem(CHAVE_DO_DONO_NO_APARELHO, v.trim());
      else localStorage.removeItem(CHAVE_DO_DONO_NO_APARELHO);
    } catch {
      /* sem armazenamento */
    }
  };
  const navegadorEmTexto = s
    ? [
        s.navegador.modelo,
        s.navegador.oculus && `Browser ${s.navegador.oculus}`,
        s.navegador.chrome && `Chrome ${s.navegador.chrome}`,
      ]
        .filter(Boolean)
        .join(' · ') || t('não identificado')
    : '';
  const placaEmTexto = s?.webGpu
    ? `${s.webGpu.fornecedor} ${s.webGpu.arquitetura}${s.webGpu.shaderF16 ? ' · f16' : ''}`.trim()
    : t('não');

  /* ══════════════ QUEST (telas novas ligadas) ══════════════
     As mesmas medidas, uma aba por assunto: nada de página comprida para rolar com o raio. O que está
     rodando e o "Copiar o resultado" ficam na faixa do pé, à vista em qualquer aba. Os painéis ficam
     todos montados (só escondidos): trocar de aba não perde um resultado nem o JSON. */
  if (questNovo) {
    const abas = [
      { id: 'aparelho', rotulo: t('Aparelho'), icone: <Cpu aria-hidden /> },
      { id: 'som', rotulo: t('Som'), icone: <Mic aria-hidden /> },
      { id: 'velocidade', rotulo: t('Velocidade'), icone: <Gauge aria-hidden /> },
      { id: 'captura', rotulo: t('Última captura'), icone: <Timer aria-hidden /> },
      /* A aba do HEADSET (a chave das telas novas, a vibração do controle) só existe no headset. No
         computador o desenho novo liga e desliga em Ajustes → Aparência, e não há controle para vibrar. */
      ...(noQuest ? [{ id: 'headset', rotulo: t('Headset'), icone: <LayoutPanelTop aria-hidden /> }] : []),
      { id: 'resultado', rotulo: t('Resultado'), icone: <ClipboardCopy aria-hidden /> },
    ];
    /* A CHAVE DE DONO vale em qualquer aparelho (é ela que tira a medida "na nuvem" da cota diária):
       no headset mora na aba Headset, como sempre; no computador, junto da medida que ela afeta. */
    const chaveDeDonoNoDesenhoNovo = (
      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Chave de dono')}</h2>
            <p>{t('Só para quem mantém o site: com a chave certa, este aparelho não cai na cota diária da nuvem.')}</p>
          </div>
        </header>
        <label className="q-campo">
          <span>{t('Chave de dono')}</span>
          <input
            type="password"
            autoComplete="off"
            aria-label={t('Chave de dono')}
            value={chaveDeDono}
            onChange={(e) => mudarChaveDeDono(e.target.value)}
          />
          <small>
            {chaveDeDono.trim()
              ? t('Guardada só neste aparelho. Apague o campo para removê-la.')
              : t('Nenhuma chave guardada neste aparelho.')}
          </small>
        </label>
      </section>
    );
    const painel = (id: string) => ({
      role: 'tabpanel',
      id: `painel-${id}`,
      'aria-labelledby': `aba-${id}`,
      className: 'q-inst-painel',
      hidden: aba !== id,
    });
    const girando = <Loader2 className="gira" aria-hidden />;
    return (
      <div className="q-palco q-inst q-diag" data-testid="diagnostico-do-quest">
        <header className="q-cab">
          <div>
            <p className="q-sobre">{t('Suporte')}</p>
            <h1>{t('Diagnóstico do aparelho')}</h1>
          </div>
          {s?.navegador.modelo && <span className="q-chip">{s.navegador.modelo}</span>}
        </header>

        <AbasDoQuest itens={abas} ativo={aba} aoTrocar={setAba} rotuloDoGrupo={t('Partes do diagnóstico')} />

        {/* ── APARELHO ── */}
        <div {...painel('aparelho')}>
          <section className="q-secao" data-testid="diagnostico-sinais">
            <header>
              <div>
                <h2>{t('Este aparelho')}</h2>
                <p>{t('Lido do navegador ao abrir a página. Nada muda na sua captura.')}</p>
              </div>
            </header>
            {!s ? (
              <div className="q-grade g2" role="status" aria-label={t('Lendo…')}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="q-esqueleto" />
                ))}
              </div>
            ) : (
              <dl className="q-medidas duas">
                <Dado rotulo={t('Navegador')} valor={navegadorEmTexto} />
                <Dado rotulo={t('Como o app classificou')} valor={s.perfilDoApp.tipo ?? '—'} id="diagnostico-perfil" />
                <Dado rotulo={t('Núcleos que o navegador vê')} valor={s.nucleos ?? '—'} />
                <Dado rotulo={t('Memória do aparelho (GB)')} valor={s.memoriaGb ?? '—'} />
                <Dado rotulo={t('Memória da página (MB)')} valor={s.heapLimiteMb ?? '—'} />
                <Dado rotulo={t('Espaço para modelos (MB)')} valor={s.cotaMb ?? '—'} />
                <Dado rotulo={t('Várias threads (isolamento de origem)')} valor={simNao(s.isolado)} />
                <Dado rotulo={t('Placa de vídeo no navegador')} valor={placaEmTexto} />
                <Dado rotulo={t('Reconhecimento de voz do navegador')} valor={simNao(s.webSpeech)} />
                <Dado rotulo={t('Tradutor do navegador')} valor={simNao(s.tradutorNativo)} />
                <Dado rotulo={t('Compartilhar tela')} valor={simNao(s.compartilharTela)} />
                <Dado rotulo={t('Vozes de leitura')} valor={s.vozesDeLeitura ?? '—'} />
              </dl>
            )}
          </section>
        </div>

        {/* ── SOM: microfone e compartilhamento de tela ── */}
        <div {...painel('som')}>
          <div className="q-grade g2">
            <section className="q-cartao">
              <h2>
                <Mic aria-hidden /> {t('Microfone')}
              </h2>
              <p className="q-inst-nota">
                {t(
                  'Deixe um vídeo tocando no alto-falante do aparelho (em outra janela) e toque em Testar. São 10 segundos: 5 com o tratamento de voz ligado, 5 sem.',
                )}
              </p>
              <button type="button" className="q-ctl" disabled={!!ocupado || !s?.microfone} onClick={testarMicrofone}>
                {ocupado === 'microfone' ? girando : <Mic aria-hidden />}
                {ocupado === 'microfone' ? t('Ouvindo…') : t('Testar o microfone')}
              </button>
              {s && !s.microfone && (
                <p className="q-inst-nota">{t('Este navegador não entrega o microfone à página.')}</p>
              )}
              {microfone && (
                <div className="q-diag-resultado" data-testid="diagnostico-microfone">
                  {microfone.erro && (
                    <p className="q-aviso q-inst-alerta" role="alert">
                      <span>
                        <TriangleAlert aria-hidden /> {microfone.erro}
                      </span>
                    </p>
                  )}
                  <dl className="q-medidas">
                    <Dado rotulo={t('Com tratamento de voz')} valor={nivelEmTexto(microfone.comProcessamento)} />
                    <Dado rotulo={t('Sem tratamento de voz')} valor={nivelEmTexto(microfone.semProcessamento)} />
                  </dl>
                  <p className="q-inst-nota">
                    {t(
                      'Se o volume cai muito com o tratamento ligado, o cancelamento de eco está apagando o som do alto-falante: para legendar um vídeo pelo microfone, o certo é desligá-lo.',
                    )}
                  </p>
                </div>
              )}
            </section>

            <section className="q-cartao">
              <h2>
                <MonitorUp aria-hidden /> {t('Som do aparelho pelo compartilhamento')}
              </h2>
              <p className="q-inst-nota">
                {t(
                  'Com um vídeo tocando, toque em Testar e aceite compartilhar. Mede se o som vem junto, se ele continua sem a imagem e quanto a tela trava. Leva uns 12 segundos.',
                )}
              </p>
              <button
                type="button"
                className="q-ctl"
                disabled={!!ocupado || !s?.compartilharTela}
                onClick={testarCompartilhamento}
              >
                {ocupado === 'tela' ? girando : <MonitorUp aria-hidden />}
                {ocupado === 'tela' ? t('Medindo…') : t('Testar o compartilhamento')}
              </button>
              {s && !s.compartilharTela && (
                <p className="q-inst-nota">{t('Este navegador não oferece compartilhamento de tela.')}</p>
              )}
              {compartilhamento && (
                <div className="q-diag-resultado" data-testid="diagnostico-compartilhamento">
                  {compartilhamento.erro && (
                    <p className="q-aviso q-inst-alerta" role="alert">
                      <span>
                        <TriangleAlert aria-hidden /> {compartilhamento.erro}
                      </span>
                    </p>
                  )}
                  <dl className="q-medidas">
                    <Dado rotulo={t('O que foi compartilhado')} valor={compartilhamento.superficie ?? '—'} />
                    <Dado rotulo={t('Veio som junto')} valor={simNao(compartilhamento.temAudio)} />
                    <Dado rotulo={t('Nível do som')} valor={nivelEmTexto(compartilhamento.nivelComVideo)} />
                    <Dado
                      rotulo={t('O som continua sem a imagem')}
                      valor={
                        compartilhamento.audioSemVideo
                          ? `${simNao(compartilhamento.audioSemVideo.vivo)} · ${nivelEmTexto(compartilhamento.audioSemVideo)}`
                          : '—'
                      }
                    />
                    <Dado
                      rotulo={t('Travadas da tela (antes → durante)')}
                      valor={`${compartilhamento.quadrosAntes?.longos ?? '—'} → ${compartilhamento.quadrosDurante?.longos ?? '—'} (${t('pior')} ${compartilhamento.quadrosDurante?.piorMs ?? '—'} ms)`}
                    />
                  </dl>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── VELOCIDADE DA TRANSCRIÇÃO ── */}
        <div {...painel('velocidade')}>
          <section className="q-secao">
            <header>
              <div>
                <h2>{t('Velocidade da transcrição')}</h2>
                <p>
                  {t(
                    'Transcreve 11 segundos de fala com cada modelo e conta as travadas da tela. Fator abaixo de 1 acompanha a fala; quanto menor, melhor.',
                  )}
                </p>
              </div>
            </header>
            <div className="q-acoes">
              <button type="button" className="q-ctl" disabled={!!ocupado} onClick={medirNoProcessador}>
                {ocupado === 'modelos' ? girando : <Activity aria-hidden />}
                {ocupado === 'modelos' ? t('Medindo…') : t('Medir no processador')}
              </button>
              <button type="button" className="q-ctl" disabled={!!ocupado || !s?.webGpu} onClick={medirNaPlacaDeVideo}>
                {ocupado === 'gpu' ? girando : <Cpu aria-hidden />}
                {ocupado === 'gpu' ? t('Medindo…') : t('Medir na placa de vídeo')}
              </button>
              <button type="button" className="q-ctl" disabled={!!ocupado} onClick={medirNaNuvem}>
                {ocupado === 'nuvem' ? girando : <Cloud aria-hidden />}
                {ocupado === 'nuvem' ? t('Medindo…') : t('Medir na nuvem')}
              </button>
            </div>
            <p className="q-inst-nota">
              {t(
                'No processador: baixa cerca de {mb} MB na primeira vez e leva de 1 a 3 minutos. Na placa de vídeo: mais {gpu} MB, e num aparelho fraco a página pode fechar sozinha; faça por último.',
                { mb: mbDaCpu, gpu: MODELO_DA_GPU.mb },
              )}
              {s && !s.webGpu && ` ${t('Este navegador não entrega a placa de vídeo: essa medida fica desligada.')}`}
            </p>
            {erroDosModelos && (
              <p className="q-aviso q-inst-alerta" role="alert">
                <span>
                  <TriangleAlert aria-hidden /> {erroDosModelos}
                </span>
              </p>
            )}
            {(benchmark || nuvem) && (
              <dl className="q-medidas">
                {benchmark && (
                  <Dado
                    rotulo={t('Conta bruta: processador × placa de vídeo')}
                    valor={`${benchmark.pontuacaoWasm ?? '—'} × ${benchmark.pontuacaoWebgpu ?? '—'}`}
                  />
                )}
                {nuvem && (
                  <Dado
                    id="diagnostico-nuvem"
                    rotulo={t('Nuvem: 11 s de fala')}
                    valor={
                      nuvem.erro
                        ? t('falhou: {erro}', { erro: nuvem.erro })
                        : t('{total} ms no total, {servidor} ms na transcrição', {
                            total: nuvem.totalMs ?? '—',
                            servidor: nuvem.servidorMs ?? '—',
                          })
                    }
                  />
                )}
              </dl>
            )}
            {modelos.length > 0 && (
              <ul className="q-diag-modelos" data-testid="diagnostico-modelos">
                {modelos.map((m) => {
                  const veredicto = veredictoDoModelo(m.rtf);
                  return (
                    <li key={m.id} data-veredicto={veredicto}>
                      <span>{resumirModelo(m)}</span>
                      <span className="q-tag">{t(ROTULO_DO_VEREDICTO[veredicto])}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {!noQuest && chaveDeDonoNoDesenhoNovo}
        </div>

        {/* ── ÚLTIMA CAPTURA ── */}
        <div {...painel('captura')}>
          <section className="q-secao" data-testid="diagnostico-ultima-captura">
            <header>
              <div>
                <h2>{t('Última captura')}</h2>
                <p>{t('Onde o tempo foi gasto na última gravação deste aparelho, e quanto ela usou da nuvem.')}</p>
              </div>
            </header>
            {!ultima ? (
              <div className="q-vazio q-inst-vazio">
                <span className="q-ic">
                  <Timer aria-hidden />
                </span>
                <h3>{t('Nenhuma captura medida ainda')}</h3>
                <p>{t('Grave algo em Capturar e volte aqui: os tempos da gravação aparecem nesta aba.')}</p>
                <button type="button" className="q-ctl" onClick={() => irPara({ view: 'capture' })}>
                  <Mic aria-hidden /> {t('Ir para Capturar')}
                </button>
              </div>
            ) : (
              <dl className="q-medidas">
                <Dado
                  rotulo={t('Quando e quanto durou')}
                  valor={`${new Date(ultima.quando).toLocaleString()} · ${Math.round(ultima.duracaoS / 60)} min · ${ultima.count} ${t('falas')}`}
                />
                <Dado
                  rotulo={t('Do fim da fala ao texto')}
                  valor={t('{p50} ms na metade das falas, {p95} ms nas piores', {
                    p50: ultima.finalLatencyMs.p50,
                    p95: ultima.finalLatencyMs.p95,
                  })}
                />
                {Object.entries(ultima.porMotor).map(([motor, m]) => (
                  <Dado
                    key={motor}
                    rotulo={t('Transcrição: {motor}', { motor: nomeDoMotor(motor) })}
                    valor={t('{falas} falas, {min} min de fala, {p50} ms', {
                      falas: m.falas,
                      min: m.minutosDeFala,
                      p50: m.finalMs.p50,
                    })}
                  />
                ))}
                <Dado
                  rotulo={t('Tradução')}
                  valor={
                    ultima.mtLatencyMs
                      ? t('{p50} ms na metade, {p95} ms nas piores', {
                          p50: ultima.mtLatencyMs.p50,
                          p95: ultima.mtLatencyMs.p95,
                        })
                      : '—'
                  }
                />
                <Dado rotulo={t('Maior fila de falas esperando')} valor={ultima.maxQueueDepth} />
                <Dado
                  rotulo={t('Nuvem usada')}
                  valor={t('{min} min de fala, cerca de US$ {usd}', {
                    min: ultima.nuvem.minutos,
                    usd: ultima.nuvem.custoUsd.toFixed(4),
                  })}
                />
              </dl>
            )}
          </section>
        </div>

        {/* ── HEADSET: a chave das telas novas, a vibração e a chave de dono. Só no headset. ── */}
        {noQuest && (
          <div {...painel('headset')}>
            <section className="q-secao" data-testid="diagnostico-tela-nova">
              <header>
                <div>
                  <h2>{t('Telas novas do headset')}</h2>
                  <p>
                    {t(
                      'As telas redesenhadas para o Meta Quest. Se alguma sair errada, desligue aqui e a de antes volta.',
                    )}
                  </p>
                </div>
              </header>
              <div className="q-ajustes">
                <div className="q-ajuste">
                  <div>
                    <b>{t('Telas novas')}</b>
                    <small>
                      {t('Desligar troca o app inteiro na hora, inclusive esta página. Para religar, volte aqui.')}
                    </small>
                  </div>
                  <button type="button" className="q-ctl" aria-pressed={telaNova} onClick={alternarTelaNova}>
                    {telaNova && <Check aria-hidden />}
                    {telaNova ? t('Telas novas: ligadas') : t('Telas novas: desligadas')}
                  </button>
                </div>

                <div className="q-ajuste">
                  <div>
                    <b>{t('Vibração do controle')}</b>
                    <small>
                      {t(
                        'Um pulso de prova em cada intensidade, e o som que o app toca quando o navegador não entrega o motor do controle.',
                      )}
                    </small>
                  </div>
                  <div className="q-acoes" role="group" aria-label={t('Testar a vibração do controle')}>
                    <button type="button" className="q-ctl" onClick={() => provar('suave')}>
                      <Vibrate aria-hidden /> {t('Suave')}
                    </button>
                    <button type="button" className="q-ctl" onClick={() => provar('forte')}>
                      <Vibrate aria-hidden /> {t('Forte')}
                    </button>
                    <button type="button" className="q-ctl" onClick={() => provar('som')}>
                      <Volume2 aria-hidden /> {t('Som no lugar')}
                    </button>
                  </div>
                </div>
                {vibracao && (
                  <div className="q-cartao fundo" data-testid="diagnostico-vibracao">
                    <dl className="q-medidas">
                      <Dado rotulo={t('Resultado')} valor={resultadoDaVibracaoEmTexto(vibracao)} />
                      {vibracao.teste !== 'som' && (
                        <Dado rotulo={t('Vibração pelo navegador')} valor={vibrateEmTexto(vibracao)} />
                      )}
                      <Dado rotulo={t('Controles que a página enxerga')} valor={controlesEmTexto(vibracao)} />
                    </dl>
                    <p className="q-inst-nota">
                      {t(
                        'Você sentiu o controle vibrar? Me diga junto com o resultado: o navegador pode aceitar o pedido sem o controle se mexer.',
                      )}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {chaveDeDonoNoDesenhoNovo}
          </div>
        )}

        {/* ── RESULTADO: o JSON que o botão da faixa copia ── */}
        <div {...painel('resultado')}>
          <section className="q-secao">
            <header>
              <div>
                <h2>{t('Resultado')}</h2>
                <p>{t('Copie e cole onde pediram, ou tire um print desta página.')}</p>
              </div>
            </header>
            {copiaFalhou && (
              <p className="q-aviso q-inst-alerta" role="alert" data-testid="copia-a-mao">
                <span>
                  <TriangleAlert aria-hidden />{' '}
                  {t('Não deu para copiar sozinho: o texto está selecionado, copie pelo menu do navegador.')}
                </span>
              </p>
            )}
            <textarea
              ref={caixaRef}
              className="q-campo q-diag-json"
              readOnly
              aria-label={t('Resultado do diagnóstico')}
              data-testid="diagnostico-json"
              value={relatorio}
              rows={9}
            />
          </section>
        </div>

        <div className="q-faixa" role="toolbar" aria-label={t('Ações do diagnóstico')}>
          <span className="q-diag-estado" role="status" aria-live="polite" data-testid="diagnostico-andamento">
            {ocupado && girando}
            {andamento || (ocupado ? t('Medindo…') : t('Nada rodando: cada medida começa no próprio botão.'))}
          </span>
          <span className="q-espaco" />
          <button type="button" className="q-ctl pri" onClick={copiar}>
            {copiado ? <Check aria-hidden /> : <ClipboardCopy aria-hidden />}
            {copiado ? t('Copiado') : t('Copiar o resultado')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Tela largura="estreita">
      <CabecalhoDeTela
        sobrancelha="Suporte"
        icone={Stethoscope}
        titulo="Diagnóstico do aparelho"
        sub="O que este aparelho e este navegador entregam, medido aqui mesmo. Nada muda na sua captura."
      />

      {/* NO QUEST COM AS TELAS NOVAS DESLIGADAS: é por esta página que elas voltam, e o botão fica lá
          embaixo. Um aviso no topo, com o caminho de volta, e só nesse caso. */}
      {noQuest && !telaNova && (
        <div
          className="aviso-info religar-telas-novas"
          role="status"
          data-testid="religar-telas-novas"
          style={{ marginBottom: 20 }}
        >
          <LayoutPanelTop aria-hidden />
          <span style={{ flex: 1 }}>
            {t('As telas novas do headset estão desligadas: você está vendo as de antes.')}
          </span>
          <button type="button" className="btn btn-solid" onClick={alternarTelaNova}>
            {t('Ligar de novo')}
          </button>
        </div>
      )}

      <section className="secao" data-testid="diagnostico-sinais">
        <TituloDeSecao icone={Cpu} titulo="Este aparelho" desc="Lido do navegador ao abrir a página." />
        <div className="cartao p5">
          {!s ? (
            <p className="mut">Lendo…</p>
          ) : (
            <>
              <Linha rotulo={t('Navegador')} valor={navegadorEmTexto} />
              <Linha rotulo={t('Como o app classificou')} valor={s.perfilDoApp.tipo ?? '—'} id="diagnostico-perfil" />
              <Linha rotulo={t('Núcleos que o navegador vê')} valor={s.nucleos ?? '—'} />
              <Linha rotulo={t('Memória do aparelho (GB)')} valor={s.memoriaGb ?? '—'} />
              <Linha rotulo={t('Memória da página (MB)')} valor={s.heapLimiteMb ?? '—'} />
              <Linha rotulo={t('Espaço para modelos (MB)')} valor={s.cotaMb ?? '—'} />
              <Linha rotulo={t('Várias threads (isolamento de origem)')} valor={simNao(s.isolado)} />
              <Linha rotulo={t('Placa de vídeo no navegador')} valor={placaEmTexto} />
              <Linha rotulo={t('Reconhecimento de voz do navegador')} valor={simNao(s.webSpeech)} />
              <Linha rotulo={t('Tradutor do navegador')} valor={simNao(s.tradutorNativo)} />
              <Linha rotulo={t('Compartilhar tela')} valor={simNao(s.compartilharTela)} />
              <Linha rotulo={t('Vozes de leitura')} valor={s.vozesDeLeitura ?? '—'} />
            </>
          )}
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={Mic}
          titulo="Microfone"
          desc="Deixe um vídeo tocando no alto-falante do aparelho (em outra janela) e toque em Testar. São 10 segundos: 5 com o tratamento de voz ligado, 5 sem."
        />
        <div className="cartao p5">
          <button
            type="button"
            className="btn btn-outline"
            disabled={!!ocupado || !s?.microfone}
            onClick={testarMicrofone}
          >
            {ocupado === 'microfone' ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
            {ocupado === 'microfone' ? 'Ouvindo…' : 'Testar o microfone'}
          </button>
          {microfone && (
            <div style={{ marginTop: 12 }} data-testid="diagnostico-microfone">
              {microfone.erro && (
                <p className="aviso-info warn">
                  <TriangleAlert aria-hidden />
                  <span>{microfone.erro}</span>
                </p>
              )}
              <Linha rotulo={t('Com tratamento de voz')} valor={nivelEmTexto(microfone.comProcessamento)} />
              <Linha rotulo={t('Sem tratamento de voz')} valor={nivelEmTexto(microfone.semProcessamento)} />
              <p className="mut" style={{ fontSize: 13, marginTop: 8 }}>
                Se o volume cai muito com o tratamento ligado, o cancelamento de eco está apagando o som do
                alto-falante: para legendar um vídeo pelo microfone, o certo é desligá-lo.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={MonitorUp}
          titulo="Som do aparelho pelo compartilhamento de tela"
          desc="Com um vídeo tocando, toque em Testar e aceite compartilhar. Mede se o som vem junto, se ele continua sem a imagem e quanto a tela trava. Leva uns 12 segundos."
        />
        <div className="cartao p5">
          <button
            type="button"
            className="btn btn-outline"
            disabled={!!ocupado || !s?.compartilharTela}
            onClick={testarCompartilhamento}
          >
            {ocupado === 'tela' ? <Loader2 aria-hidden className="animate-spin" /> : <MonitorUp aria-hidden />}
            {ocupado === 'tela' ? 'Medindo…' : 'Testar o compartilhamento'}
          </button>
          {s && !s.compartilharTela && (
            <p className="mut" style={{ fontSize: 13, marginTop: 8 }}>
              Este navegador não oferece compartilhamento de tela.
            </p>
          )}
          {compartilhamento && (
            <div style={{ marginTop: 12 }} data-testid="diagnostico-compartilhamento">
              {compartilhamento.erro && (
                <p className="aviso-info warn">
                  <TriangleAlert aria-hidden />
                  <span>{compartilhamento.erro}</span>
                </p>
              )}
              <Linha rotulo={t('O que foi compartilhado')} valor={compartilhamento.superficie ?? '—'} />
              <Linha rotulo={t('Veio som junto')} valor={simNao(compartilhamento.temAudio)} />
              <Linha rotulo={t('Nível do som')} valor={nivelEmTexto(compartilhamento.nivelComVideo)} />
              <Linha
                rotulo={t('O som continua sem a imagem')}
                valor={
                  compartilhamento.audioSemVideo
                    ? `${simNao(compartilhamento.audioSemVideo.vivo)} · ${nivelEmTexto(compartilhamento.audioSemVideo)}`
                    : '—'
                }
              />
              <Linha
                rotulo={t('Travadas da tela (antes → durante)')}
                valor={`${compartilhamento.quadrosAntes?.longos ?? '—'} → ${compartilhamento.quadrosDurante?.longos ?? '—'} (${t('pior')} ${compartilhamento.quadrosDurante?.piorMs ?? '—'} ms)`}
              />
            </div>
          )}
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={Gauge}
          titulo="Velocidade da transcrição"
          desc="Transcreve 11 segundos de fala com cada modelo e conta as travadas da tela. Fator abaixo de 1 acompanha a fala; quanto menor, melhor."
        />
        <div className="cartao p5">
          <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-solid" disabled={!!ocupado} onClick={medirNoProcessador}>
              {ocupado === 'modelos' ? <Loader2 aria-hidden className="animate-spin" /> : <Activity aria-hidden />}
              {ocupado === 'modelos' ? 'Medindo…' : 'Medir no processador'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!!ocupado || !s?.webGpu}
              onClick={medirNaPlacaDeVideo}
            >
              {ocupado === 'gpu' ? <Loader2 aria-hidden className="animate-spin" /> : <Cpu aria-hidden />}
              {ocupado === 'gpu' ? 'Medindo…' : 'Medir na placa de vídeo'}
            </button>
            <button type="button" className="btn btn-outline" disabled={!!ocupado} onClick={medirNaNuvem}>
              {ocupado === 'nuvem' ? <Loader2 aria-hidden className="animate-spin" /> : <Activity aria-hidden />}
              {ocupado === 'nuvem' ? 'Medindo…' : 'Medir na nuvem'}
            </button>
          </div>
          <p className="mut" style={{ fontSize: 13, marginTop: 8 }}>
            {t(
              'No processador: baixa cerca de {mb} MB na primeira vez e leva de 1 a 3 minutos. Na placa de vídeo: mais {gpu} MB, e num aparelho fraco a página pode fechar sozinha; faça por último.',
              { mb: mbDaCpu, gpu: MODELO_DA_GPU.mb },
            )}
          </p>
          {andamento && (
            <p role="status" aria-live="polite" style={{ marginTop: 10 }}>
              {andamento}
            </p>
          )}
          {erroDosModelos && (
            <p className="aviso-info warn" style={{ marginTop: 10 }}>
              <TriangleAlert aria-hidden />
              <span>{erroDosModelos}</span>
            </p>
          )}
          {benchmark && (
            <Linha
              rotulo={t('Conta bruta: processador × placa de vídeo')}
              valor={`${benchmark.pontuacaoWasm ?? '—'} × ${benchmark.pontuacaoWebgpu ?? '—'}`}
            />
          )}
          {nuvem && (
            <div data-testid="diagnostico-nuvem">
              <Linha
                rotulo={t('Nuvem: 11 s de fala')}
                valor={
                  nuvem.erro
                    ? t('falhou: {erro}', { erro: nuvem.erro })
                    : t('{total} ms no total, {servidor} ms na transcrição', {
                        total: nuvem.totalMs ?? '—',
                        servidor: nuvem.servidorMs ?? '—',
                      })
                }
              />
            </div>
          )}
          {modelos.length > 0 && (
            <ul style={{ marginTop: 10, listStyle: 'none', padding: 0 }} data-testid="diagnostico-modelos">
              {modelos.map((m) => (
                <li key={m.id} data-veredicto={veredictoDoModelo(m.rtf)} style={{ padding: '6px 0' }}>
                  {resumirModelo(m)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="secao" data-testid="diagnostico-ultima-captura">
        <TituloDeSecao
          icone={Timer}
          titulo="Última captura"
          desc="Onde o tempo foi gasto na última gravação deste aparelho, e quanto ela usou da nuvem."
        />
        <div className="cartao p5">
          {!ultima ? (
            <p className="mut">Nenhuma captura medida ainda neste aparelho. Grave algo em Capturar e volte aqui.</p>
          ) : (
            <>
              <Linha
                rotulo={t('Quando e quanto durou')}
                valor={`${new Date(ultima.quando).toLocaleString()} · ${Math.round(ultima.duracaoS / 60)} min · ${ultima.count} ${t('falas')}`}
              />
              <Linha
                rotulo={t('Do fim da fala ao texto')}
                valor={t('{p50} ms na metade das falas, {p95} ms nas piores', {
                  p50: ultima.finalLatencyMs.p50,
                  p95: ultima.finalLatencyMs.p95,
                })}
              />
              {Object.entries(ultima.porMotor).map(([motor, m]) => (
                <Linha
                  key={motor}
                  rotulo={t('Transcrição: {motor}', { motor: nomeDoMotor(motor) })}
                  valor={t('{falas} falas, {min} min de fala, {p50} ms', {
                    falas: m.falas,
                    min: m.minutosDeFala,
                    p50: m.finalMs.p50,
                  })}
                />
              ))}
              <Linha
                rotulo={t('Tradução')}
                valor={
                  ultima.mtLatencyMs
                    ? t('{p50} ms na metade, {p95} ms nas piores', {
                        p50: ultima.mtLatencyMs.p50,
                        p95: ultima.mtLatencyMs.p95,
                      })
                    : '—'
                }
              />
              <Linha rotulo={t('Maior fila de falas esperando')} valor={ultima.maxQueueDepth} />
              <Linha
                rotulo={t('Nuvem usada')}
                valor={t('{min} min de fala, cerca de US$ {usd}', {
                  min: ultima.nuvem.minutos,
                  usd: ultima.nuvem.custoUsd.toFixed(4),
                })}
              />
            </>
          )}
        </div>
      </section>

      <section className="secao" data-testid="diagnostico-tela-nova">
        <TituloDeSecao
          icone={LayoutPanelTop}
          titulo="Telas novas do headset"
          desc="As telas redesenhadas para o Meta Quest. Se alguma sair errada, desligue aqui e a de antes volta."
        />
        <div className="cartao p5">
          <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={telaNova ? 'btn btn-solid' : 'btn btn-outline'}
              aria-pressed={telaNova}
              onClick={alternarTelaNova}
            >
              {telaNova ? 'Telas novas: ligadas' : 'Telas novas: desligadas'}
            </button>
          </div>
          {/* O teste da vibração: o mesmo pulso que o app usa ao apontar (`provarVibracao`), nas duas
              intensidades, e o som que entra no lugar quando o navegador não entrega o motor. */}
          <p className="mut" style={{ fontSize: 13, marginTop: 14 }}>
            {t('Vibração do controle: um pulso de prova em cada intensidade, e o som que o app toca no lugar.')}
          </p>
          <div
            className="linha"
            role="group"
            aria-label={t('Testar a vibração do controle')}
            style={{ gap: 10, flexWrap: 'wrap', marginTop: 8 }}
          >
            <button type="button" className="btn btn-outline" onClick={() => provar('suave')}>
              <Vibrate aria-hidden /> {t('Suave')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => provar('forte')}>
              <Vibrate aria-hidden /> {t('Forte')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => provar('som')}>
              <Volume2 aria-hidden /> {t('Som no lugar')}
            </button>
          </div>
          {vibracao && (
            <div style={{ marginTop: 12 }} data-testid="diagnostico-vibracao">
              <Linha rotulo={t('Resultado')} valor={resultadoDaVibracaoEmTexto(vibracao)} />
              {vibracao.teste !== 'som' && (
                <Linha rotulo={t('Vibração pelo navegador')} valor={vibrateEmTexto(vibracao)} />
              )}
              <Linha rotulo={t('Controles que a página enxerga')} valor={controlesEmTexto(vibracao)} />
              <p className="mut" style={{ fontSize: 13, marginTop: 8 }}>
                Você sentiu o controle vibrar? Me diga junto com o resultado: o navegador pode aceitar o pedido sem o
                controle se mexer.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={KeyRound}
          titulo="Chave de dono"
          desc="Só para quem mantém o site: com a chave certa, este aparelho não cai na cota diária da nuvem."
        />
        <div className="cartao p5">
          <input
            className="campo"
            type="password"
            autoComplete="off"
            aria-label={t('Chave de dono')}
            value={chaveDeDono}
            onChange={(e) => mudarChaveDeDono(e.target.value)}
          />
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={ClipboardCopy}
          titulo="Resultado"
          desc="Copie e cole onde pediram, ou tire um print desta página."
        />
        <div className="cartao p5">
          <button type="button" className="btn btn-outline" onClick={copiar}>
            <ClipboardCopy aria-hidden /> {copiado ? 'Copiado' : 'Copiar o resultado'}
          </button>
          <textarea
            ref={caixaRef}
            className="campo"
            readOnly
            aria-label={t('Resultado do diagnóstico')}
            data-testid="diagnostico-json"
            value={relatorio}
            rows={10}
            style={{ marginTop: 12, width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
          />
        </div>
      </section>
    </Tela>
  );
}
