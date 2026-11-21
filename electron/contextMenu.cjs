// Right-click menu for the setup window. Electron shows no context menu of its
// own, so without this a right-click in a text field (the import box, the name
// field) offers no Paste, as it would in Chrome. Pure: maps Electron's
// 'context-menu' params to a Menu template, so it is unit-tested; app.cjs pops
// it up. Roles do the editing, so no IPC is involved.

function contextMenuTemplate(params) {
  const flags = params.editFlags || {};
  if (params.isEditable) {
    return [
      { role: 'cut', enabled: !!flags.canCut },
      { role: 'copy', enabled: !!flags.canCopy },
      { role: 'paste', enabled: !!flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: !!flags.canSelectAll },
    ];
  }
  if (params.selectionText && params.selectionText.trim()) {
    return [{ role: 'copy', enabled: !!flags.canCopy }];
  }
  return [];
}

module.exports = { contextMenuTemplate };
