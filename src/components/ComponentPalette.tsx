import { useState, type Dispatch } from "react";
import { EditorAction } from "../state/editorReducer";
import { CellContentType } from "../types";

const contentOptions: Array<{ type: CellContentType; label: string }> = [
  { type: "text", label: "텍스트" },
  { type: "input-text", label: "한 줄 입력" },
  { type: "input-date", label: "날짜 입력" },
  { type: "checkbox", label: "체크박스" },
  { type: "signature", label: "서명란" },
];

interface ComponentPaletteProps {
  dispatch: Dispatch<EditorAction>;
}

export function ComponentPalette({ dispatch }: ComponentPaletteProps) {
  const [selectedType, setSelectedType] = useState<CellContentType>("text");

  return (
    <aside className="panel panel--left">
      <div className="panel__header">간편 메뉴</div>
      <div className="panel__body palette">
        <section className="menu-section">
          <div className="menu-section__title">파일</div>
          <div className="menu-card">
            <div className="menu-card__label">내보내기</div>
            <p className="menu-card__desc">현재 HTML은 화면 아래의 내보내기 패널에서 바로 복사할 수 있습니다.</p>
          </div>
        </section>

        <section className="menu-section">
          <div className="menu-section__title">입력</div>
          <div className="menu-card">
            <label className="menu-card__label" htmlFor="content-type-select">
              입력 요소 선택
            </label>
            <select
              id="content-type-select"
              className="menu-select"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as CellContentType)}
            >
              {contentOptions.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
            <button onClick={() => dispatch({ type: "add-content", contentType: selectedType })}>선택 요소 추가</button>
          </div>
        </section>

        <section className="menu-section">
          <div className="menu-section__title">서식</div>
          <div className="menu-card">
            <div className="menu-card__label">빠른 안내</div>
            <p className="menu-card__desc">셀 드래그로 다중 선택 후 상단의 "선택 셀 병합" 버튼을 사용하세요.</p>
            <p className="menu-card__desc">셀 오른쪽과 아래쪽 파란 손잡이로 열 너비와 행 높이를 마우스로 조정할 수 있습니다.</p>
          </div>
        </section>
      </div>
    </aside>
  );
}
