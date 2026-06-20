export function formatPageTitle(mountPath?: string): string {
  return mountPath ? `aze - ${mountPath}` : 'aze';
}
