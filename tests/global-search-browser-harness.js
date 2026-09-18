const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const port = Number(process.env.CENTRAL_SEARCH_TEST_PORT) || 43121;
const mock = String.raw`<script>
  (() => {
    const profiles = [{ id: 'comercial', name: 'Comercial', color: '#22c55e', zoom: 1, unread: 0, active: true }];
    const empty = async () => [];
    const ok = async () => ({ ok: true });
    const listen = () => {};
    let searchProgress = null;
    const indexStatus = { indexedProfiles: 1, profileCount: 1, chatCount: 18, messageCount: 12345, lastIndexedAt: '2026-09-02T12:00:00.000Z' };
    window.centralWhatsApp = {
      listProfiles: async () => profiles,
      listTemplates: empty, listLabels: empty, listCampaigns: empty, listDispatchHistory: empty,
      listDistributions: empty, listScheduledDispatches: empty, getDispatchStates: empty,
      getDispatchState: async (profileId) => ({ profileId, running: false }), getCurrentChatLabels: empty,
      beginAdd: ok, cancelAdd: ok, addLabel: ok, removeLabel: ok, addProfile: ok,
      selectProfile: async () => ({ activeProfileId: 'comercial', zoom: 1 }), setZoom: async () => ({ zoom: 1 }),
      renameProfile: async () => profiles, reorderProfiles: async () => profiles,
      removeProfile: async () => ({ profiles, activeProfileId: 'comercial' }), addTemplate: ok, updateTemplate: ok,
      removeTemplate: empty, toggleChatLabel: ok, copyText: ok, createCampaign: ok,
      getCampaignContacts: async () => ({ leads: [] }), releaseCampaignSkipped: ok, removeCampaign: empty,
      exportCampaign: ok, saveDispatchFailures: ok, saveDispatchHistory: ok, scheduleDispatch: ok,
      cancelScheduledDispatch: empty, startDispatch: ok, startDistribution: ok, stopDispatch: ok,
      stopDistribution: ok, toggleDispatchPause: ok, toggleDistributionPause: ok,
      onUnreadChanged: listen, onProfileActivated: listen, onDispatchProgress: listen,
      onDispatchStateChanged: listen, onScheduledDispatchesChanged: listen, onScheduledDispatchTriggered: listen,
      onDispatchDone: listen, onDistributionStateChanged: listen, onDistributionDone: listen,
      onDispatchHistoryChanged: listen, onCampaignsChanged: listen, onConversationBackupProgress: listen,
      onGlobalSearchProgress: (callback) => { searchProgress = callback; },
      getGlobalSearchIndexStatus: async () => indexStatus,
      cancelGlobalSearch: ok, openGlobalSearchResult: ok,
      clearGlobalSearchIndex: async () => ({ ...indexStatus, indexedProfiles: 0, chatCount: 0, messageCount: 0, lastIndexedAt: '' }),
      rebuildGlobalSearchIndex: async () => ({ cancelled: false, failures: [], searchedProfiles: 1, indexStatus }),
      searchAllConversations: async ({ query, mode }) => {
        searchProgress?.({ message: mode === 'complete' ? 'Atualizando o índice…' : 'Busca rápida…' });
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          cancelled: false, mode, searchedProfiles: 1, failures: [], phoneOnlyProfiles: [], indexStatus,
          results: [{ profileId: 'comercial', profileName: 'Comercial', profileColor: '#22c55e',
            chatId: '5527999991234@c.us', chatName: 'João da Silva', phone: '5527999991234',
            messageId: 'm1', snippet: 'Sua proposta foi aprovada hoje.', timestamp: 1788364800 }]
        };
      }
    };
  })();
</script>`;

const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
  const relative = pathname === '/' ? 'renderer/index.html' : pathname.replace(/^\//, '');
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404).end('Not found');
    return;
  }
  let body = fs.readFileSync(filePath);
  if (relative === 'renderer/index.html') {
    body = Buffer.from(body.toString('utf8').replace('<script src="../vendor/xlsx.full.min.js"></script>', `${mock}<script src="../vendor/xlsx.full.min.js"></script>`));
  }
  response.writeHead(200, { 'Content-Type': `${mime[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
  response.end(body);
});

server.listen(port, '127.0.0.1', () => console.log(`global-search-browser-harness http://127.0.0.1:${port}/`));
