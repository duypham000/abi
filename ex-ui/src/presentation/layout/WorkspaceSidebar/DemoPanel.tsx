import { LayoutToolbar } from "../LayoutToolbar/LayoutToolbar";
import "./DemoPanel.scss";

export function DemoPanel() {
  return (
    <div className="demo-panel">
      <div className="demo-panel__header">
        <span className="demo-panel__title">Demo</span>
      </div>
      <div className="demo-panel__body">
        <p className="demo-panel__desc">Layout Toolbar — all layout controls</p>
        <div className="demo-panel__toolbar-wrap">
          <LayoutToolbar />
        </div>
      </div>
    </div>
  );
}
