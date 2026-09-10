import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeAttachmentResponse } from '../src/providers/blackboard/mcp-tools.js';

test('array attachment responses retain embedded download fallbacks', () => {
  const response = mergeAttachmentResponse(
    [{ id: '_attachment_1', fileName: 'attachment.mp4' }],
    [{
      type: 'embedded',
      displayName: 'embedded.mp4',
      mimeType: 'video/mp4',
      downloadUrl: 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-1/embedded.mp4',
    }],
    'Use blackboard_download_file_url with an embeddedFiles downloadUrl.',
  );
  assert.deepEqual(response, {
    results: [{ id: '_attachment_1', fileName: 'attachment.mp4' }],
    embeddedFiles: [{
      type: 'embedded',
      displayName: 'embedded.mp4',
      mimeType: 'video/mp4',
      downloadUrl: 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-1/embedded.mp4',
    }],
    note: 'Use blackboard_download_file_url with an embeddedFiles downloadUrl.',
  });
});
