/** O popup tem UM botão: legendar a aba ativa, ou parar. O clique é o gesto que autoriza a captura. */
const botao = document.getElementById('botao');
const texto = document.getElementById('estado');

function mostrar({ capturando, erro }) {
  botao.textContent = capturando ? 'Parar' : 'Legendar esta aba';
  if (capturando) botao.setAttribute('data-parar', '');
  else botao.removeAttribute('data-parar');
  if (erro) texto.textContent = 'Não foi possível capturar esta aba. Tente em outra aba com som.';
  else if (capturando) texto.textContent = 'Legendando. Abra ou volte à aba do Frasy para ver.';
}

const falar = (m) => chrome.runtime.sendMessage({ alvo: 'sw', ...m });

botao.addEventListener('click', async () => {
  botao.disabled = true;
  const atual = await falar({ tipo: 'estado' });
  if (atual.capturando) mostrar(await falar({ tipo: 'parar' }));
  else {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    mostrar(await falar({ tipo: 'iniciar', aba: aba?.id }));
  }
  botao.disabled = false;
});

falar({ tipo: 'estado' }).then(mostrar);
