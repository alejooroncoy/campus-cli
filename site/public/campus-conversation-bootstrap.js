// Start a deep-linked chat's latest five messages before the React bundle loads.
(() => {
  const id = location.pathname.match(/^\/app\/profes\/c\/([0-9a-f-]{36})\/?$/i)?.[1];
  if (!id || window.__campusConversationPreload?.id === id) return;
  window.__campusConversationPreload = {
    id,
    promise: fetch(`/api/app/profes/conversation?id=${encodeURIComponent(id)}&limit=5`, {
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000),
    }).then(response => response.ok ? response.json() : null).catch(() => null),
  };
})();
