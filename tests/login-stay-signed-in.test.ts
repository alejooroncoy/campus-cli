import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { dismissStaySignedInOrContinue } from '../src/providers/blackboard/auth/login.js';

function fakePage(url: string, visible: string[]) {
  const clicks: string[] = [];
  const page = {
    url: () => url,
    on: () => page,
    off: () => page,
    locator: (selector: string) => ({
      isVisible: async () => visible.includes(selector),
      click: async () => { clicks.push(selector); },
    }),
  };
  return { page: page as unknown as Page, clicks };
}

test('la pantalla "Mantener la sesión iniciada" se responde con Sí', async () => {
  const { page, clicks } = fakePage('https://login.microsoftonline.com/kmsi', ['#idBtn_Back', '#idSIButton9']);
  await dismissStaySignedInOrContinue(page, 1_000);
  assert.deepEqual(clicks, ['#idSIButton9']);
});

test('#idSIButton9 como "Siguiente" no se pulsa fuera de la pantalla de sesión', async () => {
  const { page, clicks } = fakePage('https://login.microsoftonline.com/login', ['#idSIButton9']);
  await dismissStaySignedInOrContinue(page, 300);
  assert.deepEqual(clicks, []);
});

test('si ya está en Ultra no pulsa nada', async () => {
  const { page, clicks } = fakePage('https://aulavirtual.upc.edu.pe/ultra', ['#idBtn_Back', '#idSIButton9']);
  await dismissStaySignedInOrContinue(page, 1_000);
  assert.deepEqual(clicks, []);
});

test('los comandos CLI renuevan la sesión antes de pedir login', () => {
  for (const file of ['courses', 'assignments', 'download']) {
    const source = fs.readFileSync(new URL(`../src/providers/blackboard/commands/${file}.ts`, import.meta.url), 'utf-8');
    assert.match(source, /await loadOrRefreshSession\(\)/, file);
    assert.doesNotMatch(source, /\bloadSession\(\)/, file);
  }
});
