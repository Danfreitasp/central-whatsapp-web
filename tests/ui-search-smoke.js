const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { createWppRecipientRuntimeSource } = require('../src/dispatch-recipient');

app.setPath('userData', path.join(app.getPath('temp'), 'central-whatsapp-ui-search-smoke'));

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <style>
      body { font-family: sans-serif; }
      #new-chat, #result, #search, h2, footer { display: none; }
      button, input, [role="listitem"], footer div { width: 280px; height: 42px; }
    </style>
    <button id="open" aria-label="Nova conversa"><span data-icon="new-chat-outline">+</span></button>
    <section id="new-chat">
      <h2>Nova conversa</h2>
      <input id="search" aria-label="Pesquisar nome ou número" />
      <div id="result" role="listitem" tabindex="0">+55 32 8854-4521</div>
    </section>
    <footer><div contenteditable="true" role="textbox"></div></footer>
    <script>
      const open = document.querySelector('#open');
      const panel = document.querySelector('#new-chat');
      const search = document.querySelector('#search');
      const result = document.querySelector('#result');
      const footer = document.querySelector('footer');
      open.addEventListener('click', () => {
        panel.style.display = 'block';
        search.style.display = 'block';
        document.querySelector('h2').style.display = 'block';
      });
      search.addEventListener('input', () => { result.style.display = 'block'; });
      result.addEventListener('click', () => { footer.style.display = 'block'; });
    </script>
  `)}`);

  const runtimeSource = createWppRecipientRuntimeSource();
  const result = await window.webContents.executeJavaScript(`(async () => {
    globalThis.WPP = {
      chat: { getActiveChat: () => ({ id: { _serialized: '108854452100000@lid' } }) }
    };
    ${runtimeSource}
    return await openWppChatByPhoneSearch(globalThis.WPP, [
      '5532988544521@c.us',
      '553288544521@c.us'
    ]);
  })()`);

  if (result !== '108854452100000@lid') {
    throw new Error(`Conversa inesperada: ${result}`);
  }
  console.log('busca visual: número encontrado, resultado aberto e LID capturado');
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
