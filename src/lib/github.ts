export interface OpenDraftPrInput {
  token: string;
  repo: string;   // "owner/name"
  head: string;   // feature branch
  base: string;   // e.g. "main"
  title: string;
  body: string;
}

/** Create a DRAFT pull request. Returns its html_url. Never merges. */
export async function openDraftPr(input: OpenDraftPrInput, opts?: { fetchImpl?: typeof fetch }): Promise<string> {
  const f = opts?.fetchImpl ?? fetch;
  const res = await f(`https://api.github.com/repos/${input.repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bug-automation",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: input.title, head: input.head, base: input.base, body: input.body, draft: true }),
  });
  if (!res.ok) throw new Error(`openDraftPr failed: ${res.status}`);
  const data = (await res.json()) as { html_url: string };
  return data.html_url;
}
