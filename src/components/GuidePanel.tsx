/**
 * GUIA RÁPIDO — o `dialogoGuia()` do protótipo aprovado (C2): `<dialog class="largo">` com seis
 * cartões `.g-guia`, o "Bom saber" e o rodapé "Mais ajuda" / "Entendi". Aberto pelo "?" da tela
 * Capturar e pelos artigos da Ajuda.
 *
 * Os TEXTOS são os que o app já tinha (e que já estão traduzidos no catálogo de i18n): trocá-los
 * pelos do protótipo exige podar e acrescentar chaves em `public/i18n/*`, o que fica para quem
 * cuida das traduções.
 */
import type { LucideIcon } from 'lucide-react';
import { BookOpen, CircleHelp, LifeBuoy, MessageCircle, Mic, MonitorPlay, PictureInPicture2, Plus } from 'lucide-react';

import { t } from '../lib/i18n';
import { Dialogo, fecharDialogoDe, IconeEmBloco } from './ui';

const FLUXOS: Array<{ icone: LucideIcon; titulo: string; passos: string }> = [
  {
    icone: MonitorPlay,
    titulo: 'Traduzir um vídeo/chamada ao vivo',
    passos:
      'Capturar → escolha o cenário (Assistir mídia · Conversa/chamada · Minha voz) → Iniciar Captura. A legenda bilíngue aparece em tempo real; ao parar, a sessão inteira vira material de estudo.',
  },
  {
    icone: Mic,
    titulo: 'Praticar a sua fala',
    passos:
      'Capturar → deixe o Microfone ligado e fale. Sua voz é transcrita e traduzida para o idioma que você estuda, bom para ensaiar frases antes de uma reunião.',
  },
  {
    icone: Plus,
    titulo: 'Importar conteúdo (YouTube, artigo, PDF, áudio)',
    passos:
      'Biblioteca → Importar → escolha a fonte. Tudo vira uma sessão com transcrição, tradução, vocabulário e exercícios.',
  },
  {
    icone: PictureInPicture2,
    titulo: 'Legendas por cima do jogo/da chamada',
    passos:
      'Capturar → "Relay de Legendas" abre uma janelinha flutuante sempre-no-topo. Jogando? Ligue o "Modo desempenho" nos ajustes avançados para pesar menos.',
  },
  {
    icone: MessageCircle,
    titulo: 'Perguntar ao tutor (iChat)',
    passos:
      'O balão no canto abre um tutor que enxerga o conteúdo da tela atual, dá para fixar um contexto (ex.: um vídeo) e seguir conversando sobre ele em qualquer tela.',
  },
  {
    icone: BookOpen,
    titulo: 'Estudar o que capturou',
    passos:
      'Conteúdo da Sessão → abas Leitura (narração) e Prática (deck de revisão espaçada + 8 exercícios). Clique em qualquer palavra para ver tradução e pronúncia e salvar no deck.',
  },
];

const PEGADINHAS: string[] = [
  'Primeira captura: o modelo de transcrição baixa uma única vez (~30MB), a fala dita durante o download fica guardada e aparece assim que ele termina.',
  'Compartilhando uma ABA, marque "compartilhar áudio da guia" no popup do navegador, sem isso não há som.',
  'Abra o app sempre pelo MESMO endereço (localhost e a mesma porta), senão o navegador baixa o modelo de novo.',
];

export default function GuidePanel({
  onClose,
  sub = 'Seis coisas que dá para fazer a partir desta tela.',
  aoMaisAjuda,
}: {
  onClose: () => void;
  sub?: string;
  /** "Mais ajuda" leva à tela Ajuda; sem ele (já na Ajuda), o botão não aparece. */
  aoMaisAjuda?: () => void;
}) {
  return (
    <Dialogo icone={CircleHelp} titulo="Guia rápido" sub={sub} largura="largo" aoFechar={onClose}>
      <div className="dlg-corpo rola-dlg" tabIndex={0} role="region" aria-label="Conteúdo">
        <div className="g-guia">
          {FLUXOS.map(({ icone, titulo, passos }) => (
            <div key={titulo} className="cartao p5">
              <IconeEmBloco icone={icone} />
              <h3>{t(titulo)}</h3>
              <p className="mut">{t(passos)}</p>
            </div>
          ))}
        </div>
        <div className="cartao p5 sutil" style={{ marginTop: 14 }}>
          <span className="label-mono">Bom saber</span>
          <ul className="bom-saber">
            {PEGADINHAS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="dlg-pe">
        {aoMaisAjuda && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={(e) => {
              fecharDialogoDe(e.currentTarget);
              aoMaisAjuda();
            }}
          >
            <LifeBuoy aria-hidden /> Mais ajuda
          </button>
        )}
        <button type="button" className="btn btn-solid" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          Entendi
        </button>
      </div>
    </Dialogo>
  );
}
