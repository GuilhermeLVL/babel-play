import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Mic, Square, SkipForward, Turtle } from 'lucide-react';
import type { ItemOutcome, RoundReport, ResultadoDitado } from '@core';
import { scorePronunciation, scoreRound, conferirDitado } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar } from '../../lib/juice';
import { speechErrorMessage } from '../../lib/mediaErrors';
import { toast } from '../Toast';
import { criarFalante } from '../../lib/falante';

/**
 * KARAOKÊ DA FALA — a frase real toca com as palavras acendendo em sincronia; você fala junto e
 * recebe uma nota de pronúncia.
 *
 * Tudo que ele precisa JÁ EXISTIA e estava separado: o áudio salvo da sessão, os `startMs`/`endMs`
 * de cada fala (gravados desde a captura), o motor `scorePronunciation` e o reconhecimento do
 * navegador. O trabalho aqui foi juntar as peças numa mecânica.
 *
 * HONESTIDADE (a regra do projeto): se o reconhecimento de voz não existir ou não devolver texto,
 * NÃO inventamos nota — a rodada diz que não deu para avaliar. Uma nota fabricada de pronúncia é
 * pior que nota nenhuma, porque a pessoa acredita nela.
 */

export interface FalaKaraoke {
  id?: string;
  texto: string;
  traducao?: string;
  lang: string;
  startMs: number;
  endMs: number;
}

interface KaraokeGameProps {
  falas: FalaKaraoke[];
  /**
   * URL do áudio REAL da sessão, ou string VAZIA quando não há gravação (é o caso da trilha).
   *
   * Já não é verdade que "sem ele o jogo não abre": desde que a trilha passou a ter Karaokê, o
   * material pode ser palavra curada sem áudio nenhum, e `criarFalante` decide por item entre o
   * clipe da gravação e a voz sintetizada. `''` é o sinal de "não há clipe, fale o texto".
   */
  audioUrl: string;
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

type Fase = 'parado' | 'ouvindo' | 'gravando' | 'avaliado';

export default function KaraokeGame({ falas, audioUrl, ageProfile, onFinish, onExit }: KaraokeGameProps) {
  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState<Fase>('parado');
  const [palavraAtiva, setPalavraAtiva] = useState(-1);
  /**
   * A nota traz o ALINHAMENTO junto, não só o número.
   *
   * Era o que faltava para o Karaokê substituir o Estúdio de Shadowing, que tinha 1.390 linhas e
   * uma coisa boa: mostrar palavra a palavra onde a fala escapou. "85%" sozinho não ensina — a
   * pessoa não sabe se errou uma palavra difícil ou engoliu três fáceis, e portanto não sabe o
   * que repetir.
   */
  const [nota, setNota] = useState<{ accuracy: number; transcript: string; diff: ResultadoDitado } | null>(null);
  const [semReconhecimento, setSemReconhecimento] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<any>(null);
  const inicioFalaRef = useRef(0);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);

  const fala = falas[indice];
  const palavras = fala ? fala.texto.split(/\s+/).filter(Boolean) : [];

  /**
   * Toca só o trecho desta fala e acende as palavras proporcionalmente à duração real.
   *
   * A VELOCIDADE é a ajuda deste jogo, e é a única que faz sentido aqui: o que trava quem tenta
   * repetir uma fala real não é falta de memória, é a fala vir rápida e emendada demais para o
   * ouvido distinguir onde uma palavra acaba e a outra começa. A 0,6× o áudio continua sendo a
   * pessoa de verdade — `preservesPitch` mantém o timbre, então não vira voz de desenho — e a
   * pronúncia fica audível. Por isso ela NÃO custa nota: nada aqui é recuperação de memória.
   */
  /**
   * Clipe da gravação quando ela existe; voz sintetizada quando não — a decisão mora em
   * `lib/falante.ts`. Antes o `<audio>` estava cravado aqui, e por isso o Karaokê não existia na
   * TRILHA (palavras curadas, zero áudio): ele anunciava falas prontas e tocava a gravação de
   * outra fonte. Na trilha o exercício vira ouvir e repetir a PALAVRA.
   *
   * A ILUMINAÇÃO DAS PALAVRAS depende de saber a duração, e é aí que os dois caminhos diferem: na
   * gravação ela é medida (`endMs - startMs`); na voz sintetizada não há como saber de antemão,
   * então estimamos por comprimento. Estimativa serve para o efeito visual; se ela errar, acende
   * fora de compasso — o que é diferente de dar nota errada, e por isso é aceitável aqui.
   */
  const falante = useMemo(() => criarFalante(audioRef, audioUrl), [audioUrl]);
  const ouvir = (velocidade = 1) => {
    if (!fala || !falante.disponivel) return;
    setFase('ouvindo');
    setPalavraAtiva(-1);
    falante.ouvir({ texto: fala.texto, lang: fala.lang, startMs: fala.startMs, endMs: fala.endMs }, velocidade);

    const medida = fala.endMs > fala.startMs ? fala.endMs - fala.startMs : 0;
    const duracao = (medida || Math.max(900, fala.texto.length * 90)) / velocidade;
    const passo = duracao / Math.max(1, palavras.length);
    let i = 0;
    const timer = setInterval(() => {
      setPalavraAtiva(i);
      i++;
      if (i >= palavras.length) clearInterval(timer);
    }, passo);

    setTimeout(() => {
      falante.parar();
      clearInterval(timer);
      setPalavraAtiva(-1);
      setFase('parado');
    }, duracao);
  };

  const gravar = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSemReconhecimento(true); return; }
    const rec = new SR();
    rec.lang = fala.lang || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;
    inicioFalaRef.current = Date.now();
    setFase('gravando');
    setNota(null);

    rec.onresult = (e: any) => {
      const dito = e.results?.[0]?.[0]?.transcript ?? '';
      const duracao = Date.now() - inicioFalaRef.current;
      const s = scorePronunciation(fala.texto, dito, { durationMs: duracao });
      /* O alinhamento vem de `conferirDitado`, o MESMO que o jogo de Ditado usa: janela de ±2
         para reencontrar o compasso quando se pula ou repete uma palavra, e comparação sem acento
         nem pontuação — o STT não entrega pontuação confiável, e punir por ela ensinaria a coisa
         errada. Escrever um segundo alinhador aqui seria duas verdades sobre o mesmo erro. */
      setNota({ accuracy: s.accuracy, transcript: dito, diff: conferirDitado(fala.texto, dito) });
      setFase('avaliado');
      // A nota de pronúncia JÁ é o retorno principal aqui; a comemoração só a acompanha, e por
      // isso escala com ela: quase perfeito ganha faísca, aprovado ganha o efeito comum.
      comemorar(s.accuracy >= 90 ? 'sequencia' : s.accuracy >= 60 ? 'acerto' : 'erro', null, {
        texto: s.accuracy + '%',
      });
      /* SUBSTITUI em vez de empilhar. Cada "Falar agora" cria um reconhecimento novo, então falar
         três vezes na mesma fala gerava TRÊS outcomes com o mesmo `itemRef` — e o histórico passava
         a achar que a fala caiu três vezes. Vale a última nota, e `attempts` conta as tentativas,
         que é exatamente o campo que existe para isso. */
      registrarFala({
        // A nota só é reaproveitável se disser DE QUAL fala ela é: sem o id, o histórico não sabe
        // o que já foi cantado, e não dá para repetir a fala nem evitar cair nela de novo.
        ...(fala.id ? { itemRef: fala.id } : {}),
        correct: s.accuracy >= 60,
        attempts: 1,
        ms: duracao,
      });
    };
    // Parava sem dizer por quê: mic negado e rede caída davam o mesmo silêncio.
    rec.onerror = (e: any) => {
      const msg = speechErrorMessage(e?.error);
      if (msg) toast.warn(msg);
      setFase('parado');
    };
    rec.onend = () => { if (fase === 'gravando') setFase('parado'); };
    try { rec.start(); } catch { setFase('parado'); }
  };

  const parar = () => { try { recRef.current?.stop(); } catch { /* já parou */ } };

  /**
   * Grava o resultado de UMA fala — no máximo um por fala.
   *
   * O `push` direto empilhava: cada clique em "Falar agora" instancia um reconhecimento novo, e
   * três tentativas na mesma fala viravam três `ItemOutcome` com o mesmo `itemRef`. Como esse campo
   * é o que alimenta o histórico ("o que já caiu"), a fala parecia ter aparecido três vezes.
   *
   * Sem `itemRef` (fala sem id) não há como saber se é a mesma — aí empilha, porque supor que duas
   * falas anônimas são a mesma apagaria uma nota de verdade.
   */
  const registrarFala = (o: ItemOutcome) => {
    if (!o.itemRef) { resultadosRef.current.push(o); return; }
    const i = resultadosRef.current.findIndex(a => a.itemRef === o.itemRef);
    if (i < 0) { resultadosRef.current.push(o); return; }
    const anterior = resultadosRef.current[i];
    resultadosRef.current[i] = { ...o, attempts: anterior.attempts + 1 };
  };

  const proxima = (el?: HTMLElement | null) => {
    /*
     * PULOU SEM FALAR? ISSO É UM RESULTADO, e antes não era nenhum.
     *
     * O outcome só nascia dentro de `rec.onresult`, então passar por uma fala sem falar não
     * registrava nada — a rodada terminava com menos itens do que falas, e o relatório dava a
     * entender que o resto não existiu. `revealed: true` é o campo que o projeto já usa para
     * "desistiu", e `correct: false` sem `attempts` é o que o agendador precisa para tratar como
     * item não recuperado. Não é castigo: é a diferença entre "não lembrei" e "não aconteceu".
     */
    if (fase !== 'avaliado' && fala.id && !resultadosRef.current.some(a => a.itemRef === fala.id)) {
      resultadosRef.current.push({
        itemRef: fala.id,
        correct: false,
        attempts: 0,
        ms: Date.now() - inicioFalaRef.current,
        revealed: true,
      });
    }

    if (indice + 1 >= falas.length) {
      if (jaFinalizouRef.current) return;
      jaFinalizouRef.current = true;
      const todos = resultadosRef.current;
      const impecavel = todos.length > 0 && todos.every(o => o.correct);
      /* Rodada de ZERO itens não comemora erro. Antes, `todos.some(...)` era falso numa lista vazia
         e caía em `'erro'` — o jogo dizia que a pessoa errou uma rodada em que nada foi avaliado, e
         a raspadinha mostrava "0 de 0 · 0%". É o mesmo princípio que este arquivo já aplica quando
         não há reconhecimento de voz: sem avaliação, não se dá nota. */
      if (todos.length > 0) {
        comemorar(impecavel ? 'rodadaPerfeita' : todos.some(o => o.correct) ? 'rodadaBoa' : 'erro', el ?? null, { tremer: impecavel });
      }
      /* Zero itens: NENHUMA comemoração. Não existe efeito "neutro" em `Comemoracao`, e inventar um
         seria dar retorno a uma rodada que não teve avaliação. Silêncio é a resposta honesta. */
      setTimeout(() => onFinish({
        gameId: 'karaoke',
        items: todos,
        score: scoreRound('karaoke', todos),
        durationMs: Date.now() - inicioRodadaRef.current,
      }), 900);
      return;
    }
    setIndice(i => i + 1);
    setFase('parado');
    setNota(null);
    setPalavraAtiva(-1);
  };

  useEffect(() => () => { try { recRef.current?.abort?.(); } catch { /* nada */ } }, []);

  if (!fala) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />

      <header className="w-full max-w-2xl flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="font-display font-black text-lg text-ink">
            {ageProfile === 'kids' ? 'Cante junto' : 'Karaokê da fala'}
          </h2>
          <p className="text-[12px] text-ink-muted">fala {indice + 1} de {falas.length}</p>
        </div>
        <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="w-full max-w-2xl flex flex-col items-center gap-6">
        {/* A FRASE: acende em sincronia com o áudio enquanto se ouve e, DEPOIS de falar, vira o
            resultado — cada palavra com o próprio veredito. É a mesma frase servindo aos dois
            momentos, em vez de um segundo bloco repetindo o texto embaixo. */}
        <p data-tour="frase" className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-center">
          {palavras.map((p, i) => {
            const v = nota?.diff.palavras[i];
            const corDoVeredito = v ? (v.certa ? 'var(--good)' : 'var(--warn)') : undefined;
            return (
              <span
                key={i}
                /* Cor nunca sozinha: a palavra que escapou também ganha sublinhado ondulado, senão
                   quem não distingue verde de laranja não recebe informação nenhuma. */
                style={corDoVeredito ? { color: corDoVeredito, textDecoration: v!.certa ? undefined : 'underline wavy' } : undefined}
                title={v && !v.certa ? (v.escrita ? `ouvimos “${v.escrita}”` : 'não ouvimos esta palavra') : undefined}
                className={`font-display font-black text-2xl leading-tight transition-colors duration-150 ${
                  nota ? '' : i === palavraAtiva ? 'text-accent scale-105' : i < palavraAtiva ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                {p}
              </span>
            );
          })}
        </p>

        {fala.traducao && <p className="text-[13px] text-ink-muted text-center -mt-2">{fala.traducao}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={() => ouvir(1)}
            disabled={fase === 'gravando'}
            className="py-3 px-5 rounded-xl bg-canvas border border-border-subtle text-ink font-bold text-[13px] hover:border-accent disabled:opacity-40 cursor-pointer flex items-center gap-2"
          >
            <Play className="w-4 h-4" /> {ageProfile === 'senior' ? 'Ouvir a fala' : 'Ouvir'}
          </button>
          <button
            data-tour="devagar"
            onClick={() => ouvir(0.6)}
            disabled={fase === 'gravando'}
            className="py-3 px-4 rounded-xl bg-canvas border border-border-subtle text-ink-muted font-bold text-[13px] hover:border-accent hover:text-ink disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
            title="Toca a mesma fala mais devagar, sem mudar o tom da voz"
          >
            <Turtle className="w-4 h-4" /> devagar
          </button>

          {fase === 'gravando' ? (
            <button onClick={parar} className="py-3 px-6 rounded-xl bg-error text-white font-bold text-[13px] shadow-btn cursor-pointer flex items-center gap-2">
              <Square className="w-4 h-4" /> Parar
            </button>
          ) : (
            <button data-tour="falar" onClick={gravar} className="py-3 px-6 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[13px] shadow-btn cursor-pointer flex items-center gap-2">
              <Mic className="w-4 h-4" /> {ageProfile === 'kids' ? 'Falar!' : 'Falar agora'}
            </button>
          )}
        </div>

        {fase === 'gravando' && (
          <p className="flex items-center gap-2 text-[13px] text-accent font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" aria-hidden /> ouvindo você…
          </p>
        )}

        {/* NOTA — só quando houve reconhecimento de verdade. */}
        {nota && (
          <div className="w-full max-w-md text-center animate-in fade-in slide-in-from-bottom-2">
            <p className="font-display font-black text-3xl" style={{ color: nota.accuracy >= 60 ? 'var(--good)' : 'var(--warn)' }}>
              {nota.accuracy}%
            </p>
            {/* O número agregado precisa dizer DE QUANTAS — "85%" sem denominador não diz se
                escapou uma palavra ou seis. */}
            <p className="text-[13px] text-ink font-bold mt-0.5">
              {nota.diff.acertos} de {nota.diff.total} palavras
            </p>
            {/* As que escaparam, listadas: passar o mouse em cima já mostra, mas no toque não há
                mouse — e é justamente quem está no celular que mais precisa. */}
            {nota.diff.acertos < nota.diff.total && (
              <p className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
                escapou:{' '}
                {nota.diff.palavras.filter(p => !p.certa).map((p, i, todas) => (
                  <span key={i}>
                    <b className="text-ink">{p.esperada}</b>
                    {p.escrita ? <> (ouvimos “{p.escrita}”)</> : null}
                    {i < todas.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            )}
            <p className="text-[12px] text-ink-muted mt-1">o que entendemos: “{nota.transcript}”</p>
          </div>
        )}

        {semReconhecimento && (
          <p className="text-[12px] text-warn-ink text-center max-w-[46ch]">
            Este navegador não tem reconhecimento de voz, então não dá para dar nota aqui — e nota
            de pronúncia inventada seria pior que nenhuma. Você ainda pode ouvir e repetir.
          </p>
        )}

        <button
          onClick={(e) => proxima(e.currentTarget)}
          className="py-2.5 px-5 rounded-xl bg-surface border border-border-subtle text-ink font-bold text-[13px] hover:border-accent cursor-pointer flex items-center gap-1.5"
        >
          {indice + 1 >= falas.length ? 'Terminar' : 'Próxima'} <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
