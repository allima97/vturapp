export function mobileCardActions(node: HTMLTableRowElement, enabled = true) {
  const originalTabindex = node.getAttribute('tabindex');
  let expanded = false;

  function sync() {
    const active = enabled && window.innerWidth <= 640;
    node.classList.toggle('vtur-table-row-expandable', active);
    if (active) {
      node.tabIndex = 0;
      node.setAttribute('aria-expanded', String(expanded));
    } else {
      if (originalTabindex === null) node.removeAttribute('tabindex');
      else node.setAttribute('tabindex', originalTabindex);
      node.removeAttribute('aria-expanded');
    }
  }

  function toggle() {
    expanded = !expanded;
    sync();
  }

  function onClick(event: MouseEvent) {
    if (!enabled || window.innerWidth > 640) return;
    if (
      event.target instanceof Element &&
      event.target.closest('button, a, input, select, textarea, label')
    )
      return;
    toggle();
  }

  function onKeydown(event: KeyboardEvent) {
    if (!enabled || window.innerWidth > 640 || event.target !== node) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  }

  window.addEventListener('resize', sync);
  node.addEventListener('click', onClick);
  node.addEventListener('keydown', onKeydown);
  sync();

  return {
    update(value: boolean) {
      enabled = value;
      sync();
    },
    destroy() {
      window.removeEventListener('resize', sync);
      node.removeEventListener('click', onClick);
      node.removeEventListener('keydown', onKeydown);
    }
  };
}
