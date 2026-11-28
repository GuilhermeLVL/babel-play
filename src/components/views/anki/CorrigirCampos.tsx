import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { EstruturaLida, PapelNaImportacao } from '../../../core/anki';
import { type BaralhoAnkiResumo, lerEstruturasDoBaralho, remapearBaralho } from '../../../data/apiAnki';
import { numero, t, tp } from '../../../lib/i18n';
import { toast } from '../../Toast';
import { MapeadorDeCampos } from './MapeadorDeCampos';

/**
 * "CORRIGIR CAMPOS" (openspec `motor-anki-mapeador`, bloco 5, flag `anki_mapeador`): o Mapeador aberto sobre um baralho
 * JÁ importado. Mostra os campos reais do baralho (lidos de `campos_brutos` pelo servidor), a pessoa troca os papéis e a
 * rota `POST /api/anki/decks/:id/remapear` refaz frente, verso e exemplo SEM reimportar o arquivo. Cartões que ela já
 * estuda não mudam de texto nem de histórico; o resultado diz quantas notas mudaram.
 */
export function CorrigirCampos({
  baralho,
  aoFechar,
  aoCorrigir,
}: {
  baralho: BaralhoAnkiResumo;
  aoFechar: () => void;
  /** Depois de corrigir: quem montou a tela relê as contagens do baralho. */
  aoCorrigir: () => void;
}) {
  const [estruturas, setEstruturas] = useState<EstruturaLida[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    lerEstruturasDoBaralho(baralho.id)
      .then((e) => vivo && setEstruturas(e))
      .catch((e) => vivo && setErro(String((e as Error)?.message ?? e)));
    return () => {
      vivo = false;
    };
  }, [baralho.id]);

  const confirmar = async (escolhas: Record<string, PapelNaImportacao[]>) => {
    setEnviando(true);
    try {
      const r = await remapearBaralho(
        baralho.id,
        Object.entries(escolhas).map(([estruturaHash, papeis]) => ({ estruturaHash, papeis })),
      );
      toast.ok(
        r.mudaram > 0
          ? tp(r.mudaram, '{n} nota foi corrigida em {nome}', '{n} notas foram corrigidas em {nome}', {
              n: numero(r.mudaram),
              nome: baralho.nome,
            })
          : t('Nenhuma nota mudou: os campos já estavam assim.'),
      );
      aoCorrigir();
      aoFechar();
    } catch (e) {
      toast.error(t('Não consegui corrigir os campos. Nada foi alterado.'), { detail: e });
      setEnviando(false);
    }
  };

  if (erro) {
    return (
      <p className="aviso-info warn" role="alert" data-testid="corrigir-campos-erro">
        {t('Não consegui ler os campos deste baralho.')}{' '}
        <button type="button" className="link" onClick={aoFechar}>
          {t('Fechar')}
        </button>
      </p>
    );
  }
  if (!estruturas) {
    return (
      <p className="mut" role="status">
        <Loader2 className="animate-spin" aria-hidden /> {t('Lendo os campos do baralho…')}
      </p>
    );
  }
  if (!estruturas.length) {
    return (
      <p className="aviso-info" data-testid="corrigir-campos-vazio">
        {t('Este baralho não guardou os campos originais, então não dá para corrigir sem reimportar o arquivo.')}{' '}
        <button type="button" className="link" onClick={aoFechar}>
          {t('Fechar')}
        </button>
      </p>
    );
  }
  return (
    <MapeadorDeCampos
      estruturas={estruturas}
      aoConfirmar={(escolhas) => void confirmar(escolhas)}
      aoCancelar={aoFechar}
      ocupado={enviando}
      introducao={t(
        'Troque o papel de cada campo e confira como as notas vão ficar. O arquivo não precisa ser enviado de novo, e o que você já estuda não muda.',
      )}
      rotuloConfirmar={t('Aplicar correção')}
    />
  );
}
