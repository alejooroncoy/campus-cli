import { formatThesisAuthors } from './thesis-authors';

const page = document.querySelector<HTMLElement>('[data-tool]');
const calc = page?.querySelector<HTMLElement>('[data-calculator]');
if (calc) {
  const rows = calc.querySelector<HTMLElement>('[data-rows]')!;
  const result = calc.querySelector<HTMLElement>('[data-result]')!;
  function addRow() {
    const row = document.createElement('div'); row.className = 'calc-row';
    const index = rows.children.length + 1;
    const name = document.createElement('input'); name.placeholder = `Curso ${index}`; name.setAttribute('aria-label', `Nombre del curso ${index}`);
    const grade = document.createElement('input'); grade.type = 'number'; grade.min = '0'; grade.max = '20'; grade.step = 'any'; grade.placeholder = '—'; grade.setAttribute('aria-label', `Nota del curso ${index}`);
    const credits = document.createElement('input'); credits.type = 'number'; credits.min = '0'; credits.step = 'any'; credits.placeholder = '—'; credits.setAttribute('aria-label', `Créditos del curso ${index}`);
    const remove = document.createElement('button'); remove.type = 'button'; const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); icon.classList.add('tools-icon'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '/assets/lucide.svg#x'); icon.append(use); remove.append(icon); remove.className = 'remove-row'; remove.setAttribute('aria-label', `Quitar curso ${index}`); remove.addEventListener('click', () => { if (rows.children.length > 1) row.remove(); });
    row.append(name, grade, credits, remove); rows.append(row);
  }
  addRow(); addRow(); addRow();
  calc.querySelector('[data-add]')?.addEventListener('click', addRow);
  calc.querySelector('[data-calculate]')?.addEventListener('click', () => {
    let sum = 0; let total = 0; let count = 0; let invalid = false;
    for (const row of rows.querySelectorAll('.calc-row')) {
      const fields = row.querySelectorAll<HTMLInputElement>('input');
      if (!fields[1].value && !fields[2].value && !fields[0].value) continue;
      const grade = Number(fields[1].value), credits = Number(fields[2].value);
      if (!fields[1].value || !fields[2].value || !Number.isFinite(grade) || grade < 0 || grade > 20 || !Number.isFinite(credits) || credits <= 0) { invalid = true; break; }
      sum += grade * credits; total += credits; count++;
    }
    const strong = result.querySelector('strong')!; const text = result.querySelector('span')!;
    if (invalid || !count) { strong.textContent = '—'; text.textContent = 'Ingresa notas entre 0 y 20 y créditos mayores a cero para cada curso.'; return; }
    strong.textContent = (sum / total).toFixed(2); text.textContent = `${count} ${count === 1 ? 'curso' : 'cursos'} · ${total} créditos · ${sum.toLocaleString('es-PE', {maximumFractionDigits: 2})} ÷ ${total}`;
  });
}
const thesis = page?.querySelector<HTMLElement>('[data-thesis]');
if (thesis) {
  const thesisForm = thesis.querySelector<HTMLFormElement>('[data-thesis-form]');
  const authorInput = thesisForm?.querySelector<HTMLInputElement>('[name="author"]');
  authorInput?.addEventListener('input', () => authorInput.setCustomValidity(''));
  const hideStaleReference = () => { thesis.querySelector<HTMLElement>('[data-citation]')!.hidden = true; };
  thesisForm?.addEventListener('input', hideStaleReference);
  thesisForm?.addEventListener('change', hideStaleReference);
  thesisForm?.addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const data = new FormData(form);
    const authorText = formatThesisAuthors(String(data.get('author') || ''));
    if (authorText === null) {
      authorInput?.setCustomValidity('Escribe cada autor y usa punto y coma solo para separarlos.');
      authorInput?.reportValidity();
      return;
    }
    const output = thesis.querySelector<HTMLElement>('[data-citation]')!; output.replaceChildren();
    const label = document.createElement('small'); label.textContent = 'REFERENCIA PARA REVISAR';
    const p = document.createElement('p'); const title = document.createElement('em'); title.textContent = String(data.get('title') || '').trim();
    p.append(`${authorText} (${String(data.get('year')).trim()}). `, title, ` [Tesis de ${data.get('degree')}, ${String(data.get('university')).trim()}]. ${String(data.get('repository')).trim()}. ${String(data.get('url')).trim()}`);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copiar referencia'; button.addEventListener('click', async () => { try { await navigator.clipboard.writeText(p.textContent || ''); button.textContent = 'Copiada'; } catch { button.textContent = 'Selecciona el texto para copiar'; } });
    output.append(label, p, button); output.hidden = false;
  });
}
const figure = page?.querySelector<HTMLElement>('[data-figure]');
if (figure) {
  const answers: Record<string, [string, string]> = {
    propia: ['Presenta tu figura con número y título.', 'Agrega una nota si se necesita explicar su contenido. Consulta los criterios de tu institución sobre la atribución.'],
    tomada: ['Identifica y atribuye la fuente original.', 'Incluye una nota bajo la figura y la referencia correspondiente. Comprueba si necesitas permiso para reproducirla.'],
    adaptada: ['Indica que tu figura está adaptada.', 'Identifica la obra original en la nota y en la lista de referencias. Revisa las condiciones de uso y los requisitos de tu institución.'],
  };
  figure.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button => button.addEventListener('click', () => {
    figure.querySelectorAll('[data-kind]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    const answer = figure.querySelector<HTMLElement>('[data-figure-answer]')!; const [title, detail] = answers[button.dataset.kind || 'propia']; answer.querySelector('strong')!.textContent = title; answer.querySelector('p')!.textContent = detail;
  }));
}
