const profilesNode = document.querySelector('#profiles');
const dialog = document.querySelector('#profile-dialog');
const form = document.querySelector('#profile-form');
const emptyState = document.querySelector('#empty-state');
let activeProfileId = null;
let profiles = [];
const zoomOut = document.querySelector('#zoom-out');
const zoomIn = document.querySelector('#zoom-in');
const zoomLabel = document.querySelector('#zoom-label');
const templatesDialog = document.querySelector('#templates-dialog');
const templatesList = document.querySelector('#templates-list');
const templateForm = document.querySelector('#template-form');
const renameDialog = document.querySelector('#rename-dialog');
const renameForm = document.querySelector('#rename-form');
const labelsDialog = document.querySelector('#labels-dialog');
const chatLabelsList = document.querySelector('#chat-labels-list');
const labelForm = document.querySelector('#label-form');
let templates = [];
let templateEditingId = null;
let currentChatLabels = null;
let profileToRenameId = null;
let draggedProfileId = null;
let profileSelectionRevision = 0;

function activeProfile() {
  return profiles.find((profile) => profile.id === activeProfileId);
}

function renderZoom() {
  const profile = activeProfile();
  const zoom = profile?.zoom || 1;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  zoomOut.disabled = !profile || zoom <= 0.75;
  zoomIn.disabled = !profile || zoom >= 1.5;
  zoomLabel.disabled = !profile || zoom === 1;
}

async function changeZoom(nextZoom) {
  const profile = activeProfile();
  if (!profile) return;
  const result = await window.centralWhatsApp.setZoom({ id: profile.id, zoom: nextZoom });
  profile.zoom = result.zoom;
  renderZoom();
}

function renderTemplates() {
  templatesList.replaceChildren();
  if (!templates.length) {
    const empty = document.createElement('p');
    empty.className = 'templates-empty';
    empty.textContent = 'Nenhum modelo salvo ainda.';
    templatesList.append(empty);
    return;
  }
  for (const [index, template] of templates.entries()) {
    const item = document.createElement('article');
    item.className = 'template-item';
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'template-summary';
    summary.setAttribute('aria-expanded', 'false');
    const summaryText = document.createElement('div');
    summaryText.className = 'template-summary-text';
    const title = document.createElement('h3');
    title.textContent = template.name;
    const hint = document.createElement('small');
    hint.textContent = 'Clique para visualizar o texto e as opções';
    const chevron = document.createElement('span');
    chevron.className = 'template-chevron';
    chevron.textContent = '⌄';
    summaryText.append(title, hint);
    summary.append(summaryText, chevron);
    const body = document.createElement('p');
    body.textContent = template.body;
    const actions = document.createElement('div');
    actions.className = 'template-actions';
    const remove = document.createElement('button');
    remove.textContent = 'Excluir';
    remove.onclick = async () => {
      templates = await window.centralWhatsApp.removeTemplate(template.id);
      if (templateEditingId === template.id) resetTemplateEditor();
      renderTemplates();
    };
    const copy = document.createElement('button');
    copy.className = 'copy';
    copy.textContent = 'Copiar';
    copy.onclick = async () => {
      await window.centralWhatsApp.copyText(template.body);
      copy.textContent = 'Copiado';
      setTimeout(() => { copy.textContent = 'Copiar'; }, 1300);
    };
    const edit = document.createElement('button');
    edit.className = 'edit';
    edit.textContent = 'Editar';
    edit.onclick = () => {
      templateEditingId = template.id;
      document.querySelector('#template-name').value = template.name;
      document.querySelector('#template-body').value = template.body;
      document.querySelector('#template-submit').textContent = 'Salvar alterações';
      document.querySelector('#template-edit-cancel').hidden = false;
      templateForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector('#template-name').focus();
    };
    actions.append(remove, copy, edit);
    const content = document.createElement('div');
    content.className = 'template-content';
    content.id = `template-content-${index}`;
    content.hidden = true;
    summary.setAttribute('aria-controls', content.id);
    content.append(body, actions);
    item.append(summary, content);
    summary.onclick = () => {
      const shouldExpand = content.hidden;
      templatesList.querySelectorAll('.template-item.expanded').forEach((opened) => {
        if (opened === item) return;
        opened.classList.remove('expanded');
        opened.querySelector('.template-summary').setAttribute('aria-expanded', 'false');
        opened.querySelector('.template-content').hidden = true;
      });
      item.classList.toggle('expanded', shouldExpand);
      summary.setAttribute('aria-expanded', String(shouldExpand));
      content.hidden = !shouldExpand;
    };
    templatesList.append(item);
  }
}

function resetTemplateEditor() {
  templateEditingId = null;
  templateForm.reset();
  document.querySelector('#template-submit').textContent = 'Salvar modelo';
  document.querySelector('#template-edit-cancel').hidden = true;
}

async function openTemplates() {
  await window.centralWhatsApp.beginAdd();
  templates = await window.centralWhatsApp.listTemplates();
  resetTemplateEditor();
  renderTemplates();
  templatesDialog.showModal();
}

async function closeTemplates() {
  resetTemplateEditor();
  templatesDialog.close();
  await window.centralWhatsApp.cancelAdd();
}

function renderChatLabels() {
  chatLabelsList.replaceChildren();
  const labels = currentChatLabels?.labels || [];
  if (!labels.length) {
    const empty = document.createElement('p');
    empty.className = 'labels-empty';
    empty.textContent = 'Crie uma etiqueta abaixo para começar.';
    chatLabelsList.append(empty);
    return;
  }
  for (const label of labels) {
    const item = document.createElement('div');
    item.className = `chat-label ${label.selected ? 'selected' : ''}`;
    item.style.setProperty('--label-color', label.color);
    item.textContent = label.name;
    item.title = label.selected ? 'Remover deste chat' : 'Aplicar neste chat';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.onclick = async () => {
      currentChatLabels.labels = await window.centralWhatsApp.toggleChatLabel({
        profileId: currentChatLabels.profileId,
        chatKey: currentChatLabels.chatKey,
        labelId: label.id
      });
      renderChatLabels();
    };
    item.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        item.click();
      }
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'label-remove';
    remove.textContent = '×';
    remove.title = `Excluir etiqueta ${label.name}`;
    remove.onclick = async (event) => {
      event.stopPropagation();
      if (!confirm(`Excluir a etiqueta “${label.name}” de todos os chats?`)) return;
      await window.centralWhatsApp.removeLabel(label.id);
      currentChatLabels.labels = currentChatLabels.labels.filter((itemLabel) => itemLabel.id !== label.id);
      renderChatLabels();
    };
    item.append(remove);
    chatLabelsList.append(item);
  }
}

async function openLabels() {
  try {
    currentChatLabels = await window.centralWhatsApp.getCurrentChatLabels();
  } catch (error) {
    alert(error.message || 'Não foi possível identificar a conversa atual.');
    return;
  }
  await window.centralWhatsApp.beginAdd();
  document.querySelector('#labels-chat-name').textContent = `Conversa: ${currentChatLabels.chatName}`;
  renderChatLabels();
  labelsDialog.showModal();
}

async function closeLabels() {
  labelsDialog.close();
  await window.centralWhatsApp.cancelAdd();
}

function render() {
  profilesNode.replaceChildren();
  emptyState.hidden = profiles.length > 0;
  for (const profile of profiles) {
    const sending = (window.centralWhatsAppDispatchLockedProfileIds || []).includes(profile.id);
    const row = document.createElement('div');
    row.className = `profile ${profile.id === activeProfileId ? 'active' : ''} ${sending ? 'sending' : ''}`;
    row.draggable = !sending;
    const badge = profile.unread ? `<b class="unread">${profile.unread > 99 ? '99+' : profile.unread}</b>` : '';
    const sendingBadge = sending ? '<em class="sending-badge">Em lote</em>' : '';
    row.innerHTML = `<button class="profile-select" title="${sending ? 'Acompanhar, pausar ou parar este lote' : `Abrir ${profile.name}`}"><i style="background:${profile.color}"></i><span>${profile.name}</span>${badge}${sendingBadge}</button><button class="rename" title="Editar identificação" aria-label="Editar ${profile.name}">✎</button><button class="remove" title="Remover perfil" aria-label="Remover ${profile.name}">×</button>`;
    row.querySelector('.profile-select').disabled = false;
    row.querySelector('.rename').disabled = sending;
    row.querySelector('.remove').disabled = sending;
    row.querySelector('.profile-select').onclick = async () => {
      if (sending) {
        if (typeof window.openCentralDispatchForProfile === 'function') window.openCentralDispatchForProfile(profile.id);
        return;
      }
      profileSelectionRevision += 1;
      const revision = profileSelectionRevision;
      const result = await window.centralWhatsApp.selectProfile(profile.id);
      if (revision !== profileSelectionRevision) return;
      activeProfileId = result.activeProfileId;
      profile.zoom = result.zoom;
      render();
    };
    row.querySelector('.rename').onclick = async () => {
      profileToRenameId = profile.id;
      document.querySelector('#rename-name').value = profile.name;
      await window.centralWhatsApp.beginAdd();
      renameDialog.showModal();
    };
    row.querySelector('.remove').onclick = async () => {
      if (!confirm(`Remover o perfil “${profile.name}”? A sessão salva deste número continuará no computador.`)) return;
      const result = await window.centralWhatsApp.removeProfile(profile.id);
      profiles = result.profiles;
      activeProfileId = result.activeProfileId;
      render();
    };
    row.addEventListener('dragstart', (event) => {
      draggedProfileId = profile.id;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', profile.id);
    });
    row.addEventListener('dragend', () => {
      draggedProfileId = null;
      document.querySelectorAll('.profile').forEach((item) => item.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    row.addEventListener('dragover', (event) => {
      if (!draggedProfileId || draggedProfileId === profile.id) return;
      event.preventDefault();
      const before = event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      row.classList.toggle('drop-before', before);
      row.classList.toggle('drop-after', !before);
      event.dataTransfer.dropEffect = 'move';
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
    row.addEventListener('drop', async (event) => {
      event.preventDefault();
      if (!draggedProfileId || draggedProfileId === profile.id) return;
      const before = event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      profiles = await window.centralWhatsApp.reorderProfiles({ id: draggedProfileId, targetId: profile.id, position: before ? 'before' : 'after' });
      render();
    });
    profilesNode.append(row);
  }
  renderZoom();
}

document.querySelector('#add-button').onclick = async () => {
  await window.centralWhatsApp.beginAdd();
  dialog.showModal();
};
document.querySelector('#cancel').onclick = async () => {
  dialog.close();
  await window.centralWhatsApp.cancelAdd();
};
dialog.addEventListener('cancel', () => window.centralWhatsApp.cancelAdd());
document.querySelector('#labels-close').onclick = closeLabels;
labelsDialog.addEventListener('cancel', () => window.centralWhatsApp.cancelAdd());
labelForm.onsubmit = async (event) => {
  event.preventDefault();
  const labels = await window.centralWhatsApp.addLabel({
    name: document.querySelector('#label-name').value,
    color: document.querySelector('#label-color').value
  });
  const selectedIds = new Set(currentChatLabels.labels.filter((label) => label.selected).map((label) => label.id));
  currentChatLabels.labels = labels.map((label) => ({ ...label, selected: selectedIds.has(label.id) }));
  labelForm.reset();
  document.querySelector('#label-color').value = '#2dd4bf';
  renderChatLabels();
};
document.querySelector('#rename-cancel').onclick = async () => {
  renameDialog.close();
  await window.centralWhatsApp.cancelAdd();
};
renameDialog.addEventListener('cancel', () => window.centralWhatsApp.cancelAdd());
renameForm.onsubmit = async (event) => {
  event.preventDefault();
  profiles = await window.centralWhatsApp.renameProfile({ id: profileToRenameId, name: document.querySelector('#rename-name').value });
  renameDialog.close();
  await window.centralWhatsApp.cancelAdd();
  render();
};
document.querySelector('#templates-button').onclick = openTemplates;
document.querySelector('#templates-close').onclick = closeTemplates;
document.querySelector('#template-edit-cancel').onclick = resetTemplateEditor;
templatesDialog.addEventListener('cancel', () => {
  resetTemplateEditor();
  window.centralWhatsApp.cancelAdd();
});
templateForm.onsubmit = async (event) => {
  event.preventDefault();
  try {
    const input = {
      id: templateEditingId,
      name: document.querySelector('#template-name').value,
      body: document.querySelector('#template-body').value
    };
    templates = templateEditingId
      ? await window.centralWhatsApp.updateTemplate(input)
      : await window.centralWhatsApp.addTemplate(input);
    resetTemplateEditor();
    renderTemplates();
  } catch (error) {
    alert(error.message || 'Não foi possível salvar o modelo.');
  }
};
zoomOut.onclick = () => changeZoom((activeProfile()?.zoom || 1) - 0.1);
zoomIn.onclick = () => changeZoom((activeProfile()?.zoom || 1) + 0.1);
zoomLabel.onclick = () => changeZoom(1);
form.onsubmit = async (event) => {
  event.preventDefault();
  const result = await window.centralWhatsApp.addProfile({ name: document.querySelector('#name').value, color: document.querySelector('#color').value });
  profiles = result.profiles;
  activeProfileId = result.activeProfileId;
  form.reset();
  dialog.close();
  await window.centralWhatsApp.cancelAdd();
  render();
};

window.centralWhatsApp.listProfiles().then((items) => {
  profiles = items;
  activeProfileId = items.find((item) => item.active)?.id || items[0]?.id || null;
  render();
});
window.centralWhatsApp.onProfileActivated?.(async ({ profileId }) => {
  if (!profiles.some((profile) => profile.id === profileId)) return;
  document.querySelectorAll('dialog[open]').forEach((openDialog) => openDialog.close());
  const backgroundState = document.querySelector('#dispatch-background-state');
  if (backgroundState) backgroundState.hidden = true;
  activeProfileId = profileId;
  await window.centralWhatsApp.cancelAdd();
  render();
});
window.centralWhatsApp.onUnreadChanged(({ profileId, unread }) => {
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return;
  profile.unread = unread;
  render();
});
