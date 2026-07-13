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
const driverSelect = byId<HTMLSelectElement>('driver');
const hostInput = byId<HTMLInputElement>('host');
const portInput = byId<HTMLInputElement>('port');
const userInput = byId<HTMLInputElement>('user');
const databaseInput = byId<HTMLInputElement>('database');
const passwordInput = byId<HTMLInputElement>('password');
const colorInput = byId<HTMLInputElement>('color');
const swatches = byId<HTMLSpanElement>('swatches');
const clearColorButton = byId<HTMLButtonElement>('clearColor');
const cancelButton = byId<HTMLButtonElement>('cancel');

let useColor = true;

buildSwatches();

driverSelect.addEventListener('change', () => {
  if (portInput.value === '') {
    portInput.value = DEFAULT_PORTS[driverSelect.value as DriverKind];
  }
});

colorInput.addEventListener('input', () => setUseColor(true));
clearColorButton.addEventListener('click', () => setUseColor(false));
cancelButton.addEventListener('click', () => api.postMessage({ type: 'cancel' }));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  submit();
});

window.addEventListener('message', (event: MessageEvent<ExtensionToForm>) => {
  if (event.data.type === 'init') {
    applyInit(event.data.isEdit, event.data.connection);
  }
});

api.postMessage({ type: 'ready' });

function applyInit(isEdit: boolean, connection: Partial<ConnectionConfig>): void {
  nameInput.value = connection.name ?? '';
  nameInput.readOnly = isEdit;
  driverSelect.value = connection.driver ?? 'mysql';
  hostInput.value = connection.host ?? '127.0.0.1';
  portInput.value = connection.port !== undefined ? String(connection.port) : DEFAULT_PORTS[driverSelect.value as DriverKind];
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

function submit(): void {
  const connection: ConnectionConfig = {
    name: nameInput.value.trim(),
    driver: driverSelect.value as DriverKind,
    host: hostInput.value.trim(),
    port: portInput.value ? Number(portInput.value) : undefined,
    user: userInput.value.trim(),
    database: databaseInput.value.trim() || undefined,
    color: useColor ? colorInput.value : undefined,
  };
  api.postMessage({ type: 'submit', connection, password: passwordInput.value });
}

function setUseColor(next: boolean): void {
  useColor = next;
  colorInput.style.opacity = next ? '1' : '0.35';
  clearColorButton.classList.toggle('active', !next);
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
