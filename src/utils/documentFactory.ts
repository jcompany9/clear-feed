import {
  CellContent,
  CellStyle,
  DocumentTextBlock,
  FormDocument,
  PageSettings,
  TableCell,
  TableModel,
  TableRow,
} from "../types";
import { createId } from "./id";

const MM_TO_PX = 96 / 25.4;
const DEFAULT_COLUMN_WIDTH = 120;
const MIN_AUTO_COLUMN_WIDTH = 28;
const MIN_FIT_COLUMN_WIDTH = 1;

export const getPageContentWidthPx = (page: PageSettings) =>
  Math.max(120, Math.floor((page.widthMm - page.paddingMm * 2) * MM_TO_PX));

export const createAutoColumnWidths = (cols: number, maxWidthPx?: number) => {
  if (cols <= 0) {
    return [];
  }

  if (!maxWidthPx) {
    return Array.from({ length: cols }, () => DEFAULT_COLUMN_WIDTH);
  }

  const evenWidth = Math.max(MIN_AUTO_COLUMN_WIDTH, Math.floor(maxWidthPx / cols));
  const widths = Array.from({ length: cols }, () => evenWidth);
  const used = evenWidth * cols;
  let remainder = Math.max(0, maxWidthPx - used);
  let index = 0;

  while (remainder > 0) {
    widths[index % cols] += 1;
    remainder -= 1;
    index += 1;
  }

  return widths;
};

export const fitColumnWidthsToMax = (
  widths: number[],
  maxWidthPx: number,
  minWidthPx = MIN_FIT_COLUMN_WIDTH,
) => {
  if (widths.length === 0) {
    return [];
  }

  const safeMaxWidth = Math.max(widths.length * minWidthPx, Math.floor(maxWidthPx));
  const currentTotal = widths.reduce((sum, width) => sum + width, 0);
  if (currentTotal <= safeMaxWidth) {
    return widths.map((width) => Math.max(minWidthPx, Math.floor(width)));
  }

  const scale = safeMaxWidth / currentTotal;
  const nextWidths = widths.map((width) => Math.max(minWidthPx, Math.floor(width * scale)));
  let remainder = safeMaxWidth - nextWidths.reduce((sum, width) => sum + width, 0);
  let index = 0;

  while (remainder > 0) {
    nextWidths[index % nextWidths.length] += 1;
    remainder -= 1;
    index += 1;
  }

  return nextWidths;
};

export const fitTableToPageWidth = (table: TableModel, page: PageSettings): TableModel => ({
  ...table,
  columnWidths: fitColumnWidthsToMax(table.columnWidths, getPageContentWidthPx(page)),
});

export const createDefaultCellStyle = (): CellStyle => ({
  minHeightPx: 42,
  fontSize: 14,
  fontWeight: 400,
  textAlign: "center",
  verticalAlign: "middle",
  backgroundColor: "#ffffff",
  border: {
    top: true,
    right: true,
    bottom: true,
    left: true,
  },
});

export const createDefaultContent = (): CellContent => ({
  id: createId("content"),
  type: "text",
  text: "",
  binding: { key: "" },
});

export const createTextBlock = (text = ""): DocumentTextBlock => ({
  id: createId("block"),
  type: "text-block",
  text,
});

export const createCell = (rowId: string, colIndex: number): TableCell => ({
  id: createId("cell"),
  rowId,
  colIndex,
  colspan: 1,
  rowspan: 1,
  isMerged: false,
  style: createDefaultCellStyle(),
  contents: [createDefaultContent()],
});

export const createRow = (columnCount: number): TableRow => {
  const rowId = createId("row");
  return {
    id: rowId,
    heightPx: 42,
    cells: Array.from({ length: columnCount }, (_, index) => createCell(rowId, index)),
  };
};

export const createTable = (
  rows: number,
  cols: number,
  name = "새 표",
  options?: { maxWidthPx?: number },
): TableModel => ({
  id: createId("table"),
  name,
  columnWidths: createAutoColumnWidths(cols, options?.maxWidthPx),
  rows: Array.from({ length: rows }, () => createRow(cols)),
});

export const createMockDocument = (): FormDocument => {
  const page: PageSettings = {
    orientation: "portrait",
    widthMm: 210,
    heightMm: 297,
    paddingMm: 12,
  };

  return {
    id: createId("doc"),
    title: "건설 서식 편집기",
    page,
    textBlocks: [],
    tables: [],
  };
};
