/** Resolve only legacy requests belonging to the same API and exact signed-in session. */
export function legacyReplayUrl(url: string, headers: Record<string,string> | undefined, token: string, apiBase: string, origin: string): URL | null {
  if ((headers?.Authorization || headers?.authorization) !== `Bearer ${token}`) return null;
  try {
    const base=new URL(apiBase.replace(/\/$/,'')+'/',origin),target=new URL(url,base);
    return target.origin===base.origin && target.pathname.startsWith(base.pathname) ? target : null;
  } catch { return null; }
}
