import type { MinigameId } from '@core';
import { LifeBuoy, Play, TriangleAlert, X } from 'lucide-react';
import { useId, useRef } from 'react';

import type { AgeProfileType } from '../../lib/profile';
import { DialogoBase } from '../ui/Dialogo';
import { IconePixel } from '../views/play/IconesPixel';

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

/* ─────────────────────────── O CONTEÚDO ───────────────────────────
   Escrito jogo a jogo, e não gerado: cada um tem uma razão de existir diferente, e é isso que a
   pessoa precisa entender antes de começar. O campo `limites` é onde a honestidade mora. */

export const COMO_SE_JOGA: Record<MinigameId, ConteudoComoSeJoga> = {
  memory: {
    treina: 'Ligar a palavra ao significado dela, nos dois sentidos.',
    passos: [
      'Vire uma carta e depois outra.',
      'Se as duas forem a mesma palavra e a tradução dela, o par fecha.',
      'Errou? As cartas voltam, e a repetição é justamente o que fixa.',
    ],
    avaliacao:
      'Fechar o par de primeira vale "bom"; com duas ou três tentativas, "difícil". Nunca vale "fácil": aqui você tem tempo para pensar, e tempo não prova fluência.',
    limites:
      'Ver a tradução na mesa é reconhecimento, não produção. Você pode fechar todos os pares e ainda não conseguir usar a palavra ao falar.',
    ajudas: [
      {
        o_que: 'Espiar a mesa abre todas as cartas por um instante (duas por rodada).',
        custo: 'limita a nota a "difícil"',
      },
    ],
  },
  wordsearch: {
    treina: 'Lembrar a palavra a partir do significado, antes de procurá-la.',
    passos: [
      'Leia a pista na lista ao lado, ela é a tradução, nunca a palavra.',
      'Lembre qual é a palavra e arraste sobre as letras no quadro.',
      'O traço pode ir em qualquer direção, inclusive na diagonal.',
    ],
    avaliacao:
      'Achar sem ajuda vale "bom". Errar o traço não conta como erro de memória, isso é mira, e mira não estraga a sua revisão.',
    limites:
      'A palavra está escrita no quadro. Isso ajuda quem quase lembrava, mas não treina escrever do zero, para isso existe o Soletrar.',
    ajudas: [
      { o_que: 'O radar faz as duas pontas de uma palavra pulsarem no quadro (três por rodada).', custo: null },
      { o_que: 'A dica revela a primeira letra e diz a direção do traço.', custo: 'limita a nota a "difícil"' },
      { o_que: 'Revelar entrega a palavra e passa para a próxima.', custo: 'conta como não lembrei' },
    ],
  },
  termo: {
    treina: 'Escrever a palavra letra por letra, produção, que é mais difícil e mais valiosa que reconhecer.',
    passos: [
      'A pista é o significado; escreva a palavra que ele descreve. O número de quadrados já diz quantas letras ela tem.',
      'Verde: letra no lugar certo. Amarelo: existe na palavra, mas em outra posição. Acentos não contam.',
      'Escreveu um sinônimo válido do seu caderno? Não perde a tentativa: o jogo diz quantas letras a desta rodada tem e revela a primeira.',
      'Na última tentativa, errar por UMA letra não gasta a jogada (avisa "quase", uma vez por tabuleiro).',
      'Acertou? O próximo degrau tem duas palavras ao mesmo tempo. E depois, quatro. Se as tentativas acabarem, a palavra é mostrada e a rodada fecha.',
    ],
    avaliacao:
      'Acertar de primeira vale "fácil", é a evidência mais forte de domínio que dá para coletar por escrito. Da segunda tentativa em diante você já tem as cores ajudando, então vale menos. Palavras com hífen ou espaço ficam fora deste jogo (a antessala diz quantas).',
    limites:
      'Mede grafia, não pronúncia. Escrever certo e falar certo são duas habilidades, e esta só cobre a primeira.',
    ajudas: [
      { o_que: 'A varinha preenche as letras que você JÁ descobriu nas tentativas anteriores.', custo: null },
      { o_que: 'Ouvir toca a palavra em voz alta.', custo: null },
      {
        o_que: 'A lâmpada revela uma letra que você ainda não achou.',
        custo: 'limita a nota a "difícil" só naquele tabuleiro',
      },
    ],
  },
  scramble: {
    treina: 'A ordem das palavras, a única coisa que nenhum outro exercício do app cobre.',
    passos: [
      'Leia o significado da frase, que fica visível de propósito.',
      'Clique nas palavras na ordem certa; clicar de novo devolve a palavra.',
      'Confira. Se errar, o jogo diz quantas estão no lugar, sem dizer quais.',
    ],
    avaliacao:
      'Este jogo usa falas da sua gravação, que não têm cartão no baralho. Por isso ele não mexe na sua agenda de revisão, vale pelos pontos e pela prática.',
    limites:
      'A frase vem do reconhecimento de voz. Se a captura cortou no meio, a ordem "certa" é a que foi transcrita, não necessariamente a que foi dita.',
    ajudas: [
      { o_que: 'A dica encaixa a próxima palavra certa no lugar.', custo: 'limita a nota a "difícil"' },
      { o_que: 'Pular passa para a frase seguinte.', custo: 'conta como não consegui' },
    ],
  },
  karaoke: {
    treina: 'Pronúncia, repetindo uma fala real com o áudio original como modelo.',
    passos: [
      'Ouça a frase, as palavras acendem no ritmo do áudio de verdade.',
      'Toque em Falar e repita.',
      'A nota compara o que o reconhecedor entendeu com o que estava escrito.',
    ],
    avaliacao:
      'A nota é de SEMELHANÇA DE TEXTO, não de fonemas: o reconhecedor transcreve o que você falou e comparamos as palavras.',
    limites:
      'Por causa disso, uma palavra bem pronunciada pode aparecer como erro se o reconhecedor entender outra, e um sotaque diferente do esperado derruba a nota sem que a fala esteja errada. Trate como termômetro, nunca como veredito.',
    ajudas: [
      { o_que: 'Ouvir devagar toca a 0,6× sem deixar a voz esquisita, dá para separar as palavras.', custo: null },
      { o_que: 'Pular passa para a próxima fala.', custo: null },
    ],
  },
  escuta: {
    treina: 'Distinguir o que foi DITO, a habilidade que nenhum outro jogo daqui treina sozinha.',
    passos: [
      'O trecho toca sozinho quando a rodada começa.',
      'Leia as alternativas e escolha qual frase você ouviu.',
      'Ouça de novo quantas vezes precisar antes de responder.',
    ],
    avaliacao:
      'As alternativas erradas são outras falas da MESMA gravação, com tamanho parecido, mesmo assunto, mesmo sotaque. Não dá para eliminar por dedução: é preciso ouvir.',
    limites:
      'Escolher entre quatro é mais fácil que entender do zero. Acertar aqui não garante que você pegaria a frase no meio de uma conversa.',
    ajudas: [
      { o_que: 'Ouvir de novo, sem limite.', custo: null },
      { o_que: 'Ouvir devagar, a 0,6× e sem deixar a voz esquisita.', custo: null },
    ],
  },
  ditado: {
    treina: 'Ouvir e ESCREVER, junta escuta com grafia, que é onde a maioria trava.',
    passos: [
      'Ouça o trecho (ele toca sozinho ao começar).',
      'Escreva o que você entendeu na linha.',
      'Confira: a correção mostra cada palavra, e o que você escreveu no lugar.',
    ],
    avaliacao:
      'A conferência é palavra a palavra, não uma porcentagem solta, você vê exatamente onde errou. Acerto a partir de 80% das palavras.',
    limites:
      'Pontuação e acento NÃO contam, porque o jogo é de ouvido. Isso significa que ele não verifica a sua escrita formal, para grafia exata, o Soletrar é o lugar.',
    ajudas: [
      { o_que: 'Ouvir de novo e ouvir devagar, sem limite.', custo: null },
      { o_que: 'A lâmpada escreve a próxima palavra para você.', custo: 'limita a nota a "difícil"' },
      { o_que: 'Pular passa para a próxima frase.', custo: 'conta como não consegui' },
    ],
  },
  conectores: {
    treina: 'Perceber as palavras que AMARRAM as ideias, o que separa entender palavras de entender o texto.',
    passos: [
      'Leia a frase, que veio de uma gravação sua.',
      'Toque nas palavras que ligam uma ideia à outra ("porém", "porque", "however").',
      'Confira. As que passaram batido aparecem contornadas.',
    ],
    avaliacao:
      'A nota pesa os DOIS erros: deixar conector passar e marcar palavra que não é. Por isso clicar em tudo não garante nota boa, o contrário, aliás.',
    limites:
      'A lista de conectores é fixa e existe só para alguns idiomas. Ela não cobre toda expressão de ligação possível, e uma que falte não é erro seu.',
    ajudas: [{ o_que: 'Dá para marcar e desmarcar à vontade antes de conferir.', custo: null }],
  },
  blitz: {
    treina: 'Recuperação RÁPIDA, o sinal de que a palavra está firme, e não só acessível.',
    passos: [
      'Uma pergunta por vez, com quatro alternativas reais do seu baralho.',
      'Responda antes de o tempo acabar.',
      'Acertos seguidos multiplicam os pontos.',
    ],
    avaliacao:
      'É o único jogo em que a velocidade conta: responder em menos de três segundos vale "fácil"; acima disso, "bom". Nos outros jogos o teto é "bom" justamente porque lá dá para pensar.',
    limites:
      'Escolher entre quatro é mais fácil que lembrar do zero. Acertar aqui não garante que você produziria a palavra numa conversa.',
    ajudas: [
      { o_que: 'A tesoura corta duas alternativas erradas (duas por rodada).', custo: 'limita a nota a "difícil"' },
    ],
  },
  karuta: {
    treina: 'Casar o som da pista com a palavra escrita.',
    passos: [
      'O narrador declama a pista (o significado).',
      'Toque na carta com a palavra que ela descreve.',
      'Errou? A carta volta para a mesa.',
    ],
    avaliacao: 'Acertar de primeira vale "bom"; com tentativas, "dificil".',
    limites: 'A pista e falada: sem audio, o jogo perde a metade que o distingue do Duelo.',
    ajudas: [{ o_que: 'Repetir a fala da pista.', custo: 'nao custa nota' }],
  },
  choseong: {
    treina: 'Escrever a palavra a partir do significado, com as consoantes a vista.',
    passos: ['A pista e o significado.', 'As consoantes aparecem; as vogais ficam escondidas.', 'Complete as vogais.'],
    avaliacao: 'Completar sem erro vale "facil"; com erro, "dificil".',
    limites: 'So funciona com alfabeto latino: a mecanica separa consoante de vogal.',
    ajudas: [{ o_que: 'Revelar uma vogal.', custo: 'limita a nota a "dificil"' }],
  },
  tenis: {
    treina: 'Recuperar a palavra sob pressao de tempo, em rali.',
    passos: [
      'A bola traz a pista.',
      'Devolva escrevendo a palavra antes que ela caia.',
      'Cada devolucao certa encurta o tempo da proxima.',
    ],
    avaliacao: 'Devolver dentro do tempo vale "facil"; no limite, "bom".',
    limites: 'O relogio favorece quem digita rapido, e digitar rapido nao e saber mais.',
    ajudas: [{ o_que: 'Uma dica revela a primeira letra da palavra.', custo: 'limita a nota a "bom"' }],
  },
  koffer: {
    treina: 'Guardar uma sequencia crescente de palavras na ordem.',
    passos: ['A cada nivel entra uma palavra na mala.', 'Reconstrua de memoria tudo que ja esta la.', 'A ordem conta.'],
    avaliacao: 'Reconstruir a mala inteira sem erro vale "facil".',
    limites: 'Testa memoria de sequencia, que nao e a mesma coisa que saber usar a palavra.',
    ajudas: [{ o_que: 'Ver a mala por um instante.', custo: 'limita a nota a "dificil"' }],
  },
  bao: {
    treina: 'Montar a palavra a partir dos pedacos dela.',
    passos: [
      'As sementes trazem os pedacos, fora de ordem.',
      'Semeie na ordem certa.',
      'A palavra fecha quando a ordem bate.',
    ],
    avaliacao: 'Montar de primeira vale "bom".',
    limites: 'Partir a palavra em pedacos so faz sentido em alfabeto latino.',
    ajudas: [{ o_que: 'Semear a primeira peca.', custo: 'limita a nota a "dificil"' }],
  },
  vitendawili: {
    treina: 'Reconhecer a palavra pelo contexto da sua propria frase.',
    passos: [
      'O enigma e uma frase sua com a palavra apagada.',
      'Ouca a frase com pausa na lacuna.',
      'Escolha a palavra que a preenche.',
    ],
    avaliacao: 'Acertar de primeira vale "bom".',
    limites: 'Sem frase gravada o enigma nao existe: o item cai fora da rodada.',
    ajudas: [{ o_que: 'Ouvir a frase de novo.', custo: 'nao custa nota' }],
  },
  shiritori: {
    treina: 'Recuperar palavras encadeadas pela ultima letra.',
    passos: [
      'Cada palavra comeca com a ultima letra da anterior.',
      'Escolha a que continua a corrente.',
      'A corrente quebra se nao houver continuacao.',
    ],
    avaliacao: 'Acertar de primeira vale "bom".',
    limites: 'Precisa de uma corrente valida no seu baralho; sem ela a rodada nao nasce.',
    ajudas: [{ o_que: 'Ver a letra inicial exigida.', custo: 'nao custa nota' }],
  },
  cadavre: {
    treina: 'Usar as palavras da leva numa frase sua.',
    passos: [
      'Quatro palavras aparecem.',
      'Escreva uma frase que use as quatro.',
      'A frase e sua; nao ha resposta certa.',
    ],
    avaliacao: 'Nao ha nota: escrever uma frase nao e evidencia de que voce recuperou a palavra.',
    limites: 'NAO agenda revisao. Vale como producao livre, nao como memoria.',
    ajudas: [{ o_que: 'Trocar uma palavra da leva.', custo: 'nao custa nota' }],
  },
  taboo: {
    treina: 'Reconhecer a palavra por uma definicao que evita os termos obvios.',
    passos: [
      'A palavra-alvo aparece com as proibidas riscadas.',
      'Leia a definicao que sobrou.',
      'Escolha a palavra certa.',
    ],
    avaliacao: 'Acertar de primeira vale "bom".',
    limites: 'As proibidas sao derivadas do texto: em item curto pode sobrar pouca definicao.',
    ajudas: [{ o_que: 'Liberar uma palavra proibida.', custo: 'limita a nota a "dificil"' }],
  },
};

interface ComoSeJogaProps {
  jogo: MinigameId;
  titulo: string;
  ageProfile: AgeProfileType;
  onJogar: () => void;
  onFechar: () => void;
}

/**
 * O diálogo `dialogoComo()` do protótipo aprovado: `<dialog class="medio">` com a arte do jogo no
 * `.dlg-cab`, os campos em `.dlg-corpo.como` (rótulo mono + texto), as ajudas em `ul.ajudas` com
 * o preço de cada uma, o aviso `.aviso-info.warn` do que o jogo não mede e o rodapé `.dlg-pe`.
 * Esc (o `cancel` nativo) fecha; o foco começa em "Começar" — quem já sabe aperta Enter e segue.
 */
export default function ComoSeJoga({ jogo, titulo, ageProfile, onJogar, onFechar }: ComoSeJogaProps) {
  const conteudo = COMO_SE_JOGA[jogo];
  const idTitulo = useId();
  const ref = useRef<HTMLDialogElement>(null);
  if (!conteudo) return null;

  return (
    <DialogoBase classe="medio" rotuloId={idTitulo} aoFechar={onFechar} refDialogo={ref}>
      <div className="dlg-cab">
        <span className="ib" style={{ background: 'var(--surface-hover)' }} aria-hidden>
          <IconePixel id={jogo} className="w-7 h-7" />
        </span>
        <div style={{ minWidth: 0 }}>
          <span className="label-mono">Como se joga</span>
          <h2 id={idTitulo}>{titulo}</h2>
        </div>
        <button type="button" className="x" aria-label="Fechar" onClick={() => ref.current?.close()}>
          <X aria-hidden />
        </button>
      </div>
      <div className="dlg-corpo pilha como">
        <div>
          <span className="label-mono">O que treina</span>
          <p>{conteudo.treina}</p>
        </div>
        <div>
          <span className="label-mono">Como jogar</span>
          {/* `decimal` explícito: o reset do Tailwind tira a numeração que o protótipo tem. */}
          <ol style={{ listStyle: 'decimal' }}>
            {conteudo.passos.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
        {/* O CAMPO QUE SÓ EXISTE AQUI: as ajudas, com o preço de cada uma. Sem ele, a pessoa
            joga na dificuldade máxima sem saber que havia socorro no canto da tela. */}
        <div>
          <span className="label-mono">O que você tem aí</span>
          <ul className="ajudas">
            {conteudo.ajudas.map((a, i) => (
              <li key={i}>
                <LifeBuoy aria-hidden />
                <span>{a.o_que}</span>
                <small className="mut">{a.custo ?? 'de graça'}</small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="label-mono">Como conta na sua memória</span>
          <p>{conteudo.avaliacao}</p>
        </div>
        {/* Destacado de propósito: é a informação que evita a conclusão errada de uma nota baixa. */}
        <div className="aviso-info warn">
          <TriangleAlert aria-hidden />
          <span>
            <b style={{ color: 'var(--ink)' }}>O que este jogo não mede.</b> {conteudo.limites}
          </span>
        </div>
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={() => ref.current?.close()}>
          Agora não
        </button>
        <button type="button" className="btn btn-solid" data-autofocus onClick={onJogar}>
          <Play aria-hidden /> {ageProfile === 'kids' ? 'Bora jogar!' : 'Começar'}
        </button>
      </div>
    </DialogoBase>
  );
}
