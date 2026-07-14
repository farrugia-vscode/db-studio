import * as vscode from 'vscode';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Resolves tree icons tinted with the connection's color. With no (or invalid)
 * color it falls back to the themed codicon; otherwise it lazily writes a tinted
 * SVG into global storage and returns its Uri (cached per file name).
 */
export class ConnectionIconProvider {
  private readonly generated = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async connectionIcon(color?: string): Promise<vscode.ThemeIcon | vscode.Uri> {
    if (!isHex(color)) {
      return new vscode.ThemeIcon('database');
    }
    return this.ensureIcon(`db-${color.slice(1).toLowerCase()}.svg`, buildDatabaseSvg(color.toLowerCase()));
  }

  async tableIcon(color?: string): Promise<vscode.ThemeIcon | vscode.Uri> {
    if (!isHex(color)) {
      return new vscode.ThemeIcon('table');
    }
    return this.ensureIcon(`table-${color.slice(1).toLowerCase()}.svg`, buildTableSvg(color.toLowerCase()));
  }

  private async ensureIcon(fileName: string, svg: string): Promise<vscode.Uri> {
    const directory = vscode.Uri.joinPath(this.context.globalStorageUri, 'icons');
    const uri = vscode.Uri.joinPath(directory, fileName);
    if (this.generated.has(fileName)) {
      return uri;
    }
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(svg, 'utf8'));
    this.generated.add(fileName);
    return uri;
  }
}

function isHex(color?: string): color is string {
  return typeof color === 'string' && HEX_COLOR.test(color);
}

function buildDatabaseSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <path fill="${color}" d="M8 1.2c-2.9 0-5.3.95-5.3 2.1v9.4c0 1.15 2.4 2.1 5.3 2.1s5.3-.95 5.3-2.1V3.3C13.3 2.15 10.9 1.2 8 1.2z"/>
  <ellipse cx="8" cy="3.3" rx="5.3" ry="2.1" fill="#ffffff" opacity="0.35"/>
  <path d="M2.7 7.6c0 1.15 2.4 2.1 5.3 2.1s5.3-.95 5.3-2.1M2.7 11c0 1.15 2.4 2.1 5.3 2.1s5.3-.95 5.3-2.1" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.8"/>
</svg>`;
}

function buildTableSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.4" fill="none" stroke="${color}" stroke-width="1.2"/>
  <line x1="1.6" y1="6.2" x2="14.4" y2="6.2" stroke="${color}" stroke-width="1.2"/>
  <line x1="6" y1="6.2" x2="6" y2="13.4" stroke="${color}" stroke-width="1"/>
  <line x1="10" y1="6.2" x2="10" y2="13.4" stroke="${color}" stroke-width="1"/>
</svg>`;
}
