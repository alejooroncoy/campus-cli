// Live, read-only check: node --import tsx scripts/research-mdpi-check.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readResearchPdf } = require('../src/providers/academic/research-pdf.ts');
const { readResearchDocument } = require('../src/providers/academic/research-document.ts');
const { verifyResearchDocumentIdentity } = require('../src/providers/academic/research-evidence.ts');
const articles = [
  {
    "url": "https://www.mdpi.com/2227-9709/13/2/19/pdf",
    "doi": "10.3390/informatics13020019",
    "title": "An AIoT-Based Framework for Automated English-Speaking Assessment: Architecture, Benchmarking, and Reliability Analysis of Open-Source ASR",
    "authors": [
      "Paniti Netinant",
      "Rerkchai Fooprateepsiri",
      "Ajjima Rukhiran",
      "Meennapa Rukhiran"
    ],
    "year": 2026,
    "venue": "Informatics"
  },
  {
    "url": "https://www.mdpi.com/2076-3417/16/18/8936",
    "doi": "10.3390/app16188936",
    "title": "An Integrated STT-Based Multimodal Pre-Screening System for Korean Oral Presentations with an Analytics-Fitness Benchmark of Five Speech-to-Text Engines",
    "authors": [
      "Yun-Haeng Lee",
      "Hun-Min Kim",
      "Sungock Lee",
      "Hyun-Jong Cha"
    ],
    "year": 2026,
    "venue": "Applied Sciences"
  }
];

(async () => {
  const results = [];
  for (const article of articles) {
    const document = article.venue === 'Informatics'
      ? await readResearchPdf({ url: article.url, startPage: 1, pageCount: 1 })
      : await readResearchDocument({ url: article.url, sectionCount: 1 });
    assert.ok('pages' in document);
    const identity = await verifyResearchDocumentIdentity({ url: article.url, format: 'pdf',
      expectedSha256: document.sha256, expectedTitle: article.title, expectedDoi: article.doi,
      expectedAuthors: article.authors, expectedYear: article.year, expectedVenue: article.venue,
    }, { readPdf: async () => document }); // Same bytes; no second publisher fetch.
    assert.equal(identity.identityAllowed, true, JSON.stringify(identity));
    results.push({ doi: article.doi, requestedUrl: document.requestedUrl, resolvedUrl: document.resolvedUrl,
      sourceRoute: document.sourceRoute, accessScope: document.accessScope, sha256: document.sha256,
      totalPages: document.totalPages, readPages: document.pages.map(page => page.page),
      nextPage: document.nextPage, identityAllowed: identity.identityAllowed, identityBasis: identity.identityBasis });
  }
  const report = { checkedAt: new Date().toISOString(), processingLocation: 'local_validation',
    mode: 'read_only', browserbaseUsed: false, results };
  const output = path.resolve(__dirname, '../output/mdpi-public-routes-check.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

