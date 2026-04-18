export const FAKE_DOMAIN = "todo.local";
export function usernameToEmail(u: string) {
  return `${u.toLowerCase().trim()}@${FAKE_DOMAIN}`;
}
