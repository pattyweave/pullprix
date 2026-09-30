const key = 'pullprix.setup-return'
export function safeSetupReturn(value: string | null): value is string {
  return value !== null && /^\/(?:teams\/[1-9][0-9]*|installations\/callback\?installation_id=[1-9][0-9]*)$/.test(value)
}
export function rememberSetupReturn(value: string | null) {
  if (safeSetupReturn(value)) window.sessionStorage.setItem(key, value)
}
export function takeSetupReturn() {
  const value = window.sessionStorage.getItem(key)
  window.sessionStorage.removeItem(key)
  return safeSetupReturn(value) ? value : null
}
