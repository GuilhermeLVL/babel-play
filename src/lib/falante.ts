/**
 * COMO SE OUVE UM ITEM — a única pergunta que os jogos de escuta faziam de dois jeitos.
 *
 * POR QUE ISTO EXISTE. Escuta, Ditado e Karaokê nasceram amarrados a UMA forma de tocar: um
 * `<audio src={audioUrl}>` com `currentTime` no `startMs` e um `setTimeout` para pausar no `endMs`.
 * Funciona perfeitamente quando o material é uma gravação — e simplesmente não existe quando o
 * material é a TRILHA, que tem palavras curadas e nenhum áudio.
 *
 * O efeito medido disso foi pior que "o jogo não funciona": como `frases`/`audioSessao` vinham de
 * uma sessão e não eram função da fonte escolhida, no modo trilha os três anunciavam "N falas
 * prontas" e tocavam o áudio de uma gravação qualquer. Mistura silenciosa de fontes.
 *
 * Aqui a pergunta vira uma só: "faça este item soar". Quem responde é o clipe da gravação quando
 * ele existe, ou a voz sintetizada quando não — e o jogo não precisa saber qual dos dois foi.
 *
 * HONESTIDADE: quando NENHUM dos dois está disponível, `disponivel` é falso e o jogo diz isso em
 * vez de mostrar um botão que não faz som. É o mesmo princípio que o Karaokê já aplica ao
 * reconhecimento de voz ("nota de pronúncia inventada é pior que nota nenhuma").
 */
import { speak, cancelSpeech, isTtsSupported } from './tts';
import { toBcp47 } from './languages';
import { mediaErrorMessage } from './mediaErrors';
import { toast } from '../components/Toast';

/** O que se pede para ouvir. `startMs`/`endMs` só existem quando o item veio de uma gravação. */
interface ItemAudivel {
  texto: string;
  lang?: string;
  startMs?: number;
  endMs?: number;
}

export interface Falante {
  /** Faz o item soar. `velocidade` 1 = normal; o "devagar" dos jogos usa 0,6. */
  ouvir(item: ItemAudivel, velocidade?: number): void;
  parar(): void;
  /** Há alguma forma de produzir som para este material? */
  disponivel: boolean;
  /** Qual caminho está em uso — a tela usa para explicar o que a pessoa vai ouvir. */
  modo: 'gravacao' | 'voz' | 'nenhum';
}

/**
 * Monta o falante para uma rodada.
 *
 * A DECISÃO É POR ITEM, não por rodada: uma fala com `startMs`/`endMs` e uma gravação carregada
 * tocam o clipe REAL, que é sempre melhor (é a voz de verdade, com o ritmo de verdade); qualquer
 * outra coisa cai na voz sintetizada. Assim uma sessão continua soando exatamente como antes e a
 * trilha ganha som sem que nenhum jogo saiba que existem dois caminhos.
 *
 * `audioEl` é passado por referência viva (`{ current }`) porque o elemento só existe depois do
 * primeiro render, e a rodada é montada antes.
 */
export function criarFalante(
  audioEl: { current: HTMLAudioElement | null },
  audioUrl: string | undefined,
): Falante {
  const temGravacao = !!audioUrl;
  const temVoz = isTtsSupported();
  let pararEm: number | null = null;
  /* Uma vez por falante: o <audio> reemite `error` a cada `load()`, e repetir o mesmo aviso a cada
     clique seria tão inútil quanto não avisar. */
  let jaAvisouDoAudio = false;

  const parar = () => {
    if (pararEm !== null) { window.clearTimeout(pararEm); pararEm = null; }
    audioEl.current?.pause();
    cancelSpeech();
  };

  return {
    disponivel: temGravacao || temVoz,
    modo: temGravacao ? 'gravacao' : temVoz ? 'voz' : 'nenhum',
    parar,
    ouvir(item, velocidade = 1) {
      parar();
      const recortavel = temGravacao
        && typeof item.startMs === 'number'
        && typeof item.endMs === 'number'
        && item.endMs > item.startMs;

      const porVoz = () => {
        if (temVoz) speak(item.texto, { lang: toBcp47(item.lang || '') || undefined, rate: velocidade });
      };

      if (recortavel && audioEl.current && !audioEl.current.error) {
        const audio = audioEl.current;
        /**
         * SÓ DEPOIS DOS METADADOS. Escrever `currentTime` com `readyState < HAVE_METADATA` é
         * ignorado pelo navegador: o clipe tocava do zero, ou nem tocava. Era este o motivo de o
         * Karaokê não produzir som — e o `void play()` engolia a rejeição, então nada aparecia.
         */
        const tocar = () => {
          try {
            audio.currentTime = (item.startMs as number) / 1000;
            audio.playbackRate = velocidade;
            /* `preservesPitch`: sem isto, ouvir devagar vira voz de desenho animado — e o ponto do
               devagar é distinguir fonemas, não fazer graça. */
            (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
            // Falhou (autoplay bloqueado, arquivo ausente)? A voz sintetizada assume — silêncio
            // sem explicação é o pior desfecho possível num jogo de escuta.
            audio.play().catch(porVoz);
            const duracao = Math.max(300, (item.endMs as number) - (item.startMs as number)) / velocidade;
            pararEm = window.setTimeout(() => { audio.pause(); }, duracao);
          } catch { porVoz(); }
        };

        /* O `error` do <audio> é a única fonte de causa da falha de CARGA (rede, formato, arquivo
           corrompido), `mediaErrorMessage` a traduz. Sem isto o jogo caía na voz sintetizada, ou
           no silêncio quando nem ela existe, e a pessoa não tinha como saber por quê. */
        const falhouACarga = () => {
          if (!jaAvisouDoAudio) {
            jaAvisouDoAudio = true;
            const msg = mediaErrorMessage(audio);
            if (temVoz) toast.warn(`${msg} A voz sintetizada assume no lugar do clipe.`);
            else toast.error(msg);
          }
          porVoz();
        };

        if (audio.readyState >= 1) { tocar(); return; }
        audio.addEventListener('loadedmetadata', tocar, { once: true });
        audio.addEventListener('error', falhouACarga, { once: true });
        audio.load();
        return;
      }

      porVoz();
    },
  };
}
