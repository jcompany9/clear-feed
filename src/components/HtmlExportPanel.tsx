import { useMemo, useState } from "react";
import { FormDocument } from "../types";
import { exportDocumentToHtml } from "../utils/htmlExport";

interface HtmlExportPanelProps {
  formDocument: FormDocument;
}

export function HtmlExportPanel({ formDocument }: HtmlExportPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const previewHtml = useMemo(() => (isOpen ? exportDocumentToHtml(formDocument) : ""), [formDocument, isOpen]);

  const handleCopy = async () => {
    try {
      const html = exportDocumentToHtml(formDocument);
      await navigator.clipboard.writeText(html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const html = exportDocumentToHtml(formDocument);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${formDocument.title || "form-template"}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="export-panel">
      <div className="export-panel__header">
        <span>HTML 내보내기</span>
        <div className="export-panel__actions">
          <button type="button" onClick={() => setIsOpen((value) => !value)}>
            {isOpen ? "코드 숨기기" : "코드 보기"}
          </button>
          <button type="button" onClick={handleCopy}>
            {copied ? "복사 완료" : "클립보드 복사"}
          </button>
          <button type="button" onClick={handleDownload}>
            HTML 저장
          </button>
        </div>
      </div>
      {isOpen ? <textarea readOnly value={previewHtml} rows={12} /> : null}
    </section>
  );
}
