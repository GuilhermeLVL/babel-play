/**
 * GUIA IN-APP — a ajuda que o onboarding não cobre no dia a dia. Um modal leve,
 * em linguagem de usuário, com os fluxos principais e as pegadinhas conhecidas.
 * Aberto pelo "?" na tela Capturar e por Configurações.
 */
import React from 'react';
import { X, Mic, Monitor, Download, MessageCircle, PictureInPicture2, GraduationCap } from 'lucide-react';

const FLUXOS: Array<{ icon: React.ReactNode; titulo: string; passos: string }> = [
  {
    icon: <Monitor className="w-4 h-4" />,
    titulo: 'Traduzir um vídeo/chamada ao vivo',
    passos: 'Capturar → escolha o cenário (Assistir mídia · Conversa/chamada · Minha voz) → Iniciar Captura. A legenda bilíngue aparece em tempo real; ao parar, a sessão inteira vira material de estudo.',
  },
  {
    icon: <Mic className="w-4 h-4" />,
    titulo: 'Praticar a sua fala',
    passos: 'Capturar → deixe o Microfone ligado e fale. Sua voz é transcrita e traduzida para o idioma que você estuda, bom para ensaiar frases antes de uma reunião.',
  },
  {
    icon: <Download className="w-4 h-4" />,
    titulo: 'Importar conteúdo (YouTube, artigo, PDF, áudio)',
    passos: 'Biblioteca → Importar → escolha a fonte. Tudo vira uma sessão com transcrição, tradução, vocabulário e exercícios.',
  },
  {
    icon: <PictureInPicture2 className="w-4 h-4" />,
    titulo: 'Legendas por cima do jogo/da chamada',
    passos: 'Capturar → "Relay de Legendas" abre uma janelinha flutuante sempre-no-topo. Jogando? Ligue o "Modo desempenho" nos ajustes avançados para pesar menos.',
  },
  {
    icon: <MessageCircle className="w-4 h-4" />,
    titulo: 'Perguntar ao tutor (iChat)',
    passos: 'O balão no canto abre um tutor que enxerga o conteúdo da tela atual, dá para fixar um contexto (ex.: um vídeo) e seguir conversando sobre ele em qualquer tela.',
  },
  {
    icon: <GraduationCap className="w-4 h-4" />,
    titulo: 'Estudar o que capturou',
    passos: 'Conteúdo da Sessão → abas Leitura (narração) e Prática (deck de revisão espaçada + 8 exercícios). Clique em qualquer palavra para ver tradução e pronúncia e salvar no deck.',
  },
];

const PEGADINHAS: string[] = [
  'Primeira captura: o modelo de transcrição baixa uma única vez (~30MB), a fala dita durante o download fica guardada e aparece assim que ele termina.',
  'Compartilhando uma ABA, marque "compartilhar áudio da guia" no popup do navegador, sem isso não há som.',
  'Abra o app sempre pelo MESMO endereço (localhost e a mesma porta), senão o navegador baixa o modelo de novo.',
];

export default function GuidePanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar bg-canvas border border-border-subtle rounded-2xl shadow-card p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Guia do Babel Play"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-black text-xl text-ink">Guia rápido</h2>
          <button onClick={onClose} title="Fechar guia" aria-label="Fechar guia"
            className="p-2 rounded-lg hover:bg-surface-hover text-ink-muted hover:text-ink cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          {FLUXOS.map((f) => (
            <div key={f.titulo} className="flex gap-3 bg-surface border border-border-subtle rounded-xl p-3.5">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">{f.icon}</span>
              <div className="min-w-0">
                <div className="font-bold text-[13px] text-ink">{f.titulo}</div>
                <p className="text-[12px] text-ink-muted leading-relaxed mt-0.5">{f.passos}</p>
              </div>
            </div>
          ))}
        </div>

        <h3 className="font-bold text-[12px] uppercase tracking-wide text-ink-muted mt-5 mb-2">Bom saber</h3>
        <ul className="space-y-1.5">
          {PEGADINHAS.map((p) => (
            <li key={p} className="text-[12px] text-ink-muted leading-relaxed flex gap-2">
              <span className="text-accent shrink-0">•</span>{p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
