import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Root, Element } from "hast";

function normalizeBullets(text: string) {
  let fence: string | null = null;
  let listIndent: number | null = null;
  let fenceIndent = 0;
  return text.split("\n").map(line => {
    const indent = line.match(/^[ \t]*/)?.[0].replace(/\t/g, "    ").length ?? 0;
    const marker = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && indent <= fenceIndent + 3
        && !line.slice(marker[0].length).trim()) fence = null;
      return line;
    }
    if (marker && (indent <= 3 || listIndent !== null)) {
      fence = marker[1]; fenceIndent = indent; if (indent <= 3) listIndent = null; return line;
    }
    const item = line.match(/^([ \t]*)(?:•|[-+*]|\d+[.)])\s+/);
    if (item) {
      if (indent <= 3) listIndent = indent;
      if (listIndent !== null) return line.replace(/^([ \t]*)•\s+/, "$1- ");
    } else if (line.trim() && listIndent !== null && indent <= listIndent) listIndent = null;
    return line;
  }).join("\n");
}

// Keep a course/title and its table together, including older saved replies
// whose title is bold text rather than a Markdown heading.
function tableSections() {
  return (tree: Root) => {
    for (let i = 1; i < tree.children.length; i++) {
      const table = tree.children[i];
      if (table.type !== "element" || table.tagName !== "table") continue;
      let titleIndex = i - 1;
      while (titleIndex >= 0 && tree.children[titleIndex].type === "text"
        && !String((tree.children[titleIndex] as { value: string }).value).trim()) titleIndex--;
      const title = tree.children[titleIndex];
      if (!title || title.type !== "element") continue;
      const isHeading = /^h[1-6]$/.test(title.tagName);
      const isBoldTitle = title.tagName === "p" && title.children[0]?.type === "element"
        && title.children[0].tagName === "strong"
        && title.children.slice(1).every(child => child.type === "text" && /^\s*(?:\([^\n]+\))?\s*$/.test(child.value));
      if (!isHeading && !isBoldTitle) continue;
      const heading: Element = { ...title, tagName: "h3" };
      const section: Element = { type: "element", tagName: "section", properties: { className: ["app-chat-table-section"] }, children: [heading, table] };
      tree.children.splice(titleIndex, i - titleIndex + 1, section);
      i = titleIndex;
    }
  };
}

const components: Components = {
  table: ({ children }) => (
    <div className="app-academic-table" role="region" aria-label="Tabla de la respuesta" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  th: ({ children, style }) => <th scope="col" style={style}>{children}</th>,
  td: ({ children, style, node }) => {
    const pending = node?.children.length === 1 && node.children[0].type === "text"
      && /^pendiente$/i.test(node.children[0].value.trim());
    return <td style={style} className={pending ? "is-pending" : undefined}>{children}</td>;
  },
  // Model output cannot embed remote resources or executable HTML.
  img: ({ alt }) => <span>{alt}</span>,
};

export default function ChatMarkdown({ text }: { text: string }) {
  return <div className="app-chat-markdown">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[tableSections]} components={components} skipHtml>{normalizeBullets(text)}</Markdown>
  </div>;
}
