import type { ExtensionToForm, FormToExtension } from '../domain/formProtocol';
import type { ConnectionConfig, DriverKind } from '../domain/types';

interface VsCodeApi {
  postMessage(message: FormToExtension): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

const DEFAULT_PORTS: Record<DriverKind, string> = { mysql: '3306', postgres: '5432', sqlite: '' };

const form = byId<HTMLFormElement>('form');
const nameInput = byId<HTMLInputElement>('name');
const colorPicker = byId<HTMLDivElement>('colorPicker');
const driverPicker = byId<HTMLDivElement>('driverPicker');
const hostInput = byId<HTMLInputElement>('host');
const portInput = byId<HTMLInputElement>('port');
const userInput = byId<HTMLInputElement>('user');
const databaseInput = byId<HTMLInputElement>('database');
const filePathInput = byId<HTMLInputElement>('filePath');
const passwordInput = byId<HTMLInputElement>('password');
const readOnlyInput = byId<HTMLInputElement>('isReadOnly');
// Fields that only make sense against a server, hidden when the driver is file-based.
const serverFields = ['serverAddress', 'userField', 'databaseField', 'passwordField'].map((id) => byId<HTMLElement>(id));
const filePathField = byId<HTMLElement>('filePathField');
const formTitle = byId<HTMLElement>('formTitle');
const formSubtitle = byId<HTMLElement>('formSubtitle');
const browseButton = byId<HTMLButtonElement>('browse');
const cancelButton = byId<HTMLButtonElement>('cancel');
const testButton = byId<HTMLButtonElement>('test');
const result = byId<HTMLDivElement>('result');

let selectedDriver: DriverKind = 'mysql';
/** Stored as the swatch emoji so connections saved by earlier versions keep their colour. */
let selectedIcon = '';

for (const button of driverPicker.querySelectorAll<HTMLButtonElement>('.driver-option')) {
  button.addEventListener('click', () => setDriver(button.dataset.driver as DriverKind));
}

for (const swatch of colorPicker.querySelectorAll<HTMLButtonElement>('.color-swatch')) {
  swatch.addEventListener('click', () => setIcon(swatch.dataset.icon ?? ''));
}

browseButton.addEventListener('click', () => api.postMessage({ type: 'browse' }));
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
    return;
  }
  if (message.type === 'filePicked') {
    filePathInput.value = message.filePath;
  }
});

api.postMessage({ type: 'ready' });

function applyInit(isEdit: boolean, connection: Partial<ConnectionConfig>): void {
  formTitle.textContent = isEdit ? `Edit ${connection.name ?? 'connection'}` : 'New connection';
  formSubtitle.textContent = isEdit
    ? 'Changes take effect the next time the connection is opened.'
    : 'Connections are saved with the open folder; the password goes to the OS secret storage.';
  nameInput.value = connection.name ?? '';
  setIcon(connection.icon ?? '');
  setDriver(connection.driver ?? 'mysql');
  hostInput.value = connection.host ?? '127.0.0.1';
  portInput.value = connection.port !== undefined ? String(connection.port) : DEFAULT_PORTS[selectedDriver];
  userInput.value = connection.user ?? '';
  databaseInput.value = connection.database ?? '';
  filePathInput.value = connection.filePath ?? '';
  readOnlyInput.checked = connection.isReadOnly ?? false;
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
    filePath: filePathInput.value.trim() || undefined,
    icon: selectedIcon || undefined,
    isReadOnly: readOnlyInput.checked || undefined,
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
  result.className = `banner ${state}`;
}

function setIcon(icon: string): void {
  selectedIcon = icon;
  for (const swatch of colorPicker.querySelectorAll<HTMLButtonElement>('.color-swatch')) {
    const isActive = (swatch.dataset.icon ?? '') === icon;
    swatch.classList.toggle('active', isActive);
    swatch.setAttribute('aria-checked', String(isActive));
  }
}

function setDriver(driver: DriverKind): void {
  selectedDriver = driver;
  for (const button of driverPicker.querySelectorAll<HTMLButtonElement>('.driver-option')) {
    button.classList.toggle('active', button.dataset.driver === driver);
  }
  const isFileBased = driver === 'sqlite';
  for (const field of serverFields) {
    field.hidden = isFileBased;
  }
  filePathField.hidden = !isFileBased;
  // A hidden required field would block the submit, so validation follows visibility.
  hostInput.required = !isFileBased;
  userInput.required = !isFileBased;
  filePathInput.required = isFileBased;
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
