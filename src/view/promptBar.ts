import type { Ask, Confirm } from './editorSurface.ts';

/**
 * Asks for one line of text in a bar inside the page. (Webviews cannot use the browser's
 * prompt dialog.)
 */
export function createPromptBar(host: HTMLElement): { ask: Ask; confirm: Confirm } {
  const bar = document.createElement('form');
  bar.className = 'umk-promptbar';
  bar.hidden = true;
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'text';
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.textContent = 'OK';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  label.append(input);
  bar.append(label, ok, cancel);
  host.append(bar);

  let finish: ((v: string | null) => void) | null = null;
  const close = (value: string | null) => {
    bar.hidden = true;
    const f = finish;
    finish = null;
    f?.(value);
  };
  bar.addEventListener('submit', (e) => { e.preventDefault(); close(input.value); });
  cancel.addEventListener('click', () => close(null));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });

  const ask: Ask = (question, initial = '') =>
    new Promise((resolve) => {
      finish?.(null);
      finish = resolve;
      input.hidden = false;
      label.replaceChildren(question + ' ', input);
      input.value = initial;
      input.setAttribute('aria-label', question);
      bar.hidden = false;
      input.focus();
    });
  const confirm: Confirm = async (question) => {
    finish?.(null);
    return new Promise<boolean>((resolve) => {
      finish = (v) => resolve(v !== null);
      input.hidden = true;
      label.replaceChildren(question);
      bar.hidden = false;
      ok.focus();
    });
  };
  return { ask, confirm };
}
