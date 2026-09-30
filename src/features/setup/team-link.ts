export function teamEntryPath(installationId: number) {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new Error('Invalid team identifier')
  return `/teams/${installationId}`
}
export function teamEntryUrl(origin: string, installationId: number) {
  const base = new URL(origin)
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid application origin')
  return new URL(teamEntryPath(installationId), base.origin).toString()
}
export function isLocalTeamLink(url: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
}
