import { Download, FileText, Shield } from 'lucide-react';
import { Fragment } from 'react';

import { CRIADOR } from '../../../lib/criador';
import { toast } from '../../Toast';
import { Dialogo } from '../../ui';

/**
 * POLÍTICA DE PRIVACIDADE E TERMOS DE USO em diálogo — `dialogoLegal()` do protótipo aprovado:
 * o resumo em seções, "Baixar PDF" e "Fechar".
 *
 * O TEXTO É O DO PROTÓTIPO (decisão do dono para a tela Sobre), com uma troca: o contato aponta
 * para o endereço que a política oficial publica (`/privacidade.html`), e não para um endereço
 * que ainda não existe. O documento que vale juridicamente continua sendo a página completa — é ela
 * que "Baixar PDF" abre para imprimir/salvar.
 */

export type Documento = 'privacidade' | 'termos';

const LEGAL: Record<Documento, { titulo: string; versao: string; pagina: string; secoes: Array<[string, string]> }> = {
  privacidade: {
    titulo: 'Política de privacidade',
    versao: 'Versão 2 · 18/09/2026',
    pagina: '/privacidade.html',
    secoes: [
      [
        'O que fica no seu computador',
        'Áudio, transcrição, tradução e vocabulário, no modo local. Nada disso vai para um servidor.',
      ],
      [
        'O que vai para o servidor',
        'Conta (e-mail e senha cifrada), plano e pagamento, e métricas de uso só se você autorizar.',
      ],
      ['Menores de 12 anos', 'A conta é criada por um responsável, que autoriza e pode apagar tudo (LGPD, art. 14).'],
      ['Seus direitos', 'Ver, corrigir, baixar e apagar os seus dados em Ajustes → Privacidade (LGPD, art. 18).'],
      ['Contato', `${CRIADOR.contatoDePrivacidade}. Resposta em até 15 dias.`],
    ],
  },
  termos: {
    titulo: 'Termos de uso',
    versao: 'Versão 3 · 18/09/2026',
    pagina: '/termos.html',
    secoes: [
      ['Quem pode usar', 'A partir de 18 anos, ou com um responsável que aceita estes termos.'],
      [
        'Planos e cancelamento',
        'Cancele quando quiser em Planos. Nos primeiros 7 dias, o dinheiro volta inteiro (CDC, art. 49).',
      ],
      ['O conteúdo que você captura', 'É seu. O app não publica nem usa para treinar modelos.'],
      ['Uso justo', 'Não use o app para gravar pessoas sem que elas saibam.'],
    ],
  },
};

export default function DialogoLegal({ doc, aoFechar }: { doc: Documento; aoFechar: () => void }) {
  const d = LEGAL[doc];

  /** Abre o documento completo e chama a impressão do navegador ("Salvar como PDF"). */
  const baixarPdf = () => {
    const w = window.open(d.pagina, '_blank');
    if (!w) {
      toast.warn('O navegador bloqueou a janela. Libere pop-ups para baixar o PDF.');
      return;
    }
    w.addEventListener('load', () => w.print(), { once: true });
  };

  return (
    <Dialogo icone={doc === 'privacidade' ? Shield : FileText} titulo={d.titulo} sub={d.versao} aoFechar={aoFechar}>
      <div className="dlg-corpo rola-dlg texto-legal" tabIndex={0} role="region" aria-label="Texto">
        {d.secoes.map(([h, p]) => (
          <Fragment key={h}>
            <h3>{h}</h3>
            <p>{p}</p>
          </Fragment>
        ))}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={baixarPdf}>
          <Download aria-hidden /> Baixar PDF
        </button>
        <button type="button" className="btn btn-solid" onClick={(e) => e.currentTarget.closest('dialog')?.close()}>
          Fechar
        </button>
      </div>
    </Dialogo>
  );
}
