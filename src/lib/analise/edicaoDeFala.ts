/**
 * A EDIÇÃO INLINE DO TRANSCRITO — corrigir o que o STT ouviu errado e a tradução da mesma fala.
 *
 * `realUtterances` é a FONTE ÚNICA: ao salvar, atualizamos essa lista e todas as derivações
 * (parsedSentences, stats, WPM, player) recalculam via seus `useMemo`.
 *
 * Saiu de `views/Analysis.tsx` sem mudar comportamento: a fábrica roda a cada render, como as
 * closures que substituiu, e o estado da tela entra por PARÂMETRO explícito.
 */
import type { Dispatch, SetStateAction } from 'react';

import { updateUtterance } from '../../data/api';

/** Tudo que a edição de fala precisa da tela — por parâmetro, sem contexto novo. */
export interface DepsDaEdicaoDeFala {
  /** Texto de origem em edição (o que o STT ouviu). */
  editSource: string;
  /** Tradução em edição. */
  editTarget: string;
  setEditingUttId: Dispatch<SetStateAction<string | null>>;
  setEditSource: Dispatch<SetStateAction<string>>;
  setEditTarget: Dispatch<SetStateAction<string>>;
  setEditSaving: Dispatch<SetStateAction<boolean>>;
  setEditError: Dispatch<SetStateAction<string | null>>;
  setRealUtterances: Dispatch<SetStateAction<any[]>>;
}

export function criarEdicaoDeFala(deps: DepsDaEdicaoDeFala) {
  const {
    editSource,
    editTarget,
    setEditingUttId,
    setEditSource,
    setEditTarget,
    setEditSaving,
    setEditError,
    setRealUtterances,
  } = deps;

  const startEditUtt = (uttId: string, source: string, translation: string) => {
    setEditingUttId(uttId);
    setEditSource(source);
    setEditTarget(translation);
    setEditError(null);
  };

  const cancelEditUtt = () => {
    setEditingUttId(null);
    setEditError(null);
  };

  const saveEditUtt = async (uttId: string) => {
    setEditSaving(true);
    setEditError(null);
    const row = await updateUtterance(uttId, { sourceText: editSource, translatedText: editTarget });
    setEditSaving(false);
    // Erro honesto: mantém o texto editado nos campos para não perder o trabalho.
    if (!row) {
      setEditError('Não foi possível salvar. Verifique a conexão e tente de novo.');
      return;
    }
    setRealUtterances((prev) => prev.map((u) => (u.id === row.id ? { ...u, ...row } : u)));
    setEditingUttId(null);
  };

  return { startEditUtt, cancelEditUtt, saveEditUtt };
}
