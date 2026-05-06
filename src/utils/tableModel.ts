import { TableCell, TableModel, TableRow } from "../types";
import { createCell, createDefaultContent, createRow } from "./documentFactory";

const cloneTable = (table: TableModel): TableModel => ({
  ...table,
  columnWidths: [...table.columnWidths],
  rows: table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      style: { ...cell.style },
      contents: cell.contents.map((content) => ({
        ...content,
        binding: content.binding ? { ...content.binding } : undefined,
      })),
    })),
  })),
});

export const getCellPosition = (table: TableModel, cellId: string) => {
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const cellIndex = table.rows[rowIndex].cells.findIndex((cell) => cell.id === cellId);
    if (cellIndex >= 0) {
      return { rowIndex, cellIndex };
    }
  }
  return null;
};

export const getCellById = (table: TableModel, cellId: string) =>
  table.rows.flatMap((row) => row.cells).find((cell) => cell.id === cellId);

export const getVisibleCellAt = (table: TableModel, rowIndex: number, cellIndex: number) => {
  const row = table.rows[rowIndex];
  if (!row) {
    return null;
  }
  const cell = row.cells[cellIndex];
  if (!cell || cell.isMerged) {
    return null;
  }
  return cell;
};

export const findNextVisibleCell = (
  table: TableModel,
  rowIndex: number,
  cellIndex: number,
  rowStep: number,
  colStep: number,
  options?: { wrapHorizontal?: boolean },
) => {
  let nextRow = rowIndex;
  let nextCol = cellIndex;
  const wrapHorizontal = options?.wrapHorizontal ?? false;

  while (true) {
    nextRow += rowStep;
    nextCol += colStep;

    if (rowStep === 0) {
      if (nextCol < 0) {
        if (!wrapHorizontal) {
          return null;
        }
        nextRow -= 1;
        if (nextRow < 0) {
          return null;
        }
        nextCol = table.rows[nextRow].cells.length - 1;
      }

      if (nextCol >= table.columnWidths.length) {
        if (!wrapHorizontal) {
          return null;
        }
        nextRow += 1;
        if (nextRow >= table.rows.length) {
          return null;
        }
        nextCol = 0;
      }
    }

    if (colStep === 0) {
      if (nextRow < 0 || nextRow >= table.rows.length) {
        return null;
      }
    }

    const candidate = getVisibleCellAt(table, nextRow, nextCol);
    if (candidate) {
      return { cell: candidate, rowIndex: nextRow, cellIndex: nextCol };
    }
  }
};

export const getSelectionBounds = (table: TableModel, anchorCellId: string, focusCellId: string) => {
  const anchor = getCellPosition(table, anchorCellId);
  const focus = getCellPosition(table, focusCellId);

  if (!anchor || !focus) {
    return null;
  }

  return {
    startRow: Math.min(anchor.rowIndex, focus.rowIndex),
    endRow: Math.max(anchor.rowIndex, focus.rowIndex),
    startCol: Math.min(anchor.cellIndex, focus.cellIndex),
    endCol: Math.max(anchor.cellIndex, focus.cellIndex),
  };
};

const normalizeColIndex = (rows: TableRow[]) => {
  rows.forEach((row) => {
    row.cells.forEach((cell, index) => {
      cell.colIndex = index;
      cell.rowId = row.id;
    });
  });
};

export const addRowAfter = (table: TableModel, cellId: string) => {
  const next = cloneTable(table);
  const position = getCellPosition(next, cellId);
  if (!position) {
    return next;
  }

  next.rows.splice(position.rowIndex + 1, 0, createRow(next.columnWidths.length));
  normalizeColIndex(next.rows);
  return next;
};

export const removeRow = (table: TableModel, cellId: string) => {
  const next = cloneTable(table);
  if (next.rows.length === 1) {
    return next;
  }

  const position = getCellPosition(next, cellId);
  if (!position) {
    return next;
  }

  next.rows.splice(position.rowIndex, 1);
  normalizeColIndex(next.rows);
  return next;
};

export const addColumnAfter = (table: TableModel, cellId: string) => {
  const next = cloneTable(table);
  const position = getCellPosition(next, cellId);
  if (!position) {
    return next;
  }

  next.columnWidths.splice(position.cellIndex + 1, 0, 120);
  next.rows.forEach((row) => {
    row.cells.splice(position.cellIndex + 1, 0, createCell(row.id, position.cellIndex + 1));
  });
  normalizeColIndex(next.rows);
  return next;
};

export const removeColumn = (table: TableModel, cellId: string) => {
  const next = cloneTable(table);
  if (next.columnWidths.length === 1) {
    return next;
  }

  const position = getCellPosition(next, cellId);
  if (!position) {
    return next;
  }

  next.columnWidths.splice(position.cellIndex, 1);
  next.rows.forEach((row) => {
    row.cells.splice(position.cellIndex, 1);
  });
  normalizeColIndex(next.rows);
  return next;
};

export const mergeSelectedCells = (table: TableModel, anchorCellId: string, focusCellId: string) => {
  const next = cloneTable(table);
  const bounds = getSelectionBounds(next, anchorCellId, focusCellId);
  if (!bounds) {
    return next;
  }

  const width = bounds.endCol - bounds.startCol + 1;
  const height = bounds.endRow - bounds.startRow + 1;
  if (width === 1 && height === 1) {
    return next;
  }

  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    for (let colIndex = bounds.startCol; colIndex <= bounds.endCol; colIndex += 1) {
      const cell = next.rows[rowIndex].cells[colIndex];
      if (cell.isMerged || cell.colspan > 1 || cell.rowspan > 1) {
        return next;
      }
    }
  }

  const rootCell = next.rows[bounds.startRow].cells[bounds.startCol];
  rootCell.colspan = width;
  rootCell.rowspan = height;

  for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
    for (let colIndex = bounds.startCol; colIndex <= bounds.endCol; colIndex += 1) {
      if (rowIndex === bounds.startRow && colIndex === bounds.startCol) {
        continue;
      }
      const cell = next.rows[rowIndex].cells[colIndex];
      cell.isMerged = true;
      cell.mergedInto = rootCell.id;
    }
  }

  return next;
};

export const splitCell = (table: TableModel, cellId: string) => {
  const next = cloneTable(table);
  const position = getCellPosition(next, cellId);
  if (!position) {
    return next;
  }

  const row = next.rows[position.rowIndex];
  const cell = row.cells[position.cellIndex];
  if (cell.colspan <= 1 && cell.rowspan <= 1) {
    return next;
  }

  next.rows.forEach((candidateRow) => {
    candidateRow.cells.forEach((candidate) => {
      if (candidate.mergedInto === cell.id) {
        candidate.isMerged = false;
        candidate.mergedInto = undefined;
      }
    });
  });
  cell.colspan = 1;
  cell.rowspan = 1;
  return next;
};

export const updateCell = (
  table: TableModel,
  cellId: string,
  updater: (cell: TableCell) => TableCell,
) => {
  const next = cloneTable(table);
  next.rows = next.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => (cell.id === cellId ? updater(cell) : cell)),
  }));
  return next;
};

export const replaceCellContents = (table: TableModel, cellId: string, contents: TableCell["contents"]) =>
  updateCell(table, cellId, (cell) => ({
    ...cell,
    contents: contents.length > 0 ? contents : [createDefaultContent()],
  }));
