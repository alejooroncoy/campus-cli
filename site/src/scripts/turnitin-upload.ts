type UploadKind = 'document' | 'receipt';
type UploadFile = Pick<File, 'name' | 'size'>;

export function uploadError(files: readonly UploadFile[], kind: UploadKind, maxBytes: number): string | null {
  if (files.length !== 1) return 'Selecciona un solo archivo.';
  const file = files[0];
  const allowed = kind === 'document' ? /\.(pdf|docx)$/i : /\.(png|jpe?g|pdf)$/i;
  if (!allowed.test(file.name)) return kind === 'document' ? 'Usa un PDF o Word (.docx).' : 'Usa un comprobante PNG, JPG o PDF.';
  if (!file.size) return 'El archivo está vacío. Selecciona otro.';
  if (file.size > maxBytes) return `El archivo supera los ${Math.round(maxBytes / 1024 / 1024)} MB permitidos.`;
  return null;
}

export function setupTurnitinUploads(form: HTMLFormElement, maxBytes: (kind: UploadKind) => number) {
  const uploads = Array.from(form.querySelectorAll<HTMLElement>('[data-ti-upload]')).map(zone => {
    const input = zone.querySelector<HTMLInputElement>('input[type=file]')!;
    const kind = input.name as UploadKind;
    const name = zone.querySelector<HTMLElement>('[data-ti-filename]')!;
    const initial = name.textContent;
    const error = form.querySelector<HTMLElement>(`[data-ti-upload-error="${kind}"]`)!;
    const remove = form.querySelector<HTMLButtonElement>(`[data-ti-remove="${kind}"]`)!;
    let dragging = 0;
    const enabled = () => !input.matches(':disabled');
    const showError = (message: string | null) => {
      error.textContent = message; error.hidden = !message;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    };
    const update = () => {
      const file = input.files?.[0];
      name.textContent = file?.name ?? initial;
      zone.classList.toggle('ti-upload--selected', Boolean(file));
      remove.hidden = !file;
    };
    const clear = () => {
      input.value = ''; showError(null); update();
    };
    const accept = (files: File[]) => {
      if (!enabled()) return;
      const message = uploadError(files, kind, maxBytes(kind));
      if (message) { showError(message + (input.files?.length ? ' Se mantiene el archivo seleccionado.' : '')); return; }
      try {
        const transfer = new DataTransfer(); transfer.items.add(files[0]); input.files = transfer.files;
      } catch { showError('Usa el botón para seleccionar este archivo en tu dispositivo.'); return; }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('change', () => {
      const message = input.files?.length ? uploadError(Array.from(input.files), kind, maxBytes(kind)) : null;
      if (message) input.value = '';
      showError(message); update();
    });
    zone.addEventListener('keydown', event => {
      if (event.target === zone && enabled() && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); input.click();
      }
    });
    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    zone.addEventListener('dragenter', event => {
      if (!enabled() || !isFileDrag(event)) return;
      event.preventDefault(); dragging++; zone.classList.add('ti-upload--dragging');
    });
    zone.addEventListener('dragover', event => {
      if (!isFileDrag(event)) return;
      event.preventDefault(); if (!enabled()) return; if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', () => {
      dragging = Math.max(0, dragging - 1); if (!dragging) zone.classList.remove('ti-upload--dragging');
    });
    zone.addEventListener('drop', event => {
      if (!isFileDrag(event)) return;
      event.preventDefault(); dragging = 0; zone.classList.remove('ti-upload--dragging');
      accept(Array.from(event.dataTransfer?.files ?? []));
    });
    // Read files supplied by a user's paste; never request clipboard access.
    zone.addEventListener('paste', event => {
      if (!enabled()) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) { showError('El portapapeles no contiene un archivo. Usa el botón para seleccionarlo.'); return; }
      event.preventDefault(); accept(files);
    });
    remove.onclick = () => {
      if (!enabled()) return;
      clear(); input.dispatchEvent(new Event('change', { bubbles: true })); zone.focus();
    };
    return { clear, validate() {
      const message = uploadError(Array.from(input.files ?? []), kind, maxBytes(kind));
      showError(message); if (message) zone.focus(); return !message;
    } };
  });
  return { reset: () => uploads.forEach(upload => upload.clear()), validate: () => {
    for (const upload of uploads) if (!upload.validate()) return false;
    return true;
  } };
}
