import '../../../styles/leitor.css';
import '../../../styles/etiquetas.css';
import '../../../styles/leituraAtiva.css';

import { useEffect, useMemo, useState } from 'react';

import { coberturaDoTexto } from '../../../core/leitura/coberturaDoTexto';
import type { FichaDeTexto } from '../../../core/leitura/fichaDeTexto';
import { carregarAcervo } from '../../../data/leitura/acervo';
import { comBaseDoApp } from '../../../lib/baseDoApp';
import { t } from '../../../lib/i18n';
import { marcarLido, textosLidos } from '../../../lib/leituraAtiva/preferencias';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';
import { esquecerTextoDoBoot, estadoParaUrl, lerTextoDoBoot, lerUrlAtual, navegarPara } from '../../../lib/rotas';
import Catalogo from './Catalogo';
import SessaoDeLeitura from './SessaoDeLeitura';
import { IDIOMA_DOS_TEXTOS, useConhecimento } from './useConhecimento';

/**
 * A LEITURA ATIVA (`/leitura` e `/leitura/<textoId>`; openspec `leitura-ativa-textos-simples`). Tela lazy, atrás da
 * flag `leitura_ativa` (o portão está no App). Com o id, abre o texto; sem, ou com um id que não existe, o catálogo.
 * Como o leitor de livros, o id é DA TELA: ela o lê da URL e escuta o `popstate`.
 */
export default function LeituraAtiva() {
  const [fichas, setFichas] = useState<FichaDeTexto[] | null>(null);
  const [erro, setErro] = useState(false);
  const [textoId, setTextoId] = useState<string | undefined>(
    () => lerUrlAtual().textoId ?? lerTextoDoBoot() ?? undefined,
  );
  const [lidos, setLidos] = useState<ReadonlySet<string>>(() => textosLidos());
  const conhecimento = useConhecimento();
  const protegido = perfilProtegido();

  useEffect(() => {
    let vivo = true;
    carregarAcervo()
      .then((f) => vivo && setFichas(f))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, []);
  /* O F5 em `/leitura/<id>`: o boot do App reescreve a URL antes de a tela montar; o id volta para a barra. */
  useEffect(() => {
    esquecerTextoDoBoot();
    if (textoId && lerUrlAtual().textoId !== textoId) {
      window.history.replaceState({}, '', comBaseDoApp(estadoParaUrl({ view: 'leituraAtiva', textoId })));
    }
    // Só na montagem: depois, quem manda no id é a URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const aoMudar = () => setTextoId(lerUrlAtual().textoId);
    window.addEventListener('popstate', aoMudar);
    return () => window.removeEventListener('popstate', aoMudar);
  }, []);

  /* A cobertura dos 12 textos, no aparelho (sem rede). */
  const cobertura = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fichas ?? []) {
      m.set(f.id, coberturaDoTexto(f.texto, IDIOMA_DOS_TEXTOS, conhecimento.conhecidas).porcentagem);
    }
    return m;
  }, [fichas, conhecimento.conhecidas]);

  if (erro) {
    return (
      <div className="q-palco la" data-testid="leitura-ativa">
        <div className="q-vazio" role="alert">
          <p>{t('Não deu para abrir as leituras agora.')}</p>
        </div>
      </div>
    );
  }
  if (!fichas) {
    return (
      <div className="q-palco la" data-testid="leitura-ativa" aria-busy="true">
        <div className="q-esqueleto" style={{ minHeight: 320 }} />
      </div>
    );
  }

  const ficha = textoId ? fichas.find((f) => f.id === textoId) : undefined;
  if (ficha) {
    return (
      <SessaoDeLeitura
        key={ficha.id}
        ficha={ficha}
        conhecimento={conhecimento}
        protegido={protegido}
        aoVoltar={() => navegarPara({ view: 'leituraAtiva' })}
        aoTerminar={(id) => setLidos(marcarLido(id))}
      />
    );
  }
  return (
    <Catalogo
      fichas={fichas}
      cobertura={cobertura}
      conhecimento={conhecimento}
      lidos={lidos}
      aoAbrir={(id) => navegarPara({ view: 'leituraAtiva', textoId: id })}
    />
  );
}
