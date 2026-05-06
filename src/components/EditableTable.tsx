import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { EditorMode, EditorSelection, TableModel } from "../types";
import { EditorAction } from "../state/editorReducer";
import { CellContentRenderer } from "./CellContentRenderer";
import { findNextVisibleCell, getCellPosition, getSelectionBounds } from "../utils/tableModel";

interface EditableTableProps {
  table: TableModel;
  selection: EditorSelection;
  mode: EditorMode;
  dispatch: Dispatch<EditorAction>;
}

export function EditableTable({ table, selection, mode, dispatch }: EditableTableProps) {
  const SIZE_STEP = 10;
  const MIN_CELL_WIDTH = 10;
  const MIN_CELL_HEIGHT = 8;
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const keyboardHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

  const selectionBounds = useMemo(() => {
    if (selection.tableId !== table.id || !selection.anchorCellId || !selection.focusCellId) {
      return null;
    }
    return getSelectionBounds(table, selection.anchorCellId, selection.focusCellId);
  }, [selection.anchorCellId, selection.focusCellId, selection.tableId, table]);

  useEffect(() => {
    if (selection.cellId !== editingCellId) {
      setEditingCellId(null);
    }
  }, [editingCellId, selection.cellId]);

  const moveSelection = (nextCellId: string, options?: { extendRange?: boolean }) => {
    if (options?.extendRange) {
      dispatch({ type: "update-range-selection", tableId: table.id, cellId: nextCellId });
      return;
    }

    dispatch({ type: "select-cell", tableId: table.id, cellId: nextCellId });
  };

  const handleKeyboardNavigation = (event: KeyboardEvent | React.KeyboardEvent<HTMLTableElement>) => {
    if (selection.tableId !== table.id || !selection.cellId) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("textarea, input, select")) {
      return;
    }

    const navigationCellId = event.shiftKey && selection.focusCellId ? selection.focusCellId : selection.cellId;
    const position = getCellPosition(table, navigationCellId);
    if (!position) {
      return;
    }

    const extendRange = event.shiftKey;
    let next = null as ReturnType<typeof findNextVisibleCell> | null;

    switch (event.key) {
      case "1":
        if (event.altKey) {
          event.preventDefault();
          setEditingCellId(null);
          dispatch({ type: "add-content", contentType: "input-text" });
        }
        return;
      case "2":
        if (event.altKey) {
          event.preventDefault();
          setEditingCellId(null);
          dispatch({ type: "add-content", contentType: "signature" });
        }
        return;
      case "Delete":
      case "Backspace":
        if (mode !== "table") {
          return;
        }
        event.preventDefault();
        setEditingCellId(null);
        dispatch({ type: "clear-selected-cell-contents" });
        return;
      case "ArrowRight":
        if (mode !== "table") {
          return;
        }
        if (event.altKey) {
          event.preventDefault();
          setEditingCellId(null);
          dispatch({ type: "update-cell-width", value: table.columnWidths[position.cellIndex] + SIZE_STEP });
          return;
        }
        next = findNextVisibleCell(table, position.rowIndex, position.cellIndex, 0, 1, {
          wrapHorizontal: false,
        });
        break;
      case "ArrowLeft":
        if (mode !== "table") {
          return;
        }
        if (event.altKey) {
          event.preventDefault();
          setEditingCellId(null);
          dispatch({
            type: "update-cell-width",
            value: Math.max(MIN_CELL_WIDTH, table.columnWidths[position.cellIndex] - SIZE_STEP),
          });
          return;
        }
        next = findNextVisibleCell(table, position.rowIndex, position.cellIndex, 0, -1, {
          wrapHorizontal: false,
        });
        break;
      case "ArrowDown":
        if (mode !== "table") {
          return;
        }
        if (event.altKey) {
          event.preventDefault();
          setEditingCellId(null);
          dispatch({ type: "update-cell-height", value: table.rows[position.rowIndex].heightPx + SIZE_STEP });
          return;
        }
        next = findNextVisibleCell(table, position.rowIndex, position.cellIndex, 1, 0);
        break;
      case "ArrowUp":
        if (mode !== "table") {
          return;
        }
        if (event.altKey) {
          event.preventDefault();
          setEditingCellId(null);
          dispatch({
            type: "update-cell-height",
            value: Math.max(MIN_CELL_HEIGHT, table.rows[position.rowIndex].heightPx - SIZE_STEP),
          });
          return;
        }
        next = findNextVisibleCell(table, position.rowIndex, position.cellIndex, -1, 0);
        break;
      case "+":
      case "Add":
      case "NumpadAdd":
        if (mode !== "table") {
          return;
        }
        event.preventDefault();
        setEditingCellId(null);
        dispatch({ type: "merge-selected-cells" });
        return;
      case "-":
      case "Subtract":
      case "NumpadSubtract":
        if (mode !== "table") {
          return;
        }
        event.preventDefault();
        setEditingCellId(null);
        dispatch({ type: "split-cell" });
        return;
      case "Tab":
        if (mode !== "table") {
          return;
        }
        next = findNextVisibleCell(table, position.rowIndex, position.cellIndex, 0, event.shiftKey ? -1 : 1, {
          wrapHorizontal: true,
        });
        break;
      case "Enter":
        if (mode !== "table") {
          return;
        }
        next = findNextVisibleCell(table, position.rowIndex, position.cellIndex, event.shiftKey ? -1 : 1, 0);
        break;
      default:
        return;
    }

    if (!next) {
      return;
    }

    event.preventDefault();
    setEditingCellId(null);
    moveSelection(next.cell.id, { extendRange: extendRange && event.key.startsWith("Arrow") });
  };

  useEffect(() => {
    keyboardHandlerRef.current = handleKeyboardNavigation;
  });

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement?.closest("textarea, input, select, button")) {
        return;
      }
      if (tableRef.current && activeElement && tableRef.current.contains(activeElement)) {
        return;
      }
      keyboardHandlerRef.current(event);
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, []);

  return (
    <table
      ref={tableRef}
      tabIndex={mode === "table" ? 0 : -1}
      className={`editor-table${mode === "table" ? " is-keyboard-mode" : ""}`}
      onKeyDown={handleKeyboardNavigation}
    >
      <colgroup>
        {table.columnWidths.map((width, index) => (
          <col key={`${table.id}-col-${index}`} style={{ width }} />
        ))}
      </colgroup>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={row.id} style={{ height: row.heightPx }}>
            {row.cells.map((cell, cellIndex) => {
              if (cell.isMerged) {
                return null;
              }

              const isActive = selection.cellId === cell.id;
              const isCtrlSelected = selection.multiCellIds.includes(cell.id);
              const firstTextContent = cell.contents.find((content) => content.type === "text");
              const firstTextContentId = firstTextContent?.id ?? null;
              const isEditingText =
                editingCellId === cell.id &&
                !!firstTextContentId &&
                selection.contentId === firstTextContentId;
              const isInRange =
                !!selectionBounds &&
                rowIndex >= selectionBounds.startRow &&
                rowIndex <= selectionBounds.endRow &&
                cellIndex >= selectionBounds.startCol &&
                cellIndex <= selectionBounds.endCol;

              return (
                <td
                  key={cell.id}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`${isActive ? "is-selected" : ""}${isInRange ? " is-range-selected" : ""}${isCtrlSelected ? " is-multi-selected" : ""}`}
                  style={{
                    height: row.heightPx,
                    minHeight: row.heightPx,
                    background: cell.style.backgroundColor,
                    textAlign: cell.style.textAlign,
                    verticalAlign: cell.style.verticalAlign,
                    fontSize: cell.style.fontSize,
                    fontWeight: cell.style.fontWeight,
                    borderTop: cell.style.border.top ? "1px solid #111827" : "0",
                    borderRight: cell.style.border.right ? "1px solid #111827" : "0",
                    borderBottom: cell.style.border.bottom ? "1px solid #111827" : "0",
                    borderLeft: cell.style.border.left ? "1px solid #111827" : "0",
                  }}
                  onPointerDown={(event) => {
                    if (mode === "table" && event.ctrlKey) {
                      setEditingCellId(null);
                      dispatch({ type: "toggle-multi-cell", tableId: table.id, cellId: cell.id });
                      tableRef.current?.focus();
                      return;
                    }

                    if (mode === "table") {
                      setEditingCellId(null);
                      dispatch({ type: "select-cell", tableId: table.id, cellId: cell.id });
                      tableRef.current?.focus();
                      return;
                    }

                    setEditingCellId(cell.id);
                    dispatch({ type: "select-cell", tableId: table.id, cellId: cell.id });
                  }}
                  onDoubleClick={() => {
                    if (mode !== "input") {
                      return;
                    }
                    setEditingCellId(cell.id);
                    dispatch({ type: "select-cell", tableId: table.id, cellId: cell.id });
                  }}
                >
                  <div className="cell-inner">
                    {cell.contents.map((content) => (
                      <div
                        key={content.id}
                        className={`cell-content-item${selection.contentId === content.id ? " is-content-selected" : ""}`}
                        onPointerDown={(event) => {
                          if (mode === "table") {
                            return;
                          }
                          event.stopPropagation();
                          dispatch({
                            type: "select-content",
                            tableId: table.id,
                            cellId: cell.id,
                            contentId: content.id,
                          });
                        }}
                      >
                        <CellContentRenderer
                          content={content}
                          isEditing={mode === "input" && isEditingText && content.id === firstTextContentId}
                          onTextChange={(value) => dispatch({ type: "update-cell-text", text: value })}
                        />
                      </div>
                    ))}
                    {mode === "input" && editingCellId === cell.id && !firstTextContent ? (
                      <textarea
                        className="cell-text-editor"
                        value=""
                        placeholder="여기에 입력하세요. Enter로 줄바꿈할 수 있습니다."
                        onChange={(event) => dispatch({ type: "update-cell-text", text: event.target.value })}
                        onPointerDown={(event) => event.stopPropagation()}
                      />
                    ) : null}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
