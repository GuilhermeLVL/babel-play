/**
 * A TELA VISTA PELO iCHAT — o nome dela e os campos estruturados que a barra de contexto mostra.
 *
 * Do protótipo aprovado (`contextoDaTela`): "contexto de tela = campos estruturados por tela, nunca
 * uma frase pronta". Cada campo sai de um número REAL do app (métricas, caderno, biblioteca,
 * transcrição ao vivo); o que o app não sabe não vira campo.
 */
import type { AppMetrics } from '../../core/learning/contract';
import { t } from '../../lib/i18n';
import type { AgeProfileType } from '../../lib/profile';
import { deriveProgress } from '../../lib/progress';
import type { Recording, ViewType } from '../../types';
import { NAV_ITEMS, navLabel } from '../shell/navItems';

/** O nome da tela como o menu o escreve — o aviso "sintonizado com" mostra isto, nunca o id. */
export function nomeDaTela(view: ViewType, perfil: AgeProfileType): string {
  const item = NAV_ITEMS.find((n) => n.id === view);
  if (item) return navLabel(item, perfil);
  switch (view) {
    case 'analysis':
    case 'reading':
      return t('Sessão');
    case 'study':
      return t('Revisão');
    case 'profile':
      return t('Seu perfil');
    case 'ajuda':
      return t('Ajuda');
    case 'naoencontrado':
      return t('Página não encontrada');
    default:
      return String(view);
  }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface DadosDaTela {
  view: ViewType;
  metrics: AppMetrics | null;
  recordings: Recording[];
  selectedRecording: Recording | null;
  liveTranscription: string;
  /** O idioma que domina o caderno (ex.: "inglês"), quando o caderno já carregou. */
  idioma?: string | null;
}

/** Os campos que o iChat está considerando nesta tela (sem o "tela X", que a barra acrescenta). */
export function camposDaTela({
  view,
  metrics,
  recordings,
  selectedRecording,
  liveTranscription,
  idioma,
}: DadosDaTela): string[] {
  const p = metrics ? deriveProgress(metrics) : null;
  const pendentes = metrics?.dueToday ?? 0;
  switch (view) {
    case 'hub':
      return p
        ? [
            `nível ${p.level}, ${p.xpIntoLevel} de ${p.xpForLevel} XP`,
            `${plural(pendentes, 'palavra pendente', 'palavras pendentes')} de revisão`,
            `ofensiva de ${plural(p.streakDays, 'dia', 'dias')}`,
          ]
        : [];
    case 'capture': {
      const n = liveTranscription.trim() ? liveTranscription.trim().split(/\s+/).length : 0;
      return [n ? `gravando, ${plural(n, 'palavra transcrita', 'palavras transcritas')} até agora` : 'captura parada'];
    }
    case 'play':
      return metrics
        ? [`${plural(metrics.deckSize, 'palavra', 'palavras')} no caderno`, ...(idioma ? [`idioma: ${idioma}`] : [])]
        : [];
    case 'library':
      return [plural(recordings.length, 'mídia', 'mídias')];
    case 'analysis':
    case 'reading':
      return selectedRecording
        ? [`sessão “${selectedRecording.title}”`, ...(view === 'reading' ? ['aba Leitura'] : [])]
        : [];
    case 'study':
      return [
        `${plural(pendentes, 'palavra pendente', 'palavras pendentes')}`,
        ...(selectedRecording ? [`sessão “${selectedRecording.title}”`] : []),
      ];
    case 'metrics':
      return metrics
        ? [
            `${plural(metrics.deckSize, 'palavra', 'palavras')} no caderno`,
            `${plural(pendentes, 'pendente', 'pendentes')}`,
          ]
        : [];
    case 'loja':
      return p ? [`${p.seeds} Seeds`] : [];
    case 'estatisticas':
      return metrics
        ? [`ofensiva de ${plural(metrics.streakDays, 'dia', 'dias')}`, plural(metrics.reviews, 'revisão', 'revisões')]
        : [];
    case 'sobre':
      return ['página sobre o projeto'];
    default:
      return [];
  }
}
