import { useState, type Dispatch } from "react";
import { EditorAction } from "../state/editorReducer";
import { CellContentType, EditorMode, FormDocument } from "../types";

interface ToolbarProps {
  document: FormDocument;
  dispatch: Dispatch<EditorAction>;
  mode: EditorMode;
}

const contentOptions: Array<{ type: CellContentType; label: string }> = [
  { type: "text", label: "텍스트" },
  { type: "input-text", label: "한 줄 입력" },
  { type: "input-date", label: "날짜 입력" },
  { type: "checkbox", label: "체크박스" },
  { type: "signature", label: "서명란" },
];

const normalizeCountInput = (value: string, max: number) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const numberValue = Math.min(max, Number(digits));
  return String(numberValue);
};

const commitCountInput = (value: string, min: number, max: number) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min) {
    return String(min);
  }
  return String(Math.min(max, numberValue));
};

export function Toolbar({ document, dispatch, mode }: ToolbarProps) {
  const [rowCount, setRowCount] = useState("4");
  const [colCount, setColCount] = useState("4");
  const [selectedType, setSelectedType] = useState<CellContentType>("text");
  const rows = Number(rowCount) || 1;
  const cols = Number(colCount) || 1;

  return (
    <header className="toolbar">
      <section className="toolbar__section">
        <div className="toolbar__section-title">모드</div>
        <div className="toolbar__section-body">
          <button
            type="button"
            className={`toolbar__mode-button${mode === "table" ? " is-active" : ""}`}
            onClick={() => dispatch({ type: "set-mode", mode: "table" })}
          >
            셀 작업
          </button>
          <button
            type="button"
            className={`toolbar__mode-button${mode === "input" ? " is-active" : ""}`}
            onClick={() => dispatch({ type: "set-mode", mode: "input" })}
          >
            입력 작업
          </button>
        </div>
      </section>

      <section className="toolbar__section">
        <div className="toolbar__section-title">파일</div>
        <div className="toolbar__section-body">
          <strong className="toolbar__title">{document.title}</strong>
          <span className="toolbar__meta">{document.page.orientation === "portrait" ? "세로 A4" : "가로 A4"}</span>
          <button type="button" onClick={() => dispatch({ type: "toggle-orientation" })}>
            방향 전환
          </button>
        </div>
      </section>

      <section className="toolbar__section">
        <div className="toolbar__section-title">입력</div>
        <div className="toolbar__section-body">
          <button type="button" onClick={() => dispatch({ type: "add-text-block" })} disabled={mode !== "input"}>
            문단 추가
          </button>
          <select
            className="toolbar__select"
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value as CellContentType)}
            disabled={mode !== "input"}
          >
            {contentOptions.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => dispatch({ type: "add-content", contentType: selectedType })}
            disabled={mode !== "input"}
          >
            셀 요소 추가
          </button>
        </div>
      </section>

      <section className="toolbar__section">
        <div className="toolbar__section-title">표와 서식</div>
        <div className="toolbar__section-body">
          <label className="toolbar__field">
            <span>행</span>
            <input
              type="number"
              min={1}
              max={30}
              value={rowCount}
              onChange={(event) => setRowCount(normalizeCountInput(event.target.value, 30))}
              onBlur={() => setRowCount((value) => commitCountInput(value, 1, 30))}
            />
          </label>
          <label className="toolbar__field">
            <span>열</span>
            <input
              type="number"
              min={1}
              max={12}
              value={colCount}
              onChange={(event) => setColCount(normalizeCountInput(event.target.value, 12))}
              onBlur={() => setColCount((value) => commitCountInput(value, 1, 12))}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: "create-table",
                rows,
                cols,
              })
            }
            disabled={mode !== "table"}
          >
            새 표 만들기
          </button>
          <button type="button" onClick={() => dispatch({ type: "add-row-after" })} disabled={mode !== "table"}>
            행 추가
          </button>
          <button type="button" onClick={() => dispatch({ type: "remove-row" })} disabled={mode !== "table"}>
            행 삭제
          </button>
          <button type="button" onClick={() => dispatch({ type: "add-column-after" })} disabled={mode !== "table"}>
            열 추가
          </button>
          <button type="button" onClick={() => dispatch({ type: "remove-column" })} disabled={mode !== "table"}>
            열 삭제
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "merge-selected-cells" })}
            disabled={mode !== "table"}
          >
            선택 셀 병합
          </button>
          <button type="button" onClick={() => dispatch({ type: "split-cell" })} disabled={mode !== "table"}>
            병합 해제
          </button>
        </div>
      </section>
    </header>
  );
}
