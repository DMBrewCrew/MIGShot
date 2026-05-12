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

  saveBtn.disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: [url + '/*'] });
    if (!granted) {
      showStatus('err', 'Permission to reach ' + url + ' was denied. Click Save again and approve.');
      return;
    }
    await chrome.storage.local.set({ sphereUrl: url, sphereToken: token });
    showStatus('ok', '✓ Saved.');
  } finally {
    saveBtn.disabled = false;
  }
});

testBtn.addEventListener('click', async () => {
  clearStatus();
  const url = normalizeUrl(urlInput.value);
  const token = (tokenInput.value || '').trim();

  if (!/^https?:\/\//i.test(url)) {
    showStatus('err', 'Enter a valid URL first.');
    return;
  }
  if (!token) {
    showStatus('err', 'Enter an API token first.');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing…';

  try {
    const origin = url + '/*';
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      showStatus('err', 'Permission to reach ' + url + ' was denied. Click Test again and approve.');
      return;
    }

    const res = await fetch(url + '/api/captures', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    if (res.status === 401) {
      showStatus('err', '✗ Token rejected. Generate a new one at ' + url + '/settings.');
    } else if (res.status === 400) {
      showStatus('ok', '✓ Connected. Token works.');
    } else if (res.ok) {
      showStatus('ok', '✓ Connected (unexpected ' + res.status + ' but no auth error).');
    } else {
      const text = await res.text().catch(() => '');
      showStatus('err', '✗ HTTP ' + res.status + ': ' + (text.slice(0, 200) || 'no body'));
    }
  } catch (e) {
    showStatus('err', '✗ Network error: ' + e.message + ' — is the platform running?');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
});

loadSettings();
