// public/js/backup.js
(function () {
  const state = document.getElementById('state');
  const ok    = document.getElementById('ok');
  const err   = document.getElementById('err');

  const show = el => el.classList.remove('d-none');
  const hide = el => el.classList.add('d-none');

  async function triggerDownload(kind) {
    hide(ok); hide(err);
    state.textContent = 'Preparing ZIP…';

    const url = `/backup/api/${encodeURIComponent(kind)}`;

    try {
      // ✅ Step 1: Ping server with HEAD to ensure it’s reachable
      const check = await fetch(url, { method: 'HEAD' });
      if (!check.ok) throw new Error(`Server responded ${check.status}`);

      // ✅ Step 2: Now trigger real browser download
      state.textContent = 'Generating and downloading… Please wait.';

      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();

      // ✅ Step 3: Show success only after a small realistic delay
      setTimeout(() => {
        state.textContent = '';
        show(ok);
      }, 8000); // 8s delay = enough time for zipping to start
    } catch (e) {
      console.error(e);
      state.textContent = 'Failed to start download.';
      show(err);
    }
  }

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-backup]');
    if (!btn) return;
    const kind = btn.getAttribute('data-backup');
    triggerDownload(kind);
  });
})();
