import { AlertTriangle, ArrowRight, Check, CheckCircle2, Sparkles, Volume2, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { AiBadge } from '../../components/Provenance';
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { VocabCard } from '../../types';
import { consentiuNuvem } from '../consentimentoDeNuvem';
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { recursosDoAparelho } from '../dispositivo/recursos';
import { t } from '../i18n';
import { haVozPara } from '../voz/haVoz';
import { buildCorretorUser, CORRETOR_SYSTEM, respostaEhPlausivel } from './corretorPrompt';
import { diffWords, similarityPercentage } from './diff';

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
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
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
  /**
   * Há voz para o idioma desta palavra, neste aparelho? Quem monta o exercício sabe o idioma real do
   * cartão (com o do baralho como reserva); sem a resposta, vale o idioma gravado no cartão.
   */
  temVoz?: boolean;
}

export function ActiveProductionExercise({
  card,
  onVerify,
  onNext,
  llmValidationEnabled = false,
  playTTS,
  temVoz,
}: ActiveProductionProps) {
  const podeOuvir = temVoz ?? haVozPara(card.srcLang ?? '');
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
      const gw = buildGateway({ profile: getActiveProfile(), cloudConsent: consentiuNuvem });
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
        `Não foi possível verificar com IA (${detail}). ${consentiuNuvem() ? '' : 'A IA de nuvem precisa da sua autorização (Ajustes → Privacidade). '}Configure um provedor de LLM (ex.: Ollama local) ` +
          'no seu perfil, ou use a verificação local, ela compara sua resposta com a palavra-alvo.',
      );
    } finally {
      setIsLoadingLlm(false);
    }
  };

  /* NO META QUEST: o mesmo exercício dentro do cartão da revisão (`RevisaoDoQuest.tsx`), sem um cartão
     dentro do outro. O campo não pega o foco sozinho: o teclado do sistema sobe quando a pessoa toca nele. */
  const comTeclado = recursosDoAparelho(perfilDoDispositivo()).tecladoFisico;
  const pedacos = card.sentence ? card.sentence.split(new RegExp(`(${escapeRegExp(card.word)})`, 'gi')) : [];
  const ehAlvo = (pedaco: string) => pedaco.toLowerCase() === card.word.toLowerCase();
  return (
    <div className="qr-producao" data-testid="producao-no-quest">
      {card.sourceSessionTitle && <span className="q-tag off">{card.sourceSessionTitle}</span>}
      <span className="q-rotulo">{t('Escreva a palavra que completa a frase')}</span>
      <p className="qr-frase ap-prompt">
        {card.sentence ? (
          pedacos.map((pedaco, i) =>
            ehAlvo(pedaco) ? (
              <span key={i} className="qr-vao ap-blank">
                ___
              </span>
            ) : (
              <span key={i}>{pedaco}</span>
            ),
          )
        ) : (
          <span className="qr-vao ap-blank">___</span>
        )}
      </p>
      <p className="q-texto">
        {t('Definição')}: <b>{card.translation}</b>
        {card.explanation ? `, ${card.explanation}` : ''}
      </p>

      {!isVerified ? (
        <>
          <label className="q-campo">
            <span>{t('Sua resposta')}</span>
            <input
              type="text"
              className="ap-input"
              autoComplete="off"
              autoCapitalize="off"
              /* Com teclado físico (o computador com o desenho novo) o campo pega o foco, como na
                   tela de sempre; no headset não, para o teclado do sistema não subir sozinho. */
              autoFocus={comTeclado}
              value={attempt}
              placeholder={comTeclado ? t('Digite a resposta aqui...') : t('Toque para escrever')}
              onChange={(e) => setAttempt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerifyLocal();
              }}
            />
          </label>
          <div className="q-acoes">
            <button
              type="button"
              className="q-ctl pri qr-principal"
              disabled={!attempt.trim()}
              onClick={handleVerifyLocal}
            >
              <Check aria-hidden /> {t('Verificar resposta')}
            </button>
            {llmValidationEnabled && (
              <button
                type="button"
                className="q-ctl"
                disabled={!attempt.trim() || isLoadingLlm}
                onClick={() => void handleVerifyLlm()}
              >
                <Sparkles aria-hidden /> {isLoadingLlm ? t('Consultando o modelo…') : t('Verificar com IA')}
              </button>
            )}
          </div>
          {llmError && (
            <div className="q-aviso" role="alert">
              <span>{llmError}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <p
            className={`qr-veredito ${correct ? (partial ? 'parcial ap-result-partial' : 'certo ap-result-correct') : 'errado ap-result-error'}`}
            role="status"
          >
            {correct ? partial ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
            <span>
              {correct
                ? partial
                  ? t('Acerto parcial ({n}% de similaridade)', { n: (similarity * 100).toFixed(0) })
                  : t('Resposta correta!')
                : t('Resposta incorreta')}
            </span>
          </p>
          {correct && partial && (
            <div className="qr-diff" aria-label={t('Diferenças entre a sua resposta e a palavra')}>
              {diffWords(card.word, attempt).map((parte, i) => (
                <span key={i} className={parte.type === 'match' ? 'igual' : parte.type === 'added' ? 'sobra' : 'falta'}>
                  {parte.value}
                </span>
              ))}
            </div>
          )}
          {correct && partial && <p className="q-texto">{t('Riscado: sobrou na sua resposta. Sublinhado: faltou.')}</p>}
          <p className="q-texto">
            {correct ? (
              partial ? (
                <>
                  {t('Forma correta')}: <b>{card.word}</b>
                </>
              ) : (
                <>
                  {t('Sua resposta bateu com')} <b>{card.word}</b>
                </>
              )
            ) : (
              <>
                {t('Você escreveu')}: <b>{attempt}</b>. {t('A resposta correta era')}: <b>{card.word}</b>
              </>
            )}
          </p>
          {/* A procedência do veredito, só depois de existir um. */}
          <span className="qr-proveniencia ap-validation-label">
            {validationSource === 'deterministic' ? (
              <>
                <Check aria-hidden /> {t('Verificado localmente')}
              </>
            ) : (
              <>
                <Sparkles aria-hidden /> {t('Verificado pela IA (pode errar)')}
              </>
            )}
          </span>
          {validationSource === 'probabilistic' && (
            <div className="q-cartao fundo">
              <span className="q-rotulo">{t('Por que a IA decidiu assim')}</span>
              <p>{llmReason || t('O modelo não explicou o veredito.')}</p>
              <AiBadge />
              <p>{t('Conteúdo gerado por um modelo de linguagem. Pode conter erros, confira antes de decorar.')}</p>
            </div>
          )}
          <div className="q-cartao fundo">
            <span className="q-rotulo">{t('Frase completa')}</span>
            <p>
              {card.sentence ? (
                pedacos.map((pedaco, i) =>
                  ehAlvo(pedaco) ? (
                    <strong key={i} className="qr-alvo">
                      {pedaco}
                    </strong>
                  ) : (
                    <span key={i}>{pedaco}</span>
                  ),
                )
              ) : (
                <strong className="qr-alvo">{card.word}</strong>
              )}
            </p>
          </div>
          <div className="q-acoes">
            {playTTS && podeOuvir && (
              <button type="button" className="q-ctl" onClick={() => playTTS(card.sentence || card.word)}>
                <Volume2 aria-hidden /> {t('Ouvir a frase completa')}
              </button>
            )}
            <button type="button" className="q-ctl pri qr-principal" onClick={onNext}>
              {t('Próximo exercício')} <ArrowRight aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
