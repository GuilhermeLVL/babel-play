import { Activity, ClipboardCopy, Cpu, Gauge, Loader2, Mic, MonitorUp, Stethoscope, TriangleAlert } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

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
import { t } from '../../lib/i18n';
import { CabecalhoDeTela, Tela, TituloDeSecao } from '../ui';

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

const simNao = (v: boolean) => (v ? t('sim') : t('não'));

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
  const [sinais, setSinais] = useState<SinaisDoDiagnostico | null>(null);
  const [microfone, setMicrofone] = useState<ResultadoDoMicrofone | null>(null);
  const [compartilhamento, setCompartilhamento] = useState<ResultadoDoCompartilhamento | null>(null);
  const [benchmark, setBenchmark] = useState<PontuacaoDoBenchmark | null>(null);
  const [modelos, setModelos] = useState<ResultadoDoModelo[]>([]);
  const [ocupado, setOcupado] = useState<null | 'microfone' | 'tela' | 'modelos' | 'gpu'>(null);
  const [andamento, setAndamento] = useState('');
  const [erroDosModelos, setErroDosModelos] = useState('');
  const [copiado, setCopiado] = useState(false);
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
    () => JSON.stringify({ sinais, microfone, compartilhamento, benchmark, modelos }, null, 1),
    [sinais, microfone, compartilhamento, benchmark, modelos],
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
    } catch {
      // Sem a API da área de transferência: seleciona o texto para a pessoa copiar à mão.
      caixaRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const mbDaCpu = [...new Map(MODELOS_DA_CPU.map((m) => [m.modelo, m.mb])).values()].reduce((a, b) => a + b, 0);
  const s = sinais;

  return (
    <Tela largura="estreita">
      <CabecalhoDeTela
        sobrancelha="Suporte"
        icone={Stethoscope}
        titulo="Diagnóstico do aparelho"
        sub="O que este aparelho e este navegador entregam, medido aqui mesmo. Nada muda na sua captura."
      />

      <section className="secao" data-testid="diagnostico-sinais">
        <TituloDeSecao icone={Cpu} titulo="Este aparelho" desc="Lido do navegador ao abrir a página." />
        <div className="cartao p5">
          {!s ? (
            <p className="mut">Lendo…</p>
          ) : (
            <>
              <Linha
                rotulo={t('Navegador')}
                valor={
                  [
                    s.navegador.modelo,
                    s.navegador.oculus && `Browser ${s.navegador.oculus}`,
                    s.navegador.chrome && `Chrome ${s.navegador.chrome}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || t('não identificado')
                }
              />
              <Linha rotulo={t('Como o app classificou')} valor={s.perfilDoApp.tipo ?? '—'} id="diagnostico-perfil" />
              <Linha rotulo={t('Núcleos que o navegador vê')} valor={s.nucleos ?? '—'} />
              <Linha rotulo={t('Memória do aparelho (GB)')} valor={s.memoriaGb ?? '—'} />
              <Linha rotulo={t('Memória da página (MB)')} valor={s.heapLimiteMb ?? '—'} />
              <Linha rotulo={t('Espaço para modelos (MB)')} valor={s.cotaMb ?? '—'} />
              <Linha rotulo={t('Várias threads (isolamento de origem)')} valor={simNao(s.isolado)} />
              <Linha
                rotulo={t('Placa de vídeo no navegador')}
                valor={
                  s.webGpu
                    ? `${s.webGpu.fornecedor} ${s.webGpu.arquitetura}${s.webGpu.shaderF16 ? ' · f16' : ''}`.trim()
                    : t('não')
                }
              />
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
            onClick={() => rodar('microfone', async () => setMicrofone(await medirMicrofone()))}
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
            onClick={() => rodar('tela', async () => setCompartilhamento(await medirCompartilhamento()))}
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
            <button
              type="button"
              className="btn btn-solid"
              disabled={!!ocupado}
              onClick={() => rodar('modelos', medirOsModelos(MODELOS_DA_CPU, true))}
            >
              {ocupado === 'modelos' ? <Loader2 aria-hidden className="animate-spin" /> : <Activity aria-hidden />}
              {ocupado === 'modelos' ? 'Medindo…' : 'Medir no processador'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!!ocupado || !s?.webGpu}
              onClick={() => rodar('gpu', medirOsModelos([MODELO_DA_GPU], false))}
            >
              {ocupado === 'gpu' ? <Loader2 aria-hidden className="animate-spin" /> : <Cpu aria-hidden />}
              {ocupado === 'gpu' ? 'Medindo…' : 'Medir na placa de vídeo'}
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
