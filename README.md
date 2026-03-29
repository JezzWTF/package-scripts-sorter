# Package Scripts Sorter

A VS Code extension that detects when the `scripts` section of a `package.json` is not in alphabetical order and offers a one-click fix to sort them.

## Features

- Automatically checks any open `package.json` for unsorted scripts
- Highlights the `"scripts"` key with a warning when scripts are out of order
- Offers a **Sort scripts alphabetically** quick fix via the lightbulb menu
- Also available from the Command Palette: `Sort package.json Scripts Alphabetically`
- Preserves your existing indentation style

## Usage

Open a `package.json` file. If the scripts are not in alphabetical order, you'll see a warning squiggle under the `"scripts"` key. Click the lightbulb (or press `Ctrl+.` / `Cmd+.`) and select **Sort scripts alphabetically**.

## Installation

Install from a `.vsix` file:

1. Download the latest `.vsix` from the [releases page](https://github.com/JezzWTF/package-scripts-sorter/releases)
2. Open VS Code and go to **Extensions** (`Ctrl+Shift+X`)
3. Click the `···` menu and select **Install from VSIX...**
4. Select the downloaded file

Or via the terminal:

```
code --install-extension package-scripts-sorter-x.x.x.vsix
```

## Building from Source

```bash
pnpm install
pnpm compile
pnpm package
```

## License

MIT — see [LICENSE](LICENSE)
