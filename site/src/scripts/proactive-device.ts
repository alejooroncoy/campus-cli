const DEVICE_KEY = "campu_push_device",
  OWNER_KEY = "campu_push_owner";
export async function reconcilePushOwner(owner: string | null) {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(OWNER_KEY);
  } catch {}
  if (previous && previous !== owner) await removePushDevice();
}
export function rememberPushDevice(id: string) {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* Browser subscription still works without storage. */
  }
}
export async function removePushDevice() {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_KEY);
  } catch {}
  if (id && /^[0-9a-f-]{36}$/i.test(id))
    await fetch(`/api/app/proactive/subscriptions/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "same-origin",
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager?.getSubscription();
      await sub?.unsubscribe();
    } catch {
      /* Closing the Campus session remains available when browser push is unavailable. */
    }
  }
  try {
    localStorage.removeItem(DEVICE_KEY);
    localStorage.removeItem(OWNER_KEY);
  } catch {}
}
export async function enablePushDevice(key: string, owner: string) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw Error(
      "Este navegador no admite avisos push. En iPhone o iPad, instala Campus en la pantalla de inicio y ábrelo desde allí.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw Error(
      "No se concedió permiso. Puedes habilitarlo en los ajustes del navegador.",
    );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            Error(
              "Campus todavía no está listo para recibir push. Recarga la página e inténtalo de nuevo.",
            ),
          ),
        10000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  const bytes = Uint8Array.from(
    atob(key.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const sub =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  const response = await fetch("/api/app/proactive/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await sub.unsubscribe();
    throw Error("No pudimos registrar este dispositivo. Inténtalo de nuevo.");
  }
  const result = await response.json();
  rememberPushDevice(result.id);
  try {
    localStorage.setItem(OWNER_KEY, owner);
  } catch {}
}
