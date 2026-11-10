# Undermark – Primer: VS Code Extensions for Programmers

Nov 9, 2026 · @Prakash Chandrasekaran

## 1. In one page

Undermark is a VS Code extension that replaces the plain text editor for `.umk` files with a web page you edit visually, and almost everything you need to learn is about how those two halves talk to each other.

**Four ideas carry the whole project**

1. **An extension is a Node.js program with a manifest.** Its `package.json` declares what it adds to VS Code, and VS Code runs its code in a separate process called the Extension Host ([Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)).
2. **A custom editor swaps the screen, not the file.** For text formats, VS Code keeps the file as its own `TextDocument`, so save, undo, backup and git keep working. Your extension only draws a view and keeps it in sync ([Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)).
3. **The view is a webview.** A webview is an HTML page, much like an iframe, that cannot call the VS Code API directly. It talks to your extension only by passing messages ([Webview API](https://code.visualstudio.com/api/extension-guides/webview)).
4. **The editing engine lives inside that page.** Tiptap and ProseMirror run in the webview and know nothing about VS Code. The Format Core is plain code usable in both places.

**What is new if you already program**

- You write two programs that cooperate: the host (Node.js plus the `vscode` module) and the view (browser code). They share nothing but messages.
- The file belongs to VS Code, not to you. You never open or save it yourself; you ask VS Code to apply an edit.
- Registration is declarative first: much of what the extension does is announced in `package.json` before any code runs.

The sections that follow take these four ideas in order, then map every Undermark component onto them (section 8).

## 2. How VS Code is built: where your code runs

VS Code runs extension code in its own Extension Host, apart from the screen, and a webview is a third, more isolated place; the only bridge between host and webview is messages ([Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host), [Webview API](https://code.visualstudio.com/api/references/vscode-api)).

&#91;embedded content: VS Code, Extension Host and webview · 3 parts, 2 links\]

The separation is deliberate: the Extension Host prevents extensions from slowing startup, slowing UI operations or modifying the UI directly. The Format Core, being plain code, is bundled into both the host and the page, so it appears in neither band above.

## 3. Anatomy of an extension

An extension is a manifest, a trigger for loading it, and an entry file that uses the VS Code API; Undermark declares its editor in the manifest and loads its code only when a `.umk` file is opened.

**The three concepts** ([Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy))

| Concept | What it is | In Undermark |
| --- | --- | --- |
| Activation event | The moment VS Code loads your extension. Loading is lazy so that unused extensions cost nothing ([Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)). | Opening a `.umk` file. Since VS Code 1.74 a contributed custom editor needs no explicit activation entry ([Activation Events](https://code.visualstudio.com/api/references/activation-events)). |
| Contribution point | A static declaration in `package.json` that extends VS Code: commands, menus, settings, custom editors. | `customEditors`: tells VS Code which files our editor handles. |
| VS Code API | JavaScript functions you call from your code, through the `vscode` module. | Registering the editor provider, applying edits, reading settings. |

**The manifest.** Every extension has a `package.json` mixing ordinary Node fields with VS Code fields. `publisher` plus `name` form the unique ID, `main` points at the entry file, `engines.vscode` sets the minimum VS Code version, and `contributes` holds the contribution points ([Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)).

**The entry file.** It exports two functions: `activate`, run when an activation event fires, and `deactivate`, a chance to clean up. Things you register in `activate` are handed to `context.subscriptions` so VS Code can dispose them.

**What Undermark's manifest would declare** (illustrative values; the real file is written in Implement phase 3):

```json
{
  "name": "undermark",
  "displayName": "Undermark",
  "version": "0.0.1",
  "publisher": "<your-publisher-id>",
  "engines": { "vscode": "^1.85.0" },
  "main": "./dist/extension.js",
  "contributes": {
    "customEditors": [
      {
        "viewType": "undermark.editor",
        "displayName": "Undermark",
        "selector": [{ "filenamePattern": "*.umk" }],
        "priority": "default"
      }
    ]
  }
}
```

Here `viewType` is the unique name that ties the declaration to the code that registers the editor, and `priority: default` makes this editor the one VS Code uses for matching files ([Contribution Points](https://code.visualstudio.com/api/references/contribution-points)).

## 4. Custom editors: a new screen over VS Code's own file

A custom text editor replaces how a file looks while VS Code keeps owning the file's contents, which is why save, undo, backup and git keep working for free ([Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)).

**Two kinds exist.** A `CustomTextEditorProvider` uses VS Code's standard `TextDocument` as its data model, so VS Code handles operations such as save and backup for hot exit. A `CustomEditorProvider` brings its own document model, meant for binary formats, and makes you implement save and backup yourself. The documentation's rule of thumb: text-based format, use the text kind. Undermark's files are text, so it uses the text kind.

**One document, possibly several views.** There is a single `TextDocument` per file. If you split the editor, there is still one document but two webviews showing it.

**Lifecycle**

1. A user opens a `.umk` file; VS Code starts our extension if it is not already running.
2. VS Code calls our provider's `resolveCustomTextEditor` with the `TextDocument` and a fresh `WebviewPanel`.
3. We fill in the page's initial HTML and attach our listeners. Once that returns, the user sees our editor.
4. When the last editor for the file closes, VS Code disposes of the document too.

**Keeping the screen and the document in step.** This is the one place you must write real logic, and the docs spell out the pattern:

- *Screen to document.* The webview posts a message; the extension turns it into a `WorkspaceEdit` and applies it with `vscode.workspace.applyEdit`.
- *Document to screen.* The extension listens to `workspace.onDidChangeTextDocument` and posts the new content to the webview.
- *The trap.* That event also fires for edits our own editor made, so a naive version loops forever: screen edits document, document updates screen, screen reports an edit, and so on. This is exactly why the design has DocumentSync with version numbers (design contract, section 7.2).

**Good to know**

- The file can always be reopened with VS Code's normal text editor through the Reopen With command; merely listing the custom editor there does not activate our extension.
- The docs suggest learning webviews and text documents before attempting a custom editor, since it builds on both. This primer is meant to cover that ground.

## 5. Webviews: the screen, its sandbox and its messages

A webview is an HTML page that VS Code displays much like an iframe, walled off from your extension code, so everything between the two goes through messages ([Webview API](https://code.visualstudio.com/api/extension-guides/webview), [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api)).

**What you can and cannot do inside it**

| In the webview | In the Extension Host |
| --- | --- |
| Standard HTML, CSS and JavaScript | The `vscode` module and Node.js |
| No direct VS Code API; only a small handle from `acquireVsCodeApi()`, callable once per session | Apply edits, read settings, write files |
| Cannot read or write workspace files | Full file access through VS Code |
| Runs our editing engine (Tiptap and ProseMirror) | Runs DocumentSync, SettingsService, AssetService |

**Messages in both directions**

- *Host to page:* `webview.postMessage(data)`; the page receives it as an ordinary browser `message` event.
- *Page to host:* `vscode.postMessage(data)` on the handle from `acquireVsCodeApi()`; the host receives it in `webview.onDidReceiveMessage`.
- Messages must be JSON-serialisable. Browser objects such as `Blob` or `File` cannot be sent, because the receiver is not a browser. From VS Code 1.57 on, an `ArrayBuffer` is transferred efficiently when the extension targets that version, which matters for pasted pictures (the `saveImage` message).
- A successful post does not prove the page received it, and messages only reach live webviews (visible, or hidden ones that retain their context). Hence the design's `ready` handshake: the page tells the host when it is listening.

**Loading local files into the page.** The page cannot just point at a path on disk. The host converts a file location with `asWebviewUri`, and the folder must be listed in the webview's `localResourceRoots`. This is how pictures stored beside a document (design section 6.3) get displayed; AssetService does the conversion.

**Why a webview at all?** VS Code's UX guidelines say webviews should be used only when truly needed, and that everything inside must be themeable and accessible, with colour contrast, ARIA labels and keyboard navigation ([Webview UX guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews)). A visual rich-text editor is beyond what the native UI can do, so Undermark qualifies, and inherits those obligations (section 10 of the design: accessibility tests).

## 6. Theme colours inside a webview

VS Code hands every webview the active theme's colours as CSS variables, so Undermark never needs its own colour settings ([Webview API](https://code.visualstudio.com/api/extension-guides/webview), [Theme Color reference](https://code.visualstudio.com/api/references/theme-color)).

- **Variables.** Each theme colour becomes a CSS variable: the dots in the name turn into dashes and the prefix is `--vscode-`. For example `editor.foreground` becomes `var(--vscode-editor-foreground)`. VS Code also defines font variables.
- **Theme classes.** The page's `body` carries one of `vscode-light`, `vscode-dark` or `vscode-high-contrast`, for the rare case where a rule must differ by theme.
- **Theme-specific CSS is a last resort.** There is also a data attribute with the theme's ID, but VS Code's own guidance is to use it only in exceptional cases, because there are too many themes to cater for one by one.
- **Live switching.** The variables update when the user changes theme, so the editor restyles itself without reloading.

**How this serves Undermark**

- *Highlight colours (R3).* They need semi-transparent backgrounds so text stays readable. The Theme Color reference describes `editor.wordHighlightTextBackground` as deliberately non-opaque so as not to hide what is underneath, which is the kind of colour we want. The six palette colours will be chosen from such theme colours in Implement phase 2 and checked against light, dark and high-contrast themes.
- *Code colouring (R4).* The reference lists workbench colours. I did not find code token colours (keywords, strings) exposed as variables, so Phase 2 builds an approximate mapping and flags the difference. Matching VS Code's exact token colours is possible later but is a larger task that I suggest deferring.

## 7. The editing engine: ProseMirror and Tiptap

Inside the webview, ProseMirror treats a document as a typed tree and only ever allows edits that keep the tree valid against a schema you define, which is how Undermark enforces its strict-content rule ([ProseMirror Guide](https://prosemirror.net/docs/guide/)). Tiptap is a convenience layer built on ProseMirror that packages these pieces as ready-made extensions.

| Concept | What it means | Undermark use |
| --- | --- | --- |
| Document | A tree of nodes. Each node has a type, attributes, child content and marks. Most leaves are text blocks; some are empty blocks such as a horizontal rule. | Paragraph, Title, Heading, lists, code block, image, separator |
| Schema | Declares which node types may exist and how they nest, using content expressions such as `block+` or `text*`. A node can also forbid marks entirely. | Our DocumentModel, so nothing outside the list can exist |
| Marks | Extra information attached to inline text: emphasis, code, a link, with optional attributes. | Bold, italic, underline, highlight (with colour), code, link |
| State | Immutable: applying a transaction produces a new state rather than changing the old one. | Makes undo and redo reliable |
| Transaction | A described change to the document, selection or marks. Typing and commands both produce transactions. | Every toolbar click and slash-menu choice |
| Plugin | Adds state or behaviour: keymaps, extra rules, decorations, even UI that follows the editor state. | Slash menu, toolbar, block gaps |
| Commands | Functions that check whether a change is allowed and then perform it, for example toggling a mark or setting a block type. | Bold button, Title/Heading/Subheading dropdown |

**Two properties that matter to us**

- *One valid representation.* A ProseMirror document has exactly one valid form: adjacent text with identical marks is always merged, and empty text nodes are not allowed. That fits our rule that saving writes one canonical text form.
- *The menu example is our toolbar.* ProseMirror's own menu example builds a toolbar as a plugin whose buttons call commands such as toggling a mark or setting a block type ([menu example](https://prosemirror.net/examples/menu/)). The gap cursor and drop cursor are also ready-made plugins in its standard setup ([basic example](https://prosemirror.net/examples/basic/)), which is where the "cursor between two code blocks" behaviour comes from.

**How it fits the design.** The editor's schema is built from the Format Core's DocumentModel, so there is one definition of what a document may contain. Pasted content is converted through the schema's parse rules, so anything the schema cannot represent is dropped while its text survives ([schema example](https://prosemirror.net/examples/schema/)). That is PasteGuard.

## 8. How each Undermark component maps to VS Code

Only the six Extension Host components may call the VS Code API; the other 15 are ordinary code that never touches it. Component names match section 5 of the [design contract](https://claude.ai/artifact/5n9TPFdTFuksYi5wS6AXMa).

| Component | In VS Code or editor terms | Runs in | Calls VS Code API |
| --- | --- | --- | --- |
| ExtensionActivator | The `activate` and `deactivate` entry file; registers the provider | Extension Host | Yes |
| UndermarkEditorProvider | A `CustomTextEditorProvider`; its `resolveCustomTextEditor` builds the webview | Extension Host | Yes |
| DocumentSync | `onDidChangeTextDocument` listener plus `WorkspaceEdit` and `applyEdit`, plus message passing | Extension Host | Yes |
| SettingsService | VS Code user settings, declared as a contribution point | Extension Host | Yes |
| AssetService | File writes beside the document; `asWebviewUri` conversion | Extension Host | Yes |
| ExportService | Later phase: HTML and PDF output | Extension Host | Yes |
| EditorShell | The webview page's own script; holds the `acquireVsCodeApi` handle and the message handler | Webview | No |
| EditorSurface | The ProseMirror editor, set up through Tiptap | Webview | No |
| PasteGuard | The schema's parse rules plus paste handling | Webview | No |
| Toolbar | An HTML bar driven by editor state, as in ProseMirror's menu example | Webview | No |
| SlashMenu | A plugin that watches for `/` and shows a menu | Webview | No |
| BlockGapNavigator | The gap-cursor plugin plus a trailing empty paragraph | Webview | No |
| HighlightPalette | CSS variables from the theme | Webview | No |
| ThemeStyles | CSS using `--vscode-*` variables and the theme classes | Webview | No |
| CodeHighlighter | A code-colouring library, mapped to theme colours | Webview | No |
| ImageHandler | Page code that inserts pictures and sends `saveImage` | Webview | No |
| LineSpacingControl | A slider setting a CSS value; asks the host to store it | Webview | No |
| DocumentModel, FormatParser, FormatSerializer, DiagnosticsList | Plain code with no dependencies; bundled into both sides | Both | No |

The last row is why the Format Core is the only code with two homes: the screen uses it to turn the editor's document into text, and the host uses it to understand the file it hands over.

## 9. Daily workflow: build, run, debug, test, package

The loop is: edit code, press a launch button, try it in a second VS Code window, and package a `.vsix` file when you want to install it for real.

| Task | How it works | Source |
| --- | --- | --- |
| Scaffold | The Yeoman generator creates a starter extension, including integration tests. | [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) |
| Run and debug | A launch configuration of type `extensionHost` opens a second VS Code window, the Extension Development Host, with your extension loaded. | [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) |
| Debug the webview | The page is browser code, so you inspect it with developer tools. VS Code has a Command Palette command for opening a webview's developer tools; search for "Webview Developer Tools". (From my experience, not from the pages above.) | n/a |
| Bundle | Compile and bundle with esbuild or webpack so `main` points at one file. Undermark needs two bundles: one for the host (Node) and one for the page (browser). | [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) |
| Unit tests | Format Core tests run in plain Node with no VS Code, so they are fast. | design section 10 |
| Integration tests | Run inside an Extension Development Host with full API access, using Mocha through `@vscode/test-cli` and `@vscode/test-electron`. They download and launch a real VS Code. | [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) |
| Package | `vsce package` (from `@vscode/vsce`) produces a `.vsix` file. | [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) |
| Install locally | `code --install-extension name.vsix`, or Extensions view, Install from VSIX. | [Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) |
| Publish (optional) | Needs a Marketplace publisher and a personal access token. Not required for personal use. | [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) |

**For you as the product owner.** None of this is something you must run. In each phase's completion report I state which of these steps were done and what passed; from Phase 4 you can install the packaged `.vsix` and use Undermark in your own VS Code.

## 10. Glossary

Twenty-two terms cover everything you will meet in the design and in the completion reports.

| Term | Plain meaning |
| --- | --- |
| Extension | A Node.js program, described by a `package.json`, that adds features to VS Code |
| Extension Host | The separate process where extension code runs, kept apart so a faulty extension cannot freeze VS Code |
| Manifest | The `package.json` file that declares an extension's identity, entry file and contributions |
| Activation event | The trigger that makes VS Code load an extension |
| Contribution point | A declaration in the manifest that adds something to VS Code, such as a custom editor or a setting |
| VS Code API | The `vscode` module of functions an extension calls |
| Custom editor | An editor an extension supplies in place of the standard text editor for chosen files |
| TextDocument | VS Code's in-memory copy of a text file; the single source of truth for Undermark |
| WorkspaceEdit | A described set of changes applied to documents through the API |
| Webview | A sandboxed HTML page shown inside VS Code; the screen of our editor |
| postMessage | The only channel between a webview and its extension |
| asWebviewUri | The API call that converts a file location into an address a webview may load |
| Extension Development Host | The second VS Code window used to run and test an extension under development |
| VSIX | The installable package file for an extension |
| vsce | The command-line tool that packages and publishes extensions |
| ProseMirror | The editing library inside our webview |
| Tiptap | A layer on ProseMirror that bundles common features as extensions |
| Schema | The rules saying what a document may contain and how it nests |
| Mark | Inline styling attached to text, such as bold or a link |
| Transaction | One described change to the editor's document or selection |
| Canonical form | The single standard text layout Undermark always writes |
| Round trip | Reading a file and writing it back; Undermark requires the result to be identical |

## 11. Where to read more

If you read only three pages, read the first three; all are official and were read in November 2026.

**VS Code**

1. [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors): the pattern Undermark is built on
2. [Webview API](https://code.visualstudio.com/api/extension-guides/webview): messaging, local files, theme variables
3. [Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy): manifest, activation, entry file
4. [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest) and [Contribution Points](https://code.visualstudio.com/api/references/contribution-points)
5. [Activation Events](https://code.visualstudio.com/api/references/activation-events) and [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)
6. [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api) and [Theme Color reference](https://code.visualstudio.com/api/references/theme-color)
7. [Webview UX guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews)
8. [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension), [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension), [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)

**ProseMirror**

1. [ProseMirror Guide](https://prosemirror.net/docs/guide/): documents, schemas, state, transactions, plugins
2. [Schema example](https://prosemirror.net/examples/schema/), [menu example](https://prosemirror.net/examples/menu/) and [basic example](https://prosemirror.net/examples/basic/)
3. [Reference manual](https://prosemirror.net/docs/ref/)

**Not verified.** The Webview Developer Tools tip (section 9) and the statement that theme variables update live when the theme changes come from my experience, not from the pages above. The Tiptap description is general knowledge; I did not open Tiptap's documentation for this primer.
