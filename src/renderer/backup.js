const backupElements = {
  button: document.querySelector('#backup-button'),
  dialog: document.querySelector('#backup-dialog'),
  close: document.querySelector('#backup-close'),
  cancel: document.querySelector('#backup-cancel'),
  generate: document.querySelector('#backup-generate'),
  profile: document.querySelector('#backup-profile'),
  progress: document.querySelector('#backup-progress'),
  progressBar: document.querySelector('#backup-progress-bar'),
  progressText: document.querySelector('#backup-progress-text'),
  result: document.querySelector('#backup-result')
};

let conversationBackupRunning = false;

function setConversationBackupBusy(busy) {
  conversationBackupRunning = busy;
  backupElements.generate.disabled = busy;
  backupElements.cancel.disabled = false;
  backupElements.close.disabled = busy;
  backupElements.generate.textContent = busy ? 'Gerando backup…' : 'Escolher local e gerar ZIP';
  backupElements.cancel.textContent = busy ? 'Cancelar backup' : 'Cancelar';
}

async function closeConversationBackup() {
  if (conversationBackupRunning) return;
  backupElements.dialog.close();
  await window.centralWhatsApp.cancelAdd();
}

async function cancelOrCloseConversationBackup() {
  if (!conversationBackupRunning) {
    await closeConversationBackup();
    return;
  }
  backupElements.cancel.disabled = true;
  backupElements.cancel.textContent = 'Cancelando…';
  backupElements.progressText.textContent = 'Cancelando o backup com segurança…';
  await window.centralWhatsApp.cancelConversationBackup(activeProfileId);
}

async function openConversationBackup() {
  const profile = profiles.find((item) => item.id === activeProfileId);
  if (!profile) {
    alert('Conecte e selecione um número antes de gerar o backup.');
    return;
  }
  await window.centralWhatsApp.beginAdd();
  backupElements.profile.textContent = `Conversa aberta em ${profile.name}`;
  backupElements.progress.hidden = true;
  backupElements.result.hidden = true;
  backupElements.result.className = 'backup-result';
  backupElements.progressBar.style.width = '8%';
  setConversationBackupBusy(false);
  backupElements.dialog.showModal();
}

async function generateConversationBackup() {
  const profileId = activeProfileId;
  if (!profileId || conversationBackupRunning) return;
  setConversationBackupBusy(true);
  backupElements.progress.hidden = false;
  backupElements.result.hidden = true;
  backupElements.progressText.textContent = 'Escolha onde salvar o arquivo ZIP…';
  backupElements.progressBar.style.width = '8%';
  try {
    const result = await window.centralWhatsApp.backupConversation(profileId);
    if (result?.canceled) {
      backupElements.progress.hidden = true;
      return;
    }
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível gerar o backup.');
    backupElements.progressBar.style.width = '100%';
    backupElements.progressText.textContent = 'Backup concluído.';
    backupElements.result.className = 'backup-result';
    backupElements.result.textContent = `${result.messageCount} mensagem(ns), ${result.audioCount} áudio(s) e ${result.screenshotCount} captura(s) foram salvos. ${result.audioFailureCount ? `${result.audioFailureCount} áudio(s) não estavam mais disponíveis.` : ''}`;
    backupElements.result.hidden = false;
  } catch (error) {
    backupElements.progressBar.style.width = '100%';
    backupElements.progressText.textContent = 'O backup não foi concluído.';
    backupElements.result.className = 'backup-result error';
    backupElements.result.textContent = error.message || String(error);
    backupElements.result.hidden = false;
  } finally {
    setConversationBackupBusy(false);
  }
}

window.centralWhatsApp.onConversationBackupProgress?.((progress) => {
  if (!conversationBackupRunning) return;
  backupElements.progress.hidden = false;
  backupElements.progressText.textContent = progress?.message || 'Gerando backup…';
  const determinate = Number(progress?.total) > 0;
  const ratio = determinate ? Math.max(0, Math.min(1, Number(progress.current || 0) / Number(progress.total))) : 0;
  const percentage = progress?.phase === 'screenshots' && determinate
    ? Math.round(30 + ratio * 38)
    : progress?.phase === 'audio' && determinate
      ? Math.round(70 + ratio * 20)
      : ({ loading: 10, history: 20, screenshots: 30, audio: 70, compressing: 94, done: 100 }[progress?.phase] || 18);
  backupElements.progressBar.style.width = `${percentage}%`;
});

backupElements.button.onclick = openConversationBackup;
backupElements.generate.onclick = generateConversationBackup;
backupElements.cancel.onclick = cancelOrCloseConversationBackup;
backupElements.close.onclick = closeConversationBackup;
backupElements.dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeConversationBackup();
});
