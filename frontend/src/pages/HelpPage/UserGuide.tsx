import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DOCS_LIST = [
  { id: "getting-started", title: "1. Getting Started", path: "/docs/user-getting-started.md" },
  { id: "coding-page", title: "2. Coding Page", path: "/docs/user-coding-page.md" },
  { id: "map-view", title: "3. Map View & Analysis", path: "/docs/user-map-view.md" },
  { id: "path-analysis", title: "4. Path Analysis", path: "/docs/user-path-analysis.md" },
  { id: "treatment-application", title: "5. Treatment Application", path: "/docs/user-treatment-application.md" },
];

export default function UserGuide() {
  const [activeDoc, setActiveDoc] = useState(DOCS_LIST[0]);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch(activeDoc.path)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load document");
        return res.text();
      })
      .then((text) => {
        if (isMounted) setContent(text);
      })
      .catch((err) => {
        if (isMounted) setContent(`**Error loading document:** ${err.message}`);
      })
      .finally(() => {
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
