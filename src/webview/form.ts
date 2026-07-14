import type { ExtensionToForm, FormToExtension } from '../domain/formProtocol';
import type { ConnectionConfig, DriverKind } from '../domain/types';

interface VsCodeApi {
  postMessage(message: FormToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

const SWATCHES = ['#f14c4c', '#f5a623', '#f8e71c', '#4ec94e', '#4aa3ff', '#9b59b6', '#e879c0', '#8a8a8a'];
const DEFAULT_PORTS: Record<DriverKind, string> = { mysql: '3306', postgres: '5432' };

const form = byId<HTMLFormElement>('form');
const nameInput = byId<HTMLInputElement>('name');
const iconInput = byId<HTMLInputElement>('icon');
const driverPicker = byId<HTMLDivElement>('driverPicker');
const hostInput = byId<HTMLInputElement>('host');
const portInput = byId<HTMLInputElement>('port');
const userInput = byId<HTMLInputElement>('user');
const databaseInput = byId<HTMLInputElement>('database');
const passwordInput = byId<HTMLInputElement>('password');
const colorInput = byId<HTMLInputElement>('color');
const swatches = byId<HTMLSpanElement>('swatches');
const clearColorButton = byId<HTMLButtonElement>('clearColor');
const cancelButton = byId<HTMLButtonElement>('cancel');
const testButton = byId<HTMLButtonElement>('test');
const result = byId<HTMLDivElement>('result');

let useColor = true;
let selectedDriver: DriverKind = 'mysql';

buildSwatches();

for (const button of driverPicker.querySelectorAll<HTMLButtonElement>('.driver-option')) {
  button.addEventListener('click', () => setDriver(button.dataset.driver as DriverKind));
}

colorInput.addEventListener('input', () => setUseColor(true));
clearColorButton.addEventListener('click', () => setUseColor(false));
cancelButton.addEventListener('click', () => api.postMessage({ type: 'cancel' }));
testButton.addEventListener('click', test);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  submit();
});

window.addEventListener('message', (event: MessageEvent<ExtensionToForm>) => {
  const message = event.data;
  if (message.type === 'init') {
    applyInit(message.isEdit, message.connection);
    return;
  }
  if (message.type === 'testResult') {
    showResult(message.ok ? 'ok' : 'error', message.message);
    testButton.disabled = false;
  }
});

api.postMessage({ type: 'ready' });

function applyInit(isEdit: boolean, connection: Partial<ConnectionConfig>): void {
  nameInput.value = connection.name ?? '';
  iconInput.value = connection.icon ?? '';
  setDriver(connection.driver ?? 'mysql');
  hostInput.value = connection.host ?? '127.0.0.1';
  portInput.value = connection.port !== undefined ? String(connection.port) : DEFAULT_PORTS[selectedDriver];
  userInput.value = connection.user ?? '';
  databaseInput.value = connection.database ?? '';
  passwordInput.value = '';
  passwordInput.placeholder = isEdit ? 'leave blank to keep current' : '';
  if (connection.color) {
    colorInput.value = connection.color;
    setUseColor(true);
  } else {
    setUseColor(!isEdit);
  }
}

function readConnection(): ConnectionConfig {
  return {
    name: nameInput.value.trim(),
    driver: selectedDriver,
    host: hostInput.value.trim(),
    port: portInput.value ? Number(portInput.value) : undefined,
    user: userInput.value.trim(),
    database: databaseInput.value.trim() || undefined,
    color: useColor ? colorInput.value : undefined,
    icon: iconInput.value.trim() || undefined,
  };
}

function submit(): void {
  api.postMessage({ type: 'submit', connection: readConnection(), password: passwordInput.value });
}

function test(): void {
  testButton.disabled = true;
  showResult('pending', 'Testing…');
  api.postMessage({ type: 'test', connection: readConnection(), password: passwordInput.value });
}

function showResult(state: 'ok' | 'error' | 'pending', message: string): void {
  result.textContent = message;
  result.className = `result ${state}`;
}

function setUseColor(next: boolean): void {
  useColor = next;
  colorInput.style.opacity = next ? '1' : '0.35';
  clearColorButton.classList.toggle('active', !next);
}

function setDriver(driver: DriverKind): void {
  selectedDriver = driver;
  for (const button of driverPicker.querySelectorAll<HTMLButtonElement>('.driver-option')) {
    button.classList.toggle('active', button.dataset.driver === driver);
  }
  if (portInput.value === '') {
    portInput.value = DEFAULT_PORTS[driver];
  }
}

function buildSwatches(): void {
  for (const color of SWATCHES) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener('click', () => {
      colorInput.value = color;
      setUseColor(true);
    });
    swatches.appendChild(swatch);
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}
