import * as vscode from 'vscode';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Resolves the tree icon for a connection. With no (or invalid) color it falls
 * back to the themed database codicon; with a color it lazily writes a tinted
 * SVG into global storage and returns its Uri (cached per color).
 */
export class ConnectionIconProvider {
  private readonly generated = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async iconFor(color?: string): Promise<vscode.ThemeIcon | vscode.Uri> {
    if (!color || !HEX_COLOR.test(color)) {
      return new vscode.ThemeIcon('database');
    }
    return this.ensureIcon(color.toLowerCase());
  }

  private async ensureIcon(color: string): Promise<vscode.Uri> {
    const fileName = `conn-${color.slice(1)}.svg`;
    const directory = vscode.Uri.joinPath(this.context.globalStorageUri, 'icons');
    const uri = vscode.Uri.joinPath(directory, fileName);
    if (this.generated.has(fileName)) {
      return uri;
    }
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(buildSvg(color), 'utf8'));
    this.generated.add(fileName);
    return uri;
  }
}

function buildSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <path fill="${color}" d="M8 1.2c-2.9 0-5.3.95-5.3 2.1v9.4c0 1.15 2.4 2.1 5.3 2.1s5.3-.95 5.3-2.1V3.3C13.3 2.15 10.9 1.2 8 1.2z"/>
  <ellipse cx="8" cy="3.3" rx="5.3" ry="2.1" fill="#ffffff" opacity="0.35"/>
  <path d="M2.7 7.6c0 1.15 2.4 2.1 5.3 2.1s5.3-.95 5.3-2.1M2.7 11c0 1.15 2.4 2.1 5.3 2.1s5.3-.95 5.3-2.1" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.8"/>
</svg>`;
}
