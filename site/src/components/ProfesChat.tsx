import AgentFeedback from './AgentFeedback';
import { consumeConversationHandoff } from '../scripts/account-onboarding';
import { analyticsHeaders, track } from '../scripts/analytics';
import { canRetryQuestion, questionFailure } from '../scripts/question-retry';
import {universitySetupHref} from "../scripts/university-onboarding";
import GuestUniversity from './GuestUniversity';
import { readGuestUniversity, rememberGuestUniversity, guestUniversitySupported, type UniversityChoice } from '../scripts/guest-university';
import {assistantAccountView} from "../scripts/assistant-account";
import {assistantLoginHref} from "../scripts/assistant-handoff";
import { createConversationDrafts, restoreConversationDrafts, markGuestDraftHandoff } from "../scripts/conversation-drafts";
import { createPortal } from "react-dom";
import MiupcReconnect from "./MiupcReconnect";
import ChatMarkdown from "./ChatMarkdown";
import ChatActivity, { activityLabels, appendActivity } from "./ChatActivity";
import {rememberMiupcReconnect,hasMiupcReconnectNotice,requiresUpcReconnect,clearMiupcReconnectNotices} from "../scripts/miupc-reconnect";
import { useChat } from "@ai-sdk/react";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from "react";
import { getCampusSession, getCampusProfilePreview, type CampusSession } from "../scripts/campus-session";

import { createConversationCache } from "../scripts/conversation-cache";

type Access = "checking" | "ready" | "guest_limit" | "setup" | "unsupported" | "unavailable";

interface ConversationItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ConversationPage {
  messages: StoredMessage[];
  hasMore: boolean;
  nextBeforeId: string | null;
}

function conversationIdFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/app\/(?:profes|asistente)\/c\/([0-9a-f-]{36})\/?$/i);
  return match?.[1] ?? null;
}

async function fetchConversationPage(id: string, before?: string | null): Promise<ConversationPage> {
  const preload = (window as Window & { __campusConversationPreload?: { id: string; promise: Promise<ConversationPage | null> } }).__campusConversationPreload;
  if (!before && preload?.id === id) {
    delete (window as Window & { __campusConversationPreload?: unknown }).__campusConversationPreload;
    const page = await preload.promise;
    if (page) return page;
  }
  const params = new URLSearchParams({ id, limit: "5" });
  if (before) params.set("before", before);
  const response = await fetch(`/api/app/profes/conversation?${params}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("No pudimos abrir la conversación.");
  return await response.json() as ConversationPage;
}

function toUIMessages(messages: StoredMessage[]): UIMessage[] {
  return messages.map(item => ({
    id: item.id,
    role: item.role,
    parts: [{ type: "text" as const, text: item.content }],
  }));
}

function formatRelativeTime(iso: string): string {
  try {
    const date = new Date(iso);
    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return "hace un momento";
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return "hace un momento";
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffHour === 1) return "hace 1 hora";
    if (diffHour < 24) return `hace ${diffHour} h`;
    if (diffDay === 1) return "ayer";
    if (diffDay < 7) return `hace ${diffDay} días`;
    return date.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

const getLoginUrl = () => assistantLoginHref(typeof window === 'undefined' ? '/app/asistente/' : window.location.pathname, typeof window === 'undefined' ? '' : window.location.search);
const guestQuotaDismissedKey = "campus-profes-quota-dismissed";
const upcHintDismissedKey = "campus-profes-upc-hint-dismissed";
const suggestions = [
  { icon: "users", label: "Opiniones de profesores", prompt: "¿Qué dicen los estudiantes del profesor " },
  { icon: "book-open", label: "Profesores por curso", prompt: "Quiero encontrar profesores para el curso de " },
  { icon: "calendar-days", label: "Horario y clases", prompt: "¿Cuál es mi horario de clases y salones este ciclo?" },
  { icon: "sparkles", label: "Mi malla curricular", prompt: "¿Cuáles son los cursos que me toca llevar en mi carrera?" },
];

function messageText(message: UIMessage) {
  return message.parts.filter(part => part.type === "text").map(part => part.text).join("\n");
}

interface ProfessorData {
  name: string;
  score?: number;
  difficulty?: number;
  reviews?: number;
  tags?: string[];
  summary?: string;
}

type ReviewProfessor = { id: number; name: string; university: string };
type ReviewCourse = { id: number; name: string; code: string | null };

function wantsToReview(text: string) {
  return /\b(?:reseñar|rese[nñ]ar)\b|\b(?:dejar|enviar|escribir|publicar|dar|poner|hacer)\b.{0,45}\b(?:reseña|resena|opini[oó]n|calificaci[oó]n)\b/i.test(text);
}

type MessageBlock =
  | { type: "text"; text: string }
  | { type: "professor"; data: ProfessorData }
  | { type: "quotes"; quotes: string[]; intro?: string };

function extractProfessorInfo(name: string, text: string): ProfessorData {
  let score: number | undefined;
  const explicitScoreM = text.match(/(?:calificaci[o\u00f3]n|score|puntaje|nota)\s*[:\-–]?\s*(?:⭐\s*)?(\d+(?:\.\d+)?)/i)
    || text.match(/⭐\s*(\d+(?:\.\d+)?)/);
  if (explicitScoreM) score = parseFloat(explicitScoreM[1]);

  let difficulty: number | undefined;
  const diffM = text.match(/(?:dificultad|diff)\s*[:\-–]?\s*(?:⚡\s*)?(\d+(?:\.\d+)?)/i)
    || text.match(/⚡\s*(\d+(?:\.\d+)?)/);
  if (diffM) difficulty = parseFloat(diffM[1]);

  let reviews: number | undefined;
  const revM = text.match(/(?:rese[\u00f1n]as|opiniones|reviews)\s*[:\-–]?\s*(?:💬\s*)?(\d+)/i)
    || text.match(/💬\s*(\d+)/)
    || text.match(/(\d+)\s*(?:rese[\u00f1n]as|opiniones|reviews)/i);
  if (revM) reviews = parseInt(revM[1], 10);

  let recommendation: string | undefined;
  const recM = text.match(/(\d+%\s*(?:de\s*)?recomendaci[o\u00f3]n)/i)
    || text.match(/(?:recomendaci[o\u00f3]n)\s*[:\-–]?\s*(\d+%)/i);
  if (recM) recommendation = recM[1];

  let tags: string[] = [];
  const tagsM = text.match(/(?:etiquetas|tags)\s*[:\-–]\s*(.+?)(?=(?:\.\s+[A-Z]|\n|comentarios?|qu[e\u00e9]\s+dicen|$))/i);
  if (tagsM) {
    const raw = tagsM[1].replace(/\.\s*$/, "");
    tags = raw
      .split(/[,|•]/)
      .map(t => t.replace(/[\[\]]/g, "").trim())
      .filter(t => t.length > 0 && !/^dict[o\u00f3]\s+en/i.test(t) && !/^rese[\u00f1n]as/i.test(t));
  }
  const bracketTags = [...text.matchAll(/\[([^\]]+)\]/g)]
    .map(m => m[1].trim())
    .filter(t => !/^dict[o\u00f3]\s+en/i.test(t) && !/^\d+/i.test(t));
  if (tags.length === 0 && bracketTags.length > 0) {
    tags = bracketTags;
  }
  if (recommendation && !tags.some(t => t.toLowerCase().includes("recom"))) {
    tags.unshift(recommendation);
  }

  let summary: string | undefined;
  const commM = text.match(/(?:comentarios?|resumen|qu[e\u00e9]\s+dicen|opini[o\u00f3]n)\s*[:\-–]\s*([^\n\r]+)/i);
  if (commM) summary = commM[1].trim();

  return { name, score, difficulty, reviews, tags: tags.slice(0, 4), summary };
}

function isQuoteLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return /^(?:[\*\-•]\s+|\d+\.\s+|>\s*)?["“]([\s\S]+?)["”]?$/.test(trimmed) || /^>\s*["“]?([^"\n]{6,})["”]?$/.test(trimmed);
}

function extractQuoteText(line: string): string {
  let t = line.trim();
  t = t.replace(/^(?:[\*\-•]\s+|\d+\.\s+|>\s*)["“]?/, "");
  t = t.replace(/["”]\s*$/, "");
  return t.trim();
}

function isQuoteIntroLine(line: string): boolean {
  const t = line.trim();
  return /^(?:aqu[ií]\s+(?:tienes|est[aá]n|algunas?)|algunas?|estas?|lo\s+que\s+dicen)?.*?(?:citas?(?:\s+textuales)?|opiniones|reseñas|rese[nñ]as|comentarios?|testimonios).*?[:\.]?$/i.test(t) && t.length < 90;
}

function parseMessageBlocks(content: string): MessageBlock[] {
  const lines = content.split("\n");
  const blocks: MessageBlock[] = [];
  let currentProf: { name: string; rawLines: string[] } | null = null;
  let textBuffer: string[] = [];
  let currentQuotes: string[] = [];
  let quotesIntro: string | undefined = undefined;

  function flushText() {
    if (textBuffer.length > 0) {
      const text = textBuffer.join("\n").trim();
      if (text) blocks.push({ type: "text", text });
      textBuffer = [];
    }
  }

  function flushProf() {
    if (currentProf) {
      const rawText = currentProf.rawLines.join(" ");
      const data = extractProfessorInfo(currentProf.name, rawText);
      blocks.push({ type: "professor", data });
      currentProf = null;
    }
  }

  function flushQuotes() {
    if (currentQuotes.length > 0) {
      blocks.push({ type: "quotes", quotes: currentQuotes, intro: quotesIntro });
      currentQuotes = [];
      quotesIntro = undefined;
    }
  }

  const profHeaderRegex = /^(?:[\*\-]\s+|\d+\.\s+)?\*\*([^*]+)\*\*(?:\s*[:\-–]\s*(.*))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isQuoteLine(line) && !currentProf) {
      if (currentQuotes.length === 0) {
        while (textBuffer.length > 0 && textBuffer[textBuffer.length - 1].trim() === "") {
          textBuffer.pop();
        }
        if (textBuffer.length > 0) {
          const lastLine = textBuffer[textBuffer.length - 1].trim();
          if (isQuoteIntroLine(lastLine)) {
            quotesIntro = lastLine.replace(/[:\.\s]+$/, "").trim();
            textBuffer.pop();
          }
        }
        flushText();
      }
      const quoteText = extractQuoteText(line);
      if (quoteText) currentQuotes.push(quoteText);
      continue;
    }

    if (currentQuotes.length > 0) {
      if (line.trim() === "" && i + 1 < lines.length && isQuoteLine(lines[i + 1])) {
        continue;
      }
      flushQuotes();
    }

    const match = line.match(profHeaderRegex);

    if (match) {
      const candidateName = match[1].trim();
      const rest = match[2] || "";
      const lookahead = [rest, lines[i + 1] || "", lines[i + 2] || ""].join(" ");
      const isProfCard = !/^\s*\|?\s*:?-{3,}:?\s*\|/m.test([rest, lines[i + 1] || "", lines[i + 2] || "", lines[i + 3] || ""].join("\n")) && /(?:calificaci[o\u00f3]n|dificultad|reseñas|rese[\u00f1n]as|⭐|⚡|💬)/i.test(lookahead);

      if (isProfCard) {
        flushText();
        flushProf();
        currentProf = { name: candidateName, rawLines: rest ? [rest] : [] };
        continue;
      }
    }

    if (currentProf) {
      if (line.trim() === "") {
        const next = lines[i + 1] || "";
        if (
          next &&
          !next.startsWith(" ") &&
          !next.startsWith("\t") &&
          !next.startsWith("-") &&
          !next.startsWith("*") &&
          !/^(?:calificaci|dificultad|etiquetas|comentario)/i.test(next.trim())
        ) {
          flushProf();
          continue;
        }
      } else if (
        /^(?:#{1,6}\s+|[A-ZÁÉÍÓÚ¿¡])/.test(line.trim()) &&
        !/^(?:calificaci|dificultad|etiquetas|comentario|reseñas|rese[\u00f1n]as)/i.test(line.trim()) &&
        !line.startsWith(" ")
      ) {
        flushProf();
        textBuffer.push(line);
        continue;
      } else {
        currentProf.rawLines.push(line);
        continue;
      }
    }

    textBuffer.push(line);
  }

  flushText();
  flushProf();
  flushQuotes();

  return blocks;
}

function renderFormattedTokens(line: string) {
  const parts: (string | ReactElement)[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts;
}

function renderInlineMarkdown(text: string, groupHistory = true): ReactElement[] {
  if (groupHistory && /\b(notas|calificaciones|aprobados)\b/i.test(text)) {
    const lines = text.split("\n");
    const starts = lines.flatMap((line, i) => /^[\s*#-]*(?:ciclo\s+|periodo\s+)?20\d{4}\b/i.test(line) ? [i] : []);
    if (starts.length > 1) return [
      <div key="history-intro">{renderInlineMarkdown(lines.slice(0, starts[0]).join("\n"), false)}</div>,
      ...starts.map((start, i) => {
        const next = starts[i + 1] ?? lines.length;
        const heading = lines.slice(start + 1, next).findIndex(line => /^\s*\*\*(?:Cursos|Nota\b)/i.test(line));
        const end = heading < 0 ? next : start + 1 + heading;
        return <div key={start}>
          <details className="app-academic-period" open={i === 0}>
            <summary>{renderFormattedTokens(lines[start].replace(/^[\s#*-]+/, "").replace(/\*\*/g, ""))}</summary>
            <div>{renderInlineMarkdown(lines.slice(start + 1, end).join("\n"), false)}</div>
          </details>
          {end < next ? <div className="app-academic-history-note">{renderInlineMarkdown(lines.slice(end, next).join("\n"), false)}</div> : null}
        </div>;
      }),
    ];
  }
  return [<ChatMarkdown key="markdown" text={text} />];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatStudentName(raw?: string | null): string {
  if (!raw) return "";
  let name = raw.trim();
  if (name.includes(",")) {
    const [last, first] = name.split(",").map(s => s.trim());
    name = `${first} ${last}`.trim();
  }
  if (name === name.toUpperCase() && name.length > 2) {
    name = name
      .toLowerCase()
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return name;
}


export function ProfessorCard({
  data,
  onAskAbout,
  onLeaveReview,
}: {
  data: ProfessorData;
  onAskAbout: (name: string) => void;
  onLeaveReview?: (name: string) => void;
}) {
  const scoreClass =
    data.score !== undefined
      ? data.score >= 8.5
        ? "is-high"
        : data.score >= 7.0
        ? "is-good"
        : "is-mid"
      : "";

  return (
    <div className="app-prof-card">
      <div className="app-prof-card__top">
        <div className="app-prof-card__header-left">
          <span className="app-prof-card__avatar">{getInitials(data.name)}</span>
          <div className="app-prof-card__titles">
            <h3 className="app-prof-card__name">{data.name}</h3>
          </div>
        </div>
        {data.score !== undefined ? (
          <div className={`app-prof-score ${scoreClass}`}>
            <span className="app-prof-score__value">{data.score.toFixed(1)}</span>
            <span className="app-prof-score__label">/ 10</span>
          </div>
        ) : null}
      </div>

      {(data.difficulty !== undefined || data.reviews !== undefined) ? (
        <div className="app-prof-card__metrics">
          {data.difficulty !== undefined ? (
            <div className="app-prof-metric" title="Dificultad (de 0 a 10)">
              <span>Dificultad:</span>
              <strong className="app-prof-metric__val">{data.difficulty.toFixed(1)} / 10</strong>
            </div>
          ) : null}
          {data.reviews !== undefined ? (
            <div className="app-prof-metric" title="Reseñas de estudiantes">
              <span>Reseñas:</span>
              <strong className="app-prof-metric__val">
                {data.reviews} {data.reviews === 1 ? "opinión" : "opiniones"}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {data.tags && data.tags.length > 0 ? (
        <div className="app-prof-card__tags">
          {data.tags.map((tag, i) => (
            <span key={i} className="app-prof-tag">{tag}</span>
          ))}
        </div>
      ) : null}

      {data.summary ? (
        <p className="app-prof-card__summary">“{data.summary}”</p>
      ) : null}

      <div className="app-prof-card__footer">
        <button
          type="button"
          className="app-prof-card__action"
          onClick={() => onAskAbout(data.name)}
        >
          <span>Ver qué opinan</span>
          <span aria-hidden="true">→</span>
        </button>
        {onLeaveReview ? (
          <button
            type="button"
            className="app-prof-card__action app-prof-card__action--review"
            onClick={() => onLeaveReview(data.name)}
            title={`Dejar reseña para ${data.name}`}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>Calificar profe</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function QuotesSection({
  quotes,
  intro,
}: {
  quotes: string[];
  intro?: string;
}) {
  const cleanTitle = intro
    ? intro.replace(/^aqu[ií]\s+(?:tienes|est[aá]n)\s+(?:algunas?\s+)?/i, "")
    : "Opiniones de estudiantes";
  const displayTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

  return (
    <div className="app-prof-quotes-section">
      <div className="app-prof-quotes-header">
        <svg
          className="app-prof-quotes-header-icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span className="app-prof-quotes-title">{displayTitle}</span>
        <span className="app-prof-quotes-count">
          {quotes.length} {quotes.length === 1 ? "opinión" : "opiniones"}
        </span>
      </div>
      <div className="app-prof-quotes-list">
        {quotes.map((quote, idx) => (
          <div key={idx} className="app-prof-quote-card">
            <svg
              className="app-prof-quote-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
            <div className="app-prof-quote-content">
              <p className="app-prof-quote-text">“{quote}”</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantMessageContent({
  content,
  onAskAbout,
  onLeaveReview,
}: {
  content: string;
  onAskAbout: (name: string) => void;
  onLeaveReview?: (name: string) => void;
}) {
  const blocks = useMemo(() => parseMessageBlocks(content), [content]);

  return (
    <div className="app-profes-ai__message-content">
      {blocks.map((block, idx) => {
        if (block.type === "professor") {
          return (
            <ProfessorCard
              key={`${block.data.name}-${idx}`}
              data={block.data}
              onAskAbout={onAskAbout}
              onLeaveReview={onLeaveReview}
            />
          );
        }
        if (block.type === "quotes") {
          return (
            <QuotesSection
              key={`quotes-${idx}`}
              quotes={block.quotes}
              intro={block.intro}
            />
          );
        }
        return (
          <div key={idx} className="app-profes-ai__text-block">
            {renderInlineMarkdown(block.text)}
          </div>
        );
      })}
    </div>
  );
}

function profesTransport(
  onUsage: (usage: CampusSession["usage"]) => void,
  onActivity: (activity: string) => void,
  onGuestLimit: (question:string, conversationId:string|null) => void,
  getConversationId: () => string | null,
  onConversationCreated: (id: string, title?: string) => void,
  onMiupcReconnect: (conversationId: string | null,upcRequired:boolean) => void,
  onMiupcRestored: () => void,
  onTurn: (traceId:string)=>void,
): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages, abortSignal }) {
      const last = messages.at(-1);
      const question = last && last.role === "user" ? messageText(last).trim() : "";
      if (!question) throw new Error("Escribe una pregunta antes de enviarla.");

      const started=performance.now();
      const activeConvId = getConversationId();
      track('campus_question_submitted', { new_conversation: !activeConvId });
      const response = await fetch("/api/app/profes/message", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson", ...analyticsHeaders() },
        credentials: "same-origin",
        signal: abortSignal,
        body: JSON.stringify({ message: question, conversationId: activeConvId || undefined,
          universityId: readGuestUniversity()?.id }),
      });
      const traceId=response.headers.get('X-Campus-Trace-Id');
      if(traceId)track('campus_agent_response_received',{trace_id:traceId,duration_ms:Math.round(performance.now()-started)});
      const data = response.ok ? null : await response.json().catch(() => ({}));
      if (response.status === 401) {
        if (data?.code === "LOGIN_REQUIRED_GUEST_LIMIT") {
          onGuestLimit(question,activeConvId);
          throw new Error("LOGIN_REQUIRED_GUEST_LIMIT");
        }
        markGuestDraftHandoff(); window.location.assign(getLoginUrl());
        throw new Error("Inicia sesión para continuar.");
      }
      if (response.status === 409 && data.code === "UNIVERSITY_REQUIRED") {
        window.location.assign(universitySetupHref(window.location.pathname, window.location.search));
        throw new Error("Elige tu universidad para continuar.");
      }
      if (!response.ok) throw questionFailure(typeof data?.error === "string" ? data.error : "No pudimos completar la consulta.", data?.code);
      if (!response.body) throw new Error("Campus no devolvió una respuesta.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let answer = "";
      let usage: CampusSession["usage"];
      let convId: string | undefined;
      let convTitle: string | undefined;
      let miupcReconnectRequired = false;
      let upcReconnectRequired=false;
      let miupcConnectionRestored=false;
      const readEvent = (line: string) => {
        const event = JSON.parse(line) as { type: string; activity?: string; answer?: string; usage?: CampusSession["usage"]; error?: string; conversationId?: string; title?: string; miupcReconnectRequired?: boolean; upcReconnectRequired?:boolean; miupcConnectionRestored?:boolean };
        if (event.type === "status" && event.activity && activityLabels[event.activity]) {onActivity(event.activity);track('campus_agent_activity',{trace_id:traceId,activity:event.activity,duration_ms:Math.round(performance.now()-started)});}
        if (event.type === "answer") {
          answer = event.answer ?? "";
          usage = event.usage;
          miupcReconnectRequired = event.miupcReconnectRequired === true;
          upcReconnectRequired=event.upcReconnectRequired===true;
          miupcConnectionRestored=event.miupcConnectionRestored===true;
          if (event.conversationId) {
            convId = event.conversationId;
            convTitle = event.title;
          }
        }
        if (event.type === "error") throw questionFailure(event.error ?? "No pudimos completar la consulta.", (event as { code?: string }).code);
      };
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        let newline: number;
        while ((newline = pending.indexOf("\n")) !== -1) {
          const line = pending.slice(0, newline).trim();
          pending = pending.slice(newline + 1);
          if (line) readEvent(line);
        }
        if (done) break;
      }
      if (pending.trim()) readEvent(pending.trim());
      if (!answer.trim()) throw new Error("Campus no devolvió una respuesta.");
      track('campus_answer_displayed', { trace_id:traceId,remaining: usage?.remaining, limit: usage?.limit,duration_ms:Math.round(performance.now()-started) });
      if(traceId)onTurn(traceId);
      if(usage)onUsage(usage);
      if (convId) onConversationCreated(convId, convTitle);
      if (miupcReconnectRequired || upcReconnectRequired) onMiupcReconnect(convId ?? activeConvId,upcReconnectRequired);
      else if(miupcConnectionRestored)onMiupcRestored();

      // The existing Profes API returns one completed answer; adapt it to AI SDK UI's
      // message protocol without pretending that the agent streams partial tokens.
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          const id = crypto.randomUUID();
          controller.enqueue({ type: "start" });
          controller.enqueue({ type: "text-start", id });
          controller.enqueue({ type: "text-delta", id, delta: answer });
          controller.enqueue({ type: "text-end", id });
          controller.enqueue({ type: "finish", finishReason: "stop" });
          controller.close();
        },
      });
    },
    async reconnectToStream() { return null; },
  };
}

export default function ProfesChat() {
  const [access, setAccess] = useState<Access>("checking");
  const [session, setSession] = useState<CampusSession | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [guestUniversity, setGuestUniversity] = useState(readGuestUniversity);
  const [changingUniversity, setChangingUniversity] = useState(false);
  const guestNeedsUniversity = session?.authenticated === false && (changingUniversity || !guestUniversity);
  const guestUnsupported = session?.authenticated === false && !guestUniversitySupported(guestUniversity);
  function selectGuestUniversity(value: UniversityChoice) {
    rememberGuestUniversity(value); setGuestUniversity(value); setChangingUniversity(false);
  }
  const [input, setInput] = useState("");
  const [usage, setUsage] = useState<CampusSession["usage"]>();
  const [activitySteps, setActivitySteps] = useState<string[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [miupcReconnectRequired,setMiupcReconnectRequired] = useState(false);
  const [miupcReconnectConversationId,setMiupcReconnectConversationId] = useState<string|null>(null);
  const [miupcReconnectRevision,setMiupcReconnectRevision] = useState(0);
  const [upcReconnectRequired,setUpcReconnectRequired] = useState(false);
  const [accessNote, setAccessNote] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [upcHintDismissed, setUpcHintDismissed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("modal") === "review");
  const [reviewStep, setReviewStep] = useState<"select" | "edit" | "confirm" | "done">("select");
  const [reviewSearchMode, setReviewSearchMode] = useState<"course" | "professor">("course");
  const [reviewCourses, setReviewCourses] = useState<ReviewCourse[]>([]);
  const [reviewCourse, setReviewCourse] = useState<ReviewCourse | null>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const reviewExperience = useRef<HTMLTextAreaElement>(null);
  const reviewSearchInput = useRef<HTMLInputElement>(null);
  const [reviewLookupAttempt, setReviewLookupAttempt] = useState(0);
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState("");
  const [reviewTerm, setReviewTerm] = useState("");
  const [reviewProfessors, setReviewProfessors] = useState<ReviewProfessor[]>([]);
  const [reviewProfessor, setReviewProfessor] = useState<ReviewProfessor | null>(null);
  const [reviewSearching, setReviewSearching] = useState(false);
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewResult, setReviewResult] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const quotaDialog = useRef<HTMLDivElement>(null);
  const quotaClose = useRef<HTMLButtonElement>(null);
  const quotaReopen = useRef<HTMLButtonElement>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [previewName, setPreviewName] = useState("");
  useEffect(() => { setPreviewName(getCampusProfilePreview()?.cleanName ?? ""); }, []);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(() => conversationIdFromPath());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [sidebarHosts, setSidebarHosts] = useState<{ actions: HTMLElement; history: HTMLElement } | null>(null);
  const mobileHistoryDialog = useRef<HTMLDialogElement>(null);
  const conversationDrafts = useRef(createConversationDrafts());
  const draftEditedBeforeSession = useRef(false);
  const pageCache = useRef(createConversationCache(fetchConversationPage));
  const conversationSnapshots = useRef(new Map<string, { messages: UIMessage[]; hasMore: boolean; cursor: string | null; top: number }>());
  const navigationVersion = useRef(0);
  const [loadingConversation, setLoadingConversation] = useState(() => Boolean(conversationIdFromPath()));
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const olderMessagesCursor = useRef<string | null>(null);
  const preserveScrollAfterPrepend = useRef<{ height: number; top: number } | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  currentConversationIdRef.current = currentConversationId;
  const usageHandler = useRef(setUsage);
  usageHandler.current = setUsage;
  const activityHandler = useRef((value: string) => setActivitySteps(steps => appendActivity(steps, value)));
  const guestLimitHandler = useRef(() => setAccess("guest_limit"));
  guestLimitHandler.current = () => setAccess("guest_limit");

  useEffect(() => {
    const actions = document.getElementById("profes-sidebar-actions");
    const history = document.getElementById("profes-sidebar-history");
    if (actions && history) setSidebarHosts({ actions, history });
  }, []);

  useEffect(() => {
    const dialog = mobileHistoryDialog.current;
    if (!dialog) return;
    if (!historyOpen) {
      dialog.classList.remove("is-visible");
      if (!dialog.open) return;
      const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
      const timeout = window.setTimeout(() => {
        dialog.close();
        document.getElementById("profes-history-toggle")?.focus();
      }, delay);
      return () => window.clearTimeout(timeout);
    }
    if (!dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => dialog.classList.add("is-visible"));
    const media = window.matchMedia("(min-width: 701px)");
    const closeOnDesktop = () => { if (media.matches) setHistoryOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", closeOnDesktop);
    };
  }, [historyOpen]);

  const handleConversationCreated = useCallback((id: string, title?: string) => {
    setCurrentConversationId(id);
    const search = window.location.search;
    const targetPath = `/app/asistente/c/${id}/`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ ...window.history.state, campusConversation: id }, "", `${targetPath}${search}`);
    }
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === id);
      const now = new Date().toISOString();
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], updatedAt: now, title: title || next[idx].title };
        return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }
      return [{ id, title: title || "Nueva consulta", createdAt: now, updatedAt: now }, ...prev];
    });
  }, []);

  useEffect(()=>{
    const needsReconnect=authenticated&&hasMiupcReconnectNotice(currentConversationId);
    setMiupcReconnectConversationId(currentConversationId);
    setMiupcReconnectRequired(needsReconnect);
    setUpcReconnectRequired(needsReconnect&&requiresUpcReconnect(currentConversationId));
  },[authenticated,currentConversationId]);

  const freshMiupcNotice=useRef<string|null>(null);
  const handleMiupcReconnect = useCallback((id:string|null,upcRequired:boolean)=>{
    freshMiupcNotice.current=id;
    rememberMiupcReconnect(id,upcRequired);
    setMiupcReconnectConversationId(id);
    setUpcReconnectRequired(upcRequired);
    setMiupcReconnectRequired(true);
    setMiupcReconnectRevision(value=>value+1);
  },[]);

  const [feedbackTrace,setFeedbackTrace]=useState<string|null>(null);
  const transport = useMemo(() => profesTransport(
    value => {
      usageHandler.current(value);
      if (value && value.remaining <= 0) guestLimitHandler.current();
    },
    value => activityHandler.current(value),
    (question,id) => {
      if(currentConversationIdRef.current===id){
        conversationDrafts.current.set(id,question);
        setInput(question);
      }
      guestLimitHandler.current();
    },
    () => currentConversationIdRef.current,
    handleConversationCreated,
    handleMiupcReconnect,
    ()=>{clearMiupcReconnectNotices();setMiupcReconnectRequired(false);setUpcReconnectRequired(false);},
    traceId=>setFeedbackTrace(traceId),
  ), [handleConversationCreated,handleMiupcReconnect]);
  const { messages, setMessages, sendMessage, regenerate, status, error, stop } = useChat({ transport, onError: () => track('campus_flow_failed', { step: 'question', error_kind: 'rejected' }) });
  const messagesHandler = useRef(setMessages);
  messagesHandler.current = setMessages;
  const busy = status === "submitted" || status === "streaming";
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const scrollToLatestAfterLoad = useRef(false);
  const restoreScrollAfterLoad = useRef<number | null>(null);
  const navigateConversation = useRef<(id: string | null) => void>(() => {});
  useEffect(() => {
    if (busy && currentConversationId) pageCache.current.invalidate(currentConversationId);
  }, [busy, currentConversationId]);

  useEffect(() => {
    if (busy) {
      conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, busy]);

  const balanceRetryPending = useRef(false);
  const [balanceRetrying, setBalanceRetrying] = useState(false);
  function applyAccessSession(session: CampusSession) {
        setSession(session);
        setUsage(session.usage);
        setAuthenticated(session.authenticated);

        if (!session.authenticated) {
          const guestRemaining = session.usage?.remaining ?? 5;
          setAccess(!session.aiReady ? "unavailable" : guestRemaining > 0 ? "ready" : "guest_limit");
          setAccessNote(!session.aiReady ? "Campus no está disponible por ahora." : "");
        } else {
          setAccess(!session.universityConfirmed ? "setup" : !session.profesAvailable ? "unsupported" : !session.accessUnavailable && session.aiReady ? "ready" : "unavailable");
          setAccessNote(session.universityConfirmed && !session.profesAvailable
            ? "Campus tiene cobertura para UPC por ahora. Tu universidad ya quedó registrada."
            : session.accessUnavailable ? "No pudimos comprobar tu saldo. Inténtalo de nuevo." : !session.aiReady ? "Campus no está disponible por ahora." : "");
        }
  }
  function restoreAccessDraft(session: CampusSession) {
    const owner = session.authenticated ? (session.email ? `account:${session.email.toLowerCase()}` : null) : 'guest';
    let storage: Storage | undefined;
    try { storage = sessionStorage; } catch { /* Private browsing may deny storage. */ }
    const currentId = currentConversationIdRef.current;
    const savedDrafts = restoreConversationDrafts(owner,storage,conversationDrafts.current,
      draftEditedBeforeSession.current,currentId,textarea.current?.value ?? '');
    draftEditedBeforeSession.current = false;
    conversationDrafts.current = savedDrafts;
    setInput(savedDrafts.get(currentId));
  }
  async function loadConversationHistory(isCurrent: () => boolean) {
    setHistoryLoading(true);
    setHistoryError("");
    // The URL decides which chat is open; /profes/ always starts a new chat.
    // History metadata must never block or re-open the messages that just loaded.
    try {
      const convRes = await fetch("/api/app/profes/conversations", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!convRes.ok) throw new Error("History unavailable");
      const data = await convRes.json() as { conversations?: ConversationItem[] };
      if (!isCurrent()) return;
      const list = data.conversations ?? [];
      setConversations(list);
      // Warm a small set of recent chats; hovering/focusing loads any other one.
      for (const conversation of list.filter(item => item.id !== currentConversationIdRef.current).slice(0, 3)) {
        void pageCache.current.get(conversation.id).catch(() => {});
      }
    } catch { if (isCurrent()) setHistoryError("No pudimos cargar el historial. Puedes volver a intentarlo."); }
    finally { if (isCurrent()) setHistoryLoading(false); }

  }
  useEffect(() => {
    const updated = (event: Event) => applyAccessSession((event as CustomEvent<CampusSession>).detail);
    let mounted = true;
    const recovered = (event: Event) => {
      restoreAccessDraft((event as CustomEvent<CampusSession>).detail);
      void loadConversationHistory(() => mounted);
    };
    window.addEventListener("campus:session-updated", updated);
    window.addEventListener("campus:session-recovered", recovered);
    return () => {
      mounted = false;
      window.removeEventListener("campus:session-updated", updated);
      window.removeEventListener("campus:session-recovered", recovered);
    };
  }, []);
  async function retryAccess() {
    if (balanceRetryPending.current) return;
    balanceRetryPending.current = true;
    setBalanceRetrying(true);
    try { applyAccessSession(await getCampusSession(true)); }
    catch { setAccessNote("No pudimos comprobar tu saldo. Inténtalo de nuevo."); }
    finally { balanceRetryPending.current = false; setBalanceRetrying(false); }
  }

  useEffect(() => {
    try { setUpcHintDismissed(sessionStorage.getItem(upcHintDismissedKey) === "1"); } catch { /* The hint still works without storage. */ }
    try {
      const saved = sessionStorage.getItem("campus-profes-review-draft");
      if (saved) {
        const draft = JSON.parse(saved) as { query?: string; text?: string; rating?: string; term?: string; professor?: ReviewProfessor; course?: ReviewCourse; mode?: "course" | "professor" };
        setReviewQuery(draft.query ?? ""); setReviewText(draft.text ?? "");
        setReviewRating(draft.rating ?? ""); setReviewTerm(draft.term ?? "");
        setReviewProfessor(draft.professor ?? null); setReviewCourse(draft.course ?? null);
        setReviewSearchMode(draft.mode ?? (draft.query ? "professor" : "course"));
        setReviewStep(draft.professor ? "edit" : "select");
      }
    } catch { /* The form remains usable without storage. */ }
    let mounted = true;
    const routeConversationId = conversationIdFromPath();
    const initialNavigationVersion = navigationVersion.current;
    const routeConversationPage = routeConversationId ? pageCache.current.get(routeConversationId) : null;
    if (routeConversationId && routeConversationPage) {
      void routeConversationPage.then(page => {
        if (!mounted || navigationVersion.current !== initialNavigationVersion) return;
        scrollToLatestAfterLoad.current = true;
        messagesHandler.current(toUIMessages(page.messages));
        setHasOlderMessages(page.hasMore);
        olderMessagesCursor.current = page.nextBeforeId;
        if (page.hasMore && page.nextBeforeId) void pageCache.current.get(routeConversationId, page.nextBeforeId).catch(() => {});
        setLoadingConversation(false);
      }).catch(() => {
        if (!mounted || navigationVersion.current !== initialNavigationVersion) return;
        setHistoryError("No pudimos abrir esta consulta. Puede que ya no esté disponible.");
        setLoadingConversation(false);
      });
    }
    getCampusSession()
      .then(async session => {
        if (!mounted) return;
        restoreAccessDraft(session);
        applyAccessSession(session);
        if (session.authenticated && routeConversationPage) {
          void routeConversationPage.then(page => {
            if (mounted && navigationVersion.current === initialNavigationVersion && page.messages.length > 0
              && consumeConversationHandoff(window.location.pathname)) track('campus_conversation_restored');
          }).catch(() => { /* Failed history loads never count as restored. */ });
        }
        await loadConversationHistory(() => mounted);

      })
      .catch(() => { if (mounted) { setHistoryLoading(false); setAccess("unavailable"); setAccessNote("Campus no está disponible por ahora."); } });
    return () => { mounted = false; navigationVersion.current++; };
  }, []);

  useEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 42), 160)}px`;
    conversationDrafts.current.set(currentConversationId,input);
  }, [input,currentConversationId]);

  useEffect(() => {
    if (!reviewOpen || reviewStep === "done") return;
    try { sessionStorage.setItem("campus-profes-review-draft", JSON.stringify({ query: reviewQuery, text: reviewText, rating: reviewRating, term: reviewTerm, professor: reviewProfessor, course: reviewCourse, mode: reviewSearchMode })); }
    catch { /* The current form still keeps its draft. */ }
  }, [reviewOpen, reviewStep, reviewQuery, reviewText, reviewRating, reviewTerm, reviewProfessor, reviewCourse, reviewSearchMode]);

  useEffect(() => {
    const dialog = reviewDialog.current;
    if (!dialog) return;
    if (!reviewOpen) {
      dialog.classList.remove("is-visible");
      if (!dialog.open) return;
      const timeout = window.setTimeout(() => dialog.close(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
      return () => window.clearTimeout(timeout);
    }
    if (!dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => dialog.classList.add("is-visible"));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; };
  }, [reviewOpen]);

  useEffect(() => {
    if (reviewOpen && reviewStep === "edit") reviewExperience.current?.focus();
    if (reviewOpen && reviewStep === "select") reviewSearchInput.current?.focus();
  }, [reviewOpen, reviewStep, reviewSearchMode, reviewCourse]);

  useEffect(() => {
    if (!reviewOpen || reviewStep !== "select" || !authenticated || !session?.universityConfirmed) return;
    const courseLookup = reviewSearchMode === "course" && reviewCourse;
    if (!courseLookup && reviewQuery.trim().length < 2) { setReviewSearching(false); return; }
    const controller = new AbortController();
    setReviewSearching(true); setReviewError("");
    const timeout = window.setTimeout(async () => {
      try {
        const url = courseLookup ? `/api/app/profes/review-professors?courseId=${reviewCourse!.id}`
          : `/api/app/profes/review-${reviewSearchMode === "course" ? "courses" : "professors"}?q=${encodeURIComponent(reviewQuery.trim())}`;
        const response = await fetch(url, { credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error ?? "No pudimos buscar. Inténtalo de nuevo.");
        setReviewCourses(data.courses ?? []); setReviewProfessors(data.professors ?? []);
      } catch (error) {
        if (!controller.signal.aborted) setReviewError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "La búsqueda tardó demasiado. Inténtalo de nuevo.");
      } finally { if (!controller.signal.aborted) setReviewSearching(false); }
    }, courseLookup ? 0 : 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [reviewOpen, reviewStep, reviewQuery, reviewSearchMode, reviewCourse, authenticated, session?.universityConfirmed, reviewLookupAttempt]);

  const isGuestLimit = Boolean(access === "guest_limit"
    || error?.message === "LOGIN_REQUIRED_GUEST_LIMIT"
    || error?.message?.includes("consultas de prueba gratis")
    || (usage && !authenticated && usage.remaining <= 0));

  useEffect(() => {
    if (!isGuestLimit || guestNeedsUniversity || guestUnsupported) return;
    try { setQuotaDialogOpen(sessionStorage.getItem(guestQuotaDismissedKey) !== "1"); }
    catch { setQuotaDialogOpen(true); }
  }, [isGuestLimit, guestNeedsUniversity, guestUnsupported]);

  useEffect(() => {
    if (!isGuestLimit || !quotaDialogOpen || guestNeedsUniversity || guestUnsupported) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    quotaClose.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isGuestLimit, quotaDialogOpen, guestNeedsUniversity, guestUnsupported]);

  function closeQuotaDialog() {
    try { sessionStorage.setItem(guestQuotaDismissedKey, "1"); } catch { /* El aviso compacto sigue disponible. */ }
    setQuotaDialogOpen(false);
    window.requestAnimationFrame(() => quotaReopen.current?.focus());
  }

  function reopenQuotaDialog() {
    try { sessionStorage.removeItem(guestQuotaDismissedKey); } catch { /* El modal también abre sin almacenamiento. */ }
    setQuotaDialogOpen(true);
  }

  function onQuotaDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeQuotaDialog(); return; }
    if (event.key !== "Tab") return;
    const controls = quotaDialog.current?.querySelectorAll<HTMLElement>("button, a[href]");
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const question = input.trim();
    if (!question || busy || loadingConversation || guestNeedsUniversity || guestUnsupported || access === "checking" || access === "unavailable" || access === "unsupported") return;
    if (wantsToReview(question)) {
      openReview();
      setInput("");
      return;
    }
    if (isGuestLimit) { markGuestDraftHandoff(); window.location.assign(getLoginUrl()); return; }
    if (access === "setup") { window.location.assign(universitySetupHref(window.location.pathname, window.location.search)); return; }
    setActivitySteps(["connecting"]);
    setActivityExpanded(false);
    setInput("");
    try { await sendMessage({ text: question }); }
    catch (err: any) {
      if (err?.message !== "LOGIN_REQUIRED_GUEST_LIMIT") {
        setInput(question);
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    textarea.current?.form?.requestSubmit();
  }

  function chooseSuggestion(prompt: string) {
    draftEditedBeforeSession.current = true;
    conversationDrafts.current.set(currentConversationIdRef.current, prompt);
    setInput(prompt);
    textarea.current?.focus();
  }

  function syncModalUrl(open: boolean) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const currentModal = url.searchParams.get("modal");
    if (open) {
      if (currentModal !== "review") {
        url.searchParams.set("modal", "review");
        window.history.pushState({ ...window.history.state, campusReviewModal: true }, "", url.pathname + url.search + url.hash);
      }
    } else {
      if (currentModal === "review") {
        url.searchParams.delete("modal");
        window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
      }
    }
  }

  function openReview() {
    if (reviewStep === "done") {
      setReviewProfessor(null); setReviewCourse(null);
      setReviewQuery(""); setReviewText(""); setReviewRating(""); setReviewTerm("");
      setReviewSearchMode("course");
      setReviewCourses([]); setReviewProfessors([]);
    }
    setReviewStep(reviewStep !== "done" && reviewProfessor ? "edit" : "select");
    setReviewOpen(true); setReviewError("");
    syncModalUrl(true);
  }

  function openReviewForProfessor(profName: string) {
    if (reviewStep === "done") { setReviewText(""); setReviewRating(""); setReviewTerm(""); }
    setReviewSearchMode("professor"); setReviewCourse(null);
    setReviewQuery(profName); setReviewProfessor(null);
    setReviewCourses([]); setReviewProfessors([]);
    setReviewStep("select"); setReviewError(""); setReviewOpen(true);
    syncModalUrl(true);
  }

  function closeReview() {
    if (reviewSending) return;
    setReviewOpen(false); setReviewError("");
    if (typeof window !== "undefined") {
      if (window.history.state?.campusReviewModal) {
        window.history.back();
      } else {
        syncModalUrl(false);
      }
    }
  }

  function changeReviewSearchMode(mode: "course" | "professor") {
    setReviewSearchMode(mode); setReviewQuery("");
    if (mode === "professor") setReviewCourse(null);
    setReviewProfessor(null);
    setReviewCourses([]); setReviewProfessors([]); setReviewError("");
  }

  async function sendReview() {
    if (!reviewProfessor || reviewSending) return;
    setReviewSending(true); setReviewError("");
    try {
      const response = await fetch("/api/app/profes/reviews", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", ...analyticsHeaders() },
        body: JSON.stringify({ professorId: reviewProfessor.id, text: reviewText.trim(),
          ...(reviewCourse ? { courseId: reviewCourse.id } : {}),
          ...(reviewRating ? { rating: Number(reviewRating) } : {}),
          ...(reviewTerm ? { term: reviewTerm.trim() } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos enviar la reseña.");
      setReviewResult(data.message ?? "Recibimos tu reseña.");
      setReviewStep("done");
      try { sessionStorage.removeItem("campus-profes-review-draft"); } catch { /* Sent successfully. */ }
    } catch (error) { setReviewError(error instanceof Error ? error.message : "No pudimos enviar la reseña."); }
    finally { setReviewSending(false); }
  }

  function saveCurrentConversation() {
    conversationDrafts.current.set(currentConversationId, input);
    if (currentConversationId && !loadingConversation) {
      conversationSnapshots.current.set(currentConversationId, {
        messages, hasMore: hasOlderMessages, cursor: olderMessagesCursor.current, top: window.scrollY,
      });
      if (conversationSnapshots.current.size > 24) conversationSnapshots.current.delete(conversationSnapshots.current.keys().next().value!);
    }
  }

  function startNewConversation(updateUrl = true) {
    setFeedbackTrace(null);
    if (busy) return;
    navigationVersion.current++;
    saveCurrentConversation();
    setLoadingConversation(false);
    setLoadingOlderMessages(false);
    preserveScrollAfterPrepend.current = null;
    setInput(conversationDrafts.current.get(null));
    setCurrentConversationId(null);
    setMessages([]);
    setActivitySteps([]);
    setActivityExpanded(false);
    setHasOlderMessages(false);
    olderMessagesCursor.current = null;
    restoreScrollAfterLoad.current = 0;
    const search = window.location.search;
    if (updateUrl && window.location.pathname !== "/app/asistente/") window.history.pushState({ ...window.history.state, campusConversation: null }, "", `/app/asistente/${search}`);
    setHistoryOpen(false);
    setHistoryError("");
    requestAnimationFrame(() => textarea.current?.focus());
  }

  async function selectConversation(id: string, updateUrl = true) {
    setFeedbackTrace(null);
    if (busy) return;
    if (id === currentConversationId && !loadingConversation) { setHistoryOpen(false); return; }
    const version = ++navigationVersion.current;
    saveCurrentConversation();
    setHistoryError("");
    setLoadingOlderMessages(false);
    preserveScrollAfterPrepend.current = null;
    const snapshot = conversationSnapshots.current.get(id);
    const cached = pageCache.current.peek(id);
    // Cached chats swap in this same render. Uncached chats keep the current view
    // until ready; users can still choose another chat or start a new one.
    if (!snapshot && !cached) setLoadingConversation(true);
    try {
      const page = snapshot ? null : cached ?? await pageCache.current.get(id);
      if (navigationVersion.current !== version) return;
      setInput(conversationDrafts.current.get(id));
      setCurrentConversationId(id);
      setHasOlderMessages(snapshot?.hasMore ?? page!.hasMore);
      olderMessagesCursor.current = snapshot ? snapshot.cursor : page!.nextBeforeId;
      if (snapshot) restoreScrollAfterLoad.current = snapshot.top;
      else scrollToLatestAfterLoad.current = true;
      setMessages(snapshot ? snapshot.messages : toUIMessages(page!.messages));
      setActivitySteps([]);
      setActivityExpanded(false);
      const search = window.location.search;
      const nextUrl = `/app/asistente/c/${id}/${search}`;
      if (updateUrl && window.location.pathname !== `/app/asistente/c/${id}/`) window.history.pushState({ ...window.history.state, campusConversation: id }, "", nextUrl);
      setHistoryOpen(false);
      if (!snapshot && page?.hasMore && page.nextBeforeId) void pageCache.current.get(id, page.nextBeforeId).catch(() => {});
    } catch {
      if (navigationVersion.current === version) setHistoryError("No pudimos cargar la conversación seleccionada. Inténtalo de nuevo.");
    } finally {
      if (navigationVersion.current === version) {
        setLoadingConversation(false);
      }
    }
  }
  navigateConversation.current = id => {
    if (id !== currentConversationIdRef.current) {
      if (id) void selectConversation(id, false);
      else startNewConversation(false);
    }
  };

  async function loadOlderMessages() {
    const id = currentConversationId;
    const before = olderMessagesCursor.current;
    if (!id || !before || !hasOlderMessages || loadingOlderMessages || loadingConversation) return;
    const version = navigationVersion.current;
    setLoadingOlderMessages(true);
    try {
      const page = await pageCache.current.get(id, before);
      if (navigationVersion.current !== version) return;
      if (!page.messages.length) {
        setHasOlderMessages(false);
        return;
      }
      preserveScrollAfterPrepend.current = { height: document.documentElement.scrollHeight, top: window.scrollY };
      setMessages(current => [...toUIMessages(page.messages), ...current]);
      setHasOlderMessages(page.hasMore);
      olderMessagesCursor.current = page.nextBeforeId;
      if (page.hasMore && page.nextBeforeId) void pageCache.current.get(id, page.nextBeforeId).catch(() => {});
    } catch {
      if (navigationVersion.current === version) setHistoryError("No pudimos cargar los mensajes anteriores.");
    } finally {
      if (navigationVersion.current === version) setLoadingOlderMessages(false);
    }
  }

  useLayoutEffect(() => {
    const previous = preserveScrollAfterPrepend.current;
    if (previous) {
      preserveScrollAfterPrepend.current = null;
      window.scrollTo(0, previous.top + document.documentElement.scrollHeight - previous.height);
      return;
    }
    if (restoreScrollAfterLoad.current !== null) {
      const top = restoreScrollAfterLoad.current;
      restoreScrollAfterLoad.current = null;
      window.scrollTo(0, top);
      return;
    }
    if (scrollToLatestAfterLoad.current) {
      scrollToLatestAfterLoad.current = false;
      conversationEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages]);

  useEffect(() => {
    if (!currentConversationId || !hasOlderMessages || loadingOlderMessages || messages.length === 0) return;
    let previousY = window.scrollY;
    const loadWhenScrollingBack = () => {
      const currentY = window.scrollY;
      const reachedTop = currentY < 120;
      if (currentY < previousY && reachedTop) void loadOlderMessages();
      previousY = currentY;
    };
    window.addEventListener("scroll", loadWhenScrollingBack, { passive: true });
    return () => window.removeEventListener("scroll", loadWhenScrollingBack);
  }, [currentConversationId, hasOlderMessages, loadingOlderMessages, messages.length]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (!/^\/app\/(?:profes|asistente)(?:\/c\/[0-9a-f-]{36})?\/?$/i.test(window.location.pathname)) return;
      // These entries belong to the mounted chat. Avoid Astro replacing the page
      // and discarding its messages/cache when the user goes Back or Forward.
      event.stopImmediatePropagation();
      const isReview = new URLSearchParams(window.location.search).get("modal") === "review";
      setReviewOpen(isReview);
      navigateConversation.current(conversationIdFromPath());
    };
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, []);

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (busy || loadingConversation) return;
    if (!window.confirm("¿Eliminar esta consulta y sus mensajes?")) return;
    try {
      const res = await fetch(`/api/app/profes/conversation?id=${id}`, {
        method: "DELETE",
        headers: { origin: window.location.origin },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Error al eliminar conversación");
      pageCache.current.invalidate(id);
      conversationSnapshots.current.delete(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationIdRef.current === id) {
        setCurrentConversationId(null);
        setMessages([]);
        setHasOlderMessages(false);
        olderMessagesCursor.current = null;
        const search = window.location.search;
        if (window.location.pathname === `/app/asistente/c/${id}/` || window.location.pathname === `/app/profes/c/${id}/`) {
          window.history.replaceState({}, "", `/app/asistente/${search}`);
        }
        setInput("");
      }
    } catch {
      alert("No pudimos eliminar la conversación.");
    }
  }

  const currentConversation = conversations.find(c => c.id === currentConversationId);

  const account = assistantAccountView(session ? { ...session, usage } : access === "checking" ? "loading" : "error");
  const hint = isGuestLimit ? "Prueba completada · Continúa con Campus Free"
    : access === "checking" ? "Comprobando acceso…"
    : access === "setup" ? "Elige tu universidad al enviar"
    : access === "unsupported" ? accessNote
    : access === "unavailable" ? accessNote
    : account.balance;

  const studentName = session
    ? formatStudentName(session.authenticated ? session.banner?.fullName || session.email?.split("@")[0] || "" : "")
    : previewName;
  const studentFirstName = studentName ? studentName.split(" ")[0] : "";
  const planningEnabled = session?.features?.schedulePlanning ?? false;
  const lastUserMessage = [...messages].reverse().find(message => message.role === "user");
  const showUpcHint = !authenticated && !isGuestLimit && !upcHintDismissed && !busy
    && messages.at(-1)?.role === "assistant"
    && Boolean(lastUserMessage && /\bupc\b|peruana de ciencias aplicadas/i.test(messageText(lastUserMessage)));

  function dismissUpcHint() {
    setUpcHintDismissed(true);
    try { sessionStorage.setItem(upcHintDismissedKey, "1"); } catch { /* The hint stays dismissed for this render. */ }
  }

  const filteredConversations = conversations.filter(item => item.title.toLocaleLowerCase("es").includes(historySearch.trim().toLocaleLowerCase("es")));

  function closeHistory() {
    setHistoryOpen(false);
  }

  const sidebarActions = (
    <div className="app-profes-sidebar-actions">
      <button type="button" className="app-profes-sidebar-new" onClick={() => startNewConversation()} disabled={busy}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M16 3l5 5M10 14l3-1 9-9-4-4-9 9-1 5Z" /></svg>
        <span>Nueva consulta</span>
      </button>
      <button type="button" className="app-profes-sidebar-search" aria-label="Buscar consultas" onClick={() => { if (historySearchOpen) setHistorySearch(""); setHistorySearchOpen(open => !open); requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".sidebar--profes .app-profes-history__search")?.focus()); }}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></svg>
      </button>
    </div>
  );
  const historyContent = (
    <section className="app-profes-history" aria-label="Historial de consultas">
      <h2 className="app-profes-history__heading">Recientes</h2>
      {historySearchOpen || historyOpen ? <input className="app-profes-history__search" type="search" value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Buscar consulta…" aria-label="Buscar en tus consultas" /> : null}
          <div className="app-profes-history__list" role="list" aria-label="Consultas guardadas">
            {filteredConversations.map(conv => {
              const isActive = conv.id === currentConversationId;
              return (
                <div key={conv.id} role="listitem" className={`app-profes-history__item${isActive ? " is-active" : ""}`}>
                  <button type="button" className="app-profes-history__item-info" onClick={() => selectConversation(conv.id)} onPointerEnter={() => { void pageCache.current.get(conv.id).catch(() => {}); }} onFocus={() => { void pageCache.current.get(conv.id).catch(() => {}); }} disabled={busy} aria-current={isActive ? "true" : undefined} title={conv.title}>
                    <span className="app-profes-history__item-title">{conv.title}</span>
                    <span className="app-profes-history__item-date">{isActive ? "Abierta · " : ""}{formatRelativeTime(conv.updatedAt)}</span>
                  </button>
                  <button type="button" className="app-profes-history__item-del" onClick={event => handleDeleteConversation(conv.id, event)} disabled={busy || loadingConversation} aria-label={`Eliminar consulta: ${conv.title}`} title="Eliminar consulta">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
                  </button>
                </div>
              );
            })}
            {filteredConversations.length === 0 ? historyLoading ? <div className="app-profes-history__loading" role="status" aria-label="Cargando historial"><span className="app-sr-only">Cargando historial…</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--short" aria-hidden="true" /><span className="app-skeleton app-skeleton--line" aria-hidden="true" /></div> : <p className="app-profes-history__empty">{conversations.length ? "No encontramos esa consulta." : "Tus consultas aparecerán aquí al empezar a conversar."}</p> : null}
          </div>
          {historyError ? <p className="app-profes-history__status" role="alert">{historyError}</p> : null}
    </section>
  );

  if (guestNeedsUniversity) return <div className="app-profes-layout"><GuestUniversity selected={guestUniversity} onSelect={selectGuestUniversity} /></div>;
  if (guestUnsupported) return <div className="app-profes-layout"><section className="app-guest-university" aria-labelledby="university-coverage-title">
    <p className="app-guest-university__eyebrow">TU UNIVERSIDAD</p>
    <h1 id="university-coverage-title">Aún no llegamos a tu universidad.</h1>
    <p><strong>{guestUniversity?.name}</strong></p>
    <p>Por ahora, el asistente de Campus está disponible para UPC. Elegir universidad no consume consultas.</p>
    <button type="button" className="app-guest-university__continue" onClick={() => setChangingUniversity(true)}>Cambiar universidad</button>
    <a className="app-guest-university__back" href={assistantLoginHref(window.location.pathname)}>Crear cuenta y conservar mi universidad</a>
  </section></div>;

  return (
    <div className="app-profes-layout">
      {sidebarHosts ? createPortal(sidebarActions, sidebarHosts.actions) : null}
      {sidebarHosts ? createPortal(historyContent, sidebarHosts.history) : null}
        <dialog ref={mobileHistoryDialog} id="profes-history" className="app-profes-history-dialog" aria-labelledby="profes-history-title" onCancel={event => { event.preventDefault(); closeHistory(); }} onClick={event => { if (event.target === event.currentTarget) closeHistory(); }}>
          <div className="app-profes-history-dialog__panel">
            <div className="app-profes-history__header">
              <h2 id="profes-history-title">Tus consultas</h2>
              <button type="button" className="app-profes-history__close" onClick={closeHistory} aria-label="Cerrar historial">×</button>
            </div>
            {sidebarActions}
            {historyContent}
          </div>
        </dialog>
    <section className={`app-profes-ai${messages.length || currentConversationId ? " has-messages" : ""}${isGuestLimit ? " is-guest-limited" : ""}`} aria-label="Asistente de Campus">

      {/* Top Toolbar for Profes */}
      <div className="app-profes-toolbar">
        {session?.universityConfirmed && session.university ? <a className="app-university-context" href="/app/perfil/">{session.university.shortName || session.university.name}<span>Cambiar</span></a>
          : session?.authenticated === false && guestUniversity ? <button type="button" className="app-university-context" onClick={() => setChangingUniversity(true)} disabled={busy}>{guestUniversity.shortName || guestUniversity.name}<span>Cambiar</span></button> : null}
        <div className="app-assistant-account" data-state={account.state} aria-label="Tu plan y consultas">
          <div className="app-assistant-account__summary">
            <strong className="app-assistant-account__label"><span className="app-assistant-account__dot" aria-hidden="true" />{account.state === "loading" ? <><span className="app-sr-only">{account.label}</span><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></> : account.label}</strong>
            <span className="app-assistant-account__balance" aria-live="polite">{account.state === "loading" ? <><span className="app-sr-only">{account.available}</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /></> : account.available}</span>
          </div>
          {account.retry ? <button type="button" className="app-assistant-account__retry" onClick={() => { void retryAccess(); }} disabled={busy || balanceRetrying} aria-busy={balanceRetrying}>{balanceRetrying ? <><span className="app-sr-only">Comprobando…</span><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></> : "Reintentar"}</button>
            : account.state !== "loading" ? <a className="app-assistant-account__link" onClick={() => { if (account.state === "guest") markGuestDraftHandoff(); }} href={account.state === "guest" ? assistantLoginHref(window.location.pathname) : "/app/perfil/"}>
              {account.state === "guest" ? "Crear cuenta" : account.state === "blocked" ? "Mi cuenta" : "Ver plan"}
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><use href="/assets/lucide.svg#arrow-right" /></svg>
            </a> : null}
        </div>
        <div className="app-profes-toolbar__left">
          <button
            type="button"
            className="app-profes-toolbar__btn app-profes-toolbar__history-btn"
            id="profes-history-toggle"
            onClick={() => setHistoryOpen(open => !open)}
            aria-expanded={historyOpen}
            aria-controls="profes-history"
            aria-label="Ver historial de consultas"
            title="Historial de consultas"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Historial</span>
            {conversations.length > 0 ? (
              <span className="app-profes-toolbar__badge">{conversations.length}</span>
            ) : null}
          </button>
          {currentConversation ? (
            <span className="app-profes-toolbar__current-title" title={currentConversation.title}>
              {currentConversation.title}
            </span>
          ) : null}
        </div>
        <div className="app-profes-toolbar__right">
          <button
            type="button"
            className="app-profes-toolbar__btn app-profes-toolbar__new-btn"
            onClick={() => startNewConversation()}
            disabled={busy}
            aria-label="Nueva consulta"
            title="Iniciar una nueva consulta"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Nueva consulta</span>
          </button>
        </div>
      </div>

      {messages.length === 0 && loadingConversation && currentConversationId ? (
        <div className="app-profes-ai__conversation-skeleton" role="status" aria-label="Cargando conversación">
          <span /><span /><span />
        </div>
      ) : messages.length === 0 ? (
        <div className="app-profes-ai__welcome">
          <h1>{studentFirstName ? `Hola, ${studentFirstName}. ¿En qué te ayudo?` : "¿En qué te ayudo hoy?"}</h1>
        </div>
      ) : messages.length > 0 ? (
        <div className="app-profes-ai__conversation" aria-live="polite" aria-label="Conversación">
          {hasOlderMessages ? (
            <button type="button" className="app-profes-ai__older-messages" onClick={loadOlderMessages} disabled={loadingOlderMessages} aria-busy={loadingOlderMessages}>
            {loadingOlderMessages ? <><span className="app-sr-only">Cargando mensajes…</span><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></> : "Ver mensajes anteriores"}
            </button>
          ) : null}
          <div className="app-profes-ai__conversation-top">
            <span>{currentConversation ? currentConversation.title : "Tu conversación"}</span>
            <div className="app-profes-ai__conversation-actions">
              <button type="button" onClick={openReview}>Dejar reseña</button>
            </div>
          </div>
          {messages.map(message => (
            <article className={`app-profes-ai__message app-profes-ai__message--${message.role}`} key={message.id}>
              {!busy && message.role === "assistant" && message.id === messages.at(-1)?.id && activitySteps.length > 0 ? <ChatActivity steps={activitySteps} busy={false} expanded={activityExpanded} onExpandedChange={setActivityExpanded} /> : null}
              {message.role === "assistant" ? <span className="app-profes-ai__speaker">Campus</span> : null}
              {message.role === "assistant" ? (
                <AssistantMessageContent
                  content={messageText(message)}
                  onAskAbout={name => chooseSuggestion(`¿Qué dicen los estudiantes del profesor ${name}?`)}
                  onLeaveReview={openReviewForProfessor}
                />
              ) : (
                <p>{messageText(message)}</p>
              )}
            </article>
          ))}
          {authenticated && miupcReconnectRequired && miupcReconnectConversationId===currentConversationId ? <MiupcReconnect key={currentConversationId} freshNotice={freshMiupcNotice.current===currentConversationId} onNoticeSeen={()=>{freshMiupcNotice.current=null;}} conversationId={currentConversationId} noticeRevision={miupcReconnectRevision} upcRequired={upcReconnectRequired} disabled={busy} onConnected={clearMiupcReconnectNotices} onUpcAccessRestored={()=>{clearMiupcReconnectNotices("upc");setUpcReconnectRequired(false);}} onDismiss={()=>setMiupcReconnectRequired(false)} /> : null}
          {busy || (activitySteps.length > 0 && messages.at(-1)?.role === "user") ? <ChatActivity steps={activitySteps} busy={busy} interrupted={!busy} expanded={activityExpanded} onExpandedChange={setActivityExpanded} /> : null}
          {busy && messages.at(-1)?.role === "user" ? <div className="app-chat-response-skeleton" aria-hidden="true"><span className="app-skeleton app-skeleton--line" /><span className="app-skeleton app-skeleton--line" /><span className="app-skeleton app-skeleton--short" /></div> : null}
          {showUpcHint ? (
            <aside className="app-profes-upc-hint" aria-label="Sugerencia para estudiantes de la UPC">
              <button type="button" className="app-profes-upc-hint__close" aria-label="Cerrar sugerencia" onClick={dismissUpcHint}>×</button>
              <span className="app-profes-ai__speaker">Campus</span>
              <strong>Ah, estudias en la UPC. Conecta tu cuenta.</strong>
              <p>Así podré consultar tus cursos y horario oficiales cuando los necesites.</p>
              <a className="app-profes-upc-hint__link" onClick={() => markGuestDraftHandoff()} href={getLoginUrl()}>Iniciar sesión para conectar UPC →</a>
            </aside>
          ) : null}
          <div ref={conversationEndRef} />
        </div>
      ) : null}

      <dialog ref={reviewDialog} className="app-profes-review" aria-labelledby="review-title"
        onCancel={event => { event.preventDefault(); closeReview(); }}
        onClick={event => { if (event.target === event.currentTarget) closeReview(); }}>
        <div className="app-profes-review__panel">
          <header className="app-profes-review__head">
            <div>
              <span className="app-profes-review__eyebrow">{reviewStep === "select" ? "1 de 2 · Curso y docente" : reviewStep === "edit" ? "2 de 2 · Tu experiencia" : reviewStep === "confirm" ? "Antes de enviar" : "Gracias por compartir"}</span>
              <h2 id="review-title">{reviewStep === "select" ? "¿A quién quieres reseñar?" : reviewStep === "confirm" ? "Revisa tu reseña" : reviewStep === "done" ? "Reseña recibida" : "Cuéntanos cómo te fue"}</h2>
            </div>
            <button type="button" className="app-profes-review__close" onClick={closeReview} disabled={reviewSending} aria-label="Cerrar reseña">×</button>
          </header>
          <div className="app-profes-review__body">
            {reviewStep === "done" ? <p role="status">{reviewResult}</p>
              : reviewStep === "confirm" ? (
                <div className="app-profes-review__preview">
                  <strong>{reviewProfessor?.name}</strong>
                  <span>{reviewCourse?.name ?? reviewProfessor?.university}</span>
                  <p>{reviewText}</p>
                  {reviewRating ? <span>Calificación: {reviewRating} / 10</span> : null}
                  {reviewTerm ? <span>Ciclo: {reviewTerm}</span> : null}
                </div>
              ) : reviewStep === "select" ? (
                <>
                  <p>Encuentra tu curso y elige al docente con quien lo llevaste.</p>
                  {access === "checking" ? <div className="app-profes-review__loading" role="status"><span className="app-sr-only">Cargando tu cuenta…</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></div> : authenticated && session?.universityConfirmed ? <>
                    <div className="app-profes-review__tabs" aria-label="Cómo buscar">
                      <button type="button" aria-pressed={reviewSearchMode === "course"} onClick={() => changeReviewSearchMode("course")}>Por curso</button>
                      <button type="button" aria-pressed={reviewSearchMode === "professor"} onClick={() => changeReviewSearchMode("professor")}>Por nombre</button>
                    </div>
                    {reviewCourse ? <div className="app-profes-review__selected-course">
                      <span>{reviewCourse.name}</span>
                      <button type="button" className="app-profes-review__secondary" onClick={() => { setReviewCourse(null); setReviewProfessor(null); setReviewQuery(""); setReviewProfessors([]); setReviewCourses([]); }}>Cambiar curso</button>
                    </div> : null}
                    {reviewSearchMode === "professor" || !reviewCourse ? <>
                      <label htmlFor="review-search">{reviewSearchMode === "course" ? "Curso" : "Nombre del docente"}</label>
                      <input ref={reviewSearchInput} id="review-search" value={reviewQuery} onChange={event => { setReviewQuery(event.target.value); setReviewProfessor(null); setReviewCourses([]); setReviewProfessors([]); }}
                        placeholder={reviewSearchMode === "course" ? "Nombre o código del curso" : "Nombre o apellido"} maxLength={100} />
                    </> : <label>Elige al docente</label>}
                    <div className="app-profes-review__lookup" aria-busy={reviewSearching}>
                      {reviewSearching ? <div className="app-profes-review__loading" role="status"><span className="app-sr-only">Buscando…</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></div> : reviewCourses.length || reviewProfessors.length ? (
                        <div className="app-profes-review__results" aria-label={reviewCourses.length ? "Cursos encontrados" : "Profesores encontrados"}>
                          {reviewCourses.map(course => <button key={course.id} type="button" onClick={() => { setReviewCourse(course); setReviewProfessor(null); setReviewQuery(""); setReviewCourses([]); setReviewProfessors([]); }}>
                            <span>{course.name}</span>{course.code ? <small>{course.code}</small> : null}<span className="app-profes-review__result-arrow" aria-hidden="true">→</span>
                          </button>)}
                          {reviewProfessors.map(professor => <button key={professor.id} type="button" onClick={() => { setReviewProfessor(professor); setReviewStep("edit"); setReviewError(""); }}>
                            <span>{professor.name}</span><small>{professor.university}</small><span className="app-profes-review__result-arrow" aria-hidden="true">→</span>
                          </button>)}
                        </div>
                      ) : !reviewError ? <p role="status">{reviewCourse && reviewSearchMode === "course" ? "No tenemos docentes asociados a este curso todavía. Puedes buscar al tuyo por nombre." : reviewQuery.trim().length >= 2 ? "Sin resultados. Prueba con otro nombre o código." : "Escribe al menos dos letras para buscar."}</p> : null}
                    </div>
                    {reviewCourse && reviewSearchMode === "course" ? <button type="button" className="app-profes-review__secondary" onClick={() => changeReviewSearchMode("professor")}>¿No aparece tu docente? Búscalo por nombre</button> : null}
                  </> : <p>{!authenticated ? "Inicia sesión para elegir al docente y compartir tu experiencia." : "Elige tu universidad en Mi perfil para encontrar tus cursos y docentes."}</p>}
                </>
              ) : (
                <>
                  <div className="app-profes-review__selected">
                    <div><strong>{reviewProfessor?.name}</strong><span>{reviewCourse?.name ?? reviewProfessor?.university}</span></div>
                    <button type="button" className="app-profes-review__secondary" onClick={() => setReviewStep("select")}>Cambiar</button>
                  </div>
                  <label htmlFor="review-text">Tu experiencia</label>
                  <textarea ref={reviewExperience} id="review-text" value={reviewText} onChange={event => setReviewText(event.target.value)} minLength={10} maxLength={1500} placeholder="¿Cómo explica, evalúa y acompaña a sus estudiantes?" />
                  <div className="app-profes-review__text-meta"><span>Tu nombre no se mostrará públicamente.</span><span>{reviewText.length}/1500</span></div>
                  <div className="app-profes-review__two">
                    <label htmlFor="review-rating">Calificación <small>(opcional)</small>
                      <input id="review-rating" type="number" min="0" max="10" step="0.5" value={reviewRating} onChange={event => setReviewRating(event.target.value)} placeholder="De 0 a 10" />
                    </label>
                    <label htmlFor="review-term">Ciclo <small>(opcional)</small>
                      <input id="review-term" value={reviewTerm} onChange={event => setReviewTerm(event.target.value)} pattern="20[0-9]{2}-[0123]" placeholder="2026-2" maxLength={6} />
                    </label>
                  </div>
                </>
              )}
            {reviewError ? <>
              <p className="app-profes-review__error" role="alert">{reviewError}</p>
              {reviewStep === "select" ? <button type="button" className="app-profes-review__secondary" onClick={() => setReviewLookupAttempt(attempt => attempt + 1)}>Reintentar búsqueda</button> : null}
            </> : null}
          </div>
          <footer className="app-profes-review__actions">
            {reviewStep === "done" ? <button type="button" className="app-profes-review__primary" onClick={closeReview}>Volver al chat</button>
              : access === "checking" ? <span className="app-profes-review__draft-note" role="status"><span className="app-sr-only">Cargando tu cuenta…</span><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></span>
              : !authenticated ? <a className="app-profes-review__primary" onClick={() => markGuestDraftHandoff()} href={getLoginUrl()}>Iniciar sesión</a>
              : !session?.universityConfirmed ? <a className="app-profes-review__primary" href="/app/perfil/">Elegir universidad</a>
              : reviewStep === "confirm" ? <>
                <button type="button" className="app-profes-review__secondary" onClick={() => setReviewStep("edit")} disabled={reviewSending}>Editar</button>
                <button type="button" className="app-profes-review__primary" onClick={sendReview} disabled={reviewSending} aria-busy={reviewSending}>{reviewSending ? <><span className="app-sr-only">Enviando…</span><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></> : "Confirmar y enviar"}</button>
              </> : reviewStep === "edit" ? <>
                <span className="app-profes-review__draft-note">Borrador guardado</span>
                <button type="button" className="app-profes-review__primary" disabled={!reviewProfessor || reviewText.trim().length < 10 || reviewText.length > 1500 || Boolean(reviewRating && (!Number.isFinite(Number(reviewRating)) || Number(reviewRating) < 0 || Number(reviewRating) > 10)) || Boolean(reviewTerm && !/^20\d{2}-[0123]$/.test(reviewTerm))} onClick={() => { setReviewError(""); setReviewStep("confirm"); }}>Revisar reseña</button>
              </> : <span className="app-profes-review__draft-note">Elige un docente para continuar</span>}
          </footer>
        </div>
      </dialog>

      {!busy&&feedbackTrace&&messages.at(-1)?.role==='assistant' ? <AgentFeedback key={feedbackTrace} traceId={feedbackTrace}/> : null}
      {isGuestLimit ? (
        <div className="app-guest-quota-reminder" role="status">
          <div className="app-guest-quota-reminder__text">
            <strong>Completaste tu prueba gratis</strong>
            <span>Crea tu cuenta Campus Free y recibe 25 consultas de bienvenida.</span>
          </div>
          <button ref={quotaReopen} type="button" className="app-guest-quota-reminder__button" onClick={reopenQuotaDialog}>Conocer Campus Free</button>
        </div>
      ) : (
        <div className="app-profes-ai__composer-dock">
          <form className="app-profes-ai__composer" onSubmit={submit}>
            <label className="app-sr-only" htmlFor="profes-message">Escribe tu pregunta a Campus</label>
            <textarea
              id="profes-message"
              autoComplete="off"
              ref={textarea}
              value={input}
              onChange={event => { draftEditedBeforeSession.current = true; setInput(event.target.value); }}
              onKeyDown={onKeyDown}
              placeholder="Pregunta a Campus…"
              rows={1}
              maxLength={2000}
              disabled={busy || loadingConversation}
            />
            <div className="app-profes-ai__composer-footer">
              {busy ? (
                <button type="button" onClick={()=>{track('campus_agent_interrupted',{step:'question'});stop();}} aria-label="Detener respuesta" title="Detener respuesta" className="app-profes-ai__send app-profes-ai__send--stop"><span aria-hidden="true" /></button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || loadingConversation || access === "checking" || access === "unavailable" || access === "unsupported"}
                  aria-label={access === "setup" ? "Elegir universidad y preguntar" : "Enviar pregunta"}
                  title={access === "setup" ? "Elegir universidad y preguntar" : "Enviar pregunta"}
                  className="app-profes-ai__send"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-up-right" /></svg>
                </button>
              )}
            </div>
          </form>
          {access !== "ready" || isGuestLimit ? <p className="app-profes-ai__composer-hint">{hint}</p> : null}
          {session?.accessUnavailable ? <button type="button" className="app-profes-ai__older-messages" onClick={() => { void retryAccess(); }} disabled={busy || balanceRetrying}>{balanceRetrying ? "Comprobando saldo…" : "Reintentar saldo"}</button> : null}
        </div>
      )}

      {(error || (historyError && !historyOpen)) && !isGuestLimit ? <div className="app-profes-ai__recovery">
        <p className="app-profes-ai__error" role="alert">{error?.message ?? historyError}</p>
        <a href="https://wa.me/51946189585" className="app-text-link" target="_blank" rel="noopener noreferrer">Escribir a soporte por WhatsApp</a>
        {canRetryQuestion(error) && messages.at(-1)?.role === 'user' && access === 'ready' && (usage?.remaining ?? 0) > 0 && !busy ? <button type="button" className="app-profes-ai__retry" onClick={() => {
          track('campus_question_retried', { step: 'question' });
          setActivitySteps(['connecting']); setActivityExpanded(false);
          void regenerate();
        }}>Reintentar consulta</button> : null}
      </div> : null}
      {messages.length === 0 && !currentConversationId && !isGuestLimit ? (
        <div className="app-profes-ai__suggestions" aria-label="Ideas para empezar">
          {suggestions.filter(item => planningEnabled || item.icon !== "calendar-days").map(item => (
            <button type="button" onClick={() => chooseSuggestion(item.prompt)} key={item.label}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`/assets/lucide.svg#${item.icon}`} /></svg>
              <span>{item.label}</span>
            </button>
          ))}
          <button type="button" onClick={openReview}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#star" /></svg>
            <span>Dejar una reseña</span>
          </button>
        </div>
      ) : null}
      {isGuestLimit && quotaDialogOpen ? (
        <div className="app-guest-quota-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeQuotaDialog(); }}>
          <div ref={quotaDialog} className="app-guest-quota-card" role="dialog" aria-modal="true" aria-labelledby="guest-quota-title" aria-describedby="guest-quota-desc" onKeyDown={onQuotaDialogKeyDown}>
            <button ref={quotaClose} type="button" className="app-guest-quota-card__close" onClick={closeQuotaDialog} aria-label="Cerrar aviso">×</button>
            <div className="app-guest-quota-card__main">
              <div className="app-guest-quota-card__badge">
                <span className="app-guest-quota-card__dot" aria-hidden="true" />
                <span>5 de 5 consultas usadas</span>
              </div>
              <h2 id="guest-quota-title" className="app-guest-quota-card__title">Continúa con tu cuenta Campus.</h2>
              <p id="guest-quota-desc" className="app-guest-quota-card__desc">Al crear tu cuenta Campus Free recibes 25 consultas de bienvenida. Si ya tienes cuenta, entra para continuar.</p>
              <div className="app-guest-quota-card__perks">
                <span><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#check" /></svg>25 consultas de bienvenida</span>
                <span><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#check" /></svg>Tu historial se conserva</span>
                <span><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#check" /></svg>Sin tarjeta de crédito</span>
              </div>
            </div>
            <div className="app-guest-quota-card__action">
              <a onClick={() => markGuestDraftHandoff()} href={getLoginUrl()} className="app-guest-quota-card__btn"><span>Crear cuenta o entrar</span><span aria-hidden="true">→</span></a>
            </div>
          </div>
        </div>
      ) : null}


    </section>
    </div>
  );
}
