import * as vscode from 'vscode';
import { ConnectionManager } from '../connections/connectionManager';
import type { ConnectionConfig } from '../domain/types';
import type { ExtensionToForm, FormToExtension } from '../domain/formProtocol';

/**
 * Webview form to add or edit a connection in one screen (name, driver, host,
 * port, user, database, password, color). In edit mode the password field may
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
    };
    this.panel?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'form.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'form.css'));
    const nonce = buildNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri}" rel="stylesheet">
</head>
<body>
  <form id="form" autocomplete="off">
    <div class="row">
      <label class="grow">Name<input id="name" required></label>
      <label class="icon-field">Icon<input id="icon" maxlength="4" placeholder="🚀"></label>
    </div>
    <label>Driver
      <div class="driver-picker" id="driverPicker">
        <button type="button" class="driver-option" data-driver="mysql"><span class="ico">🐬</span> MySQL / MariaDB</button>
        <button type="button" class="driver-option" data-driver="postgres"><span class="ico">🐘</span> PostgreSQL</button>
      </div>
    </label>
    <div class="row">
      <label class="grow">Host<input id="host" value="127.0.0.1" required></label>
      <label class="port">Port<input id="port" type="number"></label>
    </div>
    <label>User<input id="user" required></label>
    <label>Database<input id="database" placeholder="optional (required for PostgreSQL)"></label>
    <label>Password<input id="password" type="password"></label>
    <label>Color
      <span class="color-row">
        <input id="color" type="color" value="#4ec94e">
        <span id="swatches"></span>
        <button type="button" id="clearColor">No color</button>
      </span>
    </label>
    <div id="result" class="result"></div>
    <div class="actions">
      <button type="button" id="test">Test</button>
      <button type="submit" id="save" class="primary">Save</button>
      <button type="button" id="cancel">Cancel</button>
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
