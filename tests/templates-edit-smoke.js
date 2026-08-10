const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'templates-edit-preload.js'),
      contextIsolation: true,
      sandbox: false,
      partition: `templates-edit-smoke-${Date.now()}`
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const headerFits = document.querySelector('header').scrollWidth <= document.querySelector('header').clientWidth;
    document.querySelector('#templates-button').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cards = [...document.querySelectorAll('.template-item')];
    const collapsedInitially = cards.every((card) => !card.classList.contains('expanded') && card.querySelector('.template-content').hidden);
    const collapsedHeight = cards[0].getBoundingClientRect().height;
    cards[0].querySelector('.template-summary').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const firstExpanded = cards[0].classList.contains('expanded');
    const expandedCardRect = cards[0].getBoundingClientRect();
    const expandedContentRect = cards[0].querySelector('.template-content').getBoundingClientRect();
    const firstContentVisible = !cards[0].querySelector('.template-content').hidden
      && expandedCardRect.height > collapsedHeight
      && expandedContentRect.height > 0
      && expandedContentRect.bottom <= expandedCardRect.bottom + 1;
    cards[1].querySelector('.template-summary').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const accordionWorked = !cards[0].classList.contains('expanded') && cards[0].querySelector('.template-content').hidden && cards[1].classList.contains('expanded');
    cards[0].querySelector('.template-summary').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const actionsBefore = [...cards[0].querySelectorAll('.template-actions button')].map((button) => button.textContent);
    cards[0].querySelector('.template-actions .edit').click();
    const editingLabel = document.querySelector('#template-submit').textContent;
    document.querySelector('#template-name').value = 'Sem nome — Editado';
    document.querySelector('#template-body').value = 'Texto atualizado\\n\\n1 - SIM\\n2 - NÃO';
    document.querySelector('#template-form').requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      headerFits,
      actionsBefore,
      collapsedInitially,
      firstExpanded,
      firstContentVisible,
      accordionWorked,
      editingLabel,
      titleAfter: document.querySelector('.template-item h3').textContent,
      submitAfter: document.querySelector('#template-submit').textContent
    };
  })()`);
  assert.equal(result.headerFits, true);
  assert.deepEqual(result.actionsBefore, ['Excluir', 'Copiar', 'Editar']);
  assert.equal(result.collapsedInitially, true);
  assert.equal(result.firstExpanded, true);
  assert.equal(result.firstContentVisible, true);
  assert.equal(result.accordionWorked, true);
  assert.equal(result.editingLabel, 'Salvar alterações');
  assert.equal(result.titleAfter, 'Sem nome — Editado');
  assert.equal(result.submitAfter, 'Salvar modelo');
  console.log('cabeçalho, modelos recolhidos e edição validados');
  window.destroy();
  app.quit();
});
