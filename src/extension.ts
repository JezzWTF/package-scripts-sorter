import * as vscode from "vscode";

const DIAGNOSTIC_SOURCE = "package-scripts-sorter";
const UNSORTED_CODE = "unsorted-scripts";

function parsePackageJson(text: string): {
  scripts: Record<string, string>;
  scriptsRange: { start: number; end: number };
} | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed.scripts || typeof parsed.scripts !== "object") {
    return null;
  }

  const scripts = parsed.scripts as Record<string, string>;

  // Find the byte offsets of the "scripts" block in the raw text
  const scriptsKeyMatch = /"scripts"\s*:\s*\{/g.exec(text);
  if (!scriptsKeyMatch) {
    return null;
  }

  const openBrace = scriptsKeyMatch.index + scriptsKeyMatch[0].length - 1;
  let depth = 0;
  let closeBrace = openBrace;
  for (let i = openBrace; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }

  return {
    scripts,
    scriptsRange: { start: scriptsKeyMatch.index, end: closeBrace + 1 },
  };
}

function isSorted(scripts: Record<string, string>): boolean {
  const keys = Object.keys(scripts);
  return keys.every(
    (key, i) => i === 0 || key.localeCompare(keys[i - 1]) >= 0
  );
}

function buildSortedScriptsText(
  scripts: Record<string, string>,
  originalText: string,
  scriptsRange: { start: number; end: number }
): string {
  const sortedKeys = Object.keys(scripts).sort((a, b) => a.localeCompare(b));

  // Detect indentation used in the scripts block
  const scriptsBlock = originalText.slice(
    scriptsRange.start,
    scriptsRange.end
  );
  const indentMatch = scriptsBlock.match(/\n(\s+)"/);
  const entryIndent = indentMatch ? indentMatch[1] : "    ";

  // Detect the outer indentation (the "scripts" key itself)
  const beforeScripts = originalText.slice(0, scriptsRange.start);
  const outerIndentMatch = beforeScripts.match(/(\s*)"scripts"/);
  const outerIndent = outerIndentMatch ? outerIndentMatch[1] : "  ";

  const entries = sortedKeys
    .map((key, i) => {
      const comma = i < sortedKeys.length - 1 ? "," : "";
      return `${entryIndent}${JSON.stringify(key)}: ${JSON.stringify(scripts[key])}${comma}`;
    })
    .join("\n");

  return `"scripts": {\n${entries}\n${outerIndent}}`;
}

class ScriptsSortActionProvider implements vscode.CodeActionProvider {
  constructor(
    private readonly diagnostics: vscode.DiagnosticCollection
  ) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    _context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    // Look up directly from the collection so the lightbulb appears
    // anywhere in the file, not just when the cursor is on "scripts"
    const fileDiagnostics = this.diagnostics.get(document.uri) ?? [];
    const relevant = fileDiagnostics.filter(
      (d) => d.source === DIAGNOSTIC_SOURCE && d.code === UNSORTED_CODE
    );
    if (relevant.length === 0) {
      return [];
    }

    const action = new vscode.CodeAction(
      "Sort scripts alphabetically",
      vscode.CodeActionKind.QuickFix
    );
    action.command = {
      command: "packageScriptsSorter.sortScripts",
      title: "Sort scripts alphabetically",
      arguments: [document.uri],
    };
    action.diagnostics = relevant;
    action.isPreferred = true;
    return [action];
  }
}

function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  if (!isPackageJson(document)) {
    collection.delete(document.uri);
    return;
  }

  const result = parsePackageJson(document.getText());
  if (!result || isSorted(result.scripts)) {
    collection.delete(document.uri);
    return;
  }

  // Highlight just the "scripts" key on its line for a tight, visible squiggle
  const text = document.getText();
  const scriptsKeyMatch = /"scripts"/.exec(text);
  const keyStart = scriptsKeyMatch
    ? document.positionAt(scriptsKeyMatch.index)
    : document.positionAt(result.scriptsRange.start);
  const keyEnd = scriptsKeyMatch
    ? document.positionAt(scriptsKeyMatch.index + scriptsKeyMatch[0].length)
    : keyStart;
  const range = new vscode.Range(keyStart, keyEnd);

  const diagnostic = new vscode.Diagnostic(
    range,
    'Scripts are not in alphabetical order. Click the lightbulb or run "Sort package.json Scripts Alphabetically" to fix.',
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = UNSORTED_CODE;
  collection.set(document.uri, [diagnostic]);
}

function isPackageJson(document: vscode.TextDocument): boolean {
  return (
    document.languageId === "json" &&
    document.fileName.endsWith("package.json")
  );
}

async function sortScripts(
  uri: vscode.Uri | undefined
): Promise<void> {
  const document =
    uri != null
      ? await vscode.workspace.openTextDocument(uri)
      : vscode.window.activeTextEditor?.document;

  if (!document || !isPackageJson(document)) {
    vscode.window.showErrorMessage("Open a package.json file first.");
    return;
  }

  const text = document.getText();
  const result = parsePackageJson(text);
  if (!result) {
    vscode.window.showErrorMessage("Could not parse package.json.");
    return;
  }

  if (isSorted(result.scripts)) {
    vscode.window.showInformationMessage("Scripts are already sorted.");
    return;
  }

  const sortedBlock = buildSortedScriptsText(
    result.scripts,
    text,
    result.scriptsRange
  );

  const edit = new vscode.WorkspaceEdit();
  const startPos = document.positionAt(result.scriptsRange.start);
  const endPos = document.positionAt(result.scriptsRange.end);
  edit.replace(document.uri, new vscode.Range(startPos, endPos), sortedBlock);
  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage("Scripts sorted alphabetically.");
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  context.subscriptions.push(diagnosticCollection);

  // Check currently open editors on activation
  for (const editor of vscode.window.visibleTextEditors) {
    updateDiagnostics(editor.document, diagnosticCollection);
  }

  // Check when a document is opened or changed
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) =>
      updateDiagnostics(doc, diagnosticCollection)
    ),
    vscode.workspace.onDidChangeTextDocument((e) =>
      updateDiagnostics(e.document, diagnosticCollection)
    ),
    vscode.workspace.onDidCloseTextDocument((doc) =>
      diagnosticCollection.delete(doc.uri)
    )
  );

  // Register the sort command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "packageScriptsSorter.sortScripts",
      (uri?: vscode.Uri) => sortScripts(uri)
    )
  );

  // Register the code action provider (lightbulb)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: "json", pattern: "**/package.json" },
      new ScriptsSortActionProvider(diagnosticCollection),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );
}

export function deactivate(): void {}
