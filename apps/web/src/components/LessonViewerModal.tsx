import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function LessonViewerModal(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  markdown: string;
  onClose: () => void;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="ax-modal-backdrop" role="dialog" aria-modal="true">
      <div className="ax-modal">
        <div className="ax-modal-header">
          <div className="stack" style={{ gap: 2 }}>
            <strong>{props.title}</strong>
            {props.subtitle ? <span className="muted">{props.subtitle}</span> : null}
          </div>
          <button type="button" className="button-secondary" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="ax-modal-body markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{props.markdown}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

