# Undermark – Architecture & Design Contract

Nov 9, 2026 · @Prakash Chandrasekaran

## 1. Purpose, scope and status

This is the architectural contract for Undermark: once you approve it, nothing is built that it does not describe, and any difference is raised with you before it happens.

Undermark is a visual editor inside VS Code for a deliberately small rich-text format. The file on disk is plain text, but you only ever see and edit the formatted result.

| UDIR phase | Status |
| --- | --- |
| Understand | Done (section 2) |
| Design | This document, awaiting your approval |
| Implement | Not started |
| Reconcile | Not started; this document then becomes the living architecture record |

**In scope (version 1)**

- Visual editing of `.umk` files inside VS Code
- Text styles: bold, italic, underline, inline code (typed or by file; no button), links
- Blocks: Title, Heading, Subheading, paragraph, bullet and numbered lists, code block, image, separator
- Slash menu, always-visible toolbar, adjustable line spacing, theme-driven colours
- Strict content rules: nothing outside the list above can enter a file

**Out of scope (version 1)**

- Tables, quotes, strikethrough, custom fonts, sizes or text colours
- Standalone app (the design keeps the door open), collaboration, Markdown import (Markdown export was added in phase 5 at your request)
- Per-file settings; line spacing is a user setting

**Starting point.** No repository or existing code was supplied, so this is treated as a new project with nothing to reuse or preserve.

## 2. Understand: requirements and constraints

Sixteen requirements came out of our conversation; every later section traces back to these IDs.

| ID | Requirement |
| --- | --- |
| R1 | Edit visually inside VS Code; the user never edits markup by hand |
| R2 | Bold, italic and underline |
| R3 | ~~Highlight: a coloured background behind chosen words~~ Removed 2026-11-10 (D14) |
| R4 | Inline code, and code blocks with syntax colouring |
| R5 | Three heading styles: Title (double underline), Heading (single underline), Subheading (plain bold) |
| R6 | Full-width separator |
| R7 | Hyperlinks |
| R8 | Images, shown from a link or embedded in the file |
| R9 | Bullet and numbered lists |
| R10 | Adjustable line spacing, for experimenting |
| R11 | Typing `/` opens a menu to insert text, lists, code and other blocks |
| R12 | New content can be inserted between any two blocks (for example two code blocks) and after the last block |
| R13 | A standard toolbar that is visible at all times |
| R14 | Strict content: nothing outside this list can be pasted or typed into a file (no foreign fonts, no rich-text carry-over) |
| R15 | All colours follow the active VS Code theme |
| R16 | The file is plain text, so it works with git and survives any tool |

**Constraints**

- First delivery is a VS Code extension; the core must be reusable later in a standalone app.
- There is no database. The document file and a few user settings are the only stored data (section 6).
- Working name Undermark and extension `.umk` are assumed; availability is checked before release.

**Prior art.** Several VS Code extensions already offer visual Markdown editing, built on Milkdown, Tiptap or Vditor. They prove the approach works but allow full Markdown, have no underline or double-underline headings, no theme-based highlights and no strict content rules. We reuse the same kind of editing engine, not their products.

## 3. Business capabilities and expected behaviour

You open a `.umk` file and get a clean page you can type on; everything below happens on screen, never in markup.

| Capability | Expected behaviour | Req |
| --- | --- | --- |
| Open and save | Double-clicking a `.umk` file opens the visual editor. Edits save through VS Code's normal save, undo and redo. | R1, R16 |
| Toolbar | A bar fixed at the top, always visible while scrolling. It holds a style dropdown (Text, Title, Heading, Subheading), Bold, Italic, Underline, Highlight with colour choices, inline Code, bullet list, numbered list, Link, Image, Separator and Code block. Buttons show the state of the text under the cursor. The line-spacing control sits at the right end. | R13, R2, R3 |
| Heading styles | Title shows a double rule beneath it, Heading a single rule, Subheading is bold with no rule. | R5 |
| Lists | Bullet and numbered lists, nested up to three levels. | R9 |
| Code | Inline code in a monospace style. Code blocks have a language picker and syntax colouring that follows the theme. | R4 |
| Links | Select text, press the Link button, enter an address. Ctrl or Cmd click opens it. | R7 |
| Images | Insert from a web address, or paste or drop a picture. Pasted pictures are saved beside the file by default (decision in section 12). | R8 |
| Separator | A full-width line across the page. | R6 |
| Slash menu | On an empty line, typing `/` opens a filterable menu: Text, Title, Heading, Subheading, Bullet list, Numbered list, Code block, Image, Separator. Arrow keys and Enter choose; Esc closes. | R11 |
| Insert between blocks | Arrow keys move the cursor into the gap between two neighbouring blocks (for example two code blocks); typing there creates a new paragraph. The page always ends with an empty line, and Enter on an empty last line of a code block steps out of it. | R12 |
| Line spacing | A slider changes spacing live (range 1.0 to 2.5, default 1.5) and is remembered as a user setting. | R10 |
| Strict content | Anything pasted or dropped is reduced to the allowed elements. Fonts, sizes, text colours, tables and similar are discarded; the words are kept. | R14 |
| Theme | Light, dark and high-contrast themes all work with no extra configuration. | R15 |

## 4. System architecture

The system has three layers: the screen you type on, a host that connects it to VS Code and the file, and a Format Core that both rely on.

&#91;embedded content: system architecture · 3 layers, files on disk\]

The screen and the host talk only through messages (section 7.9). Both use the Format Core to read and write text, and only the host touches files on disk, always through VS Code's own save.

## 5. Component and class catalogue

The system has 21 components in three layers; each has one responsibility, and the Format Core knows nothing about VS Code or the screen, which keeps a later standalone app cheap.

### Layer A: Format Core (pure logic, reused everywhere)

| Component | Responsibility | Key operations |
| --- | --- | --- |
| DocumentModel | Defines the only things a document may contain: block kinds, text styles and their attributes (section 6). The single source of truth for the strict-content rule. | allowedBlocks, allowedStyles, validate |
| FormatParser | Turns file text into a DocumentModel. Never fails: unknown or broken syntax becomes plain text plus a diagnostic. | parse(text) returns model and diagnostics |
| FormatSerializer | Turns a DocumentModel back into canonical file text. | serialize(model) returns text |
| DiagnosticsList | Describes what the parser could not honour (line, reason). | add, count, describe |

### Layer B: Extension Host (runs inside VS Code)

| Component | Responsibility | Key operations |
| --- | --- | --- |
| ExtensionActivator | Registers the editor for `.umk` files, the commands and the settings listener. | activate, deactivate |
| UndermarkEditorProvider | Creates one editor session per open file and connects it to the file. | openEditor, closeEditor |
| DocumentSync | Keeps the VS Code text document and the screen identical: pushes changes to the screen, writes screen edits to the document, ignores its own echoes. | pushToView, applyFromView, onExternalChange |
| SettingsService | Reads and updates user settings (section 6) and announces changes. | get, set, onChange |
| AssetService | Saves pasted pictures beside the file and turns stored picture paths into addresses the screen may load. | saveImage, resolveImage |
| ExportService | Exports one document, or every document in a folder, as HTML, PDF or Markdown. Pure converters live in `src/export` (no VS Code); the service finds files, embeds or copies pictures and writes results. PDF is printed by an installed Chromium-based browser. | exportHtml, exportPdf, exportMarkdown |

### Layer C: Editor View (the visual screen)

| Component | Responsibility | Key operations |
| --- | --- | --- |
| EditorShell | Hosts the page, toolbar and slash menu; talks to the Extension Host. | load, reportEdit, showBanner |
| EditorSurface | The editable page. Configured with the DocumentModel so it can only produce allowed content. Provides undo and redo. | applyCommand, currentModel, selectionState |
| PasteGuard | Reduces anything pasted or dropped to allowed content; keeps words, drops the rest. | cleanPaste, cleanDrop |
| Toolbar | Always-visible controls; shows the state of the selection and sends commands to the surface. | render, reflectSelection, runCommand |
| SlashMenu | Appears on an empty line after `/`; filters as you type; inserts the chosen block. | open, filter, choose, close |
| BlockGapNavigator | Lets the cursor sit between neighbouring blocks, keeps a trailing empty line, and steps out of code blocks. | enterGap, ensureTrailingLine, leaveCodeBlock |
| CodeHighlighter | Colours code by language using theme colours. | languages, colour |
| ImageHandler | Inserts pictures from links, paste or drop; shows a placeholder if one cannot load. | insertFromLink, insertFromPaste, showPlaceholder |
| LineSpacingControl | The slider; applies spacing live and asks the host to remember it. | setSpacing |
| ThemeStyles | Maps VS Code theme colours and fonts onto every element on screen. | apply |

**Reuse.** The Layer C engine pieces (editable page, undo, gap cursor, suggestion menu) come from an established editing library; the components above configure and wrap them (section 9).

## 6. Data model

There are no database tables: the data is one document file per document, a handful of user settings, and an optional folder of pictures.

### 6.1 The document file (`.umk`)

A document is an ordered list of blocks; each block holds styled text or, for lists, items that hold blocks.

| Block | Contains | Attributes | How it is stored |
| --- | --- | --- | --- |
| Title | styled text | none | the text, then a line of `=` beneath it |
| Heading | styled text | none | the text, then a line of `-` beneath it |
| Subheading | styled text | none | `# text` |
| Paragraph | styled text | none | plain lines |
| Bullet list | items | nesting level 1 to 3 | `- item`, nested items indented four spaces |
| Numbered list | items | nesting level 1 to 3 | `1. item`, nested items indented four spaces |
| Code block | code text | language (optional) | lines fenced by three backticks, language after the opening fence |
| Image | nothing | address (web address, relative path or embedded data), alt text | `![alt](address)` |
| Separator | nothing | none | `***` on its own line |

| Text style | How it is stored |
| --- | --- |
| Bold | `**text**` |
| Italic | `*text*` |
| Underline | `__text__` |
| Inline code | `` `text` `` |
| Link | `[text](address)` |

Styles may combine. Characters that would otherwise look like markup are protected with a backslash, so any typed text survives a save and reload.

**Rules this contract fixes**

1. Blocks are separated by exactly one blank line.
2. Saving always writes the single canonical text form, and reading it back gives the identical document.
3. Opening a file never changes it. A hand-written variant is read leniently and tidied into canonical form only when you make your first edit.
4. Unsupported syntax (a table, a quote, HTML) is kept as visible plain text and reported; it is never deleted.
5. Empty paragraphs are not stored. Vertical space comes from line spacing, not from blank lines.

### 6.2 User settings

| Setting | Meaning | Default | Allowed |
| --- | --- | --- | --- |
| `undermark.lineSpacing` | Space between lines | 1.5 | 1.0 to 2.5 |
| `undermark.imageStorage` | Where pasted pictures go | assets folder | assets folder, embedded in file |
| `undermark.embedWarningKB` | Size above which an embedded picture triggers a warning | 500 | 50 to 5000 |

Out-of-range values are clamped silently to the nearest allowed value.

### 6.3 Pictures folder

Pictures saved beside a file live in a folder named after it (`notes.umk` uses `notes.assets/`). The document refers to them by relative path. Consequence: moving a document means moving its folder too.

## 7. Key interaction flows

The VS Code text document is always the single source of truth; the screen is a view of it that can also make edits.

### 7.1 Open a file

1. VS Code opens a `.umk` file; UndermarkEditorProvider starts an editor session.
2. The provider creates the screen (EditorShell) and waits for it to report ready.
3. DocumentSync sends the file text; FormatParser builds the DocumentModel and a DiagnosticsList.
4. EditorSurface shows the document; if diagnostics exist, EditorShell shows a banner with the count.

### 7.2 Edit and save

1. You type or press a toolbar button; EditorSurface changes the document.
2. EditorShell asks FormatSerializer for the canonical text and sends it, with a version number, to DocumentSync.
3. DocumentSync writes it into the VS Code document; VS Code marks the file as changed.
4. The version number lets DocumentSync ignore the echo of its own change, so the cursor never jumps.
5. Save, undo and redo are VS Code's own; each undo step is sent back to the screen as a change from outside.

### 7.3 Change from outside (another tab, git, a file sync)

1. VS Code reports a document change that did not come from the screen.
2. DocumentSync sends the new text; FormatParser rebuilds the document.
3. EditorSurface replaces its content and restores the cursor to the nearest valid place.

### 7.4 Paste or drop

1. EditorSurface hands the content to PasteGuard.
2. PasteGuard keeps only allowed blocks and styles (section 6) and discards everything else, keeping the words.
3. A picture is passed to ImageHandler, which asks the host to save it (flow 7.5).
4. The cleaned content is inserted at the cursor.

### 7.5 Insert a picture

1. From a web address: ImageHandler inserts the picture with that address.
2. From paste or drop with storage set to the assets folder: the view sends the picture to AssetService, which saves it and returns a relative path.
3. With storage set to embedded: the picture is stored inside the file; above the size threshold you get a warning first.
4. If the picture cannot be loaded later, a placeholder with the alt text is shown and the file is untouched.

### 7.6 Slash menu

1. On an empty line you type `/`; SlashMenu opens at the cursor.
2. Typing narrows the list; Enter inserts the chosen block in place of the `/` text.
3. Esc or moving away closes the menu and leaves the `/` as ordinary text.

### 7.7 Insert between blocks

1. With the cursor in or beside a block, an arrow key towards a neighbouring block puts the cursor in the gap (BlockGapNavigator).
2. Typing in the gap creates a new paragraph; the slash menu works there too.
3. Enter on an empty last line of a code block leaves the block.

### 7.8 Change line spacing

1. You move the slider; LineSpacingControl changes the page spacing immediately.
2. The value is sent to SettingsService, which stores it as a user setting.
3. Other open `.umk` editors pick up the change through the settings-changed message.

### 7.9 Messages between screen and host

| Message | From | To | Carries |
| --- | --- | --- | --- |
| ready | screen | host | nothing |
| load | host | screen | file text, version, settings |
| edit | screen | host | canonical text, version |
| externalChange | host | screen | file text, version |
| saveImage | screen | host | picture data, suggested name |
| imageSaved | host | screen | relative path or failure reason |
| settingChanged | both ways | both ways | setting name, new value |

## 8. Error handling and failure behaviour

The governing rule: no failure may lose or silently change your content, and the file on disk is never left half-written.

| Situation | Behaviour |
| --- | --- |
| File contains syntax Undermark does not support (table, quote, HTML) | Shown as plain text; a banner reports how many lines; nothing is deleted. |
| Broken markup, such as an unclosed `**` | Treated as ordinary characters and reported in the banner. |
| Picture cannot be loaded (missing file, no network) | A placeholder with the alt text and address is shown; the file is untouched. |
| Picture cannot be saved beside the file (read-only folder) | A message appears with an offer to embed it in the file instead. |
| Embedded picture larger than the warning size | You are warned before it is inserted and may cancel or continue. |
| Pasted content has disallowed formatting | Reduced silently to allowed content; if nothing allowed remains, the words are kept as paragraphs. |
| File changes outside while you are typing | The VS Code document is the single truth; the screen re-reads it and restores your cursor to the nearest valid place. |
| Edit and outside change collide | The last write to the VS Code document wins, as in any VS Code editor; undo history recovers the other version. |
| The visual screen crashes or is closed | The file is unaffected, because every edit is already in the VS Code document; reopening reloads it. |
| File is not readable text | The visual editor declines to open it and offers VS Code's plain text editor. |
| Setting outside its allowed range | Clamped to the nearest allowed value; no error shown. |
| Slash menu opened where it is not allowed (inside code) | Does not open; `/` is ordinary text. |

## 9. Architectural decisions, trade-offs and reuse

Eight decisions shape the system; each is recorded with what it costs.

| # | Decision | Alternative rejected | Consequence |
| --- | --- | --- | --- |
| D1 | Store documents as plain text | A structured data file | Works with git and any tool (R16), but needs a parser and serializer with strict round-trip tests. |
| D2 | Build first as a VS Code custom editor | Standalone app first | File explorer, tabs, git and undo come free; the standalone app waits but stays cheap because of D3. |
| D3 | Keep all format logic in a Format Core with no screen or VS Code knowledge | Logic spread through the editor | One tested place for the format; a future app reuses it unchanged. |
| D4 | Reuse an established editing library (Tiptap, built on ProseMirror) | Write an editing engine | Undo, cursor gaps and slash-style menus are solved problems; we depend on a third-party library and must follow its upgrades. |
| D5 | Enforce content rules by a fixed allowed-content definition (DocumentModel) | Clean pasted content after the fact | The editor cannot produce disallowed content at all (R14); adding a feature later means extending the definition on purpose. |
| D6 | Colours come only from the VS Code theme; highlights use a fixed palette of six | User-chosen colours | Always readable in light, dark and high-contrast (R15); you cannot pick arbitrary colours. |
| D7 | Underline uses `__text__`, which differs from Markdown | Keep Markdown meaning of `__` | Undermark files are not Markdown files, hence their own extension; a Markdown export can come later. |
| D8 | Saving writes one canonical form | Preserve the original layout of hand-edited files | Predictable, clean git diffs; a hand-written variant is tidied on the first edit only. |
| D9 (2026-11-10) | Markdown export added; underline becomes `<u>`, highlight `<mark>` (colour dropped) | Leave Markdown out | Requested by you for files that do not suit Markdown tools; HTML tags are the only faithful spelling of those two styles. Import stays out of scope. |
| D10 (2026-11-10) | Folder export mirrors the folder under `<folder>/export/<format>/`; HTML also gets an `index.html` | Ask for a destination each time | No prompt for the common case; the `export` folder is skipped when scanning, so repeat exports never feed on themselves. A single document asks where to save. |
| D11 (2026-11-10) | PDF is printed by an installed Chrome, Edge or Chromium (`undermark.pdfBrowserPath` overrides) | Bundle a browser engine (+100 MB); build a PDF writer | Keeps the extension small and the PDF identical to the HTML page. Cost: PDF needs one of those browsers installed; HTML and Markdown do not. |
| D12 (2026-11-10) | HTML and PDF carry pictures inside the page; Markdown copies them to `<name>.assets` beside the output | Link to originals | HTML moves anywhere without breaking; Markdown keeps pictures as files, as Markdown tools expect. |
| D13 (2026-11-10) | Exports use fixed colours (light, with a dark variant in HTML; PDF always light), not the VS Code theme | Embed the current theme | A page outside VS Code has no theme variables; paper should be light. Headings, highlights and code colours follow the editor's design. |
| D14 (2026-11-10) | Highlight removed everywhere: format (`~text~` is now plain text), editor, settings, exports. Supersedes D6's palette and D9's `<mark>` | Keep it | Requested by the user |
| D15 (2026-11-10) | Titles, headings and subheadings hold plain text only; formatting found in a file is dropped with a notice, and the toolbar disables the style buttons there | Allow styles | Requested by the user |
| D16 (2026-11-10) | The inline-code toolbar button is removed (the format and Ctrl/Cmd+E remain); page text uses the VS Code interface font, code keeps the editor font | Keep the button; editor font for text | Requested by the user |
| D17 (2026-11-10) | Title and heading rules are as wide as the text plus a small overhang, in the editor and in exports; the toolbar is grouped, and line spacing shows the multiple and the pixels it gives | Full-width rules | Requested by the user |

### New versus reused

| Reused (not built by us) | New (built by us) |
| --- | --- |
| VS Code custom-editor facility, undo, save, settings storage | Format Core: DocumentModel, FormatParser, FormatSerializer, DiagnosticsList |
| Editing library: editable page, undo, cursor gaps, suggestion menu | Extension Host: activation, editor provider, DocumentSync, AssetService, SettingsService |
| Code-colouring library | Editor View: toolbar, slash menu items, PasteGuard rules, HighlightPalette, ImageHandler, LineSpacingControl, ThemeStyles |
| VS Code theme colour variables | Format specification and test suite |

## 10. Testing and validation strategy

Every requirement R1 to R16 gets at least one automated check, and the riskiest area, text-to-screen-to-text fidelity, gets the most.

| Test area | What it proves | Requirements |
| --- | --- | --- |
| Format round trip | Reading then saving gives the identical document for a large set of sample files, including awkward characters and every style combination. | R16, R2 to R9 |
| Lenient reading | Unsupported or broken syntax is preserved as visible text with a diagnostic; opening never alters the file. | R14, R16 |
| Strict content | Content pasted from a word processor, a web page and a spreadsheet comes out containing only allowed blocks and styles. | R14 |
| Editing commands | Each toolbar button and each slash-menu item produces the right block or style, and the toolbar reflects the cursor position. | R2 to R9, R11, R13 |
| Block gaps | The cursor can reach and type between two adjacent code blocks, two images, and after the last block. | R12 |
| Sync with VS Code | Typing, undo, redo, save, and outside changes keep screen and file identical, with no cursor jumps or edit loops. | R1, R16 |
| Images | Link, paste and drop all work; missing pictures show placeholders; large embeds warn. | R8 |
| Line spacing | The slider changes spacing live and the setting survives restart. | R10 |
| Themes | Light, dark and high-contrast render readable text, highlights and code colours (visual check plus contrast measurement). | R15 |
| Accessibility | Toolbar and slash menu work by keyboard alone; controls have labels. | R13, R11 |

Each phase in section 11 ends only when its tests pass, and the completion report lists what was run.

## 11. Implement and Reconcile

Implementation runs in five phases; each ends with passing tests, an updated architecture record and a short completion report to you, and no phase starts before the previous one is accepted.

1. **Format Core.** Format specification, DocumentModel, FormatParser, FormatSerializer, DiagnosticsList. Exit: round-trip and lenient-reading tests pass on the sample set.
2. **Editor View in a browser test page.** EditorSurface, PasteGuard, Toolbar, SlashMenu, BlockGapNavigator, HighlightPalette, CodeHighlighter, ThemeStyles. Exit: strict-content, command and block-gap tests pass; you can try it on a plain page.
3. **VS Code integration.** Activator, editor provider, DocumentSync, SettingsService, AssetService, ImageHandler. Exit: sync, undo and image tests pass inside a real VS Code test instance.
4. **Polish.** Line-spacing control, diagnostics banner, accessibility, theme checks, packaging as an installable extension. Exit: all section 10 areas pass.
5. **Export.** HTML and PDF output. Exit: exported files match the on-screen look.

**Reconcile commitments**

- After each phase the architecture record is updated to match the code as built, not as planned. It covers system architecture, component catalogue, format specification, flows, data model and the decision log (section 9).
- This document becomes that record and moves into the repository's architecture folder; every later change adds a dated entry to the decision log.
- Anything that would change an approved element (a component, a flow, the file format) stops work and comes to you first, with the problem, the options and a recommendation.
- Routine engineering choices inside this design are made without asking you.

## 12. Decisions awaiting approval

One decision needs you, where pasted pictures are stored by default; everything else below I have decided and list so you can veto it.

### Decision needed: where pasted pictures live by default

**The problem.** The document is a plain-text file, so a pasted picture must be stored somewhere else or squeezed into the text.

| Option | What happens | Benefit | Cost |
| --- | --- | --- | --- |
| A. Beside the file | Picture saved in a folder next to the document (`notes.assets/`); the document refers to it. | Small, readable files; clean git history; pictures can be replaced. | The folder must travel with the document. |
| B. Inside the file | Picture encoded into the document text. | One self-contained file. | Files become huge and unreadable as text; git diffs are poor; the editor gets slower. |

**Recommendation: A as the default.** B stays available through the `undermark.imageStorage` setting, and is offered automatically if saving beside the file fails.

**Question for you:** do you approve A as the default?

### Decided by me (tell me if you disagree)

- Lists nest up to three levels.
- Line spacing is a personal setting, not stored in the document, so the same file can look different on two machines.
- Empty paragraphs are not saved; spacing comes from the line-spacing setting.
- Code blocks use a language picker from a list of common languages, with no automatic detection.
- Working name Undermark and extension `.umk` stand until availability is checked before release.

### To proceed

Answer the question above and say "approved" and I start Phase 1 (Format Core). Corrections to anything in this document come first.
