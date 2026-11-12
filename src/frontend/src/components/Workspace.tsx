import { useEffect, useState, type MouseEvent } from "react";
import { App } from "../pages/App.js";
import { QuestionBank } from "../pages/QuestionBank.js";
import { Assessments } from "../pages/Assessments.js";

function currentView() { const query = new URLSearchParams(window.location.search); return query.has("assessments") ? "assessments" : query.has("bank") ? "bank" : "upload"; }

/** Keep the upload/review mounted while navigating so files, requests and edits survive. */
export function Workspace() {
  const [displayMode, setDisplayMode] = useState<"pc" | "mobile">(() =>
    window.matchMedia("(max-width: 700px)").matches ? "mobile" : "pc",
  );
  const [view, setView] = useState(currentView);
  const [reviewId, setReviewId] = useState<string | undefined>(() =>
    new URLSearchParams(window.location.search).get("review") ?? undefined,
  );
  useEffect(() => {
    if (view === "assessments") document.title = "Avaliações e dashboards | Mentary";
    else if (view === "bank") document.title = "Banco de questões | Mentary";
    else window.history.replaceState(null, "", reviewId ? `/?review=${encodeURIComponent(reviewId)}` : "/");
  }, [view, reviewId]);
  useEffect(() => {
    const update = () => {
      setView(currentView());
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (href !== "/" && href !== "/?bank=1" && href !== "/?assessments=1") return;
    event.preventDefault();
    const destination = href === "/" && reviewId ? `/?review=${encodeURIComponent(reviewId)}` : href;
    window.history.pushState(null, "", destination);
    setView(currentView());
    window.scrollTo(0, 0);
  }
  return <>
    <div className="demo-toolbar">
      <span id="demo-format-label">Demonstração</span>
      <div className="demo-format-options" role="group" aria-labelledby="demo-format-label">
        <button type="button" aria-pressed={displayMode === "pc"} onClick={() => setDisplayMode("pc")}>PC</button>
        <button type="button" aria-pressed={displayMode === "mobile"} onClick={() => setDisplayMode("mobile")}>Celular</button>
      </div>
    </div>
    <div className="demo-stage">
      <div className={displayMode === "pc" ? "demo-preview demo-preview--pc" : "demo-preview demo-preview--mobile"} onClick={navigate}>
        <div hidden={view !== "upload"}><App active={view === "upload"} onReviewChange={setReviewId} /></div>
        {view === "bank" && <QuestionBank />}
        {view === "assessments" && <Assessments />}
      </div>
    </div>
  </>;
}
