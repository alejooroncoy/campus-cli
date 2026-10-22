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
  },
  {
    "url": "https://doi.org/10.3390/app15116335",
    "doi": "10.3390/app15116335",
    "title": "Machine Learning-Driven Acoustic Feature Classification and Pronunciation Assessment for Mandarin Learners",
    "authors": ["Gulnur Arkin", "Tangnur Abdukelim", "Hankiz Yilahun", "Askar Hamdulla"],
    "year": 2025,
    "venue": "Applied Sciences",
    "expectedSha256": "b1c26de6dc6c246f86ddea0c3263c53cbd256cb1498d564beeb51e2ddbe7bc87"
  },
  {
    "url": "https://www.mdpi.com/2079-9292/12/9/2055/pdf",
    "doi": "10.3390/electronics12092055",
    "title": "Knowledge-Based Features for Speech Analysis and Classification: Pronunciation Diagnoses",
    "authors": ["Lichuan Liu", "Wei Li", "Sherrill Morris", "Mutian Zhuang"],
    "year": 2023,
    "venue": "Electronics",
    "expectedSha256": "88af2dcfdedc3b4b933d3c6e1e31be26432c3e496b8ad864898767674b2fa0bf"
  },
  {
    "url": "https://doi.org/10.3390/inventions10040046",
    "doi": "10.3390/inventions10040046",
    "title": "Intelligent Mobile-Assisted Language Learning: A Deep Learning Approach for Pronunciation Analysis and Personalized Feedback",
    "authors": ["Fengqin Liu", "Korawit Orkphol", "Natthapon Pannurat", "Thanat Sooknuan", "Thanin Muangpool", "Sanya Kuankid", "Montri Phothisonothai"],
    "year": 2025,
    "venue": "Inventions",
    "expectedSha256": "8d903b8e293903033c58805513730fdc018a897fdff3affa9b39d0f65addaf8b"
  },
  {
    "url": "https://www.mdpi.com/2079-9292/12/8/1775",
    "doi": "10.3390/electronics12081775",
    "title": "Automatic Fluency Assessment Method for Spontaneous Speech without Reference Text",
    "authors": ["Jiajun Liu", "Aishan Wumaier", "Cong Fan", "Shen Guo"],
    "year": 2023,
    "venue": "Electronics",
    "expectedSha256": "9d6f76e4739e021674a35263e1027c151ddcbb9efabca98a1315253cfbe4e8ff"
  }
];

(async () => {
  const results = [];
  for (const article of articles) {
    const document = article.venue === 'Informatics'
      ? await readResearchPdf({ url: article.url, startPage: 1, pageCount: 1 })
      : await readResearchDocument({ url: article.url, sectionCount: 1 });
    assert.ok('pages' in document);
    if (article.expectedSha256) assert.equal(document.sha256, article.expectedSha256,
      'The public PDF changed; recheck its identity before updating the expected hash.');
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

