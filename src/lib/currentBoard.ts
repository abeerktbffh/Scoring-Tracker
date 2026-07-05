export const BOARD_STORAGE_KEY = "st.group";

export function loadBoardId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(BOARD_STORAGE_KEY) || null;
}

export function saveBoardId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(BOARD_STORAGE_KEY, id);
  else window.localStorage.removeItem(BOARD_STORAGE_KEY);
}
