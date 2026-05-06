import type { Dispatch } from "react";
import { EditorMode, EditorSelection, FormDocument } from "../types";
import { EditorAction } from "../state/editorReducer";
import { EditableTable } from "./EditableTable";
import { PageTextBlock } from "./PageTextBlock";

interface A4CanvasProps {
  document: FormDocument;
  selection: EditorSelection;
  mode: EditorMode;
  dispatch: Dispatch<EditorAction>;
}

export function A4Canvas({ document, selection, mode, dispatch }: A4CanvasProps) {
  const pageStyle = {
    width: `${document.page.widthMm}mm`,
    height: `${document.page.heightMm}mm`,
    minHeight: `${document.page.heightMm}mm`,
    padding: `${document.page.paddingMm}mm`,
  };

  return (
    <main className="canvas-shell">
      <div className="canvas-scroll">
        <div className="a4-page" style={pageStyle}>
          {document.textBlocks.map((block) => (
            <PageTextBlock
              key={block.id}
              block={block}
              isSelected={selection.blockId === block.id}
              mode={mode}
              dispatch={dispatch}
            />
          ))}
          {document.tables.map((table) => (
            <section key={table.id} className="table-block">
              <EditableTable table={table} selection={selection} mode={mode} dispatch={dispatch} />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
