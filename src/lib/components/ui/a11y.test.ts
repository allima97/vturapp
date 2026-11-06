/**
 * Fase 3.2: acessibilidade do kit de componentes.
 * Renderiza os componentes no servidor (svelte/server) e confere os atributos.
 * Nenhuma regra de negócio muda: só aria-*, tabindex e foco.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FieldInput from './form/FieldInput.svelte';
import FieldSelect from './form/FieldSelect.svelte';
import FieldTextarea from './form/FieldTextarea.svelte';
import FieldCheckbox from './form/FieldCheckbox.svelte';
import FieldRadioGroup from './form/FieldRadioGroup.svelte';
import Tabs from './Tabs.svelte';
import Button from './Button.svelte';
import PageHeader from './PageHeader.svelte';
import { focusableTabIndex, nextTabIndex } from './tabsKeyboard';

const html = (component: unknown, props: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(component as any, { props }).body.replace(/<!--[^>]*-->/g, '');

describe('campos: erro/ajuda ligados ao campo', () => {
  it.each([
    ['FieldInput', FieldInput, {}],
    ['FieldInput com máscara', FieldInput, { mask: 'cpf' }],
    ['FieldSelect', FieldSelect, { options: [{ value: 'a', label: 'A' }] }],
    ['FieldTextarea', FieldTextarea, {}],
    ['FieldCheckbox', FieldCheckbox, {}]
  ])('%s: com erro → aria-invalid e aria-describedby apontando para a mensagem', (_n, C, extra) => {
    const body = html(C, { label: 'Nome', id: 'f1', error: 'Campo obrigatório', ...extra });
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="f1-desc"');
    expect(body).toMatch(/<p[^>]*id="f1-desc"[^>]*>Campo obrigatório<\/p>/);
  });

  it('com ajuda (sem erro) → aria-describedby, sem aria-invalid', () => {
    const body = html(FieldInput, { label: 'CPF', id: 'f2', helper: 'Só números' });
    expect(body).toContain('aria-describedby="f2-desc"');
    expect(body).not.toContain('aria-invalid');
  });

  it('sem erro e sem ajuda → nenhum atributo extra', () => {
    const body = html(FieldInput, { label: 'CPF', id: 'f3' });
    expect(body).not.toContain('aria-describedby');
    expect(body).not.toContain('aria-invalid');
  });

  it('asterisco de obrigatório não é lido; o campo continua required', () => {
    const body = html(FieldInput, { label: 'Nome', id: 'f4', required: true });
    expect(body).toContain('<span class="ml-0.5 text-red-500" aria-hidden="true">*</span>');
    expect(body).toMatch(/<input[^>]*required/);
  });
});

describe('FieldRadioGroup', () => {
  it('o rótulo nomeia o grupo (antes apontava para um id inexistente)', () => {
    const body = html(FieldRadioGroup, {
      label: 'Tipo',
      id: 'g1',
      name: 'tipo',
      required: true,
      error: 'Escolha um',
      options: [
        { value: 'pf', label: 'PF' },
        { value: 'pj', label: 'PJ' }
      ]
    });
    expect(body).toMatch(/<label[^>]*id="g1-label"/);
    expect(body).not.toContain('for="g1"');
    expect(body).toContain('role="radiogroup"');
    expect(body).toContain('aria-labelledby="g1-label"');
    expect(body).toContain('aria-required="true"');
    expect(body).toContain('aria-describedby="g1-desc"');
  });
});

describe('Tabs', () => {
  const items = [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B', disabled: true },
    { key: 'c', label: 'C' }
  ];

  it('só a aba ativa entra na ordem do Tab (tabindex móvel)', () => {
    const body = html(Tabs, { items, activeKey: 'c' });
    const tabs = [...body.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toContain('tabindex="-1"');
    expect(tabs[2]).toContain('tabindex="0"');
    expect(tabs[2]).toContain('aria-selected="true"');
  });

  it('sem aba ativa válida, a primeira habilitada recebe o foco', () => {
    expect(focusableTabIndex(items, '')).toBe(0);
    expect(focusableTabIndex(items, 'b')).toBe(0);
  });

  it('setas pulam desabilitadas e dão a volta; Home/End; outras teclas ignoradas', () => {
    expect(nextTabIndex(items, 0, 'ArrowRight')).toBe(2);
    expect(nextTabIndex(items, 2, 'ArrowRight')).toBe(0);
    expect(nextTabIndex(items, 0, 'ArrowLeft')).toBe(2);
    expect(nextTabIndex(items, 2, 'Home')).toBe(0);
    expect(nextTabIndex(items, 0, 'End')).toBe(2);
    expect(nextTabIndex(items, -1, 'ArrowRight')).toBe(0);
    expect(nextTabIndex(items, 0, 'Enter')).toBeNull();
    expect(nextTabIndex([{ disabled: true }], 0, 'ArrowRight')).toBeNull();
  });
});

describe('Button', () => {
  it('carregando → aria-busy e desabilitado; normal → sem aria-busy', () => {
    const busy = html(Button, { loading: true });
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toMatch(/<button[^>]*disabled/);
    expect(html(Button, {})).not.toContain('aria-busy');
  });
});

describe('Fase 3.3: navegação', () => {
  it('Button: ariaControls e ariaExpanded chegam ao <button>', () => {
    const body = html(Button, { ariaControls: 'menu-x', ariaExpanded: false });
    expect(body).toContain('aria-controls="menu-x"');
    expect(body).toContain('aria-expanded="false"');
    expect(html(Button, {})).not.toContain('aria-controls');
  });

  it('PageHeader: trilha nomeada, início com rótulo e último item como página atual', () => {
    const body = html(PageHeader, {
      title: 'Editar cliente',
      breadcrumbs: [
        { label: 'Clientes', href: '/clientes' },
        { label: 'Editar', href: '/clientes/1/editar' }
      ]
    });
    expect(body).toContain('aria-label="Trilha de navegação"');
    expect(body).toContain('aria-label="Início"');
    expect(body).toContain('href="/clientes"');
    expect(body).toMatch(/aria-current="page"[^>]*>Editar</);
    // sem breadcrumbs → sem trilha
    expect(html(PageHeader, { title: 'X' })).not.toContain('Trilha de navegação');
  });
});
