# Undermark

A visual editor for `.umk` files: a small plain-text format that reads well as text and edits like a document.

- Open any `.umk` file; it shows as a formatted page with a toolbar and a `/` block menu.
- Pictures pasted or dropped are saved next to the document in `<name>.assets/` (or embedded, see `undermark.imageStorage`).
- Undo, redo, save and source control are VS Code's own.
- Format reference: `docs/format-spec.md`.

Settings: `undermark.lineSpacing`, `undermark.imageStorage`, `undermark.embedWarningKB`.

## Export
Right-click a `.umk` file or a folder in the Explorer (or run **Undermark: Export as…** from the Command Palette) and choose HTML, PDF or Markdown.
- A folder exports every `.umk` inside it, into `export/<format>/` within that folder, keeping the folder structure. HTML also gets an `index.html`.
- A single document asks where to save.
- HTML and PDF contain their pictures; Markdown copies them to a `.assets` folder beside the file. Markdown writes underline as `<u>`.
- PDF needs Google Chrome, Microsoft Edge or Chromium installed (set `undermark.pdfBrowserPath` if it is not found).
