import { useEffect, useState } from 'react';

import { codigoDoTradutor } from '../../gateway/adapters/chromeTranslator';
import { modeloDisponivel } from '../../gateway/modelManifest';
import type { Disponibilidade } from '../dispositivo/sonda';

/**
 * O QUE O TOQUE EM INICIAR PRECISA SABER, medido QUANDO A TELA ABRE — e não dentro do clique.
 *
 * Antes, o clique esperava a conferência do cache de cada modelo (`modeloDisponivel`, IndexedDB/Cache
 * Storage) antes de decidir se perguntava do download; cada `await` ali gastava a ativação do usuário,
 * e no iPhone o áudio criado depois dela podia ficar mudo (ver `contextoDoClique.ts`). Aqui ficam, já
 * prontos para `planejarInicio`:
 *   · `completos`: os modelos da captura que já estão inteiros no aparelho (refeito quando a lista
 *     muda e quando uma gravação acaba — ela pode ter baixado algum);
 *   · `noAparelho`: o navegador reconhece a sua voz no aparelho? (`available({processLocally})`);
 *   · `podeInstalarPacote`: há `SpeechRecognition.install()` (o pacote de voz do navegador);
 *   · `permissao`: o estado da permissão do microfone ('granted' dispensa o "Permita o microfone");
 *   · `tradutorNativo`: o navegador já traduz o par NO APARELHO (`Translator.availability` =
 *     'available') — o nosso tradutor não baixa, e a folha não conta os MB dele.
 * Até chegar, `completos` é `null` e o plano conta tudo como a baixar (errar para o lado de avisar).
 */
export interface PreparoDoInicio {
  completos: ReadonlySet<string> | null;
  noAparelho: Disponibilidade | null;
  podeInstalarPacote: boolean;
  permissao: PermissionState | null;
  tradutorNativo: boolean;
}

type ComInstalar = { install?: unknown };

export function usePreparoDoInicio(o: {
  modelos: readonly string[];
  langDoMic: string;
  /** O navegador tem Web Speech e o seletor do mic está nele (senão a sonda não serve). */
  sondarMic: boolean;
  /** Muda quando uma gravação acaba (o cache pode ter crescido). */
  gravando: boolean;
  /** O par do tradutor da captura (de, para). Ausente = não sonda o tradutor do navegador. */
  parDoTradutor?: readonly [string, string];
}): PreparoDoInicio {
  const [completos, setCompletos] = useState<ReadonlySet<string> | null>(null);
  const [noAparelho, setNoAparelho] = useState<Disponibilidade | null>(null);
  const [permissao, setPermissao] = useState<PermissionState | null>(null);
  const chave = o.modelos.join('|');
  const [tradutorNativo, setTradutorNativo] = useState(false);
  const [deTradutor, paraTradutor] = o.parDoTradutor ?? ['', ''];

  useEffect(() => {
    setTradutorNativo(false);
    const api = (globalThis as { Translator?: { availability?: (x: unknown) => Promise<string> } }).Translator;
    if (!deTradutor || !paraTradutor || typeof api?.availability !== 'function') return;
    const s = codigoDoTradutor(deTradutor);
    const t = codigoDoTradutor(paraTradutor);
    if (s === t) return;
    let vivo = true;
    void api
      .availability({ sourceLanguage: s, targetLanguage: t })
      .then((d) => vivo && setTradutorNativo(d === 'available' || d === 'readily'))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [deTradutor, paraTradutor, o.gravando]);

  useEffect(() => {
    if (o.gravando) return;
    let vivo = true;
    const ids = chave ? chave.split('|') : [];
    void Promise.all(
      ids.map((id) =>
        modeloDisponivel(id)
          .then((e) => (e.completo ? id : null))
          .catch(() => null),
      ),
    ).then((r) => {
      if (vivo) setCompletos(new Set(r.filter((id): id is string => !!id)));
    });
    return () => {
      vivo = false;
    };
  }, [chave, o.gravando]);

  useEffect(() => {
    if (!o.sondarMic) {
      setNoAparelho(null);
      return;
    }
    let vivo = true;
    void import('../dispositivo/sonda')
      .then((m) => m.disponibilidadeDoSttNoAparelho(o.langDoMic))
      .then((d) => vivo && setNoAparelho(d))
      .catch(() => vivo && setNoAparelho(null));
    return () => {
      vivo = false;
    };
  }, [o.langDoMic, o.sondarMic]);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    let vivo = true;
    try {
      void navigator.permissions
        ?.query({ name: 'microphone' as PermissionName })
        .then((s) => {
          if (!vivo) return;
          status = s;
          setPermissao(s.state);
          s.onchange = () => setPermissao(s.state);
        })
        .catch(() => setPermissao(null));
    } catch {
      /* Safari antigo: sem a Permissions API para o microfone */
    }
    return () => {
      vivo = false;
      if (status) status.onchange = null;
    };
  }, []);

  const g = globalThis as { SpeechRecognition?: ComInstalar; webkitSpeechRecognition?: ComInstalar };
  const podeInstalarPacote = typeof (g.SpeechRecognition ?? g.webkitSpeechRecognition)?.install === 'function';
  return { completos, noAparelho, podeInstalarPacote, permissao, tradutorNativo };
}
