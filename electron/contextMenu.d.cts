/** The parts of Electron's 'context-menu' params the template reads. */
export interface ContextMenuParams {
  isEditable: boolean;
  selectionText: string;
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

export interface ContextMenuItem {
  role?: 'cut' | 'copy' | 'paste' | 'selectAll';
  type?: 'separator';
  enabled?: boolean;
}

export function contextMenuTemplate(params: ContextMenuParams): ContextMenuItem[];
