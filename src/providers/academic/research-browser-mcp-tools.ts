import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResearchBrowserReading, browserReadingInput, browserReadingJobInput,
  browserReadingPagesInput, browserReadingEvidenceInput } from './research-browser-reading.js';

/** Registered only by the desktop stdio host, never by the shared remote research-tool registration. */
export function registerBrowserResearchTools(server: McpServer, options: {
  authorize: () => boolean | Promise<boolean>; reader: ResearchBrowserReading;
}) {
  const run = async (action: () => unknown | Promise<unknown>) => {
    if (!await options.authorize()) throw new Error('No autorizado para investigación académica. Verifica la sesión Campus.');
    try { return { content: [{ type: 'text' as const, text: JSON.stringify(await action()) }] }; }
    catch { return { isError: true, content: [{ type: 'text' as const,
      text: 'No se pudo completar la lectura local. Comprueba jobId, estado, rango de páginas y SHA-256; la lectura puede haber expirado. No se leyó contenido nuevo.' }] }; }
  };
  server.registerTool('campus_research_start_browser_reading', {
    description: 'Local desktop only. Open a visible, isolated browser for a publisher URL and exact DOI after the user requests this recovery. The human completes any CAPTCHA or login. Campus then automatically captures the PDF, verifies title/DOI/authors against the registry on those bytes, saves it under the local Campus download folder, and reads the requested pages. Returns a jobId immediately; poll browser_reading_status. Does not reuse the host browser cookies, solve CAPTCHAs, transfer sessions or bypass access controls. Never call this on a shared hosted server.',
    inputSchema: browserReadingInput.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, input => run(() => options.reader.start(input)));
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool('campus_research_browser_reading_status', {
    description: 'Poll a local browser reading job. ready includes the verified saved PDF, SHA-256 and only the initially requested pages. Pending verification is not read evidence; do not start a duplicate job. No cookies or signed asset URLs are returned.',
    inputSchema: browserReadingJobInput.shape, annotations,
  }, input => run(() => options.reader.status(input)));
  server.registerTool('campus_research_browser_read_pages', {
    description: 'Continue pages from the same local browser PDF without downloading again. Requires the jobId and SHA-256 from ready status. Only returned pages were extracted; inspect figures and tables visually before interpreting them.',
    inputSchema: browserReadingPagesInput.shape, annotations,
  }, input => run(() => options.reader.read(input)));
  server.registerTool('campus_research_browser_verify_evidence', {
    description: 'Verify an excerpt at an exact page of the same verified local browser PDF and SHA-256. Text integrity does not certify semantic support, peer review or scientific validity.',
    inputSchema: browserReadingEvidenceInput.shape, annotations,
  }, input => run(() => options.reader.verify(input)));
  server.registerTool('campus_research_cancel_browser_reading', {
    description: 'Close the local browser and release the job PDF from memory. Any already saved local PDF remains available. Does not delete user files.',
    inputSchema: browserReadingJobInput.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, input => run(() => options.reader.cancel(input)));
}
