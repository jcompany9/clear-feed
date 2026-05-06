import { EditorState, FormDocument, PageOrientation, TableCell, TableModel } from "../types";
import {
  createAutoColumnWidths,
  createMockDocument,
  createTextBlock,
  fitTableToPageWidth,
  getPageContentWidthPx,
} from "../utils/documentFactory";
import {
  addColumnAfter,
  addRowAfter,
  getCellById,
  mergeSelectedCells,
  removeColumn,
  removeRow,
  replaceCellContents,
  splitCell,
  updateCell,
} from "../utils/tableModel";
import { createId } from "../utils/id";

type CellStylePatch = Partial<TableCell["style"]>;

export type EditorAction =
  | { type: "set-mode"; mode: "table" | "input" }
  | { type: "select-text-block"; blockId: string }
  | { type: "add-text-block" }
  | { type: "update-text-block"; text: string }
  | { type: "remove-selected-text-block" }
  | { type: "select-cell"; tableId: string; cellId: string }
  | { type: "toggle-multi-cell"; tableId: string; cellId: string }
  | { type: "select-content"; tableId: string; cellId: string; contentId: string }
  | { type: "start-range-selection"; tableId: string; cellId: string }
  | { type: "update-range-selection"; tableId: string; cellId: string }
  | { type: "toggle-orientation" }
  | { type: "create-table"; rows?: number; cols?: number }
  | { type: "resize-column"; tableId: string; columnIndex: number; width: number }
  | { type: "resize-row"; tableId: string; rowId: string; height: number }
  | { type: "add-row-after" }
  | { type: "remove-row" }
  | { type: "add-column-after" }
  | { type: "remove-column" }
  | { type: "merge-selected-cells" }
  | { type: "split-cell" }
  | { type: "update-cell-style"; patch: CellStylePatch }
  | { type: "update-cell-text"; text: string }
  | { type: "update-binding-key"; key: string }
  | { type: "update-cell-height"; value: number }
  | { type: "update-cell-width"; value: number }
  | { type: "add-content"; contentType: TableCell["contents"][number]["type"] }
  | { type: "remove-selected-content" }
  | { type: "clear-selected-cell-contents" };

export const createInitialState = (): EditorState => {
  const document = createMockDocument();
  const initialCell = document.tables[0]?.rows[0]?.cells[0];

  return {
    document,
    mode: "table",
    selection: {
      blockId: null,
      tableId: document.tables[0]?.id ?? null,
      cellId: initialCell?.id ?? null,
      contentId: initialCell?.contents[0]?.id ?? null,
      anchorCellId: initialCell?.id ?? null,
      focusCellId: initialCell?.id ?? null,
      multiCellIds: initialCell?.id ? [initialCell.id] : [],
    },
  };
};

const createDefaultCellStyle = () => ({
  minHeightPx: 42,
  fontSize: 14,
  fontWeight: 400 as const,
  textAlign: "center" as const,
  verticalAlign: "middle" as const,
  backgroundColor: "#ffffff",
  border: {
    top: true,
    right: true,
    bottom: true,
    left: true,
  },
});

const updateTable = (document: FormDocument, tableId: string, updater: (table: TableModel) => TableModel) => ({
  ...document,
  tables: document.tables.map((table) => (table.id === tableId ? updater(table) : table)),
});

const updateTableAndFitToPage = (
  document: FormDocument,
  tableId: string,
  updater: (table: TableModel) => TableModel,
) => updateTable(document, tableId, (table) => fitTableToPageWidth(updater(table), document.page));

const updateSelectedCell = (state: EditorState, updater: (table: TableModel, cellId: string) => TableModel) => {
  const { tableId, cellId } = state.selection;
  if (!tableId || !cellId) {
    return state;
  }

  return {
    ...state,
    document: updateTable(state.document, tableId, (table) => updater(table, cellId)),
  };
};

const getSelectedCell = (state: EditorState, tableId = state.selection.tableId, cellId = state.selection.cellId) => {
  const table = state.document.tables.find((item) => item.id === tableId);
  const cell = table && cellId ? getCellById(table, cellId) : undefined;
  return { table, cell };
};

const createContentByType = (type: TableCell["contents"][number]["type"]): TableCell["contents"][number] => {
  const id = createId("content");

  switch (type) {
    case "input-text":
      return { id, type, placeholder: "텍스트 입력", binding: { key: "" } };
    case "input-date":
      return { id, type, binding: { key: "" } };
    case "checkbox":
      return { id, type, label: "확인", checked: false, binding: { key: "" } };
    case "signature":
      return { id, type, label: "서명란", binding: { key: "" } };
    case "text":
    default:
      return { id, type: "text", text: "새 텍스트", binding: { key: "" } };
  }
};

export const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case "set-mode":
      return {
        ...state,
        mode: action.mode,
      };
    case "select-text-block":
      return {
        ...state,
        selection: {
          blockId: action.blockId,
          tableId: null,
          cellId: null,
          contentId: null,
          anchorCellId: null,
          focusCellId: null,
          multiCellIds: [],
        },
      };
    case "add-text-block": {
      const nextBlock = createTextBlock("");
      return {
        ...state,
        mode: "input",
        document: {
          ...state.document,
          textBlocks: [...state.document.textBlocks, nextBlock],
        },
        selection: {
          blockId: nextBlock.id,
          tableId: null,
          cellId: null,
          contentId: null,
          anchorCellId: null,
          focusCellId: null,
          multiCellIds: [],
        },
      };
    }
    case "update-text-block":
      if (!state.selection.blockId) {
        return state;
      }

      return {
        ...state,
        document: {
          ...state.document,
          textBlocks: state.document.textBlocks.map((block) =>
            block.id === state.selection.blockId ? { ...block, text: action.text } : block,
          ),
        },
      };
    case "remove-selected-text-block":
      if (!state.selection.blockId) {
        return state;
      }

      return {
        ...state,
        document: {
          ...state.document,
          textBlocks: state.document.textBlocks.filter((block) => block.id !== state.selection.blockId),
        },
        selection: {
          ...state.selection,
          blockId: null,
        },
      };
    case "select-cell": {
      const selectedCell = getSelectedCell(state, action.tableId, action.cellId).cell;
      return {
        ...state,
        selection: {
          blockId: null,
          tableId: action.tableId,
          cellId: action.cellId,
          contentId: selectedCell?.contents[0]?.id ?? null,
          anchorCellId: action.cellId,
          focusCellId: action.cellId,
          multiCellIds: [action.cellId],
        },
      };
    }
    case "toggle-multi-cell": {
      const selectedCell = getSelectedCell(state, action.tableId, action.cellId).cell;
      const exists = state.selection.multiCellIds.includes(action.cellId);
      const nextMultiCellIds = exists
        ? state.selection.multiCellIds.filter((id) => id !== action.cellId)
        : [...state.selection.multiCellIds, action.cellId];

      return {
        ...state,
        selection: {
          blockId: null,
          tableId: action.tableId,
          cellId: action.cellId,
          contentId: selectedCell?.contents[0]?.id ?? null,
          anchorCellId: state.selection.anchorCellId ?? action.cellId,
          focusCellId: state.selection.focusCellId ?? action.cellId,
          multiCellIds: nextMultiCellIds.length > 0 ? nextMultiCellIds : [action.cellId],
        },
      };
    }
    case "select-content":
      return {
        ...state,
        selection: {
          blockId: null,
          tableId: action.tableId,
          cellId: action.cellId,
          contentId: action.contentId,
          anchorCellId: action.cellId,
          focusCellId: action.cellId,
          multiCellIds: [action.cellId],
        },
      };
    case "start-range-selection": {
      const selectedCell = getSelectedCell(state, action.tableId, action.cellId).cell;
      return {
        ...state,
        selection: {
          blockId: null,
          tableId: action.tableId,
          cellId: action.cellId,
          contentId: selectedCell?.contents[0]?.id ?? null,
          anchorCellId: action.cellId,
          focusCellId: action.cellId,
          multiCellIds: [action.cellId],
        },
      };
    }
    case "update-range-selection":
      return {
        ...state,
        selection: {
          ...state.selection,
          blockId: null,
          tableId: action.tableId,
          cellId: state.selection.anchorCellId ?? action.cellId,
          focusCellId: action.cellId,
          multiCellIds: state.selection.multiCellIds,
        },
      };
    case "toggle-orientation": {
      const current = state.document.page;
      const nextOrientation: PageOrientation = current.orientation === "portrait" ? "landscape" : "portrait";
      const nextPage = {
        ...current,
        orientation: nextOrientation,
        widthMm: nextOrientation === "portrait" ? 210 : 297,
        heightMm: nextOrientation === "portrait" ? 297 : 210,
      };

      return {
        ...state,
        document: {
          ...state.document,
          page: nextPage,
          tables: state.document.tables.map((table) => fitTableToPageWidth(table, nextPage)),
        },
      };
    }
    case "create-table": {
      const rows = action.rows ?? 3;
      const cols = action.cols ?? 3;
      const nextTable: TableModel = {
        id: createId("table"),
        name: `표 ${state.document.tables.length + 1}`,
        columnWidths: createAutoColumnWidths(cols, getPageContentWidthPx(state.document.page)),
        rows: Array.from({ length: rows }, () => {
          const rowId = createId("row");
          return {
            id: rowId,
            heightPx: 42,
            cells: Array.from({ length: cols }, (_, colIndex) => ({
              id: createId("cell"),
              rowId,
              colIndex,
              colspan: 1,
              rowspan: 1,
              isMerged: false,
              mergedInto: undefined,
              style: createDefaultCellStyle(),
              contents: [{ id: createId("content"), type: "text", text: "", binding: { key: "" } }],
            })),
          };
        }),
      };
      const initialCell = nextTable.rows[0].cells[0];

      return {
        ...state,
        mode: "table",
        document: {
          ...state.document,
          tables: [...state.document.tables, nextTable],
        },
        selection: {
          blockId: null,
          tableId: nextTable.id,
          cellId: initialCell.id,
          contentId: initialCell.contents[0]?.id ?? null,
          anchorCellId: initialCell.id,
          focusCellId: initialCell.id,
          multiCellIds: [initialCell.id],
        },
      };
    }
    case "resize-column":
      return {
        ...state,
        document: updateTableAndFitToPage(state.document, action.tableId, (table) => {
          const next = { ...table, columnWidths: [...table.columnWidths] };
          next.columnWidths[action.columnIndex] = Math.max(10, action.width);
          return next;
        }),
      };
    case "resize-row":
      return {
        ...state,
        document: updateTable(state.document, action.tableId, (table) => ({
          ...table,
          rows: table.rows.map((row) =>
            row.id === action.rowId ? { ...row, heightPx: Math.max(8, action.height) } : row,
          ),
        })),
      };
    case "add-row-after":
      return updateSelectedCell(state, addRowAfter);
    case "remove-row":
      return updateSelectedCell(state, removeRow);
    case "add-column-after": {
      const { tableId, cellId } = state.selection;
      if (!tableId || !cellId) {
        return state;
      }

      return {
        ...state,
        document: updateTableAndFitToPage(state.document, tableId, (table) => addColumnAfter(table, cellId)),
      };
    }
    case "remove-column":
      return updateSelectedCell(state, removeColumn);
    case "merge-selected-cells": {
      const { tableId, anchorCellId, focusCellId } = state.selection;
      if (!tableId || !anchorCellId || !focusCellId) {
        return state;
      }

      const nextDocument = updateTable(state.document, tableId, (table) =>
        mergeSelectedCells(table, anchorCellId, focusCellId),
      );

      return {
        ...state,
        document: nextDocument,
        selection: {
          ...state.selection,
          cellId: anchorCellId,
          anchorCellId,
          focusCellId: anchorCellId,
          multiCellIds: [anchorCellId],
        },
      };
    }
    case "split-cell":
      return updateSelectedCell(state, (table, cellId) => splitCell(table, cellId));
    case "update-cell-style":
      return updateSelectedCell(state, (table, cellId) =>
        updateCell(table, cellId, (cell) => ({
          ...cell,
          style: { ...cell.style, ...action.patch },
        })),
      );
    case "update-cell-text":
      return updateSelectedCell(state, (table, cellId) => {
        const { cell } = getSelectedCell(state);
        const currentContents = cell?.contents ?? [];
        const first = currentContents[0];
        const nextContents =
          first?.type === "text"
            ? [{ ...first, text: action.text }, ...currentContents.slice(1)]
            : [{ id: createId("content"), type: "text" as const, text: action.text, binding: { key: "" } }, ...currentContents];
        return replaceCellContents(table, cellId, nextContents);
      });
    case "update-binding-key":
      return updateSelectedCell(state, (table, cellId) => {
        const { cell } = getSelectedCell(state);
        if (!cell) {
          return table;
        }

        const nextContents = cell.contents.map((content, index) =>
          index === 0 ? { ...content, binding: { ...(content.binding ?? {}), key: action.key } } : content,
        );
        return replaceCellContents(table, cellId, nextContents);
      });
    case "update-cell-height":
      return updateSelectedCell(state, (table, cellId) => {
        const target = getCellById(table, cellId);
        if (!target) {
          return table;
        }

        const nextHeight = Math.max(8, action.value);
        return {
          ...table,
          rows: table.rows.map((row) =>
            row.id === target.rowId
              ? {
                  ...row,
                  heightPx: nextHeight,
                  cells: row.cells.map((cell) => ({
                    ...cell,
                    style: { ...cell.style, minHeightPx: nextHeight },
                  })),
                }
              : row,
          ),
        };
      });
    case "update-cell-width": {
      const { tableId, cellId } = state.selection;
      if (!tableId || !cellId) {
        return state;
      }

      return {
        ...state,
        document: updateTableAndFitToPage(state.document, tableId, (table) => {
          const target = getCellById(table, cellId);
          if (!target) {
            return table;
          }

          const next = { ...table, columnWidths: [...table.columnWidths] };
          next.columnWidths[target.colIndex] = Math.max(10, action.value);
          return next;
        }),
      };
    }
    case "add-content":
      return updateSelectedCell(state, (table, cellId) => {
        const { cell } = getSelectedCell(state);
        if (!cell) {
          return table;
        }

        return replaceCellContents(table, cellId, [...cell.contents, createContentByType(action.contentType)]);
      });
    case "remove-selected-content": {
      const { tableId, cellId, contentId } = state.selection;
      if (!tableId || !cellId || !contentId) {
        return state;
      }

      const table = state.document.tables.find((item) => item.id === tableId);
      const cell = table ? getCellById(table, cellId) : undefined;
      if (!table || !cell) {
        return state;
      }

      const nextContents = cell.contents.filter((content) => content.id !== contentId);
      const nextDocument = updateTable(state.document, tableId, (currentTable) =>
        replaceCellContents(currentTable, cellId, nextContents),
      );
      const nextTable = nextDocument.tables.find((item) => item.id === tableId);
      const nextCell = nextTable ? getCellById(nextTable, cellId) : undefined;

      return {
        ...state,
        document: nextDocument,
        selection: {
          ...state.selection,
          contentId: nextCell?.contents[0]?.id ?? null,
        },
      };
    }
    case "clear-selected-cell-contents":
      return updateSelectedCell(state, (table, cellId) =>
        replaceCellContents(table, cellId, [
          {
            id: createId("content"),
            type: "text",
            text: "",
            binding: { key: "" },
          },
        ]),
      );
    default:
      return state;
  }
};
