const urlInput = document.getElementById('urlInput');
const tokenInput = document.getElementById('tokenInput');
const toggleShowBtn = document.getElementById('toggleShowBtn');
const testBtn = document.getElementById('testBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

function showStatus(kind, msg) {
  statusEl.textContent = msg;
  statusEl.className = 'status show ' + kind;
}
function clearStatus() {
  statusEl.className = 'status';
}

function normalizeUrl(raw) {
  return (raw || '').trim().replace(/\/+$/, '');
}

async function loadSettings() {
  const { sphereUrl, sphereToken } = await chrome.storage.local.get(['sphereUrl', 'sphereToken']);
  if (sphereUrl) urlInput.value = sphereUrl;
  if (sphereToken) tokenInput.value = sphereToken;
}

toggleShowBtn.addEventListener('click', () => {
  if (tokenInput.type === 'password') {
    tokenInput.type = 'text';
    toggleShowBtn.textContent = 'Hide';
  } else {
    tokenInput.type = 'password';
    toggleShowBtn.textContent = 'Show';
  }
});

saveBtn.addEventListener('click', async () => {
  clearStatus();
  const url = normalizeUrl(urlInput.value);
  const token = (tokenInput.value || '').trim();

  if (!/^https?:\/\//i.test(url)) {
    showStatus('err', 'URL must start with http:// or https://');
    return;
  }
  if (!token) {
    showStatus('err', 'API token is required.');
    return;
  }

  await chrome.storage.local.set({ sphereUrl: url, sphereToken: token });
  showStatus('ok', '✓ Saved.');
});

testBtn.addEventListener('click', () => {
  // Wired in Task 3.
  showStatus('err', 'Test Connection not implemented yet.');
});

document.addEventListener('DOMContentLoaded', loadSettings);
