// Local dev (vite dev server on :5173) talks to the server on :4000. A production
// build is served BY that same server on one origin, so it just uses relative URLs.
const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;

export const SERVER_URL =
  envUrl && envUrl.length > 0
    ? envUrl
    : import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : "";
