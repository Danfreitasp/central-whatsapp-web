const dispatchElements = {
  button: document.querySelector('#dispatch-button'),
  backgroundState: document.querySelector('#dispatch-background-state'),
  backgroundText: document.querySelector('#dispatch-background-text'),
  dialog: document.querySelector('#dispatch-dialog'),
  close: document.querySelector('#dispatch-close'),
  headingDescription: document.querySelector('#dispatch-heading-description'),
  workflowSingle: document.querySelector('#dispatch-workflow-single'),
  workflowCampaign: document.querySelector('#dispatch-workflow-campaign'),
  profileName: document.querySelector('#dispatch-profile-name'),
  campaignPicker: document.querySelector('#dispatch-campaign-picker'),
  campaignSelect: document.querySelector('#dispatch-campaign-select'),
  campaignContactMode: document.querySelector('#dispatch-campaign-contact-mode'),
  campaignTarget: document.querySelector('#dispatch-campaign-target'),
  campaignPickerSummary: document.querySelector('#dispatch-campaign-picker-summary'),
  campaignLoad: document.querySelector('#dispatch-campaign-load'),
  sourceTitle: document.querySelector('#dispatch-source-title'),
  sourceSheet: document.querySelector('#dispatch-source-sheet'),
  sourceManual: document.querySelector('#dispatch-source-manual'),
  sheetPanel: document.querySelector('#dispatch-sheet-panel'),
  manualPanel: document.querySelector('#dispatch-manual-panel'),
  file: document.querySelector('#dispatch-file'),
  fileName: document.querySelector('#dispatch-file-name'),
  manualPhones: document.querySelector('#dispatch-manual-phones'),
  limit: document.querySelector('#dispatch-limit'),
  limitLabel: document.querySelector('#dispatch-limit-label'),
  validate: document.querySelector('#dispatch-validate'),
  preview: document.querySelector('#dispatch-preview'),
  distribution: document.querySelector('#dispatch-distribution'),
  distributionCount: document.querySelector('#dispatch-distribution-count'),
  distributionMode: document.querySelector('#dispatch-distribution-mode'),
  distributionProfiles: document.querySelector('#dispatch-distribution-profiles'),
  distributionSummary: document.querySelector('#dispatch-distribution-summary'),
  campaignSave: document.querySelector('#dispatch-campaign-save'),
  campaignName: document.querySelector('#dispatch-campaign-name'),
  campaignRepeat: document.querySelector('#dispatch-campaign-repeat'),
  campaignCreate: document.querySelector('#dispatch-campaign-create'),
  campaignResult: document.querySelector('#dispatch-campaign-result'),
  messageMode: document.querySelector('#dispatch-message-mode'),
  singleMessage: document.querySelector('#dispatch-single-message'),
  variantMessage: document.querySelector('#dispatch-variant-message'),
  savedTemplate: document.querySelector('#dispatch-saved-template'),
  variantCount: document.querySelector('#dispatch-variant-count'),
  variantList: document.querySelector('#dispatch-variant-list'),
  variantStatus: document.querySelector('#dispatch-variant-status'),
  senderName: document.querySelector('#dispatch-sender-name'),
  message: document.querySelector('#dispatch-message'),
  messagePreviewCard: document.querySelector('#dispatch-message-preview-card'),
  previewRecipient: document.querySelector('#dispatch-preview-recipient'),
  previewIdentity: document.querySelector('#dispatch-preview-identity'),
  messagePreview: document.querySelector('#dispatch-message-preview'),
  delay: document.querySelector('#dispatch-delay'),
  jitter: document.querySelector('#dispatch-jitter'),
  scheduledAt: document.querySelector('#dispatch-scheduled-at'),
  schedule: document.querySelector('#dispatch-schedule'),
  schedulesCard: document.querySelector('#dispatch-schedules-card'),
  schedulesCount: document.querySelector('#dispatch-schedules-count'),
  schedulesList: document.querySelector('#dispatch-schedules-list'),
  distributionDashboard: document.querySelector('#dispatch-distribution-dashboard'),
  distributionTitle: document.querySelector('#dispatch-distribution-title'),
  distributionOverall: document.querySelector('#dispatch-distribution-overall'),
  distributionProgress: document.querySelector('#dispatch-distribution-progress'),
  distributionWorkers: document.querySelector('#dispatch-distribution-workers'),
  distributionPause: document.querySelector('#dispatch-distribution-pause'),
  distributionStop: document.querySelector('#dispatch-distribution-stop'),
  status: document.querySelector('#dispatch-status'),
  statusText: document.querySelector('#dispatch-status-text'),
  progress: document.querySelector('#dispatch-progress-bar'),
  log: document.querySelector('#dispatch-log'),
  failures: document.querySelector('#dispatch-failures'),
  failuresCount: document.querySelector('#dispatch-failures-count'),
  failuresList: document.querySelector('#dispatch-failures-list'),
  saveFailures: document.querySelector('#dispatch-save-failures'),
  stop: document.querySelector('#dispatch-stop'),
  pause: document.querySelector('#dispatch-pause'),
  start: document.querySelector('#dispatch-start')
};

const DISPATCH_PREFERENCES_KEY = 'centralWhatsAppDispatchPreferences';
const DISPATCH_HEADER_ALIASES = {
  nome: ['nome', 'cliente', 'nome_completo', 'nome_cliente'],
  telefone: ['telefone', 'telefones', 'tel', 'cel', 'celular', 'celulares', 'whatsapp', 'whats', 'zap', 'fone', 'fones', 'numero', 'numeros', 'numero_telefone', 'numero_celular', 'telefone_cliente', 'tel_cliente', 'phone', 'mobile'],
  url: ['url', 'link', 'link_proposta', 'link_simulacao'],
  qtdOportunidades: ['qtd_oportunidades', 'quantidade_oportunidades', 'oportunidades'],
  valorDisponivel: ['valor_disponivel', 'valor_liquido', 'disponivel'],
  valorEmprestimo: ['valor_emprestimo', 'valor_do_emprestimo', 'emprestimo'],
  parcela: ['parcela', 'valor_parcela'],
  qtdContratos: ['qtd_contratos', 'quantidade_contratos', 'contratos']
};

let dispatchSource = 'sheet';
let dispatchRows = [];
let dispatchPhoneColumn = 'telefone';
let dispatchLeads = [];
let dispatchCampaignImportLeads = [];
let dispatchCampaignImportMeta = null;
let dispatchCampaignId = '';
let dispatchSuccessTarget = 0;
let dispatchCampaignMode = 'pending';
let dispatchDistributionMode = false;
let dispatchWorkflowMode = 'single';
let dispatchCampaignChoices = [];
let singleDispatchDraft = null;
let activeDistributions = [];
let focusedDistributionId = '';
let dispatchRunning = false;
let dispatchPaused = false;
let dispatchSending = false;
let dispatchReleaseBetweenSends = false;
let dispatchProfileId = null;
let dispatchLockedProfileId = null;
let dispatchDone = 0;
let dispatchTotal = 0;
let scheduledDispatches = [];
let dispatchFailures = [];
let dispatchSavedTemplates = [];
let dispatchVariantAssignments = [];
let dispatchVariantPreferenceIds = [];
const dispatchRuntimeStates = new Map();
const dispatchFailureReports = new Map();

window.centralWhatsAppDispatchLockedProfileIds = [];

function normalizeDispatchHeader(value) {
  return globalThis.DispatchSpreadsheetColumns.normalizeHeader(value);
}

function normalizeDispatchRow(row) {
  return Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [normalizeDispatchHeader(key), value])
  );
}

function dispatchColumn(row, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return '';
}

function normalizeDispatchPhone(value) {
  let digits = typeof value === 'number' && Number.isFinite(value)
    ? String(Math.trunc(value))
    : String(value ?? '').replace(/\D/g, '');
  digits = digits.replace(/^0+/, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (!/^\d{10,11}$/.test(digits)) return null;
  return { areaCode: digits.slice(0, 2), number: digits.slice(2), e164: `55${digits}` };
}

function parseDispatchNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value ?? '').trim().replace(/[R$\s]/g, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

const DISPATCH_BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function dispatchPreviewCurrency(value) {
  const number = Number(value);
  return Number.isFinite(number) ? DISPATCH_BRL.format(number) : 'R$ 0,00';
}

function dispatchPreviewCapitalize(value) {
  return String(value || '')
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((word) => word.length > 2 ? word[0].toLocaleUpperCase('pt-BR') + word.slice(1) : word)
    .join(' ');
}

function renderDispatchPreviewTemplate(template, lead, senderName) {
  const name = lead?.person?.name || '';
  const sender = String(senderName || '').trim();
  const available = lead?.opportunities?.available || {};
  const won = lead?.opportunities?.won || {};
  const values = {
    '{nome}': dispatchPreviewCapitalize(name),
    '{primeiroNome}': dispatchPreviewCapitalize(name.split(/\s+/)[0] || ''),
    '{url}': lead?.url || '',
    '{meuNome}': sender,
    '{meuPrimeiroNome}': sender.split(/\s+/)[0] || '',
    '{vendedor}': sender.split(/\s+/)[0] || sender,
    '{qtdOportunidades}': String(available.count || 0),
    '{valorDisponivel}': dispatchPreviewCurrency(available.sumNetAmount),
    '{valorEmprestimo}': dispatchPreviewCurrency(available.sumLoanAmount),
    '{parcela}': dispatchPreviewCurrency(available.sumInstallmentAmount),
    '{qtdContratos}': String(won.count || 0)
  };
  let result = String(template || '');
  for (const [placeholder, value] of Object.entries(values)) result = result.split(placeholder).join(value);
  return result;
}

function dispatchUsesVariants() {
  return dispatchElements.messageMode.value === 'variants';
}

function selectedDispatchVariants() {
  const selectedIds = new Set(
    [...dispatchElements.variantList.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value)
  );
  return dispatchSavedTemplates.filter((template) => selectedIds.has(template.id));
}

function expectedDispatchVariantCount() {
  return Math.max(2, Math.min(20, Number(dispatchElements.variantCount.value) || 2));
}

function dispatchHasValidMessage() {
  if (!dispatchUsesVariants()) return Boolean(dispatchElements.message.value.trim());
  const selected = selectedDispatchVariants();
  const uniqueBodies = new Set(selected.map((template) => template.body.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')));
  return selected.length === expectedDispatchVariantCount() && uniqueBodies.size === selected.length;
}

function refreshDispatchVariantAssignments() {
  if (!dispatchUsesVariants() || !dispatchLeads.length) {
    dispatchVariantAssignments = [];
    return;
  }
  const selected = selectedDispatchVariants();
  dispatchVariantAssignments = selected.length === expectedDispatchVariantCount()
    ? globalThis.DispatchMessageVariants.assignMessageVariants(dispatchLeads.length, selected)
    : [];
}

function dispatchTemplateForRecipient(index) {
  if (!dispatchUsesVariants()) {
    return { id: '', name: '', body: dispatchElements.message.value };
  }
  return dispatchVariantAssignments[index] || { id: '', name: '', body: '' };
}

function dispatchLeadsWithMessages() {
  const singleOption = dispatchElements.savedTemplate.selectedOptions[0];
  const singleModelName = singleOption?.value
    ? `${singleOption.textContent}${singleOption.dataset.body === dispatchElements.message.value ? '' : ' (editado)'}`
    : 'Mensagem digitada';
  return dispatchLeads.map((lead, index) => {
    const selected = dispatchTemplateForRecipient(index);
    return {
      ...lead,
      messageTemplate: dispatchUsesVariants() ? selected.body : dispatchElements.message.value,
      messageTemplateName: dispatchUsesVariants() ? selected.name : singleModelName
    };
  });
}

function selectedDistributionProfileIds() {
  if (!dispatchDistributionMode) return [activeProfileId].filter(Boolean);
  return [...dispatchElements.distributionProfiles.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => input.value);
}

function selectedDistributionTargets() {
  return Object.fromEntries(
    [...dispatchElements.distributionProfiles.querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => {
        const quota = checkbox.closest('label')?.querySelector('.dispatch-distribution-quota');
        return [checkbox.value, Math.max(0, Number(quota?.value) || 0)];
      })
  );
}

function customDistributionQuotasValid() {
  if (!dispatchDistributionMode || dispatchElements.distributionMode.value !== 'custom') return true;
  const targets = selectedDistributionTargets();
  const values = Object.values(targets);
  return values.length > 0 && values.every((value) => value > 0)
    && values.reduce((sum, value) => sum + value, 0) === Math.max(1, Number(dispatchElements.limit.value) || 1);
}

function updateDistributionSelectionSummary() {
  const selected = selectedDistributionProfileIds();
  const custom = dispatchElements.distributionMode.value === 'custom';
  dispatchElements.distribution.classList.toggle('custom', custom);
  dispatchElements.distributionCount.textContent = `${selected.length} selecionado(s)`;
  if (!selected.length) {
    dispatchElements.distributionSummary.textContent = 'Selecione pelo menos um número disponível.';
  } else if (!custom) {
    const target = Math.max(1, Number(dispatchElements.limit.value) || dispatchSuccessTarget || 1);
    const base = Math.floor(target / selected.length);
    const extra = target % selected.length;
    const forecast = selected.map((profileId, index) => {
      const profile = profiles.find((item) => item.id === profileId);
      const value = base + (index < extra ? 1 : 0);
      const quota = dispatchElements.distributionProfiles.querySelector(`input[type="checkbox"][value="${CSS.escape(profileId)}"]`)?.closest('label')?.querySelector('.dispatch-distribution-quota');
      if (quota) quota.value = String(Math.max(1, value));
      return `${profile?.name || 'Número'}: ~${value}`;
    });
    dispatchElements.distributionSummary.textContent = `Previsão equilibrada · ${forecast.join(' · ')}. As cotas se ajustam automaticamente após falhas ou pausas.`;
    dispatchElements.distributionSummary.classList.remove('dispatch-distribution-summary-warning');
  } else {
    const target = Math.max(1, Number(dispatchElements.limit.value) || 1);
    const targets = selectedDistributionTargets();
    const sum = Object.values(targets).reduce((total, value) => total + value, 0);
    dispatchElements.distributionSummary.textContent = sum === target && Object.values(targets).every((value) => value > 0)
      ? `Cotas válidas: ${sum} envio(s) efetivo(s) distribuídos entre ${selected.length} número(s).`
      : `A soma das cotas é ${sum}. Ajuste os valores para totalizar a meta global de ${target}.`;
    dispatchElements.distributionSummary.classList.toggle('dispatch-distribution-summary-warning', !customDistributionQuotasValid());
  }
  updateDispatchButtons();
}

function renderDistributionProfileSelector() {
  const previous = new Set(selectedDistributionProfileIds());
  dispatchElements.distributionProfiles.replaceChildren();
  for (const profile of profiles) {
    const runtime = dispatchRuntimeStates.get(profile.id);
    const busy = Boolean(runtime?.running && runtime.distributionId !== focusedDistributionId);
    const option = document.createElement('label');
    option.className = `dispatch-distribution-profile ${busy ? 'busy' : ''}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = profile.id;
    checkbox.disabled = busy;
    checkbox.checked = !busy && (previous.has(profile.id) || (!previous.size && profile.id === activeProfileId));
    checkbox.onchange = updateDistributionSelectionSummary;
    const name = document.createElement('strong');
    name.textContent = profile.name;
    const status = document.createElement('span');
    status.textContent = busy ? 'Executando outro lote' : 'Disponível';
    const quota = document.createElement('input');
    quota.type = 'number';
    quota.min = '1';
    quota.max = '5000';
    quota.value = '1';
    quota.className = 'dispatch-distribution-quota';
    quota.title = 'Cota de envios efetivos deste número';
    quota.oninput = updateDistributionSelectionSummary;
    option.append(checkbox, name, status, quota);
    dispatchElements.distributionProfiles.append(option);
  }
  updateDistributionSelectionSummary();
}

function mergeDistribution(distribution) {
  if (!distribution?.id) return;
  const index = activeDistributions.findIndex((item) => item.id === distribution.id);
  if (index >= 0) activeDistributions[index] = distribution;
  else activeDistributions.unshift(distribution);
  focusedDistributionId ||= distribution.id;
}

function distributionWorkerStatus(worker, distributionRunning = false) {
  if (distributionRunning && worker.workerError) return worker.workerError;
  if (!worker.running) return 'Concluído';
  if (worker.paused) return 'Pausado';
  if (worker.sending) return 'Enviando agora';
  return 'Aguardando o próximo contato';
}

function renderDistributionDashboard() {
  const distribution = activeDistributions.find((item) => item.id === focusedDistributionId)
    || activeDistributions.find((item) => item.running)
    || activeDistributions[0];
  dispatchElements.distributionDashboard.hidden = !distribution;
  if (!distribution) return;
  focusedDistributionId = distribution.id;
  dispatchElements.distributionTitle.textContent = distribution.running
    ? `Distribuição · ${distribution.campaignName}`
    : `Última distribuição · ${distribution.campaignName}`;
  dispatchElements.distributionOverall.textContent = `${distribution.sent} de ${distribution.target} efetivos · ${distribution.attempted} tentativa(s) · ${distribution.errors} falha(s)`;
  dispatchElements.distributionProgress.style.width = `${distribution.target ? Math.min(100, Math.round(distribution.sent / distribution.target * 100)) : 0}%`;
  dispatchElements.distributionPause.disabled = !distribution.running;
  dispatchElements.distributionStop.disabled = !distribution.running;
  dispatchElements.distributionPause.textContent = distribution.paused ? 'Continuar todos' : 'Pausar todos';
  dispatchElements.distributionWorkers.replaceChildren();
  for (const worker of distribution.workers) {
    const card = document.createElement('article');
    card.className = 'dispatch-distribution-worker';
    const heading = document.createElement('header');
    const name = document.createElement('strong');
    name.textContent = worker.profileName;
    const status = document.createElement('em');
    status.textContent = distributionWorkerStatus(worker, distribution.running);
    if (distribution.running && worker.workerError) status.className = 'error';
    heading.append(name, status);
    const stats = document.createElement('span');
    stats.textContent = `${worker.sent}${worker.target ? ` de ${worker.target}` : ''} enviado(s) · ${worker.errors} falha(s) · ${worker.done} tentativa(s)`;
    card.append(heading, stats);
    if (worker.running) {
      const actions = document.createElement('div');
      actions.className = 'dispatch-worker-actions';
      const pause = document.createElement('button');
      pause.type = 'button';
      pause.className = 'dispatch-secondary';
      pause.textContent = worker.paused ? 'Continuar' : 'Pausar';
      pause.onclick = async () => {
        await window.centralWhatsApp.toggleDispatchPause(worker.profileId);
      };
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'dispatch-danger';
      stop.textContent = 'Parar número';
      stop.onclick = async () => {
        await window.centralWhatsApp.stopDispatch(worker.profileId);
      };
      actions.append(pause, stop);
      card.append(actions);
    }
    dispatchElements.distributionWorkers.append(card);
  }
}

async function refreshDistributions() {
  activeDistributions = await window.centralWhatsApp.listDistributions();
  if (!activeDistributions.some((item) => item.id === focusedDistributionId)) {
    focusedDistributionId = activeDistributions.find((item) => item.running)?.id || activeDistributions[0]?.id || '';
  }
  renderDistributionDashboard();
  updateDispatchHeader();
}

function renderDispatchVariantStatus() {
  const expected = expectedDispatchVariantCount();
  const selectedTemplates = selectedDispatchVariants();
  const selected = selectedTemplates.length;
  const uniqueBodies = new Set(selectedTemplates.map((template) => template.body.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')));
  if (dispatchSavedTemplates.length < 2) {
    dispatchElements.variantStatus.textContent = 'Salve pelo menos 2 textos na aba Modelos para usar o rodízio.';
    dispatchElements.variantStatus.className = 'dispatch-variant-status warning';
    return;
  }
  const valid = selected === expected && uniqueBodies.size === selected;
  dispatchElements.variantStatus.textContent = valid
    ? `${selected} modelo(s) selecionado(s). Cada número alternará os envios concluídos; falhas não quebram o rodízio.`
    : (uniqueBodies.size !== selected
      ? 'Existem modelos com o mesmo texto. Escolha textos realmente diferentes.'
      : `Selecione exatamente ${expected} modelo(s). Selecionados agora: ${selected}.`);
  dispatchElements.variantStatus.className = `dispatch-variant-status ${valid ? '' : 'warning'}`;
}

function renderDispatchVariantSelector(preferredIds = null) {
  const expected = Math.min(Math.max(2, expectedDispatchVariantCount()), Math.max(2, dispatchSavedTemplates.length));
  dispatchElements.variantCount.max = String(Math.min(20, Math.max(2, dispatchSavedTemplates.length)));
  dispatchElements.variantCount.value = String(expected);
  const validIds = new Set(dispatchSavedTemplates.map((template) => template.id));
  const desired = new Set(
    (preferredIds || selectedDispatchVariants().map((item) => item.id))
      .filter((id) => validIds.has(id))
      .slice(0, expected)
  );
  for (const template of dispatchSavedTemplates) {
    if (desired.size >= expected) break;
    desired.add(template.id);
  }

  dispatchElements.variantList.replaceChildren();
  for (const template of dispatchSavedTemplates) {
    const option = document.createElement('label');
    option.className = 'dispatch-variant-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = template.id;
    checkbox.checked = desired.has(template.id);
    const name = document.createElement('strong');
    name.textContent = template.name;
    const excerpt = document.createElement('span');
    excerpt.textContent = template.body.replace(/\s+/g, ' ').slice(0, 100);
    checkbox.onchange = () => {
      if (selectedDispatchVariants().length > expected) checkbox.checked = false;
      dispatchVariantPreferenceIds = selectedDispatchVariants().map((item) => item.id);
      refreshDispatchVariantAssignments();
      renderDispatchVariantStatus();
      renderDispatchMessagePreview();
      updateDispatchButtons();
      saveDispatchPreferences();
    };
    option.append(checkbox, name, excerpt);
    dispatchElements.variantList.append(option);
  }
  dispatchVariantPreferenceIds = selectedDispatchVariants().map((item) => item.id);
  refreshDispatchVariantAssignments();
  renderDispatchVariantStatus();
}

function updateDispatchMessageMode() {
  const variants = dispatchUsesVariants();
  dispatchElements.singleMessage.hidden = variants;
  dispatchElements.variantMessage.hidden = !variants;
  if (variants) {
    renderDispatchVariantSelector(dispatchVariantPreferenceIds);
  } else {
    dispatchVariantAssignments = [];
  }
  renderDispatchMessagePreview();
  updateDispatchButtons();
}

function renderDispatchMessagePreview() {
  if (!dispatchLeads.length) {
    dispatchElements.messagePreviewCard.hidden = true;
    return;
  }

  const selectedIndex = Math.max(0, Math.min(dispatchLeads.length - 1, Number(dispatchElements.previewRecipient.value) || 0));
  const lead = dispatchLeads[selectedIndex];
  const selectedTemplate = dispatchTemplateForRecipient(selectedIndex);
  const template = selectedTemplate.body;
  const senderName = dispatchElements.senderName.value.trim();
  const name = lead.person?.name || '';
  const phone = `+55 ${lead.phone.areaCode} ${lead.phone.number}`;
  const usesCustomerName = /\{(?:nome|primeiroNome)\}/.test(template);
  const usesSenderName = /\{(?:meuNome|meuPrimeiroNome|vendedor)\}/.test(template);
  const warnings = [];
  if (usesCustomerName && !name) warnings.push('Atenção: esta linha não trouxe nome; a variável ficará vazia.');
  if (usesSenderName && !senderName) warnings.push('Preencha o nome do atendente para substituir a variável correspondente.');

  const identity = [
    name ? `Nome importado: ${name}.` : 'Nome não informado nesta linha.',
    `Telefone: ${phone}.`,
    ...(selectedTemplate.name ? [`Modelo atribuído: ${selectedTemplate.name}.`] : []),
    ...warnings
  ];
  dispatchElements.previewIdentity.textContent = identity.join(' ');
  dispatchElements.previewIdentity.className = `dispatch-preview-identity ${warnings.length ? 'warning' : 'ok'}`;
  dispatchElements.messagePreview.textContent = renderDispatchPreviewTemplate(template, lead, senderName) || 'A mensagem está vazia.';
  dispatchElements.messagePreviewCard.hidden = false;
}

function populateDispatchMessagePreview() {
  dispatchElements.previewRecipient.replaceChildren();
  dispatchLeads.forEach((lead, index) => {
    const phone = `+55 ${lead.phone.areaCode} ${lead.phone.number}`;
    const label = lead.person?.name ? `${index + 1}. ${lead.person.name} — ${phone}` : `${index + 1}. Sem nome — ${phone}`;
    dispatchElements.previewRecipient.append(new Option(label, String(index)));
  });
  dispatchElements.previewRecipient.value = '0';
  renderDispatchMessagePreview();
}

function dispatchLimit() {
  return Math.max(1, Math.min(5000, Number(dispatchElements.limit.value) || 50));
}

function manualDispatchRows() {
  return dispatchElements.manualPhones.value
    .split(/\r?\n/)
    .map((telefone) => ({ telefone: telefone.trim() }))
    .filter((row) => row.telefone);
}

function validateDispatchRows(rows, limit, phoneColumn = 'telefone') {
  const leads = [];
  const phones = new Set();
  let invalid = 0;
  let duplicates = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = normalizeDispatchRow(rows[index]);
    const phoneValue = Object.prototype.hasOwnProperty.call(row, phoneColumn)
      ? row[phoneColumn]
      : dispatchColumn(row, DISPATCH_HEADER_ALIASES.telefone);
    const phone = normalizeDispatchPhone(phoneValue);
    if (!phone) {
      invalid += 1;
      continue;
    }
    if (phones.has(phone.e164)) {
      duplicates += 1;
      continue;
    }
    phones.add(phone.e164);
    const name = String(dispatchColumn(row, DISPATCH_HEADER_ALIASES.nome) ?? '').trim();
    leads.push({
      uuid: `central-dispatch-${index + 1}`,
      person: { name },
      phone: { active: true, areaCode: phone.areaCode, number: phone.number },
      url: String(dispatchColumn(row, DISPATCH_HEADER_ALIASES.url) ?? '').trim(),
      opportunities: {
        available: {
          count: Math.max(0, Math.trunc(parseDispatchNumber(dispatchColumn(row, DISPATCH_HEADER_ALIASES.qtdOportunidades)))),
          sumNetAmount: parseDispatchNumber(dispatchColumn(row, DISPATCH_HEADER_ALIASES.valorDisponivel)),
          sumLoanAmount: parseDispatchNumber(dispatchColumn(row, DISPATCH_HEADER_ALIASES.valorEmprestimo)),
          sumInstallmentAmount: parseDispatchNumber(dispatchColumn(row, DISPATCH_HEADER_ALIASES.parcela))
        },
        won: {
          count: Math.max(0, Math.trunc(parseDispatchNumber(dispatchColumn(row, DISPATCH_HEADER_ALIASES.qtdContratos))))
        }
      }
    });
    if (leads.length >= limit) break;
  }
  return { leads, invalid, duplicates };
}

async function readDispatchSpreadsheet(file) {
  if (!globalThis.XLSX) throw new Error('O leitor de Excel não foi carregado.');
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(extension)) throw new Error('Selecione um arquivo .xlsx, .xls ou .csv.');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não possui abas.');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
  if (!rows.length) throw new Error('A primeira aba não possui dados.');
  const detectedPhone = globalThis.DispatchSpreadsheetColumns.detectPhoneColumn(rows);
  if (!detectedPhone) {
    throw new Error('Não foi possível identificar uma coluna de telefone. Use um título como telefone, número, tel, celular ou WhatsApp.');
  }
  return { rows, sheetName, detectedPhone };
}

function dispatchHasInput() {
  return dispatchSource === 'sheet' ? dispatchRows.length > 0 : manualDispatchRows().length > 0;
}

function dispatchPhoneLabel(lead) {
  return `+55 ${lead?.phone?.areaCode || ''} ${lead?.phone?.number || ''}`.trim();
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function prepareScheduleDateInput() {
  const minimum = new Date(Date.now() + 60_000);
  dispatchElements.scheduledAt.min = localDateTimeValue(minimum);
  if (!dispatchElements.scheduledAt.value || new Date(dispatchElements.scheduledAt.value).getTime() <= Date.now()) {
    dispatchElements.scheduledAt.value = localDateTimeValue(new Date(Date.now() + 5 * 60_000));
  }
}

function renderScheduledDispatches() {
  dispatchElements.schedulesList.replaceChildren();
  dispatchElements.schedulesCard.hidden = scheduledDispatches.length === 0;
  dispatchElements.schedulesCount.textContent = `${scheduledDispatches.length} registro(s)`;
  for (const schedule of scheduledDispatches) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `${schedule.profileName} · ${schedule.leadCount} telefone(s)`;
    const detail = document.createElement('span');
    detail.textContent = new Date(schedule.scheduledAt).toLocaleString('pt-BR');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = schedule.status === 'failed' ? 'dispatch-danger' : 'dispatch-secondary';
    remove.textContent = schedule.status === 'failed' ? 'Remover' : 'Cancelar';
    remove.onclick = async () => {
      scheduledDispatches = await window.centralWhatsApp.cancelScheduledDispatch(schedule.id);
      renderScheduledDispatches();
    };
    item.append(title, detail, remove);
    if (schedule.status === 'waiting' || schedule.status === 'failed') {
      const status = document.createElement('em');
      status.textContent = schedule.status === 'waiting'
        ? 'Aguardando o lote atual terminar.'
        : `Não iniciado: ${schedule.error || 'erro desconhecido'}`;
      item.append(status);
    }
    dispatchElements.schedulesList.append(item);
  }
}

function renderDispatchFailures() {
  dispatchElements.failuresList.replaceChildren();
  dispatchElements.failures.hidden = dispatchFailures.length === 0;
  dispatchElements.failuresCount.textContent = `${dispatchFailures.length} mensagem(ns) não enviada(s)`;
  for (const failure of dispatchFailures) {
    const item = document.createElement('li');
    const identity = document.createElement('strong');
    identity.textContent = failure.name ? `${failure.name} · +${failure.phone}` : `+${failure.phone}`;
    const reason = document.createElement('span');
    reason.textContent = failure.reason;
    item.append(identity, reason);
    dispatchElements.failuresList.append(item);
  }
}

function updateDispatchWorkflowTabs() {
  const single = dispatchWorkflowMode === 'single';
  dispatchElements.workflowSingle.classList.toggle('active', single);
  dispatchElements.workflowCampaign.classList.toggle('active', !single);
  dispatchElements.workflowSingle.setAttribute('aria-selected', String(single));
  dispatchElements.workflowCampaign.setAttribute('aria-selected', String(!single));
}

function captureSingleDispatchDraft() {
  singleDispatchDraft = {
    source: dispatchSource,
    rows: dispatchRows,
    phoneColumn: dispatchPhoneColumn,
    leads: dispatchLeads,
    campaignImportLeads: dispatchCampaignImportLeads,
    campaignImportMeta: dispatchCampaignImportMeta,
    fileName: dispatchElements.fileName.textContent,
    manualPhones: dispatchElements.manualPhones.value,
    limit: dispatchElements.limit.value,
    previewText: dispatchElements.preview.textContent,
    previewHidden: dispatchElements.preview.hidden,
    campaignSaveHidden: dispatchElements.campaignSave.hidden,
    campaignResult: dispatchElements.campaignResult.textContent
  };
}

function restoreSingleDispatchDraft() {
  dispatchWorkflowMode = 'single';
  dispatchDistributionMode = false;
  dispatchCampaignId = '';
  dispatchSuccessTarget = 0;
  dispatchCampaignMode = 'pending';
  focusedDistributionId = '';
  dispatchElements.dialog.classList.remove('campaign-loaded', 'campaign-selecting');
  dispatchElements.campaignPicker.hidden = true;
  dispatchElements.distribution.hidden = true;
  dispatchElements.headingDescription.textContent = 'Prepare uma planilha temporária ou cole números para enviar pelo número selecionado.';
  dispatchElements.start.textContent = 'Iniciar disparo';
  dispatchElements.sourceTitle.textContent = 'Telefones';
  dispatchElements.limitLabel.textContent = 'Limite do lote';
  dispatchElements.limit.disabled = false;

  const draft = singleDispatchDraft;
  if (draft) {
    dispatchSource = draft.source;
    dispatchRows = draft.rows;
    dispatchPhoneColumn = draft.phoneColumn;
    dispatchLeads = draft.leads;
    dispatchCampaignImportLeads = draft.campaignImportLeads;
    dispatchCampaignImportMeta = draft.campaignImportMeta;
    dispatchElements.fileName.textContent = draft.fileName;
    dispatchElements.manualPhones.value = draft.manualPhones;
    dispatchElements.limit.value = draft.limit;
    dispatchElements.preview.textContent = draft.previewText;
    dispatchElements.preview.hidden = draft.previewHidden;
    dispatchElements.campaignSave.hidden = draft.campaignSaveHidden;
    dispatchElements.campaignResult.textContent = draft.campaignResult;
  } else {
    dispatchSource = 'sheet';
    dispatchRows = [];
    dispatchPhoneColumn = 'telefone';
    dispatchLeads = [];
    dispatchCampaignImportLeads = [];
    dispatchCampaignImportMeta = null;
    dispatchElements.file.value = '';
    dispatchElements.fileName.textContent = 'Nenhum arquivo selecionado.';
    dispatchElements.manualPhones.value = '';
    dispatchElements.preview.hidden = true;
    dispatchElements.campaignSave.hidden = true;
  }

  const sheet = dispatchSource === 'sheet';
  dispatchElements.sheetPanel.hidden = !sheet;
  dispatchElements.manualPanel.hidden = sheet;
  dispatchElements.sourceSheet.classList.toggle('active', sheet);
  dispatchElements.sourceManual.classList.toggle('active', !sheet);
  dispatchElements.sourceSheet.setAttribute('aria-selected', String(sheet));
  dispatchElements.sourceManual.setAttribute('aria-selected', String(!sheet));
  updateDispatchWorkflowTabs();
  refreshDispatchVariantAssignments();
  populateDispatchMessagePreview();
  updateDispatchButtons();
}

function selectedCampaignChoice() {
  return dispatchCampaignChoices.find((campaign) => campaign.id === dispatchElements.campaignSelect.value);
}

function updateCampaignPickerSummary() {
  const campaign = selectedCampaignChoice();
  const errorsMode = dispatchElements.campaignContactMode.value === 'errors';
  const available = campaign ? (errorsMode ? campaign.errorCount : campaign.pendingCount) : 0;
  dispatchElements.campaignPickerSummary.textContent = campaign
    ? `${available} contato(s) ${errorsMode ? 'com erro' : 'pendente(s)'} · ${campaign.sentCount} já enviado(s).`
    : 'Nenhuma campanha salva. Importe uma planilha pelo menu Campanhas.';
  dispatchElements.campaignTarget.max = String(Math.max(1, available));
  dispatchElements.campaignTarget.value = String(Math.max(1, Math.min(available || 1, Number(dispatchElements.campaignTarget.value) || 50)));
  dispatchElements.campaignLoad.disabled = !campaign || available === 0;
}

async function populateCampaignPicker(preferredId = dispatchCampaignId) {
  dispatchCampaignChoices = await window.centralWhatsApp.listCampaigns();
  dispatchElements.campaignSelect.replaceChildren();
  if (!dispatchCampaignChoices.length) {
    dispatchElements.campaignSelect.append(new Option('Nenhuma campanha salva', ''));
  } else {
    for (const campaign of dispatchCampaignChoices) {
      dispatchElements.campaignSelect.append(new Option(campaign.name, campaign.id));
    }
    if (preferredId && dispatchCampaignChoices.some((campaign) => campaign.id === preferredId)) {
      dispatchElements.campaignSelect.value = preferredId;
    }
  }
  updateCampaignPickerSummary();
}

async function switchDispatchWorkflow(mode) {
  if (dispatchRunning) return;
  if (mode === 'single') {
    restoreSingleDispatchDraft();
    setDispatchStatus(dispatchLeads.length
      ? `${dispatchLeads.length} contato(s) temporário(s) pronto(s).`
      : 'Disparo único: selecione uma planilha temporária ou cole os números.');
    return;
  }

  if (dispatchWorkflowMode === 'single') captureSingleDispatchDraft();
  dispatchWorkflowMode = 'campaign';
  dispatchDistributionMode = false;
  dispatchCampaignId = '';
  dispatchSuccessTarget = 0;
  dispatchElements.dialog.classList.remove('campaign-loaded');
  dispatchElements.dialog.classList.add('campaign-selecting');
  dispatchElements.campaignPicker.hidden = false;
  dispatchElements.distribution.hidden = true;
  dispatchElements.headingDescription.textContent = 'Escolha uma campanha salva para preparar e distribuir os envios.';
  updateDispatchWorkflowTabs();
  await populateCampaignPicker();
  setDispatchStatus('Modo Campanha: escolha a origem e a meta efetiva do lote.');
  updateDispatchButtons();
}

function setDispatchSource(source) {
  if (dispatchRunning) return;
  dispatchWorkflowMode = 'single';
  dispatchDistributionMode = false;
  dispatchElements.dialog.classList.remove('campaign-loaded', 'campaign-selecting');
  dispatchElements.campaignPicker.hidden = true;
  dispatchElements.distribution.hidden = true;
  dispatchElements.headingDescription.textContent = 'Prepare uma lista avulsa pelo número atualmente selecionado.';
  dispatchElements.start.textContent = 'Iniciar disparo';
  dispatchElements.sourceTitle.textContent = 'Telefones';
  dispatchElements.limitLabel.textContent = 'Limite do lote';
  dispatchCampaignId = '';
  dispatchSuccessTarget = 0;
  dispatchCampaignMode = 'pending';
  dispatchElements.limit.disabled = false;
  dispatchSource = source === 'manual' ? 'manual' : 'sheet';
  const sheet = dispatchSource === 'sheet';
  dispatchElements.sheetPanel.hidden = !sheet;
  dispatchElements.manualPanel.hidden = sheet;
  dispatchElements.sourceSheet.classList.toggle('active', sheet);
  dispatchElements.sourceManual.classList.toggle('active', !sheet);
  dispatchElements.sourceSheet.setAttribute('aria-selected', String(sheet));
  dispatchElements.sourceManual.setAttribute('aria-selected', String(!sheet));
  updateDispatchWorkflowTabs();
  invalidateDispatchValidation();
}

function invalidateDispatchValidation() {
  dispatchLeads = [];
  dispatchCampaignImportLeads = [];
  dispatchCampaignImportMeta = null;
  dispatchElements.preview.hidden = true;
  dispatchElements.campaignSave.hidden = true;
  dispatchElements.messagePreviewCard.hidden = true;
  dispatchElements.previewRecipient.replaceChildren();
  updateDispatchButtons();
}

function updateDispatchButtons() {
  const selectedProfiles = selectedDistributionProfileIds();
  const workflowLocked = dispatchRunning || activeDistributions.some((item) => item.running);
  dispatchElements.workflowSingle.disabled = workflowLocked;
  dispatchElements.workflowCampaign.disabled = workflowLocked;
  dispatchElements.validate.textContent = dispatchSource === 'sheet' ? 'Validar planilha' : 'Validar lista';
  dispatchElements.validate.disabled = dispatchRunning || !dispatchHasInput();
  dispatchElements.start.disabled = dispatchRunning || !dispatchLeads.length || !dispatchHasValidMessage()
    || (dispatchDistributionMode && (!selectedProfiles.length || !customDistributionQuotasValid()));
  dispatchElements.schedule.disabled = dispatchRunning || !dispatchLeads.length
    || !dispatchHasValidMessage() || !dispatchElements.scheduledAt.value
    || (dispatchDistributionMode && selectedProfiles.length > 1);
  dispatchElements.schedule.title = dispatchDistributionMode && selectedProfiles.length > 1
    ? 'O agendamento com vários números será disponibilizado em uma próxima etapa.'
    : '';
  dispatchElements.stop.disabled = !dispatchRunning;
  dispatchElements.pause.disabled = !dispatchRunning;
  dispatchElements.pause.textContent = dispatchPaused ? 'Continuar' : 'Pausar';
  dispatchElements.close.disabled = false;
}

function updateDispatchHeader() {
  const runningStates = [...dispatchRuntimeStates.values()].filter((state) => state.running);
  const runningDistributions = activeDistributions.filter((item) => item.running).length;
  const avulsos = runningStates.filter((state) => !state.distributionId).length;
  const activeCount = runningDistributions + avulsos;
  dispatchElements.button.classList.toggle('running', activeCount > 0);
  dispatchElements.button.textContent = activeCount
    ? `Disparos · ${activeCount} ativo(s)`
    : 'Disparos';
  dispatchElements.button.title = activeCount
    ? 'Existem disparos em segundo plano — selecione um número para acompanhar'
    : 'Importar telefones e iniciar disparos';
}

function syncDispatchProfileLocks() {
  window.centralWhatsAppDispatchLockedProfileIds = [...dispatchRuntimeStates.values()]
    .filter((state) => state.running && state.lockedProfileId)
    .map((state) => state.lockedProfileId);
}

function applyDispatchRuntimeState(state, focus = false) {
  if (!state?.profileId) return;
  dispatchRuntimeStates.set(state.profileId, state);
  syncDispatchProfileLocks();
  updateDispatchHeader();
  if (typeof render === 'function') render();
  if (!focus && state.profileId !== dispatchProfileId) return;
  dispatchRunning = Boolean(state?.running);
  dispatchPaused = Boolean(state?.paused);
  dispatchSending = Boolean(state?.sending);
  dispatchReleaseBetweenSends = Boolean(state?.releaseBetweenSends);
  dispatchDone = Number(state?.done) || 0;
  dispatchTotal = Number(state?.total) || 0;
  dispatchSuccessTarget = Number(state?.successTarget) || 0;
  if (state?.campaignId) dispatchCampaignId = state.campaignId;
  dispatchProfileId = state?.profileId || null;
  dispatchLockedProfileId = state?.lockedProfileId || null;
  updateDispatchButtons();
}

function showDispatchBackgroundState(state = null) {
  const current = state || {
    profileId: dispatchProfileId,
    paused: dispatchPaused,
    sending: dispatchSending,
    releaseBetweenSends: dispatchReleaseBetweenSends
  };
  const profile = profiles.find((item) => item.id === current.profileId);
  if (current.paused) {
    dispatchElements.backgroundText.textContent = profile
      ? `${profile.name} está livre. O lote está pausado antes do próximo envio.`
      : 'O lote está pausado antes do próximo envio.';
  } else if (current.releaseBetweenSends && !current.sending) {
    dispatchElements.backgroundText.textContent = profile
      ? `${profile.name} está livre durante o intervalo e será reservado somente no próximo envio.`
      : 'O remetente está livre durante o intervalo.';
  } else {
    dispatchElements.backgroundText.textContent = profile
      ? `${profile.name} está enviando uma mensagem agora.`
      : 'O número remetente está enviando uma mensagem agora.';
  }
  dispatchElements.backgroundState.hidden = false;
}

function hideDispatchBackgroundState() {
  dispatchElements.backgroundState.hidden = true;
}

function setDispatchStatus(text, done = 0, total = 0) {
  dispatchElements.status.hidden = false;
  dispatchElements.statusText.textContent = text;
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
  dispatchElements.progress.style.width = `${percentage}%`;
}

function addDispatchLog(message, level = '') {
  dispatchElements.status.hidden = false;
  const item = document.createElement('li');
  item.className = level;
  item.textContent = message;
  dispatchElements.log.append(item);
  while (dispatchElements.log.children.length > 300) dispatchElements.log.firstElementChild.remove();
  dispatchElements.log.scrollTop = dispatchElements.log.scrollHeight;
}

function loadDispatchPreferences() {
  try {
    const preferences = JSON.parse(localStorage.getItem(DISPATCH_PREFERENCES_KEY) || '{}');
    dispatchElements.senderName.value = String(preferences.senderName || '');
    dispatchElements.message.value = typeof preferences.message === 'string'
      ? preferences.message
      : 'Olá! Tudo bem? Estou entrando em contato para conversar com você.';
    dispatchElements.delay.value = Math.max(3, Number(preferences.delay) || 12);
    dispatchElements.jitter.checked = preferences.jitter !== false;
    dispatchElements.limit.value = Math.max(1, Math.min(5000, Number(preferences.limit) || 50));
    dispatchElements.messageMode.value = preferences.messageMode === 'variants' ? 'variants' : 'single';
    dispatchElements.variantCount.value = Math.max(2, Math.min(20, Number(preferences.variantCount) || 2));
    dispatchVariantPreferenceIds = Array.isArray(preferences.variantTemplateIds)
      ? preferences.variantTemplateIds.map(String)
      : [];
  } catch {
    dispatchElements.message.value = 'Olá! Tudo bem? Estou entrando em contato para conversar com você.';
  }
}

function saveDispatchPreferences() {
  localStorage.setItem(DISPATCH_PREFERENCES_KEY, JSON.stringify({
    senderName: dispatchElements.senderName.value.trim(),
    message: dispatchElements.message.value,
    delay: Math.max(3, Number(dispatchElements.delay.value) || 12),
    jitter: dispatchElements.jitter.checked,
    limit: dispatchLimit(),
    messageMode: dispatchElements.messageMode.value,
    variantCount: expectedDispatchVariantCount(),
    variantTemplateIds: dispatchElements.variantList.children.length
      ? selectedDispatchVariants().map((template) => template.id)
      : dispatchVariantPreferenceIds
  }));
}

async function populateDispatchTemplates() {
  const saved = await window.centralWhatsApp.listTemplates();
  dispatchSavedTemplates = saved;
  dispatchElements.savedTemplate.replaceChildren(new Option('Escrever mensagem', ''));
  for (const template of saved) {
    const option = new Option(template.name, template.id);
    option.dataset.body = template.body;
    dispatchElements.savedTemplate.append(option);
  }
  updateDispatchMessageMode();
}

async function openDispatch(profileId = activeProfileId) {
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    alert('Conecte e selecione um número do WhatsApp antes de abrir os disparos.');
    return;
  }
  dispatchProfileId = profile.id;
  const state = await window.centralWhatsApp.getDispatchState(profile.id);
  applyDispatchRuntimeState(state, true);
  dispatchFailures = dispatchFailureReports.get(profile.id) || [];
  renderDispatchFailures();
  await window.centralWhatsApp.beginAdd();
  dispatchElements.profileName.textContent = profile.name;
  await populateDispatchTemplates();
  prepareScheduleDateInput();
  scheduledDispatches = await window.centralWhatsApp.listScheduledDispatches();
  renderScheduledDispatches();
  await refreshDistributions();
  const distributionRunning = activeDistributions.some((item) => item.running);
  dispatchElements.dialog.classList.toggle('distribution-running', distributionRunning);
  if (!dispatchRunning && !distributionRunning) restoreSingleDispatchDraft();
  dispatchElements.log.replaceChildren();
  if (dispatchRunning) {
    setDispatchStatus(dispatchPaused
      ? `Pausado: ${dispatchDone} de ${dispatchTotal}.`
      : `Disparo em segundo plano: ${dispatchDone} de ${dispatchTotal}…`, dispatchDone, dispatchTotal);
  } else if (state.done > 0) {
    setDispatchStatus(`Último lote: ${state.sent} enviado(s), ${state.errors} erro(s).`, state.done, state.total || state.done);
  } else {
    dispatchElements.status.hidden = true;
  }
  updateDispatchHeader();
  updateDispatchButtons();
  dispatchElements.dialog.showModal();
}

async function closeDispatch() {
  saveDispatchPreferences();
  dispatchElements.dialog.close();
  if (dispatchRunning && activeProfileId === dispatchProfileId && dispatchLockedProfileId === dispatchProfileId) {
    showDispatchBackgroundState();
    return;
  }
  hideDispatchBackgroundState();
  await window.centralWhatsApp.cancelAdd();
}

async function continueDispatchInBackground() {
  dispatchElements.dialog.close();
  const lockedIds = new Set(window.centralWhatsAppDispatchLockedProfileIds || []);
  const alternative = profiles.find((profile) => profile.id !== dispatchProfileId && !lockedIds.has(profile.id));
  if (alternative) {
    await window.centralWhatsApp.cancelAdd();
    const result = await window.centralWhatsApp.selectProfile(alternative.id);
    activeProfileId = result.activeProfileId;
    alternative.zoom = result.zoom;
    hideDispatchBackgroundState();
    render();
    return;
  }
  showDispatchBackgroundState();
}

async function selectDispatchFile() {
  const file = dispatchElements.file.files?.[0];
  dispatchDistributionMode = false;
  focusedDistributionId = '';
  dispatchElements.dialog.classList.remove('campaign-loaded');
  dispatchElements.distribution.hidden = true;
  dispatchElements.headingDescription.textContent = 'Prepare uma lista avulsa pelo número atualmente selecionado.';
  dispatchElements.start.textContent = 'Iniciar disparo';
  dispatchElements.sourceTitle.textContent = 'Telefones';
  dispatchElements.limitLabel.textContent = 'Limite do lote';
  dispatchCampaignId = '';
  dispatchSuccessTarget = 0;
  dispatchCampaignMode = 'pending';
  dispatchRows = [];
  dispatchPhoneColumn = 'telefone';
  dispatchElements.limit.disabled = false;
  dispatchElements.campaignResult.textContent = '';
  dispatchElements.fileName.textContent = file?.name || 'Nenhum arquivo selecionado.';
  invalidateDispatchValidation();
  if (!file) return;
  setDispatchStatus('Lendo a planilha…');
  try {
    const [imported, digest] = await Promise.all([
      readDispatchSpreadsheet(file),
      file.arrayBuffer().then(async (buffer) => {
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      })
    ]);
    dispatchRows = imported.rows;
    dispatchPhoneColumn = imported.detectedPhone.normalized;
    dispatchCampaignImportMeta = { sourceName: file.name, sourceHash: digest, originalCount: imported.rows.length };
    dispatchElements.campaignName.value = file.name.replace(/\.(xlsx?|csv)$/i, '').trim();
    const detection = imported.detectedPhone.detectedBy === 'values' ? 'identificada pelos dados' : 'identificada pelo título';
    dispatchElements.fileName.textContent = `${file.name} — aba “${imported.sheetName}” — telefone: “${imported.detectedPhone.header}”`;
    setDispatchStatus(`${imported.rows.length} linha(s) encontradas. Coluna “${imported.detectedPhone.header}” ${detection}.`);
  } catch (error) {
    addDispatchLog(error.message || String(error), 'error');
    setDispatchStatus('Não foi possível importar a planilha.');
  }
  updateDispatchButtons();
}

function validateDispatchInput() {
  const rows = dispatchSource === 'sheet' ? dispatchRows : manualDispatchRows();
  const importingCampaign = dispatchSource === 'sheet';
  dispatchSuccessTarget = 0;
  dispatchCampaignMode = 'pending';
  const result = validateDispatchRows(rows, importingCampaign ? 20000 : dispatchLimit(), importingCampaign ? dispatchPhoneColumn : 'telefone');
  dispatchCampaignImportLeads = importingCampaign ? result.leads : [];
  dispatchCampaignImportMeta = importingCampaign ? {
    ...(dispatchCampaignImportMeta || {}),
    originalCount: rows.length,
    invalidCount: result.invalid,
    duplicateCount: result.duplicates
  } : null;
  dispatchLeads = result.leads.slice(0, dispatchLimit());
  const details = [
    `${result.leads.length} telefone(s) válido(s)`
  ];
  if (result.leads.length > dispatchLeads.length) details.push(`${dispatchLeads.length} selecionado(s) para este lote`);
  if (result.invalid) details.push(`${result.invalid} inválido(s)`);
  if (result.duplicates) details.push(`${result.duplicates} repetido(s)`);
  dispatchElements.preview.textContent = details.join(' · ');
  dispatchElements.preview.hidden = false;
  dispatchElements.campaignSave.hidden = true;
  dispatchElements.campaignCreate.disabled = false;
  dispatchElements.campaignCreate.textContent = 'Salvar campanha';
  dispatchElements.campaignResult.textContent = '';
  refreshDispatchVariantAssignments();
  populateDispatchMessagePreview();
  setDispatchStatus(
    result.leads.length ? 'Telefones validados. Confira a mensagem e inicie.' : 'Nenhum telefone válido foi encontrado.'
  );
  updateDispatchButtons();
}

async function saveCurrentSpreadsheetAsCampaign() {
  if (!dispatchCampaignImportLeads.length || !dispatchCampaignImportMeta) return;
  const name = dispatchElements.campaignName.value.trim();
  if (!name) {
    dispatchElements.campaignResult.textContent = 'Informe um nome para a campanha.';
    dispatchElements.campaignName.focus();
    return;
  }
  dispatchElements.campaignCreate.disabled = true;
  dispatchElements.campaignCreate.textContent = 'Salvando…';
  dispatchElements.campaignResult.textContent = 'Comparando com os envios anteriores…';
  try {
    const response = await window.centralWhatsApp.createCampaign({
      name,
      sourceName: dispatchCampaignImportMeta.sourceName,
      sourceHash: dispatchCampaignImportMeta.sourceHash,
      repeatDays: Number(dispatchElements.campaignRepeat.value),
      originalCount: dispatchCampaignImportMeta.originalCount,
      invalidCount: dispatchCampaignImportMeta.invalidCount,
      duplicateCount: dispatchCampaignImportMeta.duplicateCount,
      leads: dispatchCampaignImportLeads
    });
    if (!response?.ok) throw new Error(response?.error || 'Não foi possível salvar a campanha.');
    const target = dispatchLimit();
    const selection = await window.centralWhatsApp.getCampaignContacts({ campaignId: response.campaign.id, mode: 'pending', limit: 5000 });
    dispatchCampaignId = response.campaign.id;
    dispatchCampaignMode = 'pending';
    dispatchSuccessTarget = Math.min(target, response.campaign.pendingCount);
    dispatchLeads = selection.leads;
    dispatchElements.limit.value = Math.max(1, dispatchSuccessTarget);
    dispatchElements.limit.disabled = true;
    dispatchElements.preview.textContent = `${response.campaign.pendingCount} novo(s) · ${response.campaign.skippedCount} já enviado(s) · ${response.campaign.duplicateCount} repetido(s) · ${response.campaign.invalidCount} inválido(s)`;
    dispatchElements.campaignResult.textContent = dispatchLeads.length
      ? `Campanha salva. O lote continuará após falhas até completar ${dispatchSuccessTarget} envio(s).`
      : 'Campanha salva, mas todos os contatos já estavam no histórico.';
    dispatchElements.campaignCreate.textContent = 'Campanha salva';
    refreshDispatchVariantAssignments();
    populateDispatchMessagePreview();
    setDispatchStatus(dispatchLeads.length ? 'Campanha pronta para enviar os contatos pendentes.' : 'Nenhum contato novo para enviar.');
    updateDispatchButtons();
  } catch (error) {
    dispatchElements.campaignCreate.disabled = false;
    dispatchElements.campaignCreate.textContent = 'Salvar campanha';
    dispatchElements.campaignResult.textContent = error.message || String(error);
  }
}

async function applyCampaignToDispatch({ campaign, leads, mode, successTarget }) {
  if (dispatchWorkflowMode === 'single') captureSingleDispatchDraft();
  dispatchWorkflowMode = 'campaign';
  dispatchDistributionMode = true;
  focusedDistributionId = '';
  dispatchElements.dialog.classList.remove('campaign-selecting');
  dispatchElements.dialog.classList.add('campaign-loaded');
  dispatchElements.campaignPicker.hidden = false;
  dispatchElements.distribution.hidden = false;
  dispatchElements.distributionMode.value = 'balanced';
  dispatchElements.headingDescription.textContent = `Prepare a campanha “${campaign.name}” e escolha os números que compartilharão a meta.`;
  dispatchElements.sourceTitle.textContent = 'Campanha e números';
  dispatchElements.limitLabel.textContent = 'Meta global de envios efetivos';
  dispatchSource = 'sheet';
  dispatchElements.sheetPanel.hidden = false;
  dispatchElements.manualPanel.hidden = true;
  dispatchElements.sourceSheet.classList.add('active');
  dispatchElements.sourceManual.classList.remove('active');
  dispatchElements.sourceSheet.setAttribute('aria-selected', 'true');
  dispatchElements.sourceManual.setAttribute('aria-selected', 'false');
  dispatchCampaignId = campaign.id;
  dispatchSuccessTarget = Math.max(1, Math.min(leads.length, Number(successTarget) || 50));
  dispatchCampaignMode = mode === 'errors' ? 'errors' : 'pending';
  dispatchCampaignImportLeads = [];
  dispatchCampaignImportMeta = null;
  dispatchRows = [];
  dispatchLeads = leads;
  dispatchElements.limit.value = dispatchSuccessTarget;
  dispatchElements.limit.disabled = true;
  await populateCampaignPicker(campaign.id);
  dispatchElements.campaignContactMode.value = mode === 'errors' ? 'errors' : 'pending';
  dispatchElements.campaignTarget.value = dispatchSuccessTarget;
  updateCampaignPickerSummary();
  dispatchElements.fileName.textContent = `Campanha “${campaign.name}” — meta de ${dispatchSuccessTarget} envio(s) efetivo(s)`;
  dispatchElements.preview.textContent = `Até ${leads.length} candidato(s) disponível(is). O lote continuará após falhas até atingir a meta; contatos não tentados permanecerão pendentes.`;
  dispatchElements.preview.hidden = false;
  dispatchElements.campaignSave.hidden = true;
  renderDistributionProfileSelector();
  refreshDispatchVariantAssignments();
  populateDispatchMessagePreview();
  setDispatchStatus('Campanha carregada. Selecione os números, confira a mensagem e inicie a distribuição.');
  dispatchElements.start.textContent = 'Iniciar distribuição';
  updateDispatchWorkflowTabs();
  updateDispatchButtons();
}

async function loadSelectedCampaignIntoDispatch() {
  const campaign = selectedCampaignChoice();
  if (!campaign) return;
  const mode = dispatchElements.campaignContactMode.value === 'errors' ? 'errors' : 'pending';
  const available = mode === 'errors' ? campaign.errorCount : campaign.pendingCount;
  const successTarget = Math.max(1, Math.min(available, Number(dispatchElements.campaignTarget.value) || 50));
  dispatchElements.campaignLoad.disabled = true;
  dispatchElements.campaignLoad.textContent = 'Carregando…';
  try {
    const result = await window.centralWhatsApp.getCampaignContacts({ campaignId: campaign.id, mode, limit: 5000 });
    if (!result.leads.length) {
      setDispatchStatus(mode === 'errors' ? 'Esta campanha não possui erros para tentar novamente.' : 'Esta campanha não possui contatos pendentes.');
      return;
    }
    await applyCampaignToDispatch({ ...result, successTarget });
  } finally {
    dispatchElements.campaignLoad.textContent = 'Carregar campanha';
    updateCampaignPickerSummary();
  }
}

window.loadCampaignIntoDispatch = async (input) => {
  await openDispatch(activeProfileId);
  await applyCampaignToDispatch(input);
};

async function startCentralDispatch() {
  if (!dispatchLeads.length || !dispatchHasValidMessage()) return;
  if (dispatchDistributionMode) {
    await startCentralDistribution();
    return;
  }
  saveDispatchPreferences();
  dispatchElements.log.replaceChildren();
  dispatchFailures = [];
  dispatchFailureReports.delete(activeProfileId);
  renderDispatchFailures();
  dispatchProfileId = activeProfileId;
  dispatchRunning = true;
  updateDispatchButtons();
  setDispatchStatus(dispatchSuccessTarget
    ? `Preparando a meta de ${dispatchSuccessTarget} envio(s) efetivo(s)…`
    : 'Preparando a sessão selecionada…', 0, dispatchSuccessTarget || dispatchLeads.length);
  try {
    const response = await window.centralWhatsApp.startDispatch({
      leads: dispatchLeadsWithMessages(),
      template: dispatchUsesVariants() ? selectedDispatchVariants()[0].body : dispatchElements.message.value,
      messageVariants: dispatchUsesVariants() ? selectedDispatchVariants() : [],
      senderName: dispatchElements.senderName.value.trim(),
      delaySec: Math.max(3, Number(dispatchElements.delay.value) || 12),
      jitter: dispatchElements.jitter.checked,
      campaignId: dispatchCampaignId,
      successTarget: dispatchSuccessTarget
    });
    if (!response?.ok) throw new Error(response?.error || 'Não foi possível iniciar o disparo.');
    dispatchDone = 0;
    dispatchTotal = dispatchLeads.length;
    applyDispatchRuntimeState(response.state, true);
    updateDispatchHeader();
    addDispatchLog(`Lote iniciado em ${response.profileName}. A Central foi liberada para os demais números.`, 'ok');
    await continueDispatchInBackground();
  } catch (error) {
    dispatchRunning = false;
    dispatchLockedProfileId = null;
    dispatchPaused = false;
    dispatchSending = false;
    dispatchReleaseBetweenSends = false;
    dispatchDone = 0;
    dispatchTotal = 0;
    updateDispatchHeader();
    addDispatchLog(error.message || String(error), 'error');
    setDispatchStatus('Falha ao iniciar o disparo.');
    updateDispatchButtons();
  }
}

async function startCentralDistribution() {
  const profileIds = selectedDistributionProfileIds();
  if (!profileIds.length || !dispatchCampaignId) return;
  saveDispatchPreferences();
  dispatchElements.log.replaceChildren();
  dispatchFailures = [];
  renderDispatchFailures();
  dispatchElements.start.disabled = true;
  setDispatchStatus(`Preparando ${profileIds.length} número(s) para a meta global de ${dispatchSuccessTarget} envio(s)…`, 0, dispatchSuccessTarget);
  try {
    const response = await window.centralWhatsApp.startDistribution({
      campaignId: dispatchCampaignId,
      mode: dispatchCampaignMode,
      profileIds,
      distributionMode: dispatchElements.distributionMode.value,
      profileTargets: selectedDistributionTargets(),
      leads: dispatchLeadsWithMessages(),
      template: dispatchUsesVariants() ? selectedDispatchVariants()[0].body : dispatchElements.message.value,
      messageVariants: dispatchUsesVariants() ? selectedDispatchVariants() : [],
      senderName: dispatchElements.senderName.value.trim(),
      delaySec: Math.max(3, Number(dispatchElements.delay.value) || 12),
      jitter: dispatchElements.jitter.checked,
      successTarget: dispatchSuccessTarget
    });
    if (!response?.ok) throw new Error(response?.error || 'Não foi possível iniciar a distribuição.');
    mergeDistribution(response.distribution);
    focusedDistributionId = response.distribution.id;
    for (const worker of response.distribution.workers) applyDispatchRuntimeState(worker, false);
    dispatchRunning = true;
    dispatchProfileId = response.distribution.workers[0]?.profileId || activeProfileId;
    dispatchElements.dialog.classList.add('distribution-running');
    renderDistributionDashboard();
    updateDispatchHeader();
    setDispatchStatus(`Distribuição iniciada em ${profileIds.length} número(s). A meta é compartilhada e as falhas serão repostas.`, 0, dispatchSuccessTarget);
    addDispatchLog(`Campanha distribuída entre: ${response.distribution.workers.map((worker) => worker.profileName).join(', ')}.`, 'ok');
  } catch (error) {
    dispatchRunning = false;
    addDispatchLog(error.message || String(error), 'error');
    setDispatchStatus('Falha ao iniciar a distribuição.');
  }
  updateDispatchButtons();
}

async function scheduleCentralDispatch() {
  if (!dispatchLeads.length || !dispatchHasValidMessage() || !dispatchElements.scheduledAt.value) return;
  saveDispatchPreferences();
  const scheduledAt = new Date(dispatchElements.scheduledAt.value);
  const scheduledProfileId = dispatchDistributionMode ? selectedDistributionProfileIds()[0] : activeProfileId;
  const response = await window.centralWhatsApp.scheduleDispatch({
    profileId: scheduledProfileId,
    scheduledAt: scheduledAt.toISOString(),
    leads: dispatchLeadsWithMessages(),
    template: dispatchUsesVariants() ? selectedDispatchVariants()[0].body : dispatchElements.message.value,
    messageVariants: dispatchUsesVariants() ? selectedDispatchVariants() : [],
    senderName: dispatchElements.senderName.value.trim(),
    delaySec: Math.max(3, Number(dispatchElements.delay.value) || 12),
    jitter: dispatchElements.jitter.checked,
    campaignId: dispatchCampaignId,
    successTarget: dispatchSuccessTarget
  });
  if (!response?.ok) {
    addDispatchLog(response?.error || 'Não foi possível criar o agendamento.', 'error');
    return;
  }
  scheduledDispatches = response.schedules;
  renderScheduledDispatches();
  addDispatchLog(`Lote agendado para ${new Date(response.schedule.scheduledAt).toLocaleString('pt-BR')} em ${response.schedule.profileName}.`, 'ok');
  setDispatchStatus('Agendamento salvo. A lista e a mensagem foram armazenadas localmente.');
  prepareScheduleDateInput();
}

async function stopCentralDispatch() {
  await window.centralWhatsApp.stopDispatch(dispatchProfileId);
  setDispatchStatus('Parando após o envio atual…');
}

async function toggleCentralDispatchPause() {
  const response = await window.centralWhatsApp.toggleDispatchPause(dispatchProfileId);
  if (!response?.ok) {
    addDispatchLog(response?.error || 'Não foi possível alterar a pausa.', 'error');
    return;
  }
  applyDispatchRuntimeState(response.state, true);
  if (dispatchPaused) {
    addDispatchLog(dispatchSending
      ? 'Pausa solicitada. O envio atual será concluído antes de pausar.'
      : 'Disparo pausado antes do próximo envio.');
    setDispatchStatus(`Pausado: ${dispatchDone} de ${dispatchTotal}.`, dispatchDone, dispatchTotal);
  } else {
    addDispatchLog('Disparo retomado.', 'ok');
    setDispatchStatus(`Retomando: ${dispatchDone} de ${dispatchTotal}…`, dispatchDone, dispatchTotal);
  }
}

window.openCentralDispatchForProfile = openDispatch;
dispatchElements.button.onclick = () => openDispatch(activeProfileId);
dispatchElements.close.onclick = closeDispatch;
dispatchElements.dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDispatch();
});
dispatchElements.workflowSingle.onclick = () => switchDispatchWorkflow('single');
dispatchElements.workflowCampaign.onclick = () => switchDispatchWorkflow('campaign');
dispatchElements.campaignSelect.onchange = updateCampaignPickerSummary;
dispatchElements.campaignContactMode.onchange = updateCampaignPickerSummary;
dispatchElements.campaignTarget.onchange = updateCampaignPickerSummary;
dispatchElements.campaignLoad.onclick = loadSelectedCampaignIntoDispatch;
dispatchElements.sourceSheet.onclick = () => setDispatchSource('sheet');
dispatchElements.sourceManual.onclick = () => setDispatchSource('manual');
dispatchElements.file.onclick = () => { dispatchElements.file.value = ''; };
dispatchElements.file.onchange = selectDispatchFile;
  dispatchElements.manualPhones.oninput = () => {
  dispatchCampaignId = '';
  dispatchSuccessTarget = 0;
  dispatchCampaignMode = 'pending';
  dispatchElements.limit.disabled = false;
  invalidateDispatchValidation();
};
dispatchElements.limit.onchange = () => { invalidateDispatchValidation(); saveDispatchPreferences(); };
dispatchElements.validate.onclick = validateDispatchInput;
dispatchElements.campaignCreate.onclick = saveCurrentSpreadsheetAsCampaign;
dispatchElements.message.oninput = () => { updateDispatchButtons(); renderDispatchMessagePreview(); saveDispatchPreferences(); };
dispatchElements.messageMode.onchange = () => { updateDispatchMessageMode(); saveDispatchPreferences(); };
dispatchElements.variantCount.onchange = () => {
  renderDispatchVariantSelector(selectedDispatchVariants().map((template) => template.id));
  renderDispatchMessagePreview();
  updateDispatchButtons();
  saveDispatchPreferences();
};
dispatchElements.distributionMode.onchange = updateDistributionSelectionSummary;
dispatchElements.senderName.oninput = () => { renderDispatchMessagePreview(); saveDispatchPreferences(); };
dispatchElements.delay.onchange = saveDispatchPreferences;
dispatchElements.jitter.onchange = saveDispatchPreferences;
dispatchElements.scheduledAt.oninput = updateDispatchButtons;
dispatchElements.schedule.onclick = scheduleCentralDispatch;
dispatchElements.savedTemplate.onchange = () => {
  const option = dispatchElements.savedTemplate.selectedOptions[0];
  if (option?.value) dispatchElements.message.value = option.dataset.body || '';
  updateDispatchButtons();
  renderDispatchMessagePreview();
  saveDispatchPreferences();
};
dispatchElements.previewRecipient.onchange = renderDispatchMessagePreview;
dispatchElements.start.onclick = startCentralDispatch;
dispatchElements.stop.onclick = stopCentralDispatch;
dispatchElements.pause.onclick = toggleCentralDispatchPause;
dispatchElements.distributionPause.onclick = async () => {
  const distribution = activeDistributions.find((item) => item.id === focusedDistributionId);
  if (!distribution?.running) return;
  const response = await window.centralWhatsApp.toggleDistributionPause(distribution.id);
  if (response?.distribution) {
    mergeDistribution(response.distribution);
    renderDistributionDashboard();
  }
};
dispatchElements.distributionStop.onclick = async () => {
  const distribution = activeDistributions.find((item) => item.id === focusedDistributionId);
  if (!distribution?.running) return;
  if (!confirm('Parar a distribuição após os envios que estão acontecendo agora?')) return;
  const response = await window.centralWhatsApp.stopDistribution(distribution.id);
  if (response?.distribution) {
    mergeDistribution(response.distribution);
    renderDistributionDashboard();
  }
};
dispatchElements.saveFailures.onclick = async () => {
  const response = await window.centralWhatsApp.saveDispatchFailures(dispatchFailures);
  if (response?.ok) {
    dispatchElements.saveFailures.textContent = 'CSV salvo';
    setTimeout(() => { dispatchElements.saveFailures.textContent = 'Salvar CSV'; }, 1600);
  }
};

window.centralWhatsApp.onScheduledDispatchesChanged((items) => {
  scheduledDispatches = items;
  renderScheduledDispatches();
});

window.centralWhatsApp.onScheduledDispatchTriggered(({ profileName, state }) => {
  const focused = state.profileId === dispatchProfileId;
  applyDispatchRuntimeState(state, focused);
  dispatchFailureReports.delete(state.profileId);
  if (focused) {
    dispatchElements.log.replaceChildren();
    dispatchFailures = [];
    renderDispatchFailures();
    addDispatchLog(`Agendamento iniciado automaticamente em ${profileName}.`, 'ok');
    setDispatchStatus(state.successTarget
      ? `Agendamento iniciado · Meta: 0 de ${state.successTarget} envio(s) efetivo(s).`
      : `Agendamento iniciado: 0 de ${dispatchTotal}…`, 0, state.successTarget || dispatchTotal);
  }
});

window.centralWhatsApp.onDispatchStateChanged(async (state) => {
  const previous = dispatchRuntimeStates.get(state.profileId);
  const wasLocked = previous?.lockedProfileId === state.profileId;
  const focused = state.profileId === dispatchProfileId;
  applyDispatchRuntimeState(state, focused);
  if (state.distributionId) {
    const distribution = activeDistributions.find((item) => item.id === state.distributionId);
    const workerIndex = distribution?.workers.findIndex((worker) => worker.profileId === state.profileId) ?? -1;
    if (distribution && workerIndex >= 0) {
      distribution.workers[workerIndex] = { ...distribution.workers[workerIndex], ...state };
      renderDistributionDashboard();
    }
  }
  if (!state.running) return;

  if (focused && state.distributionId) {
    // O resumo global é atualizado pelo coordenador da distribuição.
  } else if (focused && state.successTarget) {
    const prefix = dispatchPaused ? 'Pausado' : dispatchSending ? 'Enviando' : 'Aguardando';
    setDispatchStatus(`${prefix} · Meta: ${state.sent} de ${state.successTarget} enviado(s) · ${state.done} tentativa(s).`, state.sent, state.successTarget);
  } else if (focused && dispatchPaused) {
    setDispatchStatus(`Pausado: ${dispatchDone} de ${dispatchTotal}.`, dispatchDone, dispatchTotal);
  } else if (focused && dispatchSending) {
    setDispatchStatus(`Enviando ${Math.min(dispatchDone + 1, dispatchTotal)} de ${dispatchTotal}…`, dispatchDone, dispatchTotal);
  } else if (focused && dispatchReleaseBetweenSends) {
    setDispatchStatus(`Aguardando o próximo envio: ${dispatchDone} de ${dispatchTotal}.`, dispatchDone, dispatchTotal);
  }

  if (!dispatchElements.dialog.open && activeProfileId === state.profileId) {
    if (state.lockedProfileId === state.profileId) showDispatchBackgroundState(state);
    else if (wasLocked) {
      hideDispatchBackgroundState();
      await window.centralWhatsApp.cancelAdd();
    }
  }
});

window.centralWhatsApp.onDispatchProgress(({ profileId, distributionId, done, total, sent, successTarget, distributionSent, distributionErrors, lead, status, error }) => {
  const runtime = dispatchRuntimeStates.get(profileId);
  if (runtime) {
    runtime.done = done;
    runtime.total = total;
    runtime.sent = sent;
    runtime.successTarget = successTarget;
    updateDispatchHeader();
  }
  if (profileId !== dispatchProfileId) return;
  dispatchDone = done;
  dispatchTotal = total;
  updateDispatchHeader();
  setDispatchStatus(distributionId
    ? `Meta global: ${distributionSent || 0} de ${successTarget} enviado(s) · ${(distributionSent || 0) + (distributionErrors || 0)} tentativa(s).`
    : successTarget
    ? `Meta: ${sent} de ${successTarget} enviado(s) · ${done} tentativa(s).`
    : `Processando ${done} de ${total}…`, successTarget ? sent : done, successTarget || total);
  const phone = dispatchPhoneLabel(lead);
  const recipient = lead?.person?.name ? `${lead.person.name} (${phone})` : phone;
  addDispatchLog(status === 'sent' ? `Enviado para ${recipient}` : `Erro em ${recipient}: ${error}`, status === 'sent' ? 'ok' : 'error');
});

window.centralWhatsApp.onDispatchDone(async ({ profileId, distributionId, sent, errors, successTarget, stopped, failures, workerError }) => {
  const runtime = dispatchRuntimeStates.get(profileId) || { profileId };
  const finishedState = {
    ...runtime,
    running: false,
    paused: false,
    sending: false,
    lockedProfileId: null,
    done: sent + errors,
    workerError: workerError || ''
  };
  dispatchRuntimeStates.set(profileId, finishedState);
  syncDispatchProfileLocks();
  updateDispatchHeader();
  if (typeof render === 'function') render();
  const report = Array.isArray(failures) ? failures : [];
  dispatchFailureReports.set(profileId, report);
  if (distributionId) {
    const distribution = activeDistributions.find((item) => item.id === distributionId);
    const workerIndex = distribution?.workers.findIndex((worker) => worker.profileId === profileId) ?? -1;
    if (distribution && workerIndex >= 0) {
      distribution.workers[workerIndex] = {
        ...distribution.workers[workerIndex], running: false, paused: false, sending: false,
        sent, errors, done: sent + errors, workerError: workerError || ''
      };
      renderDistributionDashboard();
    }
    return;
  }
  if (!dispatchElements.dialog.open && activeProfileId === profileId) {
    hideDispatchBackgroundState();
    await window.centralWhatsApp.cancelAdd();
  }
  if (profileId !== dispatchProfileId) return;

  dispatchRunning = false;
  dispatchPaused = false;
  dispatchSending = false;
  dispatchReleaseBetweenSends = false;
  dispatchLockedProfileId = null;
  dispatchDone = sent + errors;
  dispatchTotal = sent + errors;
  const total = sent + errors;
  dispatchFailures = report;
  if (dispatchCampaignId) {
    try {
      const remaining = await window.centralWhatsApp.getCampaignContacts({ campaignId: dispatchCampaignId, mode: dispatchCampaignMode, limit: 5000 });
      dispatchLeads = remaining.leads;
      dispatchSuccessTarget = Math.min(dispatchSuccessTarget || 50, dispatchLeads.length || 1);
      dispatchElements.limit.value = dispatchSuccessTarget;
      refreshDispatchVariantAssignments();
      populateDispatchMessagePreview();
    } catch {}
  }
  renderDispatchFailures();
  if (workerError) addDispatchLog(`${runtime.profileName || 'Número remetente'} interrompido: ${workerError}`, 'error');
  const finalText = workerError
    ? `Envios interrompidos neste número: ${workerError}`
    : stopped
    ? `Interrompido: ${sent} enviado(s), ${errors} erro(s).`
    : successTarget && sent < successTarget
      ? `Meta não atingida: ${sent} de ${successTarget} enviado(s), ${errors} erro(s). Abra a campanha para continuar.`
      : `Concluído: ${sent} enviado(s), ${errors} erro(s).`;
  setDispatchStatus(finalText, successTarget ? sent : total, successTarget || total);
  updateDispatchButtons();
});

window.centralWhatsApp.onDistributionStateChanged?.((distribution) => {
  mergeDistribution(distribution);
  for (const worker of distribution.workers) applyDispatchRuntimeState(worker, false);
  renderDistributionDashboard();
  updateDispatchHeader();
  if (dispatchElements.dialog.open && distribution.id === focusedDistributionId) {
    setDispatchStatus(
      `Meta global: ${distribution.sent} de ${distribution.target} enviado(s) · ${distribution.attempted} tentativa(s).`,
      distribution.sent,
      distribution.target
    );
  }
});

window.centralWhatsApp.onDistributionDone?.(async (distribution) => {
  mergeDistribution(distribution);
  dispatchRunning = activeDistributions.some((item) => item.running);
  dispatchFailures = distribution.workers.flatMap((worker) => dispatchFailureReports.get(worker.profileId) || []);
  renderDispatchFailures();
  renderDistributionDashboard();
  updateDispatchHeader();
  updateDispatchButtons();
  const completed = distribution.sent >= distribution.target;
  const unavailableWorkers = distribution.workers.filter((worker) => worker.workerError);
  if (unavailableWorkers.length) {
    addDispatchLog(
      `Número(s) retirado(s) da distribuição: ${unavailableWorkers.map((worker) => worker.profileName).join(', ')}. Os contatos reservados voltaram para a fila.`,
      'error'
    );
  }
  setDispatchStatus(
    completed && unavailableWorkers.length
      ? `Distribuição concluída pelos números disponíveis: ${distribution.sent} envio(s) efetivo(s). ${unavailableWorkers.length} número(s) foi/foram interrompido(s) pelo WhatsApp.`
      : completed
      ? `Distribuição concluída: ${distribution.sent} envio(s) efetivo(s), ${distribution.errors} falha(s).`
      : unavailableWorkers.length
        ? `Distribuição interrompida em ${unavailableWorkers.length} número(s): ${distribution.sent} de ${distribution.target} envio(s) efetivo(s). Os contatos restantes continuam pendentes.`
      : `Distribuição encerrada com ${distribution.sent} de ${distribution.target} envio(s) efetivo(s) e ${distribution.errors} falha(s).`,
    distribution.sent,
    distribution.target
  );
  if (!dispatchElements.dialog.open) {
    hideDispatchBackgroundState();
    await window.centralWhatsApp.cancelAdd();
  }
});

loadDispatchPreferences();
prepareScheduleDateInput();
window.centralWhatsApp.listScheduledDispatches().then((items) => {
  scheduledDispatches = items;
  renderScheduledDispatches();
});
window.centralWhatsApp.getDispatchStates().then((states) => {
  states.forEach((state) => applyDispatchRuntimeState(state, false));
});
window.centralWhatsApp.listDistributions().then((items) => {
  activeDistributions = items;
  focusedDistributionId = items.find((item) => item.running)?.id || items[0]?.id || '';
  renderDistributionDashboard();
  updateDispatchHeader();
});
updateDispatchHeader();
updateDispatchButtons();
