import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DOCS_LIST = [
  { id: "readme", title: "Overview (README)", path: "/README.md" },
  { id: "installation", title: "Installation", path: "/docs/installation.md" },
  { id: "architecture", title: "Architecture", path: "/docs/architecture.md" },
  { id: "api", title: "API Reference", path: "/docs/api-reference.md" },
  { id: "cv", title: "CV / ML Pipeline", path: "/docs/cv-pipeline.md" },
  { id: "scoring", title: "Scoring Logic", path: "/docs/scoring.md" },
  { id: "frontend", title: "Frontend", path: "/docs/frontend.md" },
  { id: "issues", title: "Common Issues", path: "/docs/common-issues.md" },
  { id: "contributing", title: "Contributing", path: "/docs/contributing.md" },
];

export default function DeveloperGuide() {
  const [activeDoc, setActiveDoc] = useState(DOCS_LIST[0]);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(activeDoc.path, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load document (${res.status})`);
        return res.text();
      })
      .then((text) => {
        if (isMounted) setContent(text);
      })
      .catch((err) => {
        if (isMounted)
          setContent(`**Error loading document:** ${err.name === "AbortError" ? "Request timed out" : err.message}`);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeDoc]);

  return (
    <div className="developer-guide">
      <div className="doc-sidebar">
        <h3>Documents</h3>
        <ul>
          {DOCS_LIST.map((doc) => (
            <li key={doc.id}>
              <button
                className={`doc-nav-btn ${activeDoc.id === doc.id ? "active" : ""}`}
                onClick={() => setActiveDoc(doc)}
              >
                {doc.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="doc-content-area">
        {loading ? (
          <p className="loading-text">Loading document...</p>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
