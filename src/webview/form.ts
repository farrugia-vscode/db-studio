import type { ExtensionToForm, FormToExtension } from '../domain/formProtocol';
import type { ConnectionConfig, DriverKind } from '../domain/types';

interface VsCodeApi {
  postMessage(message: FormToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

const DEFAULT_PORTS: Record<DriverKind, string> = { mysql: '3306', postgres: '5432' };

const form = byId<HTMLFormElement>('form');
const nameInput = byId<HTMLInputElement>('name');
const iconInput = byId<HTMLSelectElement>('icon');
const driverPicker = byId<HTMLDivElement>('driverPicker');
const hostInput = byId<HTMLInputElement>('host');
const portInput = byId<HTMLInputElement>('port');
const userInput = byId<HTMLInputElement>('user');
const databaseInput = byId<HTMLInputElement>('database');
const passwordInput = byId<HTMLInputElement>('password');
const cancelButton = byId<HTMLButtonElement>('cancel');
const testButton = byId<HTMLButtonElement>('test');
const result = byId<HTMLDivElement>('result');

let selectedDriver: DriverKind = 'mysql';

for (const button of driverPicker.querySelectorAll<HTMLButtonElement>('.driver-option')) {
  button.addEventListener('click', () => setDriver(button.dataset.driver as DriverKind));
}

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
}

function readConnection(): ConnectionConfig {
  return {
    name: nameInput.value.trim(),
    driver: selectedDriver,
    host: hostInput.value.trim(),
    port: portInput.value ? Number(portInput.value) : undefined,
    user: userInput.value.trim(),
    database: databaseInput.value.trim() || undefined,
    icon: iconInput.value || undefined,
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

function setDriver(driver: DriverKind): void {
  selectedDriver = driver;
  for (const button of driverPicker.querySelectorAll<HTMLButtonElement>('.driver-option')) {
    button.classList.toggle('active', button.dataset.driver === driver);
  }
  if (portInput.value === '') {
    portInput.value = DEFAULT_PORTS[driver];
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}
