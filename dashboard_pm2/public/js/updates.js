// public/js/updates.js
(() => {
  const $select = document.getElementById('verSelect');
  const $btnDownload = document.getElementById('btnDownload');
  const $btnReload = document.getElementById('btnReload');
  const $log = document.getElementById('log');

  function log(msg) {
    if (!$log) return;
    const time = new Date().toLocaleTimeString();
    $log.textContent += `[${time}] ${msg}\n`;
    $log.scrollTop = $log.scrollHeight;
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? `: ${txt}` : ''}`);
    }
    return res.json();
  }

  if ($btnDownload) {
    $btnDownload.addEventListener('click', async () => {
      try {
        const version = $select?.value;
        const edition = localStorage.getItem("MEI_EDITION") || "business"; // <--- THE NEW PART

        $btnDownload.disabled = true;

        log(`Starting download for ${version || '(latest)'}...`);

        // ----- SEND VERSION + EDITION -----
        const data = await postJSON('/updates/download', {
          version,
          edition
        });
        // -----------------------------------

        if (data.ok) {
          log(`✅ Downloaded/installed v${data.version}.`);
        } else {
          log(`❌ Failed: ${data.error || 'Unknown error'}`);
        }
      } catch (e) {
        log(`❌ Error: ${e.message}`);
      } finally {
        $btnDownload.disabled = false;
      }
    });
  }

  if ($btnReload) {
    $btnReload.addEventListener('click', () => {
      log('Refreshing page...');
      location.reload();
    });
  }

  if ($select) {
    $select.addEventListener('change', () => {
      log(`Selected version: ${$select.value}`);
    });
  }
})();
