import { useEffect, useRef } from "react";
import { CellContent } from "../types";

interface CellContentRendererProps {
  content: CellContent;
  isEditing?: boolean;
  onTextChange?: (value: string) => void;
}

export function CellContentRenderer({ content, isEditing = false, onTextChange }: CellContentRendererProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditing || content.type !== "text" || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    textarea.focus();
    const length = textarea.value.length;
    textarea.setSelectionRange(length, length);
  }, [content.type, isEditing]);

  useEffect(() => {
    if (content.type !== "text" || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [content]);

  switch (content.type) {
    case "text":
      if (isEditing) {
        return (
          <textarea
            ref={textareaRef}
            className="cell-text-editor"
            value={content.text}
            placeholder="여기에 입력하세요. Enter로 줄바꿈할 수 있습니다."
            onChange={(event) => onTextChange?.(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
          />
        );
      }
      return <div className="cell-text-display">{content.text || " "}</div>;
    case "input-text":
      return <input type="text" placeholder={content.placeholder} disabled />;
    case "input-date":
      return <input type="date" disabled />;
    case "checkbox":
      return (
        <label className="checkbox-preview">
          <input type="checkbox" checked={content.checked} readOnly />
          <span>{content.label}</span>
        </label>
      );
    case "signature":
      return <div className="signature-preview">{content.label}</div>;
    default:
      return null;
  }
}
