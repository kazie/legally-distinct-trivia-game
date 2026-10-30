/** Whether a key press should be left alone by page shortcuts: typing in a field, or a browser/OS shortcut. */
export function ignoreHotkey(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true
  const target = event.target as HTMLElement | null
  return !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
}
