import { useMemo, useState, type Dispatch } from "react";
import { EditorAction } from "../state/editorReducer";
import { EditorState } from "../types";

const contentTypeLabel: Record<string, string> = {
  text: "텍스트",
  "input-text": "한 줄 입력",
  "input-date": "날짜 입력",
  checkbox: "체크박스",
  signature: "서명란",
};

interface PropertyPanelProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

export function PropertyPanel({ state, dispatch }: PropertyPanelProps) {
  const { table, row, cell } = useMemo(() => {
    const selectedTable = state.document.tables.find((item) => item.id === state.selection.tableId);
    if (!selectedTable || !state.selection.cellId) {
      return { table: selectedTable, row: undefined, cell: undefined };
    }

    for (const currentRow of selectedTable.rows) {
      const selectedCell = currentRow.cells.find((item) => item.id === state.selection.cellId);
      if (selectedCell) {
        return { table: selectedTable, row: currentRow, cell: selectedCell };
      }
    }

    return { table: selectedTable, row: undefined, cell: undefined };
  }, [state.document.tables, state.selection.cellId, state.selection.tableId]);
  const selectedContent = cell?.contents.find((content) => content.id === state.selection.contentId) ?? null;
  const firstText = cell?.contents.find((content) => content.type === "text");
  const bindingKey = selectedContent?.binding?.key ?? cell?.contents[0]?.binding?.key ?? "";
  const selectedBlock = state.document.textBlocks.find((block) => block.id === state.selection.blockId) ?? null;
  const [isMinimized, setIsMinimized] = useState(false);

  const allBordersOn = !!cell && Object.values(cell.style.border).every(Boolean);

  return (
    <aside className={`panel panel--sidebar${isMinimized ? " is-minimized" : ""}`}>
      <div className="panel__header panel__header--sidebar">
        <span>속성 패널</span>
        <button type="button" className="panel__header-action" onClick={() => setIsMinimized((value) => !value)}>
          {isMinimized ? "펼치기" : "최소화"}
        </button>
      </div>

      {!isMinimized ? (
        <div className="panel__body property-panel">
          {!cell && !selectedBlock ? (
            <div className="muted">셀이나 문단 블록을 선택하면 속성을 편집할 수 있습니다.</div>
          ) : null}

          {selectedBlock ? (
            <>
              <section className="property-section">
                <div className="property-section__title">문단</div>
                <label>
                  <span>문단 텍스트</span>
                  <textarea
                    rows={8}
                    value={selectedBlock.text}
                    onChange={(event) => dispatch({ type: "update-text-block", text: event.target.value })}
                  />
                </label>
              </section>

              <section className="property-section">
                <div className="property-section__title">상태</div>
                <div className="property-panel__status">
                  <div>현재 모드: {state.mode === "table" ? "셀 작업" : "입력 작업"}</div>
                  <div>선택 유형: 문단 블록</div>
                  <div>문단 길이: {selectedBlock.text.length}자</div>
                </div>
              </section>

              <section className="property-section">
                <div className="property-section__title">삭제</div>
                <div className="property-panel__actions">
                  <button type="button" onClick={() => dispatch({ type: "remove-selected-text-block" })}>
                    문단 삭제
                  </button>
                </div>
              </section>
            </>
          ) : null}

          {cell ? (
            <>
              <section className="property-section">
                <div className="property-section__title">입력</div>
                <label>
                  <span>텍스트</span>
                  <textarea
                    rows={4}
                    value={firstText?.text ?? ""}
                    onChange={(event) => dispatch({ type: "update-cell-text", text: event.target.value })}
                  />
                </label>

                <label>
                  <span>바인딩 키</span>
                  <input
                    type="text"
                    value={bindingKey}
                    placeholder="site_name"
                    onChange={(event) => dispatch({ type: "update-binding-key", key: event.target.value })}
                  />
                </label>
              </section>

              <section className="property-section">
                <div className="property-section__title">서식</div>
                <label>
                  <span>정렬</span>
                  <select
                    value={cell.style.textAlign}
                    onChange={(event) =>
                      dispatch({
                        type: "update-cell-style",
                        patch: { textAlign: event.target.value as typeof cell.style.textAlign },
                      })
                    }
                  >
                    <option value="left">왼쪽</option>
                    <option value="center">가운데</option>
                    <option value="right">오른쪽</option>
                  </select>
                </label>

                <label>
                  <span>글자 크기</span>
                  <input
                    type="number"
                    min={10}
                    max={40}
                    value={cell.style.fontSize}
                    onChange={(event) =>
                      dispatch({ type: "update-cell-style", patch: { fontSize: Number(event.target.value) } })
                    }
                  />
                </label>

                <label className="inline-toggle">
                  <span>굵게</span>
                  <input
                    type="checkbox"
                    checked={cell.style.fontWeight === 700}
                    onChange={(event) =>
                      dispatch({
                        type: "update-cell-style",
                        patch: { fontWeight: event.target.checked ? 700 : 400 },
                      })
                    }
                  />
                </label>

                <div className="border-grid">
                  <span className="border-grid__title">테두리</span>
                  <label className="border-grid__item border-grid__item--all">
                    <input
                      type="checkbox"
                      checked={allBordersOn}
                      onChange={(event) =>
                        dispatch({
                          type: "update-cell-style",
                          patch: {
                            border: {
                              top: event.target.checked,
                              right: event.target.checked,
                              bottom: event.target.checked,
                              left: event.target.checked,
                            },
                          },
                        })
                      }
                    />
                    <span>전체</span>
                  </label>
                  <label className="border-grid__item">
                    <input
                      type="checkbox"
                      checked={cell.style.border.top}
                      onChange={(event) =>
                        dispatch({
                          type: "update-cell-style",
                          patch: { border: { ...cell.style.border, top: event.target.checked } },
                        })
                      }
                    />
                    <span>상</span>
                  </label>
                  <label className="border-grid__item">
                    <input
                      type="checkbox"
                      checked={cell.style.border.right}
                      onChange={(event) =>
                        dispatch({
                          type: "update-cell-style",
                          patch: { border: { ...cell.style.border, right: event.target.checked } },
                        })
                      }
                    />
                    <span>우</span>
                  </label>
                  <label className="border-grid__item">
                    <input
                      type="checkbox"
                      checked={cell.style.border.bottom}
                      onChange={(event) =>
                        dispatch({
                          type: "update-cell-style",
                          patch: { border: { ...cell.style.border, bottom: event.target.checked } },
                        })
                      }
                    />
                    <span>하</span>
                  </label>
                  <label className="border-grid__item">
                    <input
                      type="checkbox"
                      checked={cell.style.border.left}
                      onChange={(event) =>
                        dispatch({
                          type: "update-cell-style",
                          patch: { border: { ...cell.style.border, left: event.target.checked } },
                        })
                      }
                    />
                    <span>좌</span>
                  </label>
                </div>

                <label>
                  <span>배경색</span>
                  <input
                    type="color"
                    value={cell.style.backgroundColor}
                    onChange={(event) =>
                      dispatch({ type: "update-cell-style", patch: { backgroundColor: event.target.value } })
                    }
                  />
                </label>
              </section>

              <section className="property-section">
                <div className="property-section__title">크기</div>
                <label>
                  <span>셀 너비</span>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={table?.columnWidths[cell.colIndex] ?? 120}
                    onChange={(event) => dispatch({ type: "update-cell-width", value: Number(event.target.value) })}
                  />
                </label>

                <label>
                  <span>셀 높이</span>
                  <input
                    type="number"
                    min={8}
                    max={200}
                    value={row?.heightPx ?? cell.style.minHeightPx}
                    onChange={(event) => dispatch({ type: "update-cell-height", value: Number(event.target.value) })}
                  />
                </label>
              </section>

              <section className="property-section">
                <div className="property-section__title">상태</div>
                <div className="property-panel__status">
                  <div>현재 모드: {state.mode === "table" ? "셀 작업" : "입력 작업"}</div>
                  <div>가로 병합: {cell.colspan}</div>
                  <div>세로 병합: {cell.rowspan}</div>
                  <div>셀 내부 요소 수: {cell.contents.length}</div>
                  <div>선택 요소: {selectedContent ? contentTypeLabel[selectedContent.type] : "없음"}</div>
                  <div>Ctrl 선택 수: {state.selection.multiCellIds.length}</div>
                </div>
              </section>

              <section className="property-section">
                <div className="property-section__title">삭제</div>
                <div className="property-panel__actions">
                  <button type="button" onClick={() => dispatch({ type: "remove-selected-content" })} disabled={!selectedContent}>
                    선택 요소 삭제
                  </button>
                  <button type="button" onClick={() => dispatch({ type: "remove-row" })}>
                    행 삭제
                  </button>
                  <button type="button" onClick={() => dispatch({ type: "remove-column" })}>
                    열 삭제
                  </button>
                </div>
              </section>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
