import assert from "node:assert/strict";

// Test 1: URL inspection logic matches what ProfesChat does
function getInitialReviewOpen(search) {
  return new URLSearchParams(search).get("modal") === "review";
}

assert.equal(getInitialReviewOpen("?modal=review"), true, "modal=review should open review modal");
assert.equal(getInitialReviewOpen(""), false, "empty query should not open review modal");
assert.equal(getInitialReviewOpen("?foo=bar"), false, "other query should not open review modal");
assert.equal(getInitialReviewOpen("?modal=other"), false, "modal=other should not open review modal");
assert.equal(getInitialReviewOpen("?foo=bar&modal=review"), true, "multi-param should open review modal");

// Test 2: syncModalUrl preserves other query params and hash
function syncModalUrlMock(urlStr, open) {
  const url = new URL(urlStr);
  const currentModal = url.searchParams.get("modal");
  if (open) {
    if (currentModal !== "review") {
      url.searchParams.set("modal", "review");
    }
  } else {
    if (currentModal === "review") {
      url.searchParams.delete("modal");
    }
  }
  return url.pathname + (url.search ? url.search : "") + url.hash;
}

assert.equal(
  syncModalUrlMock("https://campuscli.com/app/asistente/", true),
  "/app/asistente/?modal=review",
  "Opening modal sets ?modal=review"
);

assert.equal(
  syncModalUrlMock("https://campuscli.com/app/asistente/?modal=review", false),
  "/app/asistente/",
  "Closing modal deletes ?modal=review"
);

assert.equal(
  syncModalUrlMock("https://campuscli.com/app/asistente/?foo=1&modal=review#hash", false),
  "/app/asistente/?foo=1#hash",
  "Closing modal retains other query params and hash"
);

assert.equal(
  syncModalUrlMock("https://campuscli.com/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/", true),
  "/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/?modal=review",
  "Opening modal in conversation sets ?modal=review"
);

// Test 3: getLoginUrl logic
function getLoginUrlMock(pathname, search) {
  const params = new URLSearchParams(search);
  const modalParam = params.get("modal") === "review" ? "?modal=review" : "";
  const conversationMatch = pathname.match(/^\/app\/(?:profes|asistente)\/c\/([0-9a-f-]{36})\/?$/i);
  const path = conversationMatch ? `/app/asistente/c/${conversationMatch[1]}/` : "/app/asistente/";
  return `/api/app/auth/start?return=${encodeURIComponent(`${path}${modalParam}`)}`;
}

assert.equal(
  getLoginUrlMock("/app/asistente/", "?modal=review"),
  "/api/app/auth/start?return=%2Fapp%2Fasistente%2F%3Fmodal%3Dreview",
  "Login URL retains /app/asistente/ and ?modal=review"
);

assert.equal(
  getLoginUrlMock("/app/profes/", "?modal=review"),
  "/api/app/auth/start?return=%2Fapp%2Fasistente%2F%3Fmodal%3Dreview",
  "Legacy /app/profes/ maps to /app/asistente/ with ?modal=review"
);

assert.equal(
  getLoginUrlMock("/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/", "?modal=review"),
  "/api/app/auth/start?return=%2Fapp%2Fasistente%2Fc%2F118adac7-9134-4f9e-b751-a145605de41c%2F%3Fmodal%3Dreview",
  "Login URL retains conversation ID with ?modal=review"
);

console.log("verify-modal-review: all checks passed!");
