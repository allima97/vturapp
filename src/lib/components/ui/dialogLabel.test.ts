import { describe, expect, it } from 'vitest';
import { dialogLabel, nextDialogLabelId } from './dialogLabel';

function fakeHost() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k)
  };
}

describe('dialogLabel (Fase 3.6)', () => {
  it('ids únicos por Dialog', () => {
    expect(nextDialogLabelId()).not.toBe(nextDialogLabelId());
  });

  it('grava aria-labelledby/aria-describedby no role=dialog e limpa ao destruir', () => {
    const host = fakeHost();
    let selector = '';
    const node = { closest: (s: string) => ((selector = s), host as unknown as Element) };
    const action = dialogLabel(node, { labelId: 'd1', descriptionId: 'd1-desc' });
    expect(selector).toBe('[role="dialog"]');
    expect(host.attrs.get('aria-labelledby')).toBe('d1');
    expect(host.attrs.get('aria-describedby')).toBe('d1-desc');

    action.update({ labelId: 'd1', descriptionId: null });
    expect(host.attrs.has('aria-describedby')).toBe(false);

    action.destroy();
    expect(host.attrs.size).toBe(0);
  });

  it('sem role=dialog acima: não faz nada e não quebra', () => {
    const action = dialogLabel({ closest: () => null }, { labelId: 'x' });
    expect(() => action.update({ labelId: 'x' })).not.toThrow();
    expect(() => action.destroy()).not.toThrow();
  });
});
