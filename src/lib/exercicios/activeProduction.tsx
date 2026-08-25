import React, { useState, useEffect } from 'react';
import { VocabCard } from '../../types';
import { similarityPercentage, diffWords } from './diff';
import { CORRETOR_SYSTEM, buildCorretorUser, respostaEhPlausivel } from './corretorPrompt';
import { Volume2, CheckCircle2, AlertTriangle, XCircle, Sparkles } from 'lucide-react';
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { AiBadge } from '../../components/Provenance';

/**
 * "VERIFICAR COM IA" — agora chama uma IA de verdade.
 *
 * O que havia aqui: `await new Promise(r => setTimeout(r, 1000))` seguido da MESMA comparação local
 * (`similarityPercentage`), só que com um limiar mais frouxo (0.75 em vez de 0.8). Nenhum modelo era
 * consultado — e ainda assim a tela estampava o selo "Verificado pela IA (pode errar)". Era um rótulo
 * de procedência FALSO: o usuário acreditava que um modelo tinha julgado a resposta dele, e o que
 * tinha julgado era um `if` de distância de edição fingindo ser generoso.
 *
 * Agora: ou o modelo responde de verdade (e o veredito é dele, com o motivo dele), ou a tela diz que
 * a IA está indisponível. Em NENHUMA hipótese caímos escondido na heurística local exibindo selo de IA.
 */

/** Escapa metacaracteres: uma palavra com `(`, `+` ou `?` quebrava o `new RegExp` do render. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface LlmVerdict {
  aceita: boolean;
  motivo: string;
}

/** Lê o veredito do modelo. Fora do formato → `null` (e a UI diz que não deu, em vez de chutar). */
function parseVerdict(raw: string | undefined): LlmVerdict | null {
  if (!raw) return null;
  // Modelos pequenos adoram embrulhar JSON em cercas de código.
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof obj.aceita !== 'boolean') return null;
    return {
      aceita: obj.aceita,
      motivo: typeof obj.motivo === 'string' ? obj.motivo.trim() : '',
    };
  } catch {
    return null;
  }
}

interface ActiveProductionProps {
  card: VocabCard;
  onVerify: (result: {
    correct: boolean;
    partial: boolean;
    attempt: string;
    validationSource: 'deterministic' | 'probabilistic';
  }) => void;
  onNext: () => void;
  llmValidationEnabled?: boolean;
  playTTS?: (word: string) => void;
}

export function ActiveProductionExercise({
  card,
  onVerify,
  onNext,
  llmValidationEnabled = false,
  playTTS,
}: ActiveProductionProps) {
  const [attempt, setAttempt] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [partial, setPartial] = useState(false);
  const [similarity, setSimilarity] = useState(0);
  const [validationSource, setValidationSource] = useState<'deterministic' | 'probabilistic'>('deterministic');
  const [isLoadingLlm, setIsLoadingLlm] = useState(false);
  /** O motivo que o MODELO deu. Vazio quando quem julgou foi a comparação local. */
  const [llmReason, setLlmReason] = useState('');
  /** A IA não respondeu — e a tela precisa dizer isso, em vez de silenciosamente julgar localmente. */
  const [llmError, setLlmError] = useState<string | null>(null);

  // Reset state when card changes
  useEffect(() => {
    setAttempt('');
    setIsVerified(false);
    setCorrect(false);
    setPartial(false);
    setSimilarity(0);
    setValidationSource('deterministic');
    setIsLoadingLlm(false);
    setLlmReason('');
    setLlmError(null);
  }, [card]);

  const handleVerifyLocal = () => {
    if (!attempt.trim()) return;

    const score = similarityPercentage(card.word, attempt);
    setSimilarity(score);
    setValidationSource('deterministic');

    const isExact = score === 1.0;
    const isPass = score >= 0.8;

    setCorrect(isPass);
    setPartial(isPass && !isExact);
    setIsVerified(true);

    onVerify({
      correct: isPass,
      partial: isPass && !isExact,
      attempt,
      validationSource: 'deterministic',
    });

    if (playTTS) {
      // Auto play TTS of the revealed word
      playTTS(card.word);
    }
  };

  /** Veredito REAL do modelo. Falhou? A tela diz que falhou — não vira nota por baixo do pano. */
  const handleVerifyLlm = async () => {
    const guess = attempt.trim();
    if (!guess) return;

    setIsLoadingLlm(true);
    setLlmError(null);

    // BL-07: guarda determinística ANTES do LLM. Uma resposta com muitas palavras não é a recuperação
    // da palavra-alvo (é frase/pedido/injeção) — rejeita sem chamar o modelo (imune a persuasão).
    if (!respostaEhPlausivel(guess)) {
      setSimilarity(similarityPercentage(card.word, guess));
      setValidationSource('probabilistic');
      setLlmReason('A resposta deve ser a palavra-alvo, não uma frase.');
      setCorrect(false);
      setPartial(false);
      setIsVerified(true);
      onVerify({ correct: false, partial: false, attempt: guess, validationSource: 'probabilistic' });
      setIsLoadingLlm(false);
      if (playTTS) playTTS(card.word);
      return;
    }

    try {
      const gw = buildGateway({ profile: getActiveProfile(), cloudConsent: () => true });
      const res = await gw.llm.chat(
        CORRETOR_SYSTEM,
        [{ role: 'user', content: buildCorretorUser(card.sentence, card.word, guess) }],
        { maxTokens: 200 },
      );

      const verdict = parseVerdict(res.text);
      if (!verdict) throw new Error('o modelo respondeu fora do formato esperado');

      const isExact = guess.toLowerCase() === card.word.toLowerCase();
      setSimilarity(similarityPercentage(card.word, guess));
      setValidationSource('probabilistic');
      setLlmReason(verdict.motivo);
      setCorrect(verdict.aceita);
      setPartial(verdict.aceita && !isExact);
      setIsVerified(true);

      onVerify({
        correct: verdict.aceita,
        partial: verdict.aceita && !isExact,
        attempt: guess,
        validationSource: 'probabilistic',
      });

      if (playTTS) playTTS(card.word);
    } catch (err) {
      // Falha HONESTA: sem modelo não há veredito de IA. Não caímos na heurística local fingindo que
      // uma IA respondeu — era exatamente isso que esta tela fazia. O botão "Verificar Resposta"
      // (local, e assim rotulado) continua disponível.
      const detail = err instanceof Error ? err.message : 'motivo desconhecido';
      setLlmError(
        `Não foi possível verificar com IA (${detail}). Configure um provedor de LLM (ex.: Ollama local) ` +
          'no seu perfil, ou use a verificação local — ela compara sua resposta com a palavra-alvo.',
      );
    } finally {
      setIsLoadingLlm(false);
    }
  };

  // Replace word with blank in the sentence
  const renderSentenceWithBlank = () => {
    if (!card.sentence) return <span className="ap-blank">___</span>;

    const regex = new RegExp(`(${escapeRegExp(card.word)})`, 'gi');
    const parts = card.sentence.split(regex);

    return (
      <div className="ap-prompt text-lg md:text-xl font-medium text-ink leading-relaxed text-center">
        {parts.map((part, index) => {
          if (part.toLowerCase() === card.word.toLowerCase()) {
            return (
              <span key={index} className="ap-blank px-3 py-1 mx-1 bg-accent-soft text-accent-ink font-bold border-b-2 border-dashed border-accent font-mono">
                ___
              </span>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </div>
    );
  };

  // Render highlighted differences for partial score
  const renderDiff = () => {
    const parts = diffWords(card.word, attempt);
    return (
      <div className="flex flex-wrap gap-0.5 justify-center font-mono text-lg font-bold my-2">
        {parts.map((part, idx) => {
          if (part.type === 'match') {
            return <span key={idx} className="text-good">{part.value}</span>;
          } else if (part.type === 'added') {
            return <span key={idx} className="text-error line-through bg-error-soft/30 px-0.5 rounded">{part.value}</span>;
          } else {
            return <span key={idx} className="text-warn underline decoration-dotted bg-warn-soft/30 px-0.5 rounded" title="Caractere esperado">{part.value}</span>;
          }
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-300">
      <div className="card-panel p-8 md:p-12 text-center bg-surface border-2 border-border-subtle min-h-[260px] flex flex-col justify-center items-center relative overflow-hidden shadow-md rounded-2xl">
        {/* Origin Badge */}
        {card.sourceSessionTitle && (
          <div className="absolute top-4 left-4 flex items-center gap-1.5 text-xs font-bold text-rare bg-rare-soft/20 px-2.5 py-1 rounded-full">
            <span>{card.sourceSessionTitle}</span>
          </div>
        )}

        {/* Procedência do veredito. Só aparece DEPOIS de existir um veredito — antes, a tela exibia
            "Verificado localmente" com o campo ainda vazio, anunciando uma verificação que não houve. */}
        {isVerified && (
          <div className="absolute top-4 right-4 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            <span className="ap-validation-label flex items-center gap-1">
              {validationSource === 'deterministic' ? (
                <>🟢 Verificado localmente</>
              ) : (
                <span className="text-rare flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-rare" /> Verificado pela IA (pode errar)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Prompt */}
        <div className="my-6 w-full px-4">
          <span className="text-[11px] font-mono text-ink-muted uppercase tracking-widest block mb-4">Escreva a palavra que completa a frase:</span>
          {renderSentenceWithBlank()}
        </div>

        {/* Translation and Pronunciation Hint (Not targeting the word) */}
        <div className="text-sm text-ink-muted max-w-md mx-auto italic mt-1 mb-4">
          Definição: <span className="font-bold text-ink">{card.translation}</span> — {card.explanation}
        </div>

        {/* Input Form */}
        {!isVerified ? (
          <div className="w-full max-w-md mx-auto space-y-4">
            <input
              type="text"
              value={attempt}
              onChange={(e) => setAttempt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyLocal();
              }}
              placeholder="Digite a resposta aqui..."
              className="ap-input w-full p-3 text-center text-lg border-2 border-border-subtle rounded-xl bg-canvas focus:border-accent outline-none font-medium transition-all"
              autoFocus
            />

            <div className="flex gap-2.5 justify-center">
              <button
                onClick={handleVerifyLocal}
                disabled={!attempt.trim()}
                className="btn-solid bg-accent text-white hover:bg-accent-ink py-2.5 px-6 font-bold text-sm shadow-md disabled:opacity-50 cursor-pointer"
              >
                Verificar Resposta
              </button>

              {llmValidationEnabled && (
                <button
                  onClick={handleVerifyLlm}
                  disabled={!attempt.trim() || isLoadingLlm}
                  className="btn-outline flex items-center gap-1.5 py-2.5 px-4 font-bold text-sm text-rare border-rare/30 hover:bg-rare-soft/10 cursor-pointer"
                >
                  {isLoadingLlm ? (
                    <span>Consultando o modelo…</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-rare" /> Verificar com IA
                    </>
                  )}
                </button>
              )}
            </div>

            {/* A IA falhou. Antes isto era invisível: a tela caía na heurística local e mentia o selo. */}
            {llmError && (
              <p className="text-[11.5px] text-warn-ink bg-warn-soft border border-warn/20 rounded-xl p-3 leading-relaxed text-left">
                {llmError}
              </p>
            )}
          </div>
        ) : (
          /* Feedback Card */
          <div className="w-full max-w-lg mx-auto space-y-6 animate-in zoom-in-95 duration-200">
            {correct ? (
              partial ? (
                /* PARTIAL CORRECT FEEDBACK */
                <div className="ap-result-partial bg-warn-soft/15 border border-warn/30 p-5 rounded-2xl text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-warn font-black text-[15px]">
                    <AlertTriangle className="w-5 h-5" />
                    <span>Acerto Parcial! ({(similarity * 100).toFixed(0)}% de similaridade)</span>
                  </div>
                  <p className="text-[13px] text-ink-muted">Sua resposta teve pequenas divergências em relação à palavra-alvo:</p>
                  {renderDiff()}
                  <div className="text-sm">
                    Forma correta: <strong className="text-accent text-base">{card.word}</strong>
                  </div>
                </div>
              ) : (
                /* PERFECT CORRECT FEEDBACK */
                <div className="ap-result-correct bg-good-soft/15 border border-good/30 p-5 rounded-2xl text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-good font-black text-[16px]">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Resposta Correta!</span>
                  </div>
                  <p className="text-sm">Sua resposta bateu perfeitamente com <strong className="text-good">{card.word}</strong></p>
                </div>
              )
            ) : (
              /* INCORRECT FEEDBACK */
              <div className="ap-result-error bg-error-soft/15 border border-error/30 p-5 rounded-2xl text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-error font-black text-[16px]">
                  <XCircle className="w-5 h-5" />
                  <span>Ops! Resposta Incorreta</span>
                </div>
                <div className="text-sm">
                  Você escreveu: <span className="font-mono font-bold text-error line-through">{attempt}</span>
                </div>
                <div className="text-sm">
                  A resposta correta era: <strong className="text-good text-base font-bold">{card.word}</strong>
                </div>
              </div>
            )}

            {/* O veredito foi de um MODELO: mostramos o motivo DELE e marcamos como conteúdo de IA. */}
            {validationSource === 'probabilistic' && (
              <div className="bg-canvas border border-border-subtle p-4 rounded-xl text-left space-y-2">
                <span className="text-[10px] uppercase font-mono text-ink-muted block">
                  Por que a IA decidiu assim
                </span>
                <p className="text-[12.5px] text-ink-muted leading-relaxed">
                  {llmReason || 'O modelo não explicou o veredito.'}
                </p>
                <AiBadge />
              </div>
            )}

            {/* Complete sentence revealed */}
            <div className="bg-canvas border border-border-subtle p-4 rounded-xl text-left">
              <span className="text-[10px] uppercase font-mono text-ink-muted block mb-1">Frase Completa Revelada</span>
              <p className="text-[14.5px] text-ink italic leading-relaxed">
                {card.sentence ? (
                  card.sentence.split(new RegExp(`(${escapeRegExp(card.word)})`, 'gi')).map((chunk, index) => {
                    if (chunk.toLowerCase() === card.word.toLowerCase()) {
                      return <strong key={index} className="text-accent underline font-extrabold">{chunk}</strong>;
                    }
                    return <span key={index}>{chunk}</span>;
                  })
                ) : (
                  <strong className="text-accent">{card.word}</strong>
                )}
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              {playTTS && (
                <button
                  onClick={() => playTTS(card.sentence || card.word)}
                  className="btn-outline flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-accent" /> Ouvir Frase Completa
                </button>
              )}

              <button
                onClick={onNext}
                className="btn-ink py-2 px-6 rounded-xl text-xs font-bold cursor-pointer"
              >
                Próximo Exercício
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
