import { keepBothOperation, type KeepBothOperation } from "../lib/library-versions";
import { watchLibraryVersions } from "../lib/library-version-sync";
import { CloudDraftQueue, chooseCloudRecovery, type CloudCopy, type CloudAttempt } from "../lib/library-cloud-draft";
import { DraftConflictError, LibraryDraftStore, indexedDraftFiles, libraryDraftKey } from "../lib/library-draft";
import { isLibraryWorkspaceViewHash } from "../lib/library-navigation";
import { LIBRARY_OFFLINE_OWNER, readOfflineOwner, rememberOfflineOwner, forgetOfflineOwner } from '../lib/library-offline';
import { publishSessionIdentity } from './session-sync';
type Row = {
  name: string;
  score: number | null;
  maxScore: number | null;
  comment: string;
};
type Data = {
  courseId: number;
  title: string;
  summary: string;
  kind: string;
  author: string;
  professor: string;
  evaluator: string;
  period: string;
  stage: string;
  group: boolean;
  grade: { score: number; maxScore: number } | null;
  feedback: string;
  rubricStatus: string;
  rubricTitle: string;
  criteria: Row[];
};
type Work = {
  id: string;
  revision: number;
  status: string;
  data: Data;
  course: { id: number; name: string; code: string | null; university: string };
  files: { id: string; name: string; size: number }[];
  note?: string;
  credits?: number;
};
type Recovery = {
  keepBoth?: KeepBothOperation;
  fields: Record<string, string>;
  criteria: Record<string, string>[];
  courses: { value: string; label: string }[];
  current: Pick<Work, 'id' | 'revision'> | null;
  work?: Work | null;
  cloudRevision?: number;
  cloudMutation?: string;
  cloudDirty?: boolean;
  cloudDiscarded?: boolean;
  requestId: string;
  stage: number;
  unsaved: boolean;
  expanded: boolean;
};
const e = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const statusName: Record<string, string> = {
  draft: "Borrador privado",
  pending: "En revisión",
  published: "Publicado",
  rejected: "Necesita correcciones",
  withdrawn: "Retirado",
};
const libraryIcon = (name: string) =>
  `<svg class="lib-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><use href="/assets/lucide.svg#${name}"></use></svg>`;
function publicPath(w: Work) {
  return `/biblioteca/trabajos/trabajo-${w.id}/`;
}
function detail(w: Work) {
  const d = w.data;
  return `<h3>${e(d.title)}</h3><p class="lib-pre">${e(d.summary)}</p><p>${e(w.course.university)} · ${e(w.course.name)} ${e(w.course.code)} · Por ${e(d.author)}</p><dl class="lib-facts"><div><dt>Profesor</dt><dd>${e(d.professor || "No informado")}</dd></div><div><dt>Evaluador</dt><dd>${e(d.evaluator || "No informado")}</dd></div><div><dt>Periodo</dt><dd>${e(d.period || "No informado")}</dd></div><div><dt>Entrega</dt><dd>${e(d.stage)} · ${d.group ? "Grupal" : "Individual"}</dd></div></dl><span class="lib-badge">Evaluación declarada por el autor</span><p class="lib-grade">${d.grade ? `${e(d.grade.score)} <span>/ ${e(d.grade.maxScore)}</span>` : "Nota no compartida"}</p><h3>Feedback del profesor compartido por el autor</h3><p class="lib-pre">${e(d.feedback || "No compartido")}</p><h3>${e(d.rubricTitle || "Rúbrica")}</h3>${d.rubricStatus === "available" ? `<div class="lib-table-wrap"><table><thead><tr><th>Criterio</th><th>Puntaje</th><th>Feedback</th></tr></thead><tbody>${d.criteria.map((c) => `<tr><th scope="row">${e(c.name)}</th><td data-label="Puntaje">${e(c.score ?? "—")} / ${e(c.maxScore ?? "—")}</td><td class="lib-pre" data-label="Feedback">${e(c.comment || "No compartido")}</td></tr>`).join("")}</tbody></table></div>` : `<p>${e(({ unavailable: "No disponible / no compartida", restricted: "Acceso restringido", not_graded: "Todavía no calificada", no_rubric: "El autor indica que no tuvo rúbrica" } as Record<string, string>)[d.rubricStatus])}</p>`}<h3>Archivos que acompañan la ficha</h3><ul class="lib-files">${w.files.map((f) => `<li><span>${e(f.name)}<small>${Math.ceil(f.size / 1024)} KB</small></span><a href="/api/app/library/works/${w.id}/files/${f.id}">Descargar y revisar</a></li>`).join("")}</ul>`;
}
export function initLibrary(root: HTMLElement) {
  if (root.dataset.ready) return;
  root.dataset.ready = "true";
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const form = $<HTMLFormElement>("[data-lib-form]"),
    preview = $("[data-lib-preview]"),
    status = $("[data-lib-status]");
  let current: Work | null = null,
    requestId: string = crypto.randomUUID(),
    busy = false,
    minePage = 1,
    queuePage = 1,
    admin = false,
    searchVersion = 0;
  let stage = 1;
  let view = "overview";
  let unsaved = false;
  let draftStore: LibraryDraftStore<Recovery> | null = null;
  let localSaved = false, recoveryReady = false, saveVersion = 0;
  let cloud: CloudDraftQueue<Recovery> | null = null, cloudEnabled = false, cloudSaved = false, discarding = false;
  let cloudLastMutation: string | undefined;
  let versionsEnabled=false,versionDeletionEnabled=false,versionsPage=1,pendingKeep:KeepBothOperation|undefined;
  let cloudRemote: CloudCopy<Recovery> | null = null;
  let cloudBase = 0;
  let workspaceScope: string | null = null, workspaceOwner: string | null = null;
  let offlineMode = false, deferredCurrent: Recovery['current'] = null;
  let reconnecting: Promise<void> | null = null;
  let retryConnection = true, transientCloudFailure = false;
  let sessionGeneration = 0;
  let refreshVersionList = () => {};
  if ('serviceWorker' in navigator) {
    const offlineAvailability = async () => {
      try {
        if (await caches.match('/library-offline.html')) $('[data-lib-offline-ready]').textContent = 'Editor disponible sin conexión. Comprueba también «Guardado en este navegador» antes de cerrar.';
      } catch { /* Editing and server saving remain available without CacheStorage. */ }
    };
    void navigator.serviceWorker.register('/sw.js').then(async registration => {
      navigator.serviceWorker.addEventListener('controllerchange', offlineAvailability);
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', offlineAvailability));
      await navigator.serviceWorker.ready;
      await offlineAvailability();
    }).catch(() => { $('[data-lib-offline-ready]').textContent = 'No pudimos preparar la apertura sin conexión. Mantén esta pestaña abierta hasta recuperar internet.'; });
  } else $('[data-lib-offline-ready]').textContent = 'Este navegador no permite abrir el editor sin conexión.';
  function offlineControls() {
    $('[data-lib-save]').firstChild!.textContent = offlineMode ? 'Guardar en este navegador ' : 'Guardar y revisar ';
    $('[data-lib-search]').toggleAttribute('disabled', offlineMode);
    $('[data-lib-new]').toggleAttribute('disabled', offlineMode);
    $<HTMLFormElement>('[data-lib-submit]').hidden = offlineMode || !current;
  }
  const cloudStatus = (text: string, error = false) => {
    $("[data-lib-cloud-text]").textContent = text;
    $("[data-lib-cloud]").classList.toggle("is-error", error);
    $("[data-lib-cloud-retry]").hidden = !error || !!cloud?.paused;
  };
  function cacheCloudState() {
    try { void draftStore?.save(snapshot()).catch(() => {}); } catch { /* Cloud recovery remains available if local storage is full. */ }
  }
  function createCloud(copy: CloudCopy<Recovery>) {
    cloudBase = copy.revision;
    cloudLastMutation = copy.mutationId ?? undefined;
    const queue = new CloudDraftQueue<Recovery>(copy.revision, async (attempt: CloudAttempt<Recovery>) => {
      let encoded: {name:string;base64:string}[] | undefined;
      if (attempt.files !== undefined) {
        try { encoded=await Promise.all(attempt.files.map(async file=>({name:file.name,base64:await base64(file)}))); }
        catch { throw new LibraryApiError(400,"No pudimos leer el archivo. Vuelve a seleccionarlo."); }
      }
      const payload = {...attempt, scope:copy.scope, ...(encoded !== undefined ? {files:encoded} : {})};
      return (await api("recovery", payload)).recovery;
    }, {
      before: () => { if (cloud === queue) cacheCloudState(); },
      saved: copy => {
        if (cloud !== queue) return;
        transientCloudFailure = false;
        cloudBase = copy.revision;
        cloudLastMutation = copy.mutationId ?? undefined;
        cloudSaved = !cloud!.dirty;
        cacheCloudState();
        cloudStatus(cloudSaved ? `Guardado en tu cuenta · ${new Date(copy.updatedAt!).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})} · Puedes continuar en otro dispositivo.` : "Guardando los últimos cambios en tu cuenta…");
        updateResumeNotice();
      },
      failed: error => {
        if (cloud !== queue) return;
        transientCloudFailure = !(error instanceof LibraryApiError) || error.status >= 500;
        cloudSaved = false;
        if (error instanceof LibraryApiError && error.status === 409) {
          cloud!.paused = true;
          $("[data-lib-cloud-conflict]").hidden = false;
          cloudStatus(error.message, true);
        } else {
          cloudStatus(error instanceof LibraryApiError && error.status === 401
            ? "Tu sesión expiró. Entra de nuevo para guardar en tu cuenta; conservamos tus cambios aquí."
            : error instanceof LibraryApiError && [400,413,429].includes(error.status)
              ? `${error.message} Conservamos el avance en esta pestaña.`
              : "No se pudo guardar en tu cuenta. Conservamos el avance de esta pestaña; reintenta la sincronización.", true);
          if (error instanceof LibraryApiError && error.status === 401) $("[data-lib-login]").hidden = false;
        }
        cacheCloudState();
        updateResumeNotice();
      },
    });
    cloud = queue;
  }
  function queueCloud(filesChanged = false) {
    if (offlineMode) {
      cloudSaved = false;
      cloudStatus('Sin conexión · Tus cambios se guardan en este navegador. Se sincronizarán al volver internet.');
      return;
    }
    if (!cloud || missingFiles) return;
    cloudSaved = false;
    cloud.update(snapshot(), filesChanged ? selectedFiles : undefined);
    if (!cloud.paused) cloudStatus("Guardando en tu cuenta de Campus…");
    updateResumeNotice();
  }
  async function flushCloud() {
    if (!cloud) {
      if (cloudEnabled) throw new Error("Reintenta la sincronización de tu cuenta antes de continuar.");
      return;
    }
    await cloud.flush();
  }

  let selectedFiles: File[] = [], missingFiles = false, conflict = false;
  const chosenFiles = () => selectedFiles;
  function autosaveStatus(text: string, error = false) {
    $("[data-lib-autosave-text]").textContent = text;
    $("[data-lib-autosave]").classList.toggle("is-error", error);
    $("[data-lib-autosave-retry]").hidden = !error;
  }
  function snapshot(): Recovery {
    const fields: Record<string, string> = {};
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[name]").forEach(field => {
      if (field.name !== "files") fields[field.name] = field.value;
    });
    return {
      fields,
      criteria: Array.from($("[data-lib-criteria]").children).map(box => Object.fromEntries(
        Array.from(box.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-field]"), field => [field.dataset.field!, field.value]),
      )),
      courses: Array.from((input("courseId") as HTMLSelectElement).options, option => ({ value: option.value, label: option.text })),
      current: current ? {id:current.id,revision:current.revision} : deferredCurrent, work: current, requestId, stage, unsaved,
      cloudRevision:cloud?.revision ?? cloudBase,
      cloudMutation:cloud?.mutationId ?? cloudLastMutation,
      cloudDirty:cloud ? cloud.dirty : true,
      cloudDiscarded:discarding,
      keepBoth:pendingKeep,
      expanded: !!form.querySelector<HTMLDetailsElement>("details")?.open,
    };
  }
  function persistDraft(filesChanged = false, takeover = false) {
    if (!recoveryReady) return;
    const version = ++saveVersion;
    localSaved = false;
    autosaveStatus("Guardando en este navegador…");
    try {
      if (!draftStore) throw new Error("Almacenamiento no disponible.");
      const oversized = selectedFiles.length > 3 || selectedFiles.some(file => file.size > 5 * 1024 * 1024) || selectedFiles.reduce((sum, file) => sum + file.size, 0) > 12 * 1024 * 1024;
      const saving = draftStore.save({...snapshot(),cloudDirty:true}, filesChanged ? oversized ? [] : selectedFiles : undefined, takeover);
      queueCloud(filesChanged);
      void saving.then(savedAt => {
        if (version !== saveVersion) return;
        localSaved = !oversized;
        conflict = false;
        autosaveStatus(oversized
          ? "Texto guardado. Elige hasta 3 archivos de 5 MB como máximo (12 MB en total) para conservarlos."
          : missingFiles
          ? "Texto recuperado. Vuelve a elegir el archivo para conservarlo también."
          : `Guardado en este navegador · ${new Date(savedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`, oversized);
        updateResumeNotice();
      }).catch(error => saveFailed(error, version));
    } catch (error) {
      saveFailed(error, version);
      if (!(error instanceof DraftConflictError)) queueCloud(filesChanged);
    }
  }
  function saveFailed(error: unknown, version: number) {
    if (version !== saveVersion) return;
    conflict = error instanceof DraftConflictError;
    if (conflict && cloud) cloud.paused = true;
    localSaved = false;
    autosaveStatus(conflict
      ? "Otra pestaña cambió este borrador. El guardado está en pausa; «Usar esta versión» reemplazará esa copia con tus cambios de aquí."
      : "No se pudo guardar todo en este navegador. Comprueba el espacio disponible y reintenta antes de cerrar.", true);
    $("[data-lib-autosave-retry]").textContent = conflict ? "Usar esta versión" : "Reintentar guardado";
    updateResumeNotice();
  }
  function changed(filesChanged = false) {
    discarding = false;
    unsaved = true;
    preview.hidden = true;
    persistDraft(filesChanged);
    updateResumeNotice();
  }
  $("[data-lib-autosave-retry]").onclick = async () => {
    if (!draftStore) {
      try {
        draftStore = new LibraryDraftStore<Recovery>(await libraryDraftKey(await recoveryOwnerEmail()), localStorage, indexedDraftFiles());
        const saved = await draftStore.load();
        if (saved && !confirm("Ya hay una copia de recuperación. ¿Reemplazarla con lo que tienes en esta pestaña?")) { draftStore = null; return; }
      } catch { saveFailed(new Error(), ++saveVersion); return; }
    }
    if (conflict && cloud) { cloudRemote = (await api("recovery")).recovery; cloud.rebase(cloudRemote!.revision); }
    persistDraft(true, conflict);
  };
  $("[data-lib-cloud-retry]").onclick = () => void run(async () => {
    if (offlineMode) { await reconnectOffline(); return; }
    if (!cloud) await connectCloud(snapshot(), selectedFiles, missingFiles);
    if (cloud && !cloud.paused) await cloud.flush();
  });
  $('[data-lib-keep-both]').onclick=()=>void run(async()=>{
    if(missingFiles) throw new Error('Vuelve a elegir los archivos que faltan antes de conservar ambas versiones.');
    const local=snapshot(),files=selectedFiles;
    const latest:CloudCopy<Recovery>=(await api('recovery')).recovery;
    pendingKeep=await keepBothOperation(local,files,pendingKeep);
    // Persist retry identity and files before the request can commit on the server.
    if(!draftStore) throw new Error("No pudimos preparar un reintento seguro. Activa el almacenamiento de este navegador y vuelve a intentarlo.");
    await draftStore.save({...local,keepBoth:pendingKeep,cloudDirty:true},files);
    const result=await api('recovery/keep-both',{scope:workspaceScope,revision:latest.revision,mutationId:pendingKeep.id,snapshot:local,
      files:await Promise.all(files.map(async file=>({name:file.name,base64:await base64(file)})))});
    await versions(1);
    pendingKeep=undefined;
    if(result.recovery.revision!==result.preservedRevision) {
      cacheCloudState();
      throw new Error('Las dos versiones ya están conservadas. El otro dispositivo hizo cambios nuevos; vuelve a conservar ambas para incluirlos.');
    }
    // Continue an independent copy; never update the original saved work.
    await applyRecovery({...local,keepBoth:undefined,current:null,requestId:crypto.randomUUID(),unsaved:true,stage:local.stage===2?2:1},files,false,false);
    createCloud(result.recovery);
    $('[data-lib-cloud-conflict]').hidden=true;
    persistDraft(true);
    await flushCloud(); // A newer concurrent save still fails CAS with 409.
    showView('overview');replaceWorkspaceHash('#aportes');
    message('Las dos versiones están guardadas en tu cuenta, incluidos sus archivos. Puedes retomar cualquiera en Versiones conservadas.');
  });
  $('[data-lib-versions-refresh]').onclick=()=>void run(()=>versions(1));
  $('[data-lib-version-delete-cancel]').onclick=()=>$<HTMLDialogElement>('[data-lib-version-delete-dialog]').close();
  $('[data-lib-version-delete-confirm]').onclick=()=>{
    const dialog=$<HTMLDialogElement>('[data-lib-version-delete-dialog]'),id=dialog.dataset.versionId;
    dialog.close();if(id)void run(()=>deleteVersion(id));
  };
  $('[data-lib-version-cancel]').onclick=()=>$<HTMLDialogElement>('[data-lib-version-dialog]').close();
  $('[data-lib-version-confirm]').onclick=()=>{
    const dialog=$<HTMLDialogElement>('[data-lib-version-dialog]'),id=dialog.dataset.versionId;
    dialog.close();if(id)void run(()=>openVersion(id));
  };
  $("[data-lib-cloud-use-local]").onclick = () => void run(async () => {
    if (missingFiles) {
      showView("upload"); replaceWorkspaceHash("#subir"); showStage(1);
      throw new Error("Vuelve a elegir el archivo que falta antes de usar esta versión.");
    }
    const latest: CloudCopy<Recovery> = (await api("recovery")).recovery;
    if (!cloud) createCloud(latest);
    cloud!.rebase(latest.revision);
    $("[data-lib-cloud-conflict]").hidden = true;
    queueCloud(true);
    cacheCloudState();
    await cloud!.flush();
  });
  $("[data-lib-cloud-use-remote]").onclick = () => void run(async () => {
    const latest: CloudCopy<Recovery> = (await api("recovery")).recovery;
    if (latest.snapshot) {
      const files = await downloadRecoveryFiles(latest);
      await applyRecovery(latest.snapshot, files, false, true);
    } else resetEditor();
    createCloud(latest);
    cloudSaved = !missingFiles;
    $("[data-lib-cloud-conflict]").hidden = true;
    try { await draftStore?.clear(true); } catch {}
    if (latest.snapshot) { await draftStore?.save(snapshot(), selectedFiles, true); localSaved=true; }
    cloudStatus(latest.snapshot ? "Borrador de tu cuenta recuperado. Ya puedes continuar aquí." : "El borrador fue descartado en tu cuenta.");
    updateResumeNotice();
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && cloud?.dirty && !cloud.paused) void cloud.flush().catch(() => {}); });
  window.addEventListener("online", () => {
    if (offlineMode) void run(reconnectOffline);
    else if (cloud?.dirty && !cloud.paused) void cloud.flush().catch(() => {});
  });
  const versionSync = watchLibraryVersions({
    window, document,
    active: () => root.isConnected && navigator.onLine && document.visibilityState === 'visible'
      && versionsEnabled && !offlineMode && !busy && view === 'overview' && !$('[data-lib-private]').hidden,
    refresh: async () => {
      try { await versions(); }
      catch { $('[data-lib-versions-sync]').textContent = 'No pudimos actualizar las versiones. Reintentaremos al recuperar la conexión.'; }
    },
    interval: callback => {
      const timer = setInterval(() => { if (!root.isConnected) versionSync.stop(); else callback(); }, 15000);
      return () => clearInterval(timer);
    },
  });
  refreshVersionList = versionSync.refresh;
  window.addEventListener('offline', () => {
    if (root.isConnected) $('[data-lib-versions-sync]').textContent = 'Sin conexión. Las versiones se actualizarán al volver internet.';
  });
  window.addEventListener('storage', event => {
    if (event.key !== LIBRARY_OFFLINE_OWNER && event.key !== 'campus-session-revision-v1') return;
    sessionGeneration++;
    if (!draftStore || readOfflineOwner(localStorage)?.key === draftStore.key) return;
    if (cloud) cloud.paused = true;
    cloud = null;
    recoveryReady = false;
    $('[data-lib-private]').hidden = true;
    $('[data-lib-login]').hidden = false;
    message('La cuenta cambió o se cerró la sesión. Tu borrador local sigue guardado; vuelve a entrar para continuar.');
  });
  const checkConnection = () => {
    if (!root.isConnected || !navigator.onLine || busy) return;
    if (offlineMode && retryConnection) void run(reconnectOffline);
    else if (transientCloudFailure && cloud?.dirty && !cloud.paused) void cloud.flush().catch(() => {});
  };
  let connectionTimer = setInterval(checkConnection, 10000);
  window.addEventListener('pagehide', () => clearInterval(connectionTimer));
  window.addEventListener('pageshow', () => { clearInterval(connectionTimer); connectionTimer = setInterval(checkConnection, 10000); checkConnection(); });
  const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const;
  window.addEventListener("beforeunload", (event) => {
    if (!unsaved || localSaved || cloudSaved) return;
    event.preventDefault();
  });
  function updateResumeNotice() {
    $("[data-lib-resume]").hidden = !unsaved && !current;
    $("[data-lib-resume-description]").textContent = missingFiles
      ? "Recuperamos tus textos. Continúa tu aporte y vuelve a seleccionar el archivo."
      : cloudSaved
      ? "Tu borrador está guardado en tu cuenta Campus, incluidos los archivos. Puedes retomarlo en otro navegador o dispositivo."
      : localSaved
      ? "Tu borrador se guarda automáticamente en este navegador. Retómalo aquí con tu cuenta Campus, aunque cierres la pestaña."
      : unsaved
        ? "Tienes cambios en esta pestaña. Comprueba el estado de guardado antes de cerrarla."
        : "Tu borrador está guardado en Campus. Puedes retomar la revisión cuando quieras.";
  }
  function replaceWorkspaceHash(hash: string) {
    if (root.isConnected && location.pathname === '/app/biblioteca/') {
      history.replaceState(history.state, "", '/app/biblioteca/' + hash);
    }
  }
  function showView(next: string) {
    if (offlineMode) next = 'upload';
    updateResumeNotice();
    view = next === "admin" && !admin ? "overview" : next;
    $("[data-lib-page-title]").textContent =
      view === "upload"
        ? "Subir un trabajo"
        : view === "admin"
          ? "Revisar aportes"
          : "Mis aportes";
    $("[data-lib-page-description]").textContent =
      view === "upload"
        ? "Archivo, contexto y lo que aprendiste."
        : view === "admin"
          ? "Ayuda a que cada aporte sea útil para la comunidad."
          : "Tus trabajos, con todo lo que aprendiste.";
    $("[data-lib-overview]").hidden = view !== "overview";
    $("[data-lib-upload]").hidden = view !== "upload";
    $("[data-lib-admin]").hidden = view !== "admin" || !admin;
    root.querySelectorAll<HTMLElement>("[data-lib-view]").forEach((link) => {
      if (link.dataset.libView === view)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (view === 'overview') refreshVersionList();
  }
  function showStage(next: number) {
    stage = next;
    form.hidden = stage === 3;
    root.querySelectorAll<HTMLElement>("[data-lib-stage]").forEach((panel) => {
      panel.hidden = Number(panel.dataset.libStage) !== stage;
    });
    $("[data-lib-back]").hidden = stage !== 2;
    $("[data-lib-next]").hidden = stage !== 1;
    $("[data-lib-save]").hidden = stage !== 2;
    root.querySelectorAll<HTMLElement>("[data-lib-step]").forEach((button) => {
      if (Number(button.dataset.libStep) === stage)
        button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    $("[data-lib-step-review]").toggleAttribute("data-active", stage === 3);
    if (stage === 3) $("[data-lib-step-review]").setAttribute("aria-current", "step");
    else $("[data-lib-step-review]").removeAttribute("aria-current");
    if (stage !== 3) preview.hidden = true;
    if (recoveryReady && (unsaved || current)) persistDraft();
  }
  function validateStage(next: number) {
    if (next === 1) {
      if (missingFiles) {
        const notice = $("[data-lib-form-status]");
        notice.textContent = "Vuelve a seleccionar el archivo que no pudimos recuperar antes de continuar.";
        notice.hidden = false; notice.classList.add("is-error"); showStage(1);
        return false;
      }
      const files = chosenFiles();
      if (files.length > 3 || files.some((file) => !file.size || file.size > 5 * 1024 * 1024 || !/\.(pdf|docx)$/i.test(file.name)) || files.reduce((total, file) => total + file.size, 0) > 12 * 1024 * 1024) {
        const notice = $("[data-lib-form-status]");
        notice.textContent = "Selecciona hasta 3 archivos PDF o DOCX. Máximo 5 MB por archivo y 12 MB en total.";
        notice.hidden = false;
        notice.classList.add("is-error");
        (form.elements.namedItem("files") as HTMLInputElement).focus();
        return false;
      }
    }
    const panel = $(`[data-lib-stage="${next}"]`);
    const invalid = Array.from(
      panel.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input,select,textarea"),
    ).find((field) => !field.checkValidity());
    if (invalid) {
      showStage(next);
      const disclosure = invalid.closest<HTMLDetailsElement>("details");
      if (disclosure) disclosure.open = true;
      invalid.focus();
      invalid.reportValidity();
      return false;
    }
    return true;
  }
  const fromHash = () => {
    if (!root.isConnected || location.pathname !== "/app/biblioteca/" || !isLibraryWorkspaceViewHash(location.hash)) return;
    showView(
      location.hash === "#subir"
        ? "upload"
        : location.hash === "#revision"
          ? "admin"
          : "overview",
    );
  };
  window.addEventListener("hashchange", fromHash);
  root.addEventListener("campus:library-route", fromHash);
  root
    .querySelectorAll<HTMLButtonElement>("[data-lib-step]")
    .forEach((button) => {
      button.onclick = () => {
        const next = Number(button.dataset.libStep);
        if (next === 2 && !validateStage(1)) return;
        showStage(next);
      };
    });
  $("[data-lib-next]").onclick = () => {
    if (validateStage(1)) {
      message("");
      $("[data-lib-form-status]").hidden = true;
      showStage(2);
      const legend = $('[data-lib-stage="2"] legend');
      legend.tabIndex = -1;
      legend.focus();
    }
  };
  $("[data-lib-back]").onclick = () => showStage(1);
  $("[data-lib-edit-preview]").onclick = () => {
    showStage(1);
    $("#subir").scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };
  const input = (name: string) =>
    form.elements.namedItem(name) as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const message = (text: string, error = false) => {
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle("is-error", error);
  };
  class LibraryApiError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
  async function recoveryOwnerEmail(): Promise<string> {
    if (workspaceOwner) return workspaceOwner;
    const response=await fetch("/api/app/session",{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(15000)});
    const session=await response.json();
    if(!response.ok||!session.authenticated||typeof session.email!=="string")throw new Error("Inicia sesión en Campus.");
    return session.email;
  }
  async function api(path: string, body?: unknown) {
    const r = await fetch("/api/app/library/" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? {} : { "content-type": "application/json", ...(workspaceScope ? {"x-campus-library-account":workspaceScope} : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    let d: any;
    try {
      d = await r.json();
    } catch {
      throw new Error(
        "El servidor no respondió correctamente. Inténtalo de nuevo.",
      );
    }
    if (!r.ok) throw new LibraryApiError(r.status, d.error || "No se pudo completar la operación.");
    if (d.recovery && cloudEnabled && (!workspaceScope || d.recovery?.scope !== workspaceScope)) throw new LibraryApiError(401,"Tu cuenta cambió. Abre Biblioteca de nuevo para continuar.");
    return d;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    const controls = Array.from(
      root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("button,input,select,textarea"),
    ).map((control) => ({ control, wasDisabled: control.disabled }));
    controls.forEach(({ control }) => (control.disabled = true));
    try {
      await action();
    } catch (err) {
      const error = err instanceof Error ? err.message : "No se pudo completar la operación.";
      if (view === "upload" && !form.hidden && !$("[data-lib-private]").hidden) {
        const notice = $("[data-lib-form-status]");
        notice.textContent = error;
        notice.hidden = false;
        notice.classList.add("is-error");
        notice.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
      } else {
        message(error, true);
        if ($("[data-lib-private]").hidden) $("[data-lib-retry-load]").hidden = false;
        status.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
      }
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      controls.forEach(({ control, wasDisabled }) => (control.disabled = wasDisabled));
      offlineControls();
    }
  }
  function pages(
    target: HTMLElement,
    page: number,
    hasMore: boolean,
    load: (n: number) => Promise<void>,
  ) {
    target.replaceChildren();
    for (const [label, n] of [
      ["← Anterior", page - 1],
      ["Siguiente →", page + 1],
    ] as const) {
      if (n < 1 || (n > page && !hasMore)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lib-button lib-secondary";
      b.textContent = label;
      b.onclick = () => void run(() => load(n));
      target.append(b);
    }
  }
  function card(w: Work, staff = false) {
    return `<article class="lib-card"><span class="lib-badge">${e(statusName[w.status])}</span><h3>${e(w.data.title)}</h3><p class="lib-muted">${e(w.course.name)} · ${e(w.course.university)}</p>${w.note ? `<p class="lib-pre">${e(w.note)}</p>` : ""}${w.credits ? `<p>${w.credits} consultas concedidas</p>` : ""}<div class="lib-actions">${staff ? `<button class="lib-button" data-review="${w.id}">Revisar</button>` : `<button class="lib-button lib-secondary" data-open="${w.id}">${["draft", "rejected"].includes(w.status) ? "Editar y revisar" : "Ver ficha"}</button>${w.status === "published" ? `<a href="${publicPath(w)}">Ver pública</a>` : ""}${w.status !== "withdrawn" ? `<button class="lib-button lib-secondary lib-danger" data-withdraw="${w.id}" data-revision="${w.revision}">Retirar</button>` : ""}`}</div></article>`;
  }
  async function mine(page = minePage) {
    minePage = page;
    const generation = sessionGeneration;
    const data = await api("mine?page=" + page);
    if (!root.isConnected || generation !== sessionGeneration) throw new LibraryApiError(401, 'La sesión cambió durante la carga. Vuelve a abrir Biblioteca.');
    if (workspaceScope && data.recoveryScope !== workspaceScope) throw new LibraryApiError(401,"Tu cuenta cambió. Abre Biblioteca de nuevo para continuar.");
    workspaceScope ??= typeof data.recoveryScope === "string" ? data.recoveryScope : null;
    workspaceOwner ??= typeof data.recoveryOwner === "string" ? data.recoveryOwner : null;
    admin = data.admin;
    $("[data-lib-private]").hidden = false;
    $("[data-lib-admin-nav]").hidden = !admin;
    showView(view);
    $("[data-lib-credits]").textContent = String(data.rewards.total);
    $("[data-lib-week]").textContent =
      `${data.rewards.rewardedThisWeek} de ${data.rewards.weeklyLimit} aportes premiados esta semana`;
    $<HTMLMeterElement>("[data-lib-meter]").value =
      data.rewards.rewardedThisWeek;
    $("[data-lib-mine]").innerHTML = data.works.length
      ? data.works.map((w: Work) => card(w)).join("")
      : `<div class="lib-empty"><span class="lib-empty-symbol">${libraryIcon("file-text")}</span><h3>Aquí empieza tu colección de aportes</h3><p>Guarda un trabajo como borrador. Después podrás revisarlo y decidir si lo compartes.</p><a href="/app/biblioteca/#subir" class="lib-button lib-secondary">Subir mi primer trabajo ${libraryIcon("arrow-right")}</a></div>`;
    pages($("[data-lib-mine-pages]"), page, data.hasMore, mine);
    if(versionsEnabled) await versions();
  }
  type SavedVersion={id:string;side:string;title:string;course:string;createdAt:string;fileCount?:number};
  let visibleVersions:SavedVersion[]=[];
  let versionRead = 0, versionListSignature = '';
  async function versions(page=versionsPage) {
    const generation=sessionGeneration, read=++versionRead;
    const data=await api('recovery/versions?page='+page);
    if(generation!==sessionGeneration || !root.isConnected) throw new Error('La cuenta cambió durante la carga.');
    if(read!==versionRead)return;
    if(page>1 && !data.versions.length)return versions(page-1);
    versionsPage=page;
    visibleVersions=data.versions;
    $('[data-lib-versions]').hidden=false;
    $('[data-lib-versions-sync]').textContent = 'Actualizado con tu cuenta Campus.';
    const signature=JSON.stringify({page,versions:data.versions,hasMore:data.hasMore});
    if(signature===versionListSignature)return; // Preserve keyboard focus when nothing changed.
    versionListSignature=signature;
    const dialog=$<HTMLDialogElement>('[data-lib-version-delete-dialog]');
    if(dialog.open && !visibleVersions.some(v=>v.id===dialog.dataset.versionId))dialog.close();
    $('[data-lib-versions-list]').innerHTML=data.versions.length?data.versions.map((v:SavedVersion)=>`<article class="lib-card"><span class="lib-badge">Borrador privado · ${v.side==='local'?'Copia aportada':'Copia de Campus'}</span><h3>${e(v.title||'Borrador sin título')}</h3><p class="lib-muted">${e(v.course||'Curso pendiente')} · ${e(new Date(v.createdAt).toLocaleString('es-PE'))}</p><div class="lib-actions"><button class="lib-button lib-secondary" type="button" data-version="${e(v.id)}">Retomar esta versión</button>${versionDeletionEnabled?`<button class="lib-button lib-secondary lib-danger" type="button" data-version-delete="${e(v.id)}">${libraryIcon("trash-2")} Eliminar versión</button>`:""}</div></article>`).join(''):'<p class="lib-muted">Aquí aparecerán las dos copias cuando elijas «Conservar ambas» al resolver un conflicto.</p>';
    pages($('[data-lib-versions-pages]'),page,data.hasMore,versions);
  }
  function confirmVersionDeletion(id:string) {
    const version=visibleVersions.find(v=>v.id===id);
    if(!version || !versionDeletionEnabled || busy)return;
    const dialog=$<HTMLDialogElement>('[data-lib-version-delete-dialog]');
    dialog.dataset.versionId=id;
    $('[data-lib-version-delete-title]').textContent=version.title||'Borrador sin título';
    $('[data-lib-version-delete-files]').textContent=typeof version.fileCount==='number'?`${version.fileCount} ${version.fileCount===1?'archivo':'archivos'}`:'sus archivos';
    dialog.showModal();
  }
  async function deleteVersion(id:string) {
    const generation=sessionGeneration;
    await api(`recovery/versions/${id}/delete`,{scope:workspaceScope,confirm:true});
    if(generation!==sessionGeneration || !root.isConnected)return;
    root.querySelector<HTMLButtonElement>(`button[data-version-delete="${id}"]`)?.closest('article')?.remove();
    versionListSignature='';
    message('Versión eliminada con sus archivos. Tu borrador original y tu avance actual siguen guardados.');
    try { await versions(); }
    catch { message('La versión se eliminó. No pudimos actualizar la lista; pulsa Actualizar versiones.',true); }
  }
  async function openVersion(id:string) {
    if(cloud?.paused) throw new Error('Resuelve primero el conflicto del borrador actual. Tus versiones conservadas siguen a salvo en tu cuenta.');
    await flushCloud();
    const {version}=await api('recovery/versions/'+id);
    const files=await downloadRecoveryFiles(version,`recovery/versions/${id}/files/`);
    pendingKeep=undefined;
    await applyRecovery({...version.snapshot,current:null,requestId:crypto.randomUUID(),unsaved:true,stage:version.snapshot.stage===2?2:1},files,false,true);
    persistDraft(true);
    await flushCloud();
    showView('upload');replaceWorkspaceHash('#subir');
    message('Versión recuperada con todos sus archivos. Las dos copias conservadas siguen en tu cuenta.');
  }
  async function queue(page = queuePage) {
    queuePage = page;
    const data = await api("admin?page=" + page);
    $("[data-lib-queue]").innerHTML = data.works.length
      ? `<div class="lib-grid">${data.works.map((w: Work) => card(w, true)).join("")}</div>`
      : "<p>No hay aportes pendientes.</p>";
    pages($("[data-lib-queue-pages]"), page, data.hasMore, queue);
  }
  function addCriterion(row?: Row) {
    const box = document.createElement("div");
    box.className = "lib-criterion";
    box.innerHTML = `<div class="lib-form-grid"><label>Criterio<input data-field="name" maxlength="160" minlength="2" required value="${e(row?.name)}"></label><label>Puntaje<input data-field="score" type="number" min="0" max="10000" step="any" value="${e(row?.score)}"></label><label>Máximo<input data-field="maxScore" type="number" min="0.01" max="10000" step="any" value="${e(row?.maxScore)}"></label></div><label>Comentario por criterio<textarea data-field="comment" maxlength="2000" rows="2">${e(row?.comment)}</textarea></label><button type="button" class="lib-button lib-secondary" data-remove-criterion>Quitar criterio</button>`;
    $("[data-lib-criteria]").append(box);
    box.querySelector<HTMLButtonElement>("[data-remove-criterion]")!.onclick =
      () => {
        box.remove();
        changed();
      };
  }
  async function reset() {
    discarding = true;
    cacheCloudState();
    await cloud?.discard();
    if (draftStore) {
      try { void draftStore.clear().catch(() => autosaveStatus("El texto se eliminó; no pudimos limpiar los archivos locales. Reintenta.", true)); }
      catch (error) { saveFailed(error, ++saveVersion); return; }
    }
    resetEditor();
    cloudStatus("Guardado automático en tu cuenta Campus, mientras escribes.");
  }
  function resetEditor() {
    deferredCurrent = null;
    pendingKeep=undefined;
    discarding = false;
    ++saveVersion;
    localSaved = false;
    cloudSaved = false;
    selectedFiles = [];
    missingFiles = false;
    $("[data-lib-recovered]").hidden = true;
    unsaved = false;
    current = null;
    requestId = crypto.randomUUID();
    form.reset();
    (input("courseId") as HTMLSelectElement).replaceChildren(new Option("Busca y selecciona tu curso", ""));
    form.querySelector<HTMLDetailsElement>("details")!.open = false;
    (input("files") as HTMLInputElement).required = true;
    $("[data-lib-existing]").textContent = "";
    $("[data-lib-criteria]").replaceChildren();
    $("[data-lib-rubric]").hidden = true;
    preview.hidden = true;
    $("[data-lib-form-status]").hidden = true;
    $("[data-lib-form-status]").classList.remove("is-error");
    $("#lib-editor-title").textContent = "Comparte lo que aprendiste.";
    $("[data-lib-selected]").textContent = "";
    $("#subir").hidden = false;
    showStage(1);
    autosaveStatus("Guardado automático en este navegador, mientras escribes.");
    updateResumeNotice();
  }
  async function open(id: string) {
    if (id === current?.id) {
      showView("upload");
      replaceWorkspaceHash("#subir");
      return;
    }
    const { work: w } = await api("works/" + id);
    if (!["draft", "rejected"].includes(w.status)) {
      showView("overview");
      replaceWorkspaceHash("#aportes");
      $("[data-lib-inspect-content]").innerHTML = detail(w);
      $("[data-lib-inspect]").hidden = false;
      if (root.isConnected) $("[data-lib-inspect]").scrollIntoView({ behavior: scrollBehavior() });
      return;
    }
    if (unsaved && !confirm("Abrir otro borrador reemplazará la copia de recuperación de este navegador. ¿Quieres continuar?")) return;
    await flushCloud();
    discarding = false;
    unsaved = false;
    showView("upload");
    replaceWorkspaceHash("#subir");
    current = w;
    selectedFiles = [];
    missingFiles = false;
    (input("files") as HTMLInputElement).required = false;
    $("#subir").hidden = false;
    showStage(1);
    requestId = crypto.randomUUID();
    form.reset();
    for (const name of [
      "title",
      "summary",
      "kind",
      "author",
      "professor",
      "evaluator",
      "period",
      "stage",
      "rubricStatus",
      "rubricTitle",
      "feedback",
    ])
      input(name).value = w.data[name] ?? "";
    input("group").value = String(w.data.group);
    input("score").value = w.data.grade?.score ?? "";
    input("maxScore").value = w.data.grade?.maxScore ?? "";
    const select = input("courseId") as HTMLSelectElement;
    select.replaceChildren(
      new Option(
        `${w.course.university} · ${w.course.name} ${w.course.code ?? ""}`,
        String(w.course.id),
        true,
        true,
      ),
    );
    $("[data-lib-existing]").textContent =
      "Archivos guardados: " +
      w.files.map((f: any) => f.name).join(", ") +
      ". Si seleccionas archivos nuevos, reemplazarán a los anteriores.";
    $("[data-lib-criteria]").replaceChildren();
    w.data.criteria.forEach(addCriterion);
    $("[data-lib-rubric]").hidden = w.data.rubricStatus !== "available";
    $("#lib-editor-title").textContent = "Editar borrador";
    $("[data-lib-preview-content]").innerHTML = detail(w);
    preview.hidden = true;
    $<HTMLFormElement>("[data-lib-submit]").hidden = ![
      "draft",
      "rejected",
    ].includes(w.status);
    $<HTMLFormElement>("[data-lib-submit]").reset();
    selectedFiles = await downloadWorkFiles(w);
    renderSelectedFiles();
    persistDraft(true);
    if (["draft", "rejected"].includes(w.status)) {
      $("#subir").scrollIntoView({ behavior: scrollBehavior() });
    } else {
      preview.scrollIntoView({ behavior: scrollBehavior() });
    }
  }
  function dataFromForm(): Data {
    const v = (name: string) => input(name).value.trim();
    const num = (s: string) => (s === "" ? null : Number(s));
    const score = num(v("score")),
      maxScore = num(v("maxScore"));
    if ((score === null) !== (maxScore === null))
      throw new Error("Completa la nota y su máximo, o deja ambos vacíos.");
    if (score !== null && (maxScore! <= 0 || score > maxScore!))
      throw new Error("La nota no puede superar su máximo.");
    const rubricStatus = v("rubricStatus");
    const criteria =
      rubricStatus === "available"
        ? Array.from($("[data-lib-criteria]").children).map((box) => {
            const field = (k: string) =>
              (
                box.querySelector(`[data-field="${k}"]`) as HTMLInputElement
              ).value.trim();
            return {
              name: field("name"),
              score: num(field("score")),
              maxScore: num(field("maxScore")),
              comment: field("comment"),
            };
          })
        : [];
    return {
      courseId: Number(v("courseId")),
      title: v("title"),
      summary: v("summary"),
      kind: v("kind"),
      author: v("author"),
      professor: v("professor"),
      evaluator: v("evaluator"),
      period: v("period"),
      stage: v("stage"),
      group: v("group") === "true",
      grade: score === null ? null : { score, maxScore: maxScore! },
      feedback: v("feedback"),
      rubricStatus,
      rubricTitle: v("rubricTitle"),
      criteria,
    };
  }
  function base64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("No pudimos leer " + file.name));
      reader.readAsDataURL(file);
    });
  }
  form.addEventListener("input", event => {
    if ((event.target as HTMLInputElement).type !== "file") changed();
  });
  form.addEventListener("change", event => {
    if ((event.target as HTMLInputElement).type !== "file") changed();
  });
  function renderSelectedFiles() {
    $("[data-lib-selected]").textContent = chosenFiles().map(file =>
      `${file.name} · ${file.size < 1024 * 1024 ? Math.ceil(file.size / 1024) + " KB" : (file.size / 1024 / 1024).toFixed(2) + " MB"}`,
    ).join("\n");
    (input("files") as HTMLInputElement).required = !current && !selectedFiles.length;
  }
  input("files").addEventListener("change", () => {
    selectedFiles = Array.from((input("files") as HTMLInputElement).files ?? []);
    missingFiles = false;
    $("[data-lib-recovered]").hidden = true;
    renderSelectedFiles();
    changed(true);
  });
  $<HTMLInputElement>("#lib-course-search").addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        $("[data-lib-search]").click();
      }
    },
  );
  input("rubricStatus").addEventListener("change", () => {
    const show = input("rubricStatus").value === "available";
    $("[data-lib-rubric]").hidden = !show;
    if (show && !$("[data-lib-criteria]").children.length) addCriterion();
    $("[data-lib-criteria]")
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input,textarea",
      )
      .forEach((x) => (x.disabled = !show));
    changed();
  });
  $("[data-lib-add-criterion]").onclick = () => {
    if ($("[data-lib-criteria]").children.length < 20) { addCriterion(); changed(); }
    preview.hidden = true;
  };
  $("[data-lib-new]").onclick = () => {
    if (
      unsaved &&
      !confirm("¿Descartar el borrador de este navegador y empezar de nuevo?")
    )
      return;
    void run(reset);
  };
  $("[data-lib-close-inspect]").onclick = () => { $("[data-lib-inspect]").hidden = true; };
  $("[data-lib-search]").onclick = () =>
    void run(async () => {
      const q = $<HTMLInputElement>("#lib-course-search").value.trim();
      if (q.length < 2)
        throw new Error(
          "Escribe al menos dos caracteres para buscar el curso.",
        );
      const version = ++searchVersion;
      const data = await api("catalog?q=" + encodeURIComponent(q));
      if (version !== searchVersion) return;
      const select = input("courseId") as HTMLSelectElement;
      select.replaceChildren(
        new Option(
          data.courses.length
            ? "Selecciona tu curso"
            : "No encontramos cursos; prueba otro nombre o código",
          "",
        ),
      );
      data.courses.forEach((c: any) =>
        select.add(
          new Option(
            `${c.university} · ${c.name} ${c.code ?? ""}`,
            String(c.id),
          ),
        ),
      );
      changed();
      message(
        data.courses.length
          ? "Selecciona el curso en la lista."
          : "No se encontraron cursos.",
      );
    });
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!validateStage(1)) return;
    if (stage === 1) {
      showStage(2);
      return;
    }
    if (!validateStage(2)) return;
    if (offlineMode) {
      persistDraft();
      message('Borrador guardado en este navegador. Se sincronizará al volver internet.');
      return;
    }
    void run(async () => {
      if (draftStore) {
        try { await draftStore.save(snapshot()); }
        catch (error) {
          if (error instanceof DraftConflictError) {
            saveFailed(error, ++saveVersion);
            throw new Error("Hay cambios en otra pestaña. Resuelve el aviso de guardado antes de reemplazar este borrador.");
          }
          // A local storage failure must not prevent an explicit server save.
        }
      }
      await flushCloud();
      const data = dataFromForm(),
        files = chosenFiles();
      if (
        files.length > 3 ||
        files.some(
          (f) =>
            !f.size ||
            f.size > 5 * 1024 * 1024 ||
            !/\.(pdf|docx)$/i.test(f.name),
        ) ||
        files.reduce((s, f) => s + f.size, 0) > 12 * 1024 * 1024
      )
        throw new Error(
          "Sube hasta tres PDF o DOCX de 5 MB como máximo; 12 MB en total.",
        );
      if (!current && !files.length)
        throw new Error("Selecciona el archivo de tu trabajo.");
      const notice = $("[data-lib-form-status]");
      notice.hidden = false;
      notice.classList.remove("is-error");
      notice.textContent = "Guardando tu borrador…";
      const payload = {
        requestId,
        data,
        ...(current ? { revision: current.revision } : {}),
        ...(files.length
          ? {
              files: await Promise.all(
                files.map(async (f) => ({
                  name: f.name,
                  base64: await base64(f),
                })),
              ),
            }
          : {}),
      };
      const result = await api(
        current ? "works/" + current.id : "works",
        payload,
      );
      current = result.work;
      unsaved = false;
      missingFiles = false;
      (input("files") as HTMLInputElement).required = false;
      (input("files") as HTMLInputElement).value = "";
      renderSelectedFiles();
      $("[data-lib-existing]").textContent =
        "Archivos guardados: " + current!.files.map((f) => f.name).join(", ");
      notice.textContent =
        "Borrador guardado. Revisa la ficha antes de enviarla.";
      $("[data-lib-preview-content]").innerHTML = detail(current!);
      showStage(3);
      preview.hidden = false;
      $<HTMLFormElement>("[data-lib-submit]").hidden = false;
      $<HTMLFormElement>("[data-lib-submit]").reset();
      persistDraft(true);
      await flushCloud();
      await mine();
      preview.scrollIntoView({ behavior: scrollBehavior() });
      message("Tu borrador está guardado y sigue siendo privado.");
    });
  };
  $<HTMLFormElement>("[data-lib-submit]").onsubmit = (event) => {
    event.preventDefault();
    void run(async () => {
      if (!current) return;
      const result = await api(`works/${current.id}/submit`, {
        revision: current.revision,
        publishConsent: true,
        rightsConsent: true,
      });
      current = result.work;
      preview.hidden = true;
      await reset();
      await mine();
      showView("overview");
      replaceWorkspaceHash("#aportes");
      message(
        "Tu aporte está en revisión. Al aprobarlo aparecerá en la biblioteca y recibirás las consultas que correspondan.",
      );
    });
  };
  $("[data-lib-refresh]").onclick = () => void run(() => mine());
  $("[data-lib-admin-refresh]").onclick = () => void run(() => queue());
  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-open],[data-withdraw],[data-review],button[data-version],button[data-version-delete]",
    );
    if (!target) return;
    if(target.dataset.versionDelete)confirmVersionDeletion(target.dataset.versionDelete);
    if (target.dataset.version) {
      if(unsaved) {
        const dialog=$<HTMLDialogElement>('[data-lib-version-dialog]');
        dialog.dataset.versionId=target.dataset.version;
        dialog.showModal();
      } else void run(()=>openVersion(target.dataset.version!));
    }
    if (target.dataset.open) void run(() => open(target.dataset.open!));
    if (
      target.dataset.withdraw &&
      confirm("¿Retirar este aporte? Dejará de estar disponible públicamente.")
    )
      void run(async () => {
        await api(`works/${target.dataset.withdraw}/withdraw`, {
          revision: Number(target.dataset.revision),
        });
        if (current?.id === target.dataset.withdraw) await reset();
        await mine();
        message("El aporte fue retirado.");
      });
    if (target.dataset.review)
      void run(async () => {
        const { work: w } = await api("works/" + target.dataset.review);
        const panel = $("[data-lib-review]");
        panel.hidden = false;
        panel.innerHTML = `<div class="lib-review-body">${detail(w)}<form data-review-form><label class="lib-check"><input type="checkbox" name="checked">Revisé los archivos, autoría, permisos y datos personales. El contenido es legible y pertinente.</label><label class="lib-check"><input type="checkbox" name="bonus">El feedback aporta contexto útil (+1 consulta si cumple los límites).</label><label>Mensaje para el autor<textarea name="note" maxlength="1500" rows="3" placeholder="Explica qué debe corregir si no se aprueba."></textarea></label><div class="lib-actions"><button class="lib-button" type="submit" value="approve">Aprobar y publicar</button><button class="lib-button lib-secondary" type="submit" value="reject">Pedir correcciones</button></div></form></div>`;
        panel.querySelector<HTMLFormElement>("form")!.onsubmit = (ev) => {
          ev.preventDefault();
          const accepted =
            (ev.submitter as HTMLButtonElement)?.value === "approve";
          const formData = new FormData(ev.currentTarget as HTMLFormElement);
          void run(async () => {
            const result = await api(`works/${w.id}/review`, {
              revision: w.revision,
              accepted,
              note: formData.get("note") ?? "",
              reviewedFiles: formData.get("checked") === "on",
              feedbackBonus: formData.get("bonus") === "on",
            });
            panel.hidden = true;
            await queue();
            message(
              accepted
                ? `Publicado. Se concedieron ${result.credits} consultas extra.`
                : "Se enviaron las observaciones al panel del autor.",
            );
          });
        };
        panel.scrollIntoView({ behavior: scrollBehavior() });
      });
  });
  async function downloadRecoveryFiles(copy: Pick<CloudCopy<Recovery>, "files">,path="recovery/files/") {
    return Promise.all(copy.files.map(async file => {
      const response = await fetch(`/api/app/library/${path}${file.id}`, {credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(60000)});
      if (!response.ok) throw new LibraryApiError(response.status,"No se pudo recuperar el archivo de tu cuenta. Reintenta antes de continuar.");
      const bytes = await response.blob();
      if (bytes.size !== file.size) throw new Error("La descarga del archivo está incompleta.");
      return new File([bytes], file.name, {type:file.mime});
    }));
  }
  async function downloadWorkFiles(work: Work): Promise<File[]> {
    return Promise.all(work.files.map(async file => {
      const response = await fetch(`/api/app/library/works/${work.id}/files/${file.id}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('No pudimos guardar los archivos para usarlos sin conexión. Reintenta antes de cerrar.');
      const bytes = await response.blob();
      if (bytes.size !== file.size) throw new Error('La copia local del archivo está incompleta.');
      return new File([bytes], file.name, { type: bytes.type });
    }));
  }
  async function applyRecovery(recovery: Recovery, files: File[], filesMissing: boolean, fromAccount: boolean) {
    if (!recovery.fields || !Array.isArray(recovery.criteria) || !Array.isArray(recovery.courses)) throw new Error("No se pudo leer el borrador.");
    const wasReady = recoveryReady;
    recoveryReady = false;
    try {
      pendingKeep=recovery.keepBoth;
      let stale = false;
      let work: Work | null = null;
      if (recovery.current) {
        if (offlineMode) {
          work = recovery.work ?? null;
          deferredCurrent = recovery.current;
        } else try {
          work = (await api("works/" + recovery.current.id)).work;
          stale = work!.revision !== recovery.current.revision || !["draft","rejected"].includes(work!.status);
        } catch { stale = true; }
      }
      if (!offlineMode) deferredCurrent = null;
      current = stale ? null : work;
      requestId = stale ? crypto.randomUUID() : recovery.requestId;
      unsaved = recovery.unsaved || stale;
      selectedFiles = files.map(file => new File([file],file.name,{type:file.type,lastModified:file.lastModified}));
      if (!offlineMode && work && !stale && !selectedFiles.length && !recovery.unsaved) selectedFiles = await downloadWorkFiles(work);
      missingFiles = filesMissing || (stale && !selectedFiles.length);
      form.reset();
      (input("files") as HTMLInputElement).value = "";
      const select = input("courseId") as HTMLSelectElement;
      select.replaceChildren(...recovery.courses.slice(0,31).map(option=>new Option(option.label,option.value)));
      for (const [name,value] of Object.entries(recovery.fields)) {
        const field = form.elements.namedItem(name);
        if (name !== "files" && (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) field.value = value;
      }
      $("[data-lib-criteria]").replaceChildren();
      recovery.criteria.slice(0,20).forEach(row=>{
        addCriterion();
        $("[data-lib-criteria]").lastElementChild!.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>("[data-field]").forEach(field=>{field.value=row[field.dataset.field!]??"";});
      });
      $("[data-lib-rubric]").hidden=input("rubricStatus").value!=="available";
      $("[data-lib-criteria]").querySelectorAll<HTMLInputElement|HTMLTextAreaElement>("input,textarea").forEach(field=>{field.disabled=input("rubricStatus").value!=="available";});
      form.querySelector<HTMLDetailsElement>("details")!.open=!!recovery.expanded;
      renderSelectedFiles();
      $("[data-lib-existing]").textContent=current?"Archivos guardados en Campus: "+current.files.map(file=>file.name).join(", "):"";
      $("#lib-editor-title").textContent=current?"Editar borrador":"Continúa tu aporte.";
      showStage(!offlineMode&&recovery.stage===3&&current&&!unsaved?3:recovery.stage===2?2:1);
      $<HTMLFormElement>("[data-lib-submit]").reset();
      if(stage===3&&current){$("[data-lib-preview-content]").innerHTML=detail(current);preview.hidden=false;}
      $("[data-lib-recovered]").hidden=false;
      $("[data-lib-recovered]").textContent=stale
        ? "Recuperamos tus textos como una copia: el trabajo cambió. Revisa los datos y vuelve a elegir los archivos si faltan."
        : missingFiles?"Recuperamos lo escrito, pero falta el archivo. Vuelve a seleccionarlo antes de continuar."
        : fromAccount?"Borrador recuperado de tu cuenta Campus, incluidos los archivos. Continúa donde lo dejaste."
        : "Borrador recuperado de este navegador. Sincronizaremos los cambios pendientes con tu cuenta.";
    } finally { recoveryReady = wasReady; }
  }
  async function connectCloud(local: Recovery|null, files: File[], filesMissing: boolean) {
    if (!cloudEnabled) { cloudStatus("El guardado en tu cuenta aún no está disponible. Tu copia local sigue activa."); return; }
    cloudRemote = (await api("recovery")).recovery;
    const remote = cloudRemote!;
    const choice = chooseCloudRecovery(local,remote);
    if (choice === "discard") {
      createCloud(remote);
      discarding = true;
      if (remote.snapshot) await cloud!.discard();
      try { await draftStore?.clear(); } catch {}
      resetEditor();
      cloudStatus("El borrador descartado ya no está en tu cuenta.");
      return;
    }
    if (choice === "remote") {
      if (remote.snapshot) {
        const remoteFiles = await downloadRecoveryFiles(remote);
        await applyRecovery(remote.snapshot,remoteFiles,false,true);
        createCloud(remote);
        cloudSaved = !missingFiles;
        try { await draftStore?.save(snapshot(),selectedFiles); localSaved=true; } catch { localSaved=false; }
        autosaveStatus(localSaved?"Copia de seguridad guardada en este navegador.":"La copia local no está disponible; tu borrador está en Campus.");
        cloudStatus("Borrador recuperado de tu cuenta Campus. Puedes continuarlo aquí.");
      } else {
        resetEditor();
        createCloud(remote);
        if (local) try { await draftStore?.clear(); } catch {}
        cloudStatus("Guardado automático en tu cuenta Campus, mientras escribes.");
      }
    } else {
      if (local) await applyRecovery(local,files,filesMissing,false);
      createCloud(remote);
      if (choice === "conflict") {
        cloud!.paused=true;
        cloudStatus("Hay cambios distintos en este navegador y en tu cuenta. Elige qué versión continuar.",true);
        $("[data-lib-cloud-conflict]").hidden=false;
      } else if (local) {
        if (local.cloudDirty === false && !filesMissing) {
          cloudSaved=true;
          cloudStatus("Guardado en tu cuenta Campus. Puedes continuar en otro dispositivo.");
        } else if (missingFiles) cloudStatus("Conservamos el texto aquí. Vuelve a elegir el archivo para guardar el borrador completo en Campus.",true);
        else { queueCloud(true); cacheCloudState(); }
      }
    }
    updateResumeNotice();
  }
  async function restoreDraft() {
    if (recoveryReady) return;
    let saved: Awaited<ReturnType<LibraryDraftStore<Recovery>["load"]>> = null;
    try {
      const generation = sessionGeneration;
      const email = await recoveryOwnerEmail();
      await publishSessionIdentity({ authenticated: true, email, aiReady: false }, () => root.isConnected && generation === sessionGeneration);
      if (generation !== sessionGeneration) throw new LibraryApiError(401, 'La sesión cambió durante la recuperación.');
      const key = await libraryDraftKey(email);
      draftStore=new LibraryDraftStore<Recovery>(key,localStorage,indexedDraftFiles());
      if (workspaceScope) rememberOfflineOwner(localStorage, { key, scope: workspaceScope });
      saved=await draftStore.load();
      if (saved) { cloudBase=saved.snapshot.cloudRevision ?? 0; cloudLastMutation=saved.snapshot.cloudMutation; discarding=!!saved.snapshot.cloudDiscarded; }
      if(saved){await applyRecovery(saved.snapshot,saved.files,saved.filesMissing,false);localSaved=!saved.filesMissing;}
      autosaveStatus(saved?"Copia de seguridad recuperada de este navegador.":"Copia de seguridad automática en este navegador.");
    } catch {
      draftStore=null;
      autosaveStatus("No pudimos activar la copia local. El guardado en tu cuenta seguirá disponible.",true);
    }
    try { await connectCloud(saved?.snapshot??null,saved?.files??[],saved?.filesMissing??false); }
    catch {
      cloudStatus("No pudimos recuperar el borrador de tu cuenta. Conservamos esta vista; reintenta antes de continuar.",true);
    }
    recoveryReady=true;
    if (saved && !saved.files.length && selectedFiles.length) persistDraft(true);
    updateResumeNotice();
  }
  async function restoreOffline() {
    const owner = readOfflineOwner(localStorage);
    if (!owner) return false;
    const store = new LibraryDraftStore<Recovery>(owner.key, localStorage, indexedDraftFiles());
    const saved = await store.load();
    if (!saved || saved.snapshot.cloudDiscarded) return false;
    draftStore = store;
    workspaceScope = owner.scope;
    cloudBase = saved.snapshot.cloudRevision ?? 0;
    cloudLastMutation = saved.snapshot.cloudMutation;
    offlineMode = true;
    cloud = null;
    cloudSaved = false;
    await applyRecovery(saved.snapshot, saved.files, saved.filesMissing, false);
    recoveryReady = true;
    localSaved = !saved.filesMissing;
    $('[data-lib-private]').hidden = false;
    $('[data-lib-login]').hidden = true;
    $('[data-lib-admin-nav]').hidden = true;
    showView('upload');
    replaceWorkspaceHash('#subir');
    autosaveStatus(saved.filesMissing ? 'Texto recuperado; falta la copia local de un archivo.' : 'Borrador y archivos recuperados de este navegador.', saved.filesMissing);
    cloudStatus('Sin conexión · Puedes seguir editando. Se sincronizará al volver internet.');
    message('Estás editando la copia de este dispositivo.');
    offlineControls();
    return true;
  }
  async function reconnectOffline() {
    if (!offlineMode || !recoveryReady) return;
    if (reconnecting) return reconnecting;
    reconnecting = (async () => {
      cloudStatus('Comprobando tu cuenta antes de sincronizar…');
      try {
        const config = await api('config');
        if (!config.enabled || !config.cloudDrafts) throw new Error('El guardado de borradores no está disponible.');
        // mine compares the server's opaque account scope with the offline owner
        // before any recovery mutation or download can happen.
        versionsEnabled=config.recoveryVersions===true;
        versionDeletionEnabled=config.recoveryVersionDeletion===true;
        await mine();
        cloudEnabled = true;
        $("[data-lib-keep-both]").hidden=!versionsEnabled;
        const local = snapshot(), files = selectedFiles;
        offlineMode = false;
        try { await connectCloud(local, files, missingFiles); }
        catch (error) { offlineMode = true; cloud = null; throw error; }
        await flushCloud();
        message('Conexión recuperada. Tu borrador sigue disponible.');
      } catch (error) {
        retryConnection = !(error instanceof LibraryApiError) || error.status >= 500;
        if (error instanceof LibraryApiError && error.status === 401) $('[data-lib-login]').hidden = false;
        cloudStatus(error instanceof LibraryApiError && error.status === 401
          ? 'Entra con la misma cuenta Campus para sincronizar. Conservamos el borrador en este navegador.'
          : 'No pudimos sincronizar todavía. Conservamos tus cambios y archivos aquí.', true);
      } finally { offlineControls(); }
    })();
    try { await reconnecting; } finally { reconnecting = null; }
  }
  const loadWorkspace = () => void run(async () => {
    $("[data-lib-retry-load]").hidden = true;
    $("[data-lib-login]").hidden = true;
    message("Cargando tu biblioteca…");
    if (!navigator.onLine && await restoreOffline()) return;
    let config;
    try { config = await api('config'); }
    catch (error) { if (await restoreOffline()) return; throw error; }
    cloudEnabled = config.cloudDrafts === true;
    versionsEnabled=config.recoveryVersions===true;
    versionDeletionEnabled=config.recoveryVersionDeletion===true;
    $("[data-lib-keep-both]").hidden=!versionsEnabled;
    if (!cloudEnabled) $("[data-lib-persistence-help]").textContent = "La copia automática en este navegador sigue activa. El guardado en tu cuenta estará disponible cuando Campus lo habilite.";
    if (!config.enabled) {
      message(
        "La biblioteca está en preparación. Pronto podrás compartir tus trabajos.",
      );
      return;
    }
    try {
      await mine();
    } catch (err) {
      if (err instanceof Error && err.message.includes("Inicia sesión")) {
        try { forgetOfflineOwner(localStorage); } catch {}
        $("[data-lib-login]").hidden = false;
        message("");
        return;
      }
      if (!(err instanceof LibraryApiError && err.status === 401) && await restoreOffline()) return;
      throw err;
    }
    await restoreDraft();
    message("");
    fromHash();
    if (admin) await queue();
  });
  $("[data-lib-retry-load]").onclick = loadWorkspace;
  loadWorkspace();
}
