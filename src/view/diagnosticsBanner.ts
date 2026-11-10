import type { Diagnostic } from '../core/index.ts';

/**
 * A quiet strip under the toolbar listing what could not be shown as formatted text.
 * The content itself is never lost; those lines are simply kept as plain paragraphs.
 */
export function createBanner(): { element: HTMLElement; show: (items: readonly Diagnostic[]) => void } {
  const element = document.createElement('div');
  element.className = 'umk-banner';
  element.setAttribute('role', 'status');
  element.hidden = true;

  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'umk-banner-summary';
  summary.setAttribute('aria-expanded', 'false');
  const list = document.createElement('ul');
  list.hidden = true;
  element.append(summary, list);

  summary.addEventListener('click', () => {
    list.hidden = !list.hidden;
    summary.setAttribute('aria-expanded', String(!list.hidden));
  });

  const show = (items: readonly Diagnostic[]): void => {
    element.hidden = items.length === 0;
    list.replaceChildren(
      ...items.map((d) => {
        const li = document.createElement('li');
        li.textContent = `Line ${d.line}: ${d.reason}`;
        return li;
      }),
    );
    summary.textContent = `${items.length} line${items.length === 1 ? '' : 's'} shown as plain text`;
  };
  return { element, show };
}
