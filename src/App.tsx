import { useReducer } from "react";
import { A4Canvas } from "./components/A4Canvas";
import { HtmlExportPanel } from "./components/HtmlExportPanel";
import { PropertyPanel } from "./components/PropertyPanel";
import { Toolbar } from "./components/Toolbar";
import { createInitialState, editorReducer } from "./state/editorReducer";

function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialState);

  return (
    <div className="app-shell">
      <Toolbar document={state.document} dispatch={dispatch} mode={state.mode} />
      <div className="workspace">
        <PropertyPanel state={state} dispatch={dispatch} />
        <div className="center-pane">
          <A4Canvas document={state.document} selection={state.selection} dispatch={dispatch} mode={state.mode} />
          <HtmlExportPanel formDocument={state.document} />
        </div>
      </div>
    </div>
  );
}

export default App;
