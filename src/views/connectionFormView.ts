import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { ConnectionConfig } from '../domain/types';
import type { ExtensionToForm, FormToExtension } from '../domain/formProtocol';

/**
 * Webview form to add or edit a connection in one screen (name, driver, host,
 * port, user, database, password, color emoji), or a file path for SQLite. In edit mode the password field may
 * be left blank to keep the stored one.
 */
export class ConnectionFormView {
  private panel: vscode.WebviewPanel | null = null;
  private editing: ConnectionConfig | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: ConnectionManager,
    private readonly onSaved: (connectionName: string) => void,
  ) {}

  open(existing?: ConnectionConfig): void {
    this.editing = existing ?? null;
    if (!this.panel) {
      this.createPanel();
    }
    this.panel!.title = existing ? `Edit ${existing.name}` : 'New Connection';
    this.panel!.reveal();
    this.postInit();
  }

  private createPanel(): void {
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    this.panel = vscode.window.createWebviewPanel('dbStudio.connectionForm', 'New Connection', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [mediaUri],
    });
    this.panel.webview.html = this.renderHtml(this.panel.webview, mediaUri);
    this.panel.webview.onDidReceiveMessage((message: FormToExtension) => this.handleMessage(message));
    this.panel.onDidDispose(() => {
      this.panel = null;
      this.editing = null;
    });
  }

  private async handleMessage(message: FormToExtension): Promise<void> {
    if (message.type === 'ready') {
      this.postInit();
      return;
    }
    if (message.type === 'cancel') {
      this.panel?.dispose();
      return;
    }
    if (message.type === 'submit') {
      await this.save(message.connection, message.password);
      return;
    }
    if (message.type === 'test') {
      await this.test(message.connection, message.password);
      return;
    }
    if (message.type === 'browse') {
      await this.pickDatabaseFile();
    }
  }

  private async test(connection: ConnectionConfig, password: string): Promise<void> {
    // Same rule as save: in edit mode a blank password means "use the stored one".
    const useStored = this.editing !== null && password === '';
    try {
      await this.manager.testConnection(connection, useStored ? undefined : password);
      this.postTestResult(true, 'Connection successful.');
    } catch (error) {
      this.postTestResult(false, error instanceof Error ? error.message : String(error));
    }
  }

  /** Opens the native file picker and pushes the chosen path back to the form. */
  private async pickDatabaseFile(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Use this database',
      filters: { 'SQLite database': ['sqlite', 'sqlite3', 'db', 'db3'], 'All files': ['*'] },
    });
    if (!picked || picked.length === 0) {
      return;
    }
    this.panel?.webview.postMessage({ type: 'filePicked', filePath: picked[0].fsPath });
  }

  private postTestResult(ok: boolean, message: string): void {
    this.panel?.webview.postMessage({ type: 'testResult', ok, message });
  }

  private async save(connection: ConnectionConfig, password: string): Promise<void> {
    const editingName = this.editing?.name ?? null;
    // Block silently clobbering a different existing connection with this name.
    const clash = this.manager.getConnection(connection.name);
    if (clash && connection.name !== editingName) {
      this.postTestResult(false, `A connection named "${connection.name}" already exists.`);
      return;
    }
    // Edit mode + blank password → keep the stored secret; add mode always stores what was typed.
    const keepStored = this.editing !== null && password === '';
    const resolvedPassword = keepStored ? undefined : password;
    try {
      if (editingName !== null && editingName !== connection.name) {
        await this.manager.renameConnection(editingName, connection, resolvedPassword);
      } else {
        await this.manager.saveConnection(connection, resolvedPassword);
      }
      this.onSaved(connection.name);
      this.panel?.dispose();
      vscode.window.showInformationMessage(`Connection "${connection.name}" saved.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`DB Studio: ${detail}`);
    }
  }

  private postInit(): void {
    const message: ExtensionToForm = {
      type: 'init',
      isEdit: this.editing !== null,
      connection: this.editing ?? {},
      groups: this.manager.getGroups(),
    };
    this.panel?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'form.js'));
    const baseStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'base.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'form.css'));
    const nonce = buildNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${baseStyleUri}" rel="stylesheet">
<link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <form id="form" autocomplete="off">
    <header class="form-header">
      <div class="form-title" id="formTitle">New connection</div>
      <div class="form-subtitle" id="formSubtitle">Connections are saved with the open folder; the password goes to the OS secret storage.</div>
    </header>

    <section class="section">
      <div class="section-title">Identity</div>
      <label>Name<input id="name" placeholder="e.g. Shop staging" required></label>
      <label>Group
        <input id="group" list="groupOptions" placeholder="optional folder in the tree (e.g. Clients)">
        <datalist id="groupOptions"></datalist>
      </label>
      <label>Colour
        <div class="color-picker" id="colorPicker" role="radiogroup" aria-label="Connection colour">
          <button type="button" class="color-swatch swatch-none" data-icon="" role="radio" title="No colour" aria-label="No colour"></button>
          <button type="button" class="color-swatch swatch-red" data-icon="🔴" role="radio" title="Red" aria-label="Red"></button>
          <button type="button" class="color-swatch swatch-orange" data-icon="🟠" role="radio" title="Orange" aria-label="Orange"></button>
          <button type="button" class="color-swatch swatch-yellow" data-icon="🟡" role="radio" title="Yellow" aria-label="Yellow"></button>
          <button type="button" class="color-swatch swatch-green" data-icon="🟢" role="radio" title="Green" aria-label="Green"></button>
          <button type="button" class="color-swatch swatch-blue" data-icon="🔵" role="radio" title="Blue" aria-label="Blue"></button>
          <button type="button" class="color-swatch swatch-purple" data-icon="🟣" role="radio" title="Purple" aria-label="Purple"></button>
          <button type="button" class="color-swatch swatch-brown" data-icon="🟤" role="radio" title="Brown" aria-label="Brown"></button>
          <button type="button" class="color-swatch swatch-grey" data-icon="⚫" role="radio" title="Grey" aria-label="Grey"></button>
          <button type="button" class="color-swatch swatch-white" data-icon="⚪" role="radio" title="White" aria-label="White"></button>
        </div>
      </label>
    </section>

    <section class="section">
      <div class="section-title">Engine</div>
      <div class="driver-picker" id="driverPicker" role="radiogroup" aria-label="Driver">
        <button type="button" class="driver-option" data-driver="mysql" role="radio"><span class="ico">🐬</span> MySQL / MariaDB</button>
        <button type="button" class="driver-option" data-driver="postgres" role="radio"><span class="ico">🐘</span> PostgreSQL</button>
        <button type="button" class="driver-option" data-driver="sqlite" role="radio"><span class="ico">📄</span> SQLite</button>
      </div>
    </section>

    <section class="section">
      <div class="section-title">Connection</div>
      <div class="row" id="serverAddress">
        <label class="grow">Host<input id="host" value="127.0.0.1"></label>
        <label class="port">Port<input id="port" type="number"></label>
      </div>
      <label id="userField">User<input id="user"></label>
      <label id="passwordField">Password<input id="password" type="password"></label>
      <label id="databaseField">Database<input id="database" placeholder="optional (required for PostgreSQL)"></label>
      <label id="filePathField">Database file
        <span class="input-with-button">
          <input id="filePath" placeholder="/path/to/database.sqlite">
          <button type="button" id="browse" class="btn">Browse…</button>
        </span>
      </label>
    </section>

    <section class="section">
      <div class="section-title">Options</div>
      <label class="checkbox-field">
        <input id="isReadOnly" type="checkbox">
        <span>Read-only
          <span class="checkbox-hint">Blocks every write: cell edits, commits and DDL.</span>
        </span>
      </label>
    </section>

    <div id="result" class="banner"></div>

    <div class="form-actions">
      <button type="button" id="test">Test connection</button>
      <button type="button" id="cancel">Cancel</button>
      <button type="submit" id="save" class="primary">Save</button>
    </div>
  </form>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function buildNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
