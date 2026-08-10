const campaignElements = {
  button: document.querySelector('#campaigns-button'),
  dialog: document.querySelector('#campaigns-dialog'),
  close: document.querySelector('#campaigns-close'),
  create: document.querySelector('#campaigns-new'),
  list: document.querySelector('#campaigns-list'),
  empty: document.querySelector('#campaigns-empty'),
  importPanel: document.querySelector('#campaigns-import'),
  importCancel: document.querySelector('#campaigns-import-cancel'),
  file: document.querySelector('#campaigns-file'),
  fileName: document.querySelector('#campaigns-file-name'),
  importName: document.querySelector('#campaigns-import-name'),
  importRepeat: document.querySelector('#campaigns-import-repeat'),
  importSummary: document.querySelector('#campaigns-import-summary'),
  importResult: document.querySelector('#campaigns-import-result'),
  importSave: document.querySelector('#campaigns-import-save')
};

let centralCampaigns = [];
let campaignRefreshTimer = null;
let campaignImport = null;
let highlightedCampaignId = '';
const CAMPAIGN_BATCH_SIZE_KEY = 'centralWhatsAppCampaignBatchSize';

function savedCampaignBatchSize() {
  return Math.max(1, Math.min(5000, Number(localStorage.getItem(CAMPAIGN_BATCH_SIZE_KEY)) || 50));
}

function campaignRuleLabel(days) {
  if (days === -1) return 'Bloqueio apenas nesta campanha';
  if (days === 0) return 'Nunca reenviar contatos anteriores';
  return `Não repetir por ${days} dias`;
}

function campaignAction(label, className, handler, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.disabled = disabled;
  button.onclick = handler;
  return button;
}

function resetCampaignImport(hide = true) {
  campaignImport = null;
  campaignElements.file.value = '';
  campaignElements.fileName.textContent = 'Nenhum arquivo selecionado.';
  campaignElements.importName.value = '';
  campaignElements.importSummary.hidden = true;
  campaignElements.importSummary.textContent = '';
  campaignElements.importResult.textContent = '';
  campaignElements.importSave.disabled = true;
  if (hide) campaignElements.importPanel.hidden = true;
}

function showCampaignImport() {
  resetCampaignImport(false);
  campaignElements.importPanel.hidden = false;
  renderCampaigns();
  campaignElements.file.click();
}

async function readCampaignFile() {
  const file = campaignElements.file.files?.[0];
  campaignImport = null;
  campaignElements.importSave.disabled = true;
  campaignElements.importSummary.hidden = true;
  campaignElements.importResult.textContent = '';
  campaignElements.fileName.textContent = file?.name || 'Nenhum arquivo selecionado.';
  if (!file) return;

  campaignElements.fileName.textContent = 'Lendo e validando a planilha…';
  try {
    const [imported, digest] = await Promise.all([
      readDispatchSpreadsheet(file),
      file.arrayBuffer().then(async (buffer) => {
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      })
    ]);
    const validation = validateDispatchRows(imported.rows, 20000, imported.detectedPhone.normalized);
    campaignImport = {
      leads: validation.leads,
      sourceName: file.name,
      sourceHash: digest,
      originalCount: imported.rows.length,
      invalidCount: validation.invalid,
      duplicateCount: validation.duplicates
    };
    campaignElements.importName.value = file.name.replace(/\.(xlsx?|csv)$/i, '').trim();
    campaignElements.fileName.textContent = `${file.name} · aba “${imported.sheetName}” · telefone em “${imported.detectedPhone.header}”`;
    campaignElements.importSummary.textContent = `${validation.leads.length.toLocaleString('pt-BR')} válido(s) · ${validation.invalid.toLocaleString('pt-BR')} inválido(s) · ${validation.duplicates.toLocaleString('pt-BR')} repetido(s)`;
    campaignElements.importSummary.hidden = false;
    campaignElements.importSave.disabled = !validation.leads.length;
  } catch (error) {
    campaignElements.fileName.textContent = file.name;
    campaignElements.importResult.textContent = error.message || String(error);
  }
}

async function saveCampaignImport() {
  if (!campaignImport?.leads.length) return;
  const name = campaignElements.importName.value.trim();
  if (!name) {
    campaignElements.importResult.textContent = 'Informe um nome para a campanha.';
    campaignElements.importName.focus();
    return;
  }
  campaignElements.importSave.disabled = true;
  campaignElements.importSave.textContent = 'Salvando…';
  campaignElements.importResult.textContent = 'Comparando com o histórico de envios…';
  try {
    const response = await window.centralWhatsApp.createCampaign({
      name,
      sourceName: campaignImport.sourceName,
      sourceHash: campaignImport.sourceHash,
      repeatDays: Number(campaignElements.importRepeat.value),
      originalCount: campaignImport.originalCount,
      invalidCount: campaignImport.invalidCount,
      duplicateCount: campaignImport.duplicateCount,
      leads: campaignImport.leads
    });
    if (!response?.ok) throw new Error(response?.error || 'Não foi possível salvar a campanha.');
    highlightedCampaignId = response.campaign.id;
    centralCampaigns = response.campaigns;
    resetCampaignImport(true);
    renderCampaigns();
  } catch (error) {
    campaignElements.importResult.textContent = error.message || String(error);
    campaignElements.importSave.disabled = false;
  } finally {
    campaignElements.importSave.textContent = 'Salvar campanha';
  }
}

async function loadCampaignForDispatch(campaign, mode, limit) {
  const batchSize = Math.max(1, Math.min(5000, Number(limit) || 50));
  const available = mode === 'errors' ? campaign.errorCount : campaign.pendingCount;
  const result = await window.centralWhatsApp.getCampaignContacts({ campaignId: campaign.id, mode, limit: 5000 });
  if (!result.leads.length) {
    alert(mode === 'errors' ? 'Esta campanha não possui erros para tentar novamente.' : 'Esta campanha não possui contatos pendentes.');
    return;
  }
  campaignElements.dialog.close();
  await window.loadCampaignIntoDispatch({ ...result, successTarget: Math.min(batchSize, available) });
}

function renderCampaigns() {
  campaignElements.list.replaceChildren();
  campaignElements.empty.hidden = centralCampaigns.length > 0 || !campaignElements.importPanel.hidden;
  for (const [index, campaign] of centralCampaigns.entries()) {
    const card = document.createElement('details');
    card.className = 'campaign-card';
    card.open = campaign.id === highlightedCampaignId;

    const summary = document.createElement('summary');
    const heading = document.createElement('div');
    heading.className = 'campaign-card-heading';
    const identity = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = campaign.name;
    const source = document.createElement('span');
    source.className = 'campaign-source';
    source.textContent = `${campaign.sourceName || 'Lista importada'} · ${campaignRuleLabel(campaign.repeatDays)}`;
    identity.append(title, source);
    const date = document.createElement('span');
    date.className = 'campaign-date';
    date.textContent = new Date(campaign.createdAt).toLocaleDateString('pt-BR');
    heading.append(identity, date);

    const counts = document.createElement('div');
    counts.className = 'campaign-counts';
    for (const [status, value, label] of [
      ['pending', campaign.pendingCount, 'Pendentes'],
      ['sent', campaign.sentCount, 'Enviados'],
      ['error', campaign.errorCount, 'Erros'],
      ['skipped', campaign.skippedCount, 'Já enviados']
    ]) {
      const count = document.createElement('div');
      count.className = `campaign-count ${status}`;
      const number = document.createElement('strong');
      number.textContent = value.toLocaleString('pt-BR');
      const text = document.createElement('span');
      text.textContent = label;
      count.append(number, text);
      counts.append(count);
    }
    summary.append(heading, counts);

    const body = document.createElement('div');
    body.className = 'campaign-card-body';
    const progress = document.createElement('div');
    progress.className = 'campaign-progress';
    const progressBar = document.createElement('i');
    const actionable = campaign.pendingCount + campaign.sentCount + campaign.errorCount;
    progressBar.style.width = `${actionable ? Math.round(campaign.sentCount / actionable * 100) : 0}%`;
    progress.append(progressBar);

    const batch = document.createElement('div');
    batch.className = 'campaign-batch-size';
    const batchLabel = document.createElement('label');
    batchLabel.textContent = 'Meta global de envios efetivos';
    const batchInput = document.createElement('input');
    batchInput.type = 'number';
    batchInput.min = '1';
    batchInput.max = '5000';
    batchInput.value = String(Math.min(Math.max(campaign.pendingCount, campaign.errorCount, 1), savedCampaignBatchSize()));
    batchInput.onchange = () => {
      const value = Math.max(1, Math.min(5000, Number(batchInput.value) || 50));
      batchInput.value = String(value);
      localStorage.setItem(CAMPAIGN_BATCH_SIZE_KEY, String(value));
    };
    batchLabel.append(batchInput);
    const batchHelp = document.createElement('span');
    batchHelp.textContent = 'As falhas serão repostas e a meta será compartilhada entre os números escolhidos.';
    batch.append(batchLabel, batchHelp);

    const actions = document.createElement('div');
    actions.className = 'campaign-actions';
    actions.append(
      campaignAction('Preparar distribuição', 'dispatch-primary', () => loadCampaignForDispatch(campaign, 'pending', Number(batchInput.value)), !campaign.pendingCount),
      campaignAction('Distribuir erros', 'dispatch-secondary', () => loadCampaignForDispatch(campaign, 'errors', Number(batchInput.value)), !campaign.errorCount),
      campaignAction('Exportar CSV', 'dispatch-secondary', async () => {
        const result = await window.centralWhatsApp.exportCampaign(campaign.id);
        if (result?.error) alert(result.error);
      })
    );
    if (campaign.skippedCount) {
      actions.append(campaignAction('Liberar já enviados', 'dispatch-secondary', async () => {
        if (!confirm(`Liberar ${campaign.skippedCount} contato(s) bloqueado(s) para envio?`)) return;
        const result = await window.centralWhatsApp.releaseCampaignSkipped(campaign.id);
        centralCampaigns = result.campaigns;
        highlightedCampaignId = campaign.id;
        renderCampaigns();
      }));
    }
    actions.append(campaignAction('Excluir', 'dispatch-secondary campaign-delete', async () => {
      if (!confirm(`Excluir a campanha “${campaign.name}”? O histórico global de números enviados será preservado.`)) return;
      centralCampaigns = await window.centralWhatsApp.removeCampaign(campaign.id);
      renderCampaigns();
    }));
    body.append(progress, batch, actions);
    card.append(summary, body);
    campaignElements.list.append(card);
    if (index === 0 && !highlightedCampaignId && centralCampaigns.length === 1) card.open = true;
  }
}

async function openCampaigns() {
  await window.centralWhatsApp.beginAdd();
  centralCampaigns = await window.centralWhatsApp.listCampaigns();
  renderCampaigns();
  campaignElements.dialog.showModal();
}

async function closeCampaigns() {
  resetCampaignImport(true);
  campaignElements.dialog.close();
  await window.centralWhatsApp.cancelAdd();
}

campaignElements.button.onclick = openCampaigns;
campaignElements.close.onclick = closeCampaigns;
campaignElements.dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeCampaigns();
});
campaignElements.create.onclick = showCampaignImport;
campaignElements.importCancel.onclick = () => { resetCampaignImport(true); renderCampaigns(); };
campaignElements.file.onclick = () => { campaignElements.file.value = ''; };
campaignElements.file.onchange = readCampaignFile;
campaignElements.importSave.onclick = saveCampaignImport;

window.centralWhatsApp.onCampaignsChanged?.(() => {
  if (!campaignElements.dialog.open) return;
  clearTimeout(campaignRefreshTimer);
  campaignRefreshTimer = setTimeout(async () => {
    centralCampaigns = await window.centralWhatsApp.listCampaigns();
    renderCampaigns();
  }, 150);
});
