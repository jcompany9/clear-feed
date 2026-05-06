export type PageOrientation = "portrait" | "landscape";
export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";
export type CellContentType = "text" | "input-text" | "input-date" | "checkbox" | "signature";
export type EditorMode = "table" | "input";

export interface BorderStyle {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface PageSettings {
  orientation: PageOrientation;
  widthMm: number;
  heightMm: number;
  paddingMm: number;
}

export interface BindingMeta {
  key: string;
  label?: string;
}

export interface CellStyle {
  widthPx?: number;
  minHeightPx: number;
  fontSize: number;
  fontWeight: 400 | 700;
  textAlign: HorizontalAlign;
  verticalAlign: VerticalAlign;
  backgroundColor: string;
  border: BorderStyle;
}

export interface CellContentBase {
  id: string;
  type: CellContentType;
  binding?: BindingMeta;
}

export interface TextContent extends CellContentBase {
  type: "text";
  text: string;
}

export interface InputTextContent extends CellContentBase {
  type: "input-text";
  placeholder: string;
}

export interface InputDateContent extends CellContentBase {
  type: "input-date";
}

export interface CheckboxContent extends CellContentBase {
  type: "checkbox";
  label: string;
  checked: boolean;
}

export interface SignatureContent extends CellContentBase {
  type: "signature";
  label: string;
}

export type CellContent =
  | TextContent
  | InputTextContent
  | InputDateContent
  | CheckboxContent
  | SignatureContent;

export interface TableCell {
  id: string;
  rowId: string;
  colIndex: number;
  colspan: number;
  rowspan: number;
  isMerged: boolean;
  mergedInto?: string;
  style: CellStyle;
  contents: CellContent[];
}

export interface TableRow {
  id: string;
  heightPx: number;
  cells: TableCell[];
}

export interface TableModel {
  id: string;
  name: string;
  columnWidths: number[];
  rows: TableRow[];
}

export interface DocumentTextBlock {
  id: string;
  type: "text-block";
  text: string;
}

export interface FormDocument {
  id: string;
  title: string;
  page: PageSettings;
  textBlocks: DocumentTextBlock[];
  tables: TableModel[];
}

export interface EditorSelection {
  blockId: string | null;
  tableId: string | null;
  cellId: string | null;
  contentId: string | null;
  anchorCellId: string | null;
  focusCellId: string | null;
  multiCellIds: string[];
}

export interface EditorState {
  document: FormDocument;
  selection: EditorSelection;
  mode: EditorMode;
}
