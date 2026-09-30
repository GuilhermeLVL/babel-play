import { Check, Cloud, Lock, Shuffle, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { FalhaDaNuance, PedidoDeNuance } from '../../../../data/apiDaNuance';
import { useConsentimentoDeNuvem } from '../../../../lib/consentimentoDeNuvem';
import { t } from '../../../../lib/i18n';
import type { RegistroDaTraducao } from '../../../../lib/traducao/promptComunicativo';
import ConviteDaNuance from './ConviteDaNuance';
import FixarNoGlossario, { cabeNoGlossario } from './FixarNoGlossario';

/** A fala tocada, no que a Nuance precisa. */
export interface FalaDaNuance {
  texto: string;
  traducao: string;
  /** O idioma da fala (BCP-47). */
  lang: string;
}

/* O cliente da Nuance chega por `import()` UMA vez, e os pedidos seguintes reusam a mesma promessa. */
let apiDaNuance: Promise<typeof import('../../../../data/apiDaNuance')> | null = null;
const carregarApi = () => (apiDaNuance ??= import('../../../../data/apiDaNuance'));

type Pedido<T> = { estado: 'carregando' } | { estado: 'ok'; valor: T } | { estado: 'erro'; motivo: FalhaDaNuance };

function fraseDaFalha(m: FalhaDaNuance): string {
  switch (m) {
    case 'nuvem_ocupada':
      return t('A nuvem está ocupada agora. Tente de novo em instantes.');
    case 'sem_conta':
      return t('Entre na sua conta para usar a Tradução Nuance.');
    case 'exige_nuance':
      return t('Este recurso faz parte da Tradução Nuance.');
    default:
      return t('Não deu para buscar agora. Tente de novo em instantes.');
  }
}

/**
 * A TRADUÇÃO NUANCE DE UMA FRASE (D4 da Fase D) — a folha da frase no celular e o menu do balão no
 * computador. Carregada por `lazy()`: a UI nova não entra no JS inicial.
 *
 * COM A NUANCE (e a IA de nuvem autorizada): ao abrir, a tradução no nível `nuance` da frase (o padrão
 * do dono: a legenda ao vivo é a rápida; a Nuance entra ao tocar numa frase); "Outras formas" (até 3 e
 * uma nota) e Formal/Informal. Escolher uma forma atualiza a fala (`aoEscolher`) e oferece "Sempre
 * traduzir assim" (o glossário). Nada troca a fala sem a pessoa escolher.
 *
 * SEM A NUANCE: os mesmos botões, com cadeado, abrem o texto POSITIVO e — fora do perfil protegido —
 * o convite (`aoConhecer`). Nenhum pedido sai: o servidor recusaria (402) de qualquer jeito.
 */
export default function NuanceDaFrase({
  fala,
  destino,
  contexto,
  falada,
  disponivel,
  aoConhecer,
  aoEscolher,
}: {
  fala: FalaDaNuance;
  /** O idioma da tradução (o "outro" idioma do par). */
  destino: string;
  /** As falas anteriores (≤ 3), para pronome e tempo. */
  contexto?: ReadonlyArray<string>;
  /** Fala do microfone: o prompt do intérprete. */
  falada?: boolean;
  disponivel: boolean;
  aoConhecer?: () => void;
  aoEscolher: (traducao: string) => void;
}) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const pode = disponivel && consentiu;
  const [daNuance, setDaNuance] = useState<Pedido<string> | null>(null);
  const [formas, setFormas] = useState<Pedido<{ opcoes: string[]; nota: string }> | null>(null);
  const [registro, setRegistro] = useState<RegistroDaTraducao | null>(null);
  const [doRegistro, setDoRegistro] = useState<Pedido<string> | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [convite, setConvite] = useState(false);

  const pedido: PedidoDeNuance = {
    texto: fala.texto,
    src: fala.lang,
    tgt: destino,
    contexto,
    falada,
  };

  /* A Nuance da frase, ao abrir — só com a capacidade e a nuvem autorizada. */
  useEffect(() => {
    if (!pode) return;
    let vivo = true;
    setDaNuance({ estado: 'carregando' });
    void carregarApi()
      .then(({ traduzirComNuance }) => traduzirComNuance(pedido))
      .then((r) => {
        if (!vivo) return;
        setDaNuance(r.ok === false ? { estado: 'erro', motivo: r.motivo } : { estado: 'ok', valor: r.valor.texto });
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por frase aberta
  }, [pode, fala.texto, destino]);

  const pedirFormas = async () => {
    setFormas({ estado: 'carregando' });
    const { pedirAlternativas } = await carregarApi();
    const r = await pedirAlternativas({ ...pedido, traducaoAtual: escolhida ?? fala.traducao });
    setFormas(r.ok === false ? { estado: 'erro', motivo: r.motivo } : { estado: 'ok', valor: r.valor });
  };

  const pedirRegistro = async (r: RegistroDaTraducao) => {
    setRegistro(r);
    setDoRegistro({ estado: 'carregando' });
    const { traduzirComNuance } = await carregarApi();
    const res = await traduzirComNuance({ ...pedido, registro: r });
    setDoRegistro(res.ok === false ? { estado: 'erro', motivo: res.motivo } : { estado: 'ok', valor: res.valor.texto });
  };

  const escolher = (traducao: string) => {
    setEscolhida(traducao);
    aoEscolher(traducao);
  };

  const opcao = (texto: string) => (
    <button
      key={texto}
      type="button"
      className="folha-acao"
      aria-pressed={escolhida === texto}
      onClick={() => escolher(texto)}
    >
      <Check aria-hidden /> <span>{texto}</span>
    </button>
  );

  if (!disponivel) {
    return (
      <section className="nuance-da-frase" aria-label={t('Tradução Nuance')} style={{ display: 'grid', gap: 10 }}>
        <p className="folha-rotulo">{t('Tradução Nuance')}</p>
        <div className="folha-grade">
          <button type="button" className="folha-acao" aria-expanded={convite} onClick={() => setConvite((v) => !v)}>
            <Lock aria-hidden /> {t('Outras formas')}
          </button>
          <button type="button" className="folha-acao" aria-expanded={convite} onClick={() => setConvite((v) => !v)}>
            <Lock aria-hidden /> {t('Formal ou informal')}
          </button>
        </div>
        {convite && (
          <ConviteDaNuance
            texto={t(
              'Com a Tradução Nuance do Premium, você vê outras formas de dizer cada frase e escolhe entre formal e informal.',
            )}
            aoConhecer={aoConhecer}
          />
        )}
      </section>
    );
  }

  if (!consentiu) {
    return (
      <section className="nuance-da-frase" aria-label={t('Tradução Nuance')} style={{ display: 'grid', gap: 10 }}>
        <p className="folha-rotulo">{t('Tradução Nuance')}</p>
        <p className="folha-def">{t('A Tradução Nuance usa a IA de nuvem, que você ainda não autorizou.')}</p>
        <button type="button" className="folha-acao" onClick={() => void autorizar()}>
          <Cloud aria-hidden /> {t('Autorizar IA de nuvem')}
        </button>
      </section>
    );
  }

  return (
    <section className="nuance-da-frase" aria-label={t('Tradução Nuance')} style={{ display: 'grid', gap: 10 }}>
      <p className="folha-rotulo">{t('Tradução Nuance')}</p>
      {daNuance?.estado === 'carregando' && <p className="folha-status">{t('Buscando a Tradução Nuance…')}</p>}
      {daNuance?.estado === 'erro' && <p className="folha-status">{fraseDaFalha(daNuance.motivo)}</p>}
      {daNuance?.estado === 'ok' &&
        (daNuance.valor.trim() === fala.traducao.trim() ? (
          <p className="folha-status">
            <Sparkles aria-hidden style={{ display: 'inline', verticalAlign: '-4px', marginRight: 6 }} />
            {t('A Tradução Nuance concorda com a legenda.')}
          </p>
        ) : (
          opcao(daNuance.valor)
        ))}
      <div className="folha-grade">
        <button
          type="button"
          className="folha-acao"
          aria-pressed={formas !== null}
          disabled={formas?.estado === 'carregando'}
          onClick={() => void pedirFormas()}
        >
          <Shuffle aria-hidden /> {t('Outras formas')}
        </button>
        <div className="folha-vel" role="group" aria-label={t('Registro')}>
          <button type="button" aria-pressed={registro === 'formal'} onClick={() => void pedirRegistro('formal')}>
            {t('Formal')}
          </button>
          <button type="button" aria-pressed={registro === 'informal'} onClick={() => void pedirRegistro('informal')}>
            {t('Informal')}
          </button>
        </div>
      </div>
      {doRegistro?.estado === 'carregando' && <p className="folha-status">{t('Traduzindo…')}</p>}
      {doRegistro?.estado === 'erro' && <p className="folha-status">{fraseDaFalha(doRegistro.motivo)}</p>}
      {doRegistro?.estado === 'ok' && opcao(doRegistro.valor)}
      {formas?.estado === 'carregando' && <p className="folha-status">{t('Buscando outras formas…')}</p>}
      {formas?.estado === 'erro' && <p className="folha-status">{fraseDaFalha(formas.motivo)}</p>}
      {formas?.estado === 'ok' && (
        <div className="nuance-formas" style={{ display: 'grid', gap: 8 }} data-testid="outras-formas">
          {formas.valor.opcoes.map(opcao)}
          {formas.valor.nota && <p className="folha-def">{formas.valor.nota}</p>}
        </div>
      )}
      {escolhida && cabeNoGlossario(fala.texto) && (
        <FixarNoGlossario
          key={escolhida}
          termo={fala.texto}
          traducaoInicial={escolhida}
          origem={fala.lang}
          destino={destino}
        />
      )}
    </section>
  );
}
