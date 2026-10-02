import { type ComponentType, useEffect, useState } from 'react';

/**
 * O RAMO DO QUEST QUE CHEGA SOB DEMANDA, SEM NUNCA RECARREGAR A PÁGINA.
 *
 * Cinco componentes do pacote inicial (`GateDeConta`, `PerguntaDeIdade`, `CartaoDeOferta`,
 * `AvisoDeConta`, `CardDePlanos`) têm o desenho do headset num arquivo à parte, para o CSS do Quest
 * não entrar no CSS inicial. `lazyComRecarga` não serve para eles: quando o pedaço não chega (aba
 * aberta de antes de um deploy, rede caída) ele RECARREGA a página, e um banner que aparece sozinho
 * não pode recarregar a tela no meio de uma captura, nem o aviso que promete "nada do que está na tela
 * se perde".
 *
 * Aqui a falha é só um estado: `falhou` vira `true` e quem chama desenha o ramo de sempre, que já está
 * no pacote. Enquanto o pedaço não chega, `Componente` é `null` e quem chama decide o que mostrar (uma
 * espera visível no que bloqueia a tela; nada no que é só um aviso).
 *
 * `carregar` tem de ser uma função de módulo (estável): é a chave do que já chegou, para a segunda
 * montagem não esperar de novo.
 */
type Carregador<P> = () => Promise<{ default: ComponentType<P> }>;

const prontos = new WeakMap<object, unknown>();

export interface PedacoDoQuest<P> {
  Componente: ComponentType<P> | null;
  falhou: boolean;
}

export function usePedacoDoQuest<P>(carregar: Carregador<P>, ativo: boolean): PedacoDoQuest<P> {
  const [estado, setEstado] = useState<PedacoDoQuest<P>>(() => ({
    Componente: (prontos.get(carregar) as ComponentType<P> | undefined) ?? null,
    falhou: false,
  }));

  useEffect(() => {
    if (!ativo || estado.Componente || estado.falhou) return;
    let vivo = true;
    /* `Promise.resolve().then(carregar)`: um carregador que LANÇA na hora também vira falha, não erro. */
    Promise.resolve()
      .then(carregar)
      .then((m) => {
        const Componente = m.default;
        prontos.set(carregar, Componente);
        if (vivo) setEstado({ Componente, falhou: false });
      })
      .catch(() => {
        if (vivo) setEstado({ Componente: null, falhou: true });
      });
    return () => {
      vivo = false;
    };
  }, [ativo, carregar, estado.Componente, estado.falhou]);

  return estado;
}
