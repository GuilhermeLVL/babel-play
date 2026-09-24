/**
 * GUIA RÁPIDO — o `dialogoGuia()` do protótipo aprovado (C2): `<dialog class="largo">` com seis
 * cartões `.g-guia`, o "Bom saber" e o rodapé "Mais ajuda" / "Entendi". Aberto pelo "?" da tela
 * Capturar, pela Ajuda e pelos Ajustes.
 *
 * Os TEXTOS são os do protótipo (decisão do dono, 24/09) e passam por `t()`: o catálogo de i18n
 * tem as mesmas frases. O tamanho do modelo no "Bom saber" vem de quem abre (a Captura sabe qual
 * modelo vai usar); sem ele, a frase sai sem o número.
 */
import type { LucideIcon } from 'lucide-react';
import { BookOpen, CircleHelp, LifeBuoy, MessageCircle, Mic, MonitorPlay, PictureInPicture2, Plus } from 'lucide-react';

import { t } from '../lib/i18n';
import { Dialogo, fecharDialogoDe, IconeEmBloco } from './ui';

const FLUXOS: Array<{ icone: LucideIcon; titulo: string; passos: string }> = [
  {
    icone: MonitorPlay,
    titulo: 'Traduzir um vídeo ou chamada',
    passos: 'Dê play em qualquer app e clique em Iniciar captura. O som do computador entra sozinho.',
  },
  {
    icone: Mic,
    titulo: 'Praticar a sua fala',
    passos: 'Ligue o microfone: o app separa a sua voz da dos outros e dá nota de pronúncia na Sessão.',
  },
  {
    icone: Plus,
    titulo: 'Importar conteúdo',
    passos: 'Biblioteca → Importar: YouTube, PDF, artigo da web ou áudio viram sessão.',
  },
  {
    icone: PictureInPicture2,
    titulo: 'Legendas por cima do jogo',
    passos: 'Legendas flutuantes abrem uma janelinha sempre no topo. Trave o clique para ela não atrapalhar.',
  },
  {
    icone: MessageCircle,
    titulo: 'Perguntar ao tutor',
    passos: 'O iChat sabe o que está na tela. Pergunte "o que é leverage?" no meio da captura.',
  },
  {
    icone: BookOpen,
    titulo: 'Estudar o que capturou',
    passos: 'Ao parar, a sessão vai para a Biblioteca com transcrição, vocabulário e jogos.',
  },
];

export default function GuidePanel({
  onClose,
  sub = 'Seis coisas que dá para fazer a partir desta tela.',
  aoMaisAjuda,
  mbDoModelo,
}: {
  onClose: () => void;
  sub?: string;
  /** "Mais ajuda" leva à tela Ajuda; sem ele (já na Ajuda), o botão não aparece. */
  aoMaisAjuda?: () => void;
  /** Tamanho do modelo de transcrição que a captura baixa (MB), quando quem abre sabe. */
  mbDoModelo?: number;
}) {
  const bomSaber = [
    mbDoModelo
      ? t('O modelo de transcrição baixa uma vez só ({mb} MB) e depois funciona sem internet.', { mb: mbDoModelo })
      : t('O modelo de transcrição baixa uma vez só e depois funciona sem internet.'),
    t('Nada do áudio sai do computador no modo local. A tradução também roda aqui.'),
    t('Legenda sumindo? Em Ajustes da captura, use "Testar a captura".'),
  ];
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
            {bomSaber.map((p) => (
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
