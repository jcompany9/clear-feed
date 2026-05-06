import { CellContent, DocumentTextBlock, FormDocument, TableCell, TableModel } from "../types";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escapeTextWithBreaks = (value: string) => escapeHtml(value).replace(/\n/g, "<br />");

const indent = (depth: number) => "  ".repeat(depth);

const EXPORT_CSS = `
.fe-document {
  width: 100%;
  color: #111827;
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  line-height: 1.45;
}

.fe-page-portrait {
  max-width: 794px;
}

.fe-page-landscape {
  max-width: 1123px;
}

.fe-text-block {
  margin-bottom: 14px;
  white-space: normal;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.6;
}

.fe-table {
  width: 100%;
  margin-bottom: 14px;
  border-collapse: collapse;
  table-layout: fixed;
  background: #ffffff;
}

.fe-cell {
  position: relative;
  padding: 3px 5px;
  word-break: break-word;
}

.fe-align-left {
  text-align: left;
}

.fe-align-center {
  text-align: center;
}

.fe-align-right {
  text-align: right;
}

.fe-valign-top {
  vertical-align: top;
}

.fe-valign-middle {
  vertical-align: middle;
}

.fe-valign-bottom {
  vertical-align: bottom;
}

.fe-bold {
  font-weight: 700;
}

.fe-text {
  display: inline-block;
  min-height: 1.4em;
  white-space: pre-wrap;
  word-break: break-word;
}

.fe-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 31px;
  padding: 5px 7px;
  border: 1px solid #c2ccd8;
  border-radius: 6px;
  background: #f8fafc;
  font: inherit;
  color: #111827;
}

.fe-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.fe-checkbox input {
  margin: 0;
}

.fe-signature {
  min-height: 40px;
  border: 1px dashed #64748b;
  display: grid;
  place-items: center;
  color: #475569;
}
`.trim();

const renderContent = (content: CellContent) => {
  const binding = content.binding?.key ? ` data-binding="${escapeHtml(content.binding.key)}"` : "";

  switch (content.type) {
    case "text":
      return `<span class="fe-text"${binding}>${escapeTextWithBreaks(content.text)}</span>`;
    case "input-text":
      return `<input class="fe-input fe-input-text" type="text" placeholder="${escapeHtml(content.placeholder)}"${binding} />`;
    case "input-date":
      return `<input class="fe-input fe-input-date" type="date"${binding} />`;
    case "checkbox":
      return `<label class="fe-checkbox"${binding}><input type="checkbox"${content.checked ? " checked" : ""} /> <span>${escapeHtml(content.label)}</span></label>`;
    case "signature":
      return `<div class="fe-signature"${binding}><span>${escapeHtml(content.label)}</span></div>`;
    default:
      return "";
  }
};

const getRenderedCellWidth = (table: TableModel, cell: TableCell) =>
  table.columnWidths.slice(cell.colIndex, cell.colIndex + cell.colspan).reduce((sum, width) => sum + width, 0);

const getRenderedCellHeight = (table: TableModel, cell: TableCell) => {
  const rowIndex = table.rows.findIndex((row) => row.id === cell.rowId);
  if (rowIndex < 0) {
    return cell.style.minHeightPx;
  }

  return table.rows
    .slice(rowIndex, rowIndex + cell.rowspan)
    .reduce((sum, row) => sum + row.heightPx, 0);
};

const renderCell = (table: TableModel, cell: TableCell) => {
  if (cell.isMerged) {
    return "";
  }

  const renderedWidth = getRenderedCellWidth(table, cell);
  const renderedHeight = getRenderedCellHeight(table, cell);

  const classes = [
    "fe-cell",
    `fe-align-${cell.style.textAlign}`,
    `fe-valign-${cell.style.verticalAlign}`,
    cell.style.fontWeight === 700 ? "fe-bold" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const styleTokens = [
    `width:${renderedWidth}px`,
    `height:${renderedHeight}px`,
    `min-height:${renderedHeight}px`,
    `font-size:${cell.style.fontSize}px`,
    cell.style.backgroundColor ? `background:${cell.style.backgroundColor}` : "",
    `border-top:${cell.style.border.top ? "1px solid #111827" : "0"}`,
    `border-right:${cell.style.border.right ? "1px solid #111827" : "0"}`,
    `border-bottom:${cell.style.border.bottom ? "1px solid #111827" : "0"}`,
    `border-left:${cell.style.border.left ? "1px solid #111827" : "0"}`,
  ]
    .filter(Boolean)
    .join(";");

  const attrs = [
    cell.colspan > 1 ? ` colspan="${cell.colspan}"` : "",
    cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : "",
    styleTokens ? ` style="${styleTokens}"` : "",
  ].join("");

  return [
    `${indent(4)}<td class="${classes}"${attrs}>`,
    ...cell.contents.map((content) => `${indent(5)}${renderContent(content)}`),
    `${indent(4)}</td>`,
  ].join("\n");
};

const renderTextBlock = (block: DocumentTextBlock) =>
  [
    `${indent(3)}<div class="fe-text-block">`,
    `${indent(4)}${escapeTextWithBreaks(block.text) || "&nbsp;"}`,
    `${indent(3)}</div>`,
  ].join("\n");

export const exportDocumentToHtml = (document: FormDocument) => {
  const pageClass = document.page.orientation === "portrait" ? "fe-page-portrait" : "fe-page-landscape";
  const textBlocks = document.textBlocks.map(renderTextBlock).join("\n");
  const tables = document.tables
    .map((table) => {
      const colgroup = table.columnWidths.map((width) => `${indent(5)}<col style="width:${width}px" />`).join("\n");

      const rows = table.rows
        .map((row) => {
          const cells = row.cells.map((cell) => renderCell(table, cell)).filter(Boolean).join("\n");

          return [`${indent(4)}<tr style="height:${row.heightPx}px">`, cells, `${indent(4)}</tr>`].join("\n");
        })
        .join("\n");

      return [
        `${indent(3)}<table class="fe-table" data-table-id="${table.id}">`,
        `${indent(4)}<colgroup>`,
        colgroup,
        `${indent(4)}</colgroup>`,
        `${indent(4)}<tbody>`,
        rows,
        `${indent(4)}</tbody>`,
        `${indent(3)}</table>`,
      ].join("\n");
    })
    .join("\n");

  return [
    "<!DOCTYPE html>",
    '<html lang="ko">',
    `${indent(1)}<head>`,
    `${indent(2)}<meta charset="utf-8" />`,
    `${indent(2)}<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `${indent(2)}<title>${escapeHtml(document.title)}</title>`,
    `${indent(2)}<style>`,
    ...EXPORT_CSS.split("\n").map((line) => `${indent(3)}${line}`),
    `${indent(2)}</style>`,
    `${indent(1)}</head>`,
    `${indent(1)}<body>`,
    `${indent(2)}<div class="fe-document ${pageClass}">`,
    textBlocks,
    tables,
    `${indent(2)}</div>`,
    `${indent(1)}</body>`,
    "</html>",
  ]
    .filter((line, index, lines) => {
      if (line !== "") {
        return true;
      }
      return lines[index - 1] !== "";
    })
    .join("\n");
};
