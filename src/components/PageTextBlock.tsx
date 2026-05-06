import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { EditorAction } from "../state/editorReducer";
import { DocumentTextBlock, EditorMode } from "../types";

interface PageTextBlockProps {
  block: DocumentTextBlock;
  isSelected: boolean;
  mode: EditorMode;
  dispatch: Dispatch<EditorAction>;
}

export function PageTextBlock({ block, isSelected, mode, dispatch }: PageTextBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(48, textarea.scrollHeight)}px`;
  }, [block.text]);

  useEffect(() => {
    if (mode !== "input" || !isSelected) {
      return;
    }

    textareaRef.current?.focus();
  }, [isSelected, mode]);

  useEffect(() => {
    if (!isSelected) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea, input, select")) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "remove-selected-text-block" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dispatch, isSelected]);

  return (
    <section
      className={`page-text-block${isSelected ? " is-selected" : ""}`}
      onPointerDown={() => dispatch({ type: "select-text-block", blockId: block.id })}
    >
      {isSelected ? (
        <div className="page-text-block__actions">
          <button
            type="button"
            className="page-text-block__delete"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => dispatch({ type: "remove-selected-text-block" })}
          >
            문단 삭제
          </button>
        </div>
      ) : null}

      {mode === "input" ? (
        <textarea
          ref={textareaRef}
          className="page-text-block__editor"
          value={block.text}
          placeholder="표 밖 문단이나 안내 문구를 입력하세요."
          onChange={(event) => dispatch({ type: "update-text-block", text: event.target.value })}
        />
      ) : (
        <div className="page-text-block__display">{block.text || "표 밖 문단 영역"}</div>
      )}
    </section>
  );
}
