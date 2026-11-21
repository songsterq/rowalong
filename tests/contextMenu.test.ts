import { describe, it, expect } from 'vitest';
import { contextMenuTemplate } from '../electron/contextMenu.cjs';

const NO_FLAGS = {
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canDelete: false,
  canSelectAll: false,
  canEditRichly: false,
};
const flags = (on: Partial<typeof NO_FLAGS>) => ({ ...NO_FLAGS, ...on });

describe('contextMenuTemplate', () => {
  it('offers Cut, Copy, Paste and Select All in a text field', () => {
    const t = contextMenuTemplate({
      isEditable: true,
      selectionText: '',
      editFlags: flags({ canPaste: true, canSelectAll: true }),
    });
    expect(t.map((i) => i.role ?? i.type)).toEqual(['cut', 'copy', 'paste', 'separator', 'selectAll']);
  });

  it('enables each edit item only when the field says it can', () => {
    const t = contextMenuTemplate({
      isEditable: true,
      selectionText: '',
      editFlags: flags({ canPaste: true, canSelectAll: true }),
    });
    const enabled = Object.fromEntries(t.filter((i) => i.role).map((i) => [i.role, i.enabled]));
    expect(enabled).toEqual({ cut: false, copy: false, paste: true, selectAll: true });
  });

  it('offers just Copy for selected page text', () => {
    const t = contextMenuTemplate({
      isEditable: false,
      selectionText: 'Quick 20',
      editFlags: flags({ canCopy: true }),
    });
    expect(t).toEqual([{ role: 'copy', enabled: true }]);
  });

  it('shows no menu on page text with nothing selected', () => {
    expect(contextMenuTemplate({ isEditable: false, selectionText: '', editFlags: flags({}) })).toEqual([]);
    expect(contextMenuTemplate({ isEditable: false, selectionText: '  \n', editFlags: flags({}) })).toEqual([]);
  });
});
