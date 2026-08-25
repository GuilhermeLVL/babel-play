import React, { useEffect, useRef } from 'react';
import { X, Play, GraduationCap, Lightbulb, Target, AlertTriangle } from 'lucide-react';
import type { MinigameId } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import ArteDoJogo from './ArteDosJogos';

/**
 * COMO SE JOGA — a explicação que aparece ANTES da primeira rodada de cada jogo.
 *
 * O PROBLEMA. Os jogos foram ganhando ajudas — radar, dica, varinha das letras certas, ouvir
 * devagar, cortar duas, espiar a mesa — e nenhuma delas se anuncia. São ícones no canto que só
 * se descobre por acaso, clicando. Quem não clica joga o jogo inteiro na versão difícil sem saber
 * que havia ajuda, e conclui que é ruim naquilo. Isso é a aplicação ensinando errado por omissão.
 *
 * O CONTRATO É O MESMO DO `HowItWorks` dos exercícios (`exercises/HowItWorks.tsx`), e de
 * propósito: aqueles quatro campos foram pensados para esta função e o quarto — os LIMITES — é
 * obrigatório porque todo método tem limite, e esconder o limite faz a pessoa tirar a conclusão
 * errada de uma nota baixa. A diferença é o quinto campo, que só faz sentido em jogo: **o que
 * você tem aí**, listando as ajudas e o preço de cada uma.
 *
 * QUANDO APARECE. Uma vez por jogo, antes da primeira partida. Depois disso, só quando a pessoa
 * pedir pelo "?" no cabeçalho do jogo — instrução que não some é instrução que atrapalha.
 *
 * ONDE FICA GUARDADO. `localStorage`, seguindo o precedente `babel_howitworks_${id}`. NÃO em
 * `settings.ui`: `patchUiSettings` é leitura-modificação-escrita não atômica, e o onboarding
 * chama `saveSettings`, que sobrescreve o blob `ui` inteiro — um lugar ruim para guardar isto.
 */

export interface AjudaDoJogo {
  /** O que o botão faz, em uma frase. */
  o_que: string;
  /** O preço. `null` = não custa nota, e isso é dito em voz alta. */
  custo: string | null;
}

export interface ConteudoComoSeJoga {
  /** O objetivo pedagógico. Uma frase. */
  treina: string;
  /** Passos concretos. A pessoa deve conseguir jogar só lendo isto. */
  passos: string[];
  /** O que a nota mede — de verdade. */
  avaliacao: string;
  /** O que este jogo NÃO garante. Nunca vazio. */
  limites: string;
  /** As ajudas disponíveis, com o preço de cada uma. */
  ajudas: AjudaDoJogo[];
}

const CHAVE = (jogo: string) => `babel_comosejoga_${jogo}`;

/** Já viu a explicação deste jogo? */
export function jaViuComoSeJoga(jogo: MinigameId): boolean {
  try { return localStorage.getItem(CHAVE(jogo)) === '1'; } catch { return false; }
}

export function marcarComoVisto(jogo: MinigameId): void {
  try { localStorage.setItem(CHAVE(jogo), '1'); } catch { /* storage bloqueado: mostra de novo */ }
}

/* ─────────────────────────── O CONTEÚDO ───────────────────────────
   Escrito jogo a jogo, e não gerado: cada um tem uma razão de existir diferente, e é isso que a
   pessoa precisa entender antes de começar. O campo `limites` é onde a honestidade mora. */

export const COMO_SE_JOGA: Record<MinigameId, ConteudoComoSeJoga> = {
  memory: {
    treina: 'Ligar a palavra ao significado dela, nos dois sentidos.',
    passos: [
      'Vire uma carta e depois outra.',
      'Se as duas forem a mesma palavra e a tradução dela, o par fecha.',
      'Errou? As cartas voltam — e a repetição é justamente o que fixa.',
    ],
    avaliacao: 'Fechar o par de primeira vale "bom"; com duas ou três tentativas, "difícil". Nunca vale "fácil": aqui você tem tempo para pensar, e tempo não prova fluência.',
    limites: 'Ver a tradução na mesa é reconhecimento, não produção. Você pode fechar todos os pares e ainda não conseguir usar a palavra ao falar.',
    ajudas: [
      { o_que: 'Espiar a mesa abre todas as cartas por um instante (duas por rodada).', custo: 'limita a nota a "difícil"' },
    ],
  },
  wordsearch: {
    treina: 'Lembrar a palavra a partir do significado, antes de procurá-la.',
    passos: [
      'Leia a pista na lista ao lado — ela é a tradução, nunca a palavra.',
      'Lembre qual é a palavra e arraste sobre as letras no quadro.',
      'O traço pode ir em qualquer direção, inclusive na diagonal.',
    ],
    avaliacao: 'Achar sem ajuda vale "bom". Errar o traço não conta como erro de memória — isso é mira, e mira não estraga a sua revisão.',
    limites: 'A palavra está escrita no quadro. Isso ajuda quem quase lembrava, mas não treina escrever do zero — para isso existe o Soletrar.',
    ajudas: [
      { o_que: 'O radar faz as duas pontas de uma palavra pulsarem no quadro (três por rodada).', custo: null },
      { o_que: 'A dica revela a primeira letra e diz a direção do traço.', custo: 'limita a nota a "difícil"' },
      { o_que: 'Revelar entrega a palavra e passa para a próxima.', custo: 'conta como não lembrei' },
    ],
  },
  termo: {
    treina: 'Escrever a palavra letra por letra — produção, que é mais difícil e mais valiosa que reconhecer.',
    passos: [
      'A pista é o significado; escreva a palavra que ele descreve.',
      'Verde: letra no lugar certo. Amarelo: existe na palavra, mas em outra posição.',
      'Clique num quadrado (ou use as setas) para escrever fora de ordem.',
      'Acertou? O próximo degrau tem duas palavras ao mesmo tempo. E depois, quatro.',
    ],
    avaliacao: 'Acertar de primeira vale "fácil" — é a evidência mais forte de domínio que dá para coletar por escrito. Da segunda tentativa em diante você já tem as cores ajudando, então vale menos.',
    limites: 'Mede grafia, não pronúncia. Escrever certo e falar certo são duas habilidades, e esta só cobre a primeira.',
    ajudas: [
      { o_que: 'A varinha preenche as letras que você JÁ descobriu nas tentativas anteriores.', custo: null },
      { o_que: 'Ouvir toca a palavra em voz alta.', custo: 'limita a nota a "difícil"' },
      { o_que: 'A lâmpada revela uma letra que você ainda não achou.', custo: 'limita a nota a "difícil"' },
    ],
  },
  scramble: {
    treina: 'A ordem das palavras — a única coisa que nenhum outro exercício do app cobre.',
    passos: [
      'Leia o significado da frase, que fica visível de propósito.',
      'Clique nas palavras na ordem certa; clicar de novo devolve a palavra.',
      'Confira. Se errar, o jogo diz quantas estão no lugar — sem dizer quais.',
    ],
    avaliacao: 'Este jogo usa falas da sua gravação, que não têm cartão no baralho. Por isso ele não mexe na sua agenda de revisão — vale pelos pontos e pela prática.',
    limites: 'A frase vem do reconhecimento de voz. Se a captura cortou no meio, a ordem "certa" é a que foi transcrita, não necessariamente a que foi dita.',
    ajudas: [
      { o_que: 'A dica encaixa a próxima palavra certa no lugar.', custo: 'limita a nota a "difícil"' },
      { o_que: 'Pular passa para a frase seguinte.', custo: 'conta como não consegui' },
    ],
  },
  karaoke: {
    treina: 'Pronúncia, repetindo uma fala real com o áudio original como modelo.',
    passos: [
      'Ouça a frase — as palavras acendem no ritmo do áudio de verdade.',
      'Toque em Falar e repita.',
      'A nota compara o que o reconhecedor entendeu com o que estava escrito.',
    ],
    avaliacao: 'A nota é de SEMELHANÇA DE TEXTO, não de fonemas: o reconhecedor transcreve o que você falou e comparamos as palavras.',
    limites: 'Por causa disso, uma palavra bem pronunciada pode aparecer como erro se o reconhecedor entender outra — e um sotaque diferente do esperado derruba a nota sem que a fala esteja errada. Trate como termômetro, nunca como veredito.',
    ajudas: [
      { o_que: 'Ouvir devagar toca a 0,6× sem deixar a voz esquisita — dá para separar as palavras.', custo: null },
      { o_que: 'Pular passa para a próxima fala.', custo: null },
    ],
  },
  escuta: {
    treina: 'Distinguir o que foi DITO — a habilidade que nenhum outro jogo daqui treina sozinha.',
    passos: [
      'O trecho toca sozinho quando a rodada começa.',
      'Leia as alternativas e escolha qual frase você ouviu.',
      'Ouça de novo quantas vezes precisar antes de responder.',
    ],
    avaliacao: 'As alternativas erradas são outras falas da MESMA gravação, com tamanho parecido — mesmo assunto, mesmo sotaque. Não dá para eliminar por dedução: é preciso ouvir.',
    limites: 'Escolher entre quatro é mais fácil que entender do zero. Acertar aqui não garante que você pegaria a frase no meio de uma conversa.',
    ajudas: [
      { o_que: 'Ouvir de novo, sem limite.', custo: null },
      { o_que: 'Ouvir devagar, a 0,6× e sem deixar a voz esquisita.', custo: null },
    ],
  },
  ditado: {
    treina: 'Ouvir e ESCREVER — junta escuta com grafia, que é onde a maioria trava.',
    passos: [
      'Ouça o trecho (ele toca sozinho ao começar).',
      'Escreva o que você entendeu na linha.',
      'Confira: a correção mostra cada palavra, e o que você escreveu no lugar.',
    ],
    avaliacao: 'A conferência é palavra a palavra, não uma porcentagem solta — você vê exatamente onde errou. Acerto a partir de 80% das palavras.',
    limites: 'Pontuação e acento NÃO contam, porque o jogo é de ouvido. Isso significa que ele não verifica a sua escrita formal — para grafia exata, o Soletrar é o lugar.',
    ajudas: [
      { o_que: 'Ouvir de novo e ouvir devagar, sem limite.', custo: null },
      { o_que: 'A lâmpada escreve a próxima palavra para você.', custo: 'limita a nota a "difícil"' },
      { o_que: 'Pular passa para a próxima frase.', custo: 'conta como não consegui' },
    ],
  },
  conectores: {
    treina: 'Perceber as palavras que AMARRAM as ideias — o que separa entender palavras de entender o texto.',
    passos: [
      'Leia a frase, que veio de uma gravação sua.',
      'Toque nas palavras que ligam uma ideia à outra ("porém", "porque", "however").',
      'Confira. As que passaram batido aparecem contornadas.',
    ],
    avaliacao: 'A nota pesa os DOIS erros: deixar conector passar e marcar palavra que não é. Por isso clicar em tudo não garante nota boa — o contrário, aliás.',
    limites: 'A lista de conectores é fixa e existe só para alguns idiomas. Ela não cobre toda expressão de ligação possível, e uma que falte não é erro seu.',
    ajudas: [
      { o_que: 'Dá para marcar e desmarcar à vontade antes de conferir.', custo: null },
    ],
  },
  blitz: {
    treina: 'Recuperação RÁPIDA — o sinal de que a palavra está firme, e não só acessível.',
    passos: [
      'Uma pergunta por vez, com quatro alternativas reais do seu baralho.',
      'Responda antes de o tempo acabar.',
      'Acertos seguidos multiplicam os pontos.',
    ],
    avaliacao: 'É o único jogo em que a velocidade conta: responder em menos de três segundos vale "fácil"; acima disso, "bom". Nos outros jogos o teto é "bom" justamente porque lá dá para pensar.',
    limites: 'Escolher entre quatro é mais fácil que lembrar do zero. Acertar aqui não garante que você produziria a palavra numa conversa.',
    ajudas: [
      { o_que: 'A tesoura corta duas alternativas erradas (duas por rodada).', custo: 'limita a nota a "difícil"' },
    ],
  },
};

interface ComoSeJogaProps {
  jogo: MinigameId;
  titulo: string;
  ageProfile: AgeProfileType;
  onJogar: () => void;
  onFechar: () => void;
}

export default function ComoSeJoga({ jogo, titulo, ageProfile, onJogar, onFechar }: ComoSeJogaProps) {
  const conteudo = COMO_SE_JOGA[jogo];
  const jogarRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Esc fecha, e o foco começa no botão de jogar — quem já sabe aperta Enter e segue.
   *
   * `preventScroll` NÃO é detalhe: sem ele o navegador rola o diálogo até o botão, que fica no
   * fim, e a explicação abre com a arte e os primeiros campos já fora da tela. Ou seja, o gesto
   * de dar acesso pelo teclado escondia justamente o que a pessoa veio ler.
   */
  useEffect(() => {
    jogarRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar]);

  if (!conteudo) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Como se joga: ${titulo}`}
        onClick={e => e.stopPropagation()}
        className="card-panel bg-surface w-full max-w-lg max-h-[88vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200"
      >
        {/* A mesma miniatura da carta: a pessoa reconhece de onde veio. */}
        <div className="aspect-[16/7] bg-canvas border-b border-border-subtle" aria-hidden>
          <ArteDoJogo jogo={jogo} />
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="label-mono">Como se joga</span>
              <h2 className="font-display font-black text-xl text-ink leading-tight">{titulo}</h2>
            </div>
            <button
              onClick={onFechar}
              className="p-2 -mr-2 -mt-1 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer shrink-0"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <Campo icone={<GraduationCap className="w-4 h-4" />} rotulo="O que treina">
            <p className="text-[13px] text-ink-muted leading-relaxed">{conteudo.treina}</p>
          </Campo>

          <Campo icone={<Play className="w-4 h-4" />} rotulo="Como jogar">
            <ol className="flex flex-col gap-1.5">
              {conteudo.passos.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-ink-muted leading-relaxed">
                  <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full bg-accent-soft text-accent-ink font-mono font-bold text-[9px] flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          </Campo>

          {/* O CAMPO QUE SÓ EXISTE AQUI: as ajudas, com o preço de cada uma. Sem ele, a pessoa
              joga na dificuldade máxima sem saber que havia socorro no canto da tela. */}
          <Campo icone={<Lightbulb className="w-4 h-4" />} rotulo="O que você tem aí">
            <ul className="flex flex-col gap-1.5">
              {conteudo.ajudas.map((a, i) => (
                <li key={i} className="text-[13px] text-ink-muted leading-relaxed">
                  {a.o_que}{' '}
                  {a.custo
                    ? <span className="text-warn-ink font-bold">({a.custo})</span>
                    : <span className="text-good-ink font-bold">(de graça)</span>}
                </li>
              ))}
            </ul>
          </Campo>

          <Campo icone={<Target className="w-4 h-4" />} rotulo="Como conta na sua memória">
            <p className="text-[13px] text-ink-muted leading-relaxed">{conteudo.avaliacao}</p>
          </Campo>

          {/* Destacado de propósito: é a informação que evita a conclusão errada de uma nota baixa. */}
          <Campo icone={<AlertTriangle className="w-4 h-4" />} rotulo="O que este jogo não mede">
            <p className="text-[13px] text-warn-ink leading-relaxed bg-warn-soft border border-warn/20 rounded-lg p-3">
              {conteudo.limites}
            </p>
          </Campo>

          <div className="flex items-center gap-3 pt-1">
            <button
              ref={jogarRef}
              onClick={onJogar}
              className="flex-1 py-3 px-5 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[14px] shadow-btn transition-all cursor-pointer"
            >
              {ageProfile === 'kids' ? 'Bora jogar!' : 'Começar'}
            </button>
            <button
              onClick={onFechar}
              className="py-3 px-4 text-[13px] text-ink-muted hover:text-ink cursor-pointer"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ icone, rotulo, children }: { icone: React.ReactNode; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-mono flex items-center gap-1.5">
        <span className="text-accent" aria-hidden>{icone}</span>
        {rotulo}
      </span>
      {children}
    </div>
  );
}
