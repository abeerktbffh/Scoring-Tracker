// Device-local "remember me" for the sign-in gate's display name field.
// Stores nothing sensitive — just the display name a returning user typed
// previously, so the gate can pre-fill it on this device.

const KEY = "st.displayName";

export function saveName(name: string): void {
  window.localStorage.setItem(KEY, name);
}

export function loadName(): string | null {
  return window.localStorage.getItem(KEY);
}

export function clearName(): void {
  window.localStorage.removeItem(KEY);
}
