import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TileView from "./components/Tile/TileView";
import StickyNote from "./components/Sticky/StickyNote";
import "./index.css";

// Disable the WebView's default context menu. A custom app menu can be mounted here later.
window.addEventListener("contextmenu", (event) => event.preventDefault());

const params = new URLSearchParams(window.location.search);
const isTile = params.get("tile") === "1";
const stickyNoteId = params.get("sticky");

let content: React.ReactNode;
if (stickyNoteId) {
  content = <StickyNote noteId={stickyNoteId} />;
} else if (isTile) {
  content = <TileView />;
} else {
  content = <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {content}
  </React.StrictMode>,
);
