/**
 * Chrome removed XSLT (window.XSLTProcessor). The classic KIE editor uses it in getContent() only to
 * pretty-print the DMN XML (identity-copy stylesheet + indent), so without it Publish fails with
 * "XSLTProcessor is not defined". This stand-in returns the document unchanged: same XML, no re-indent.
 */
class IdentityXsltProcessor {
  importStylesheet(): void {}

  transformToDocument(source: Document): Document {
    return source.cloneNode(true) as Document;
  }
}

/** Installs the stand-in in the editor iframe's window when the browser has no native XSLT. */
export function ensureXsltProcessor(iframe: HTMLIFrameElement | null) {
  const win = iframe?.contentWindow as (Window & { XSLTProcessor?: unknown }) | null | undefined;
  if (win && typeof win.XSLTProcessor !== "function") win.XSLTProcessor = IdentityXsltProcessor;
}
