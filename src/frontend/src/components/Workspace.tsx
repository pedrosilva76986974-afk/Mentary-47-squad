import { useEffect, useState, type MouseEvent } from "react";
import { App } from "../pages/App.js";
import { QuestionBank } from "../pages/QuestionBank.js";

/** Keep the upload/review mounted while navigating so files, requests and edits survive. */
export function Workspace() {
  const [bank, setBank] = useState(() => new URLSearchParams(window.location.search).has("bank"));
  const [reviewId, setReviewId] = useState<string | undefined>(() =>
    new URLSearchParams(window.location.search).get("review") ?? undefined,
  );
  useEffect(() => {
    if (bank) document.title = "Banco de questões | Mentary";
    else window.history.replaceState(null, "", reviewId ? `/?review=${encodeURIComponent(reviewId)}` : "/");
  }, [bank, reviewId]);
  useEffect(() => {
    const update = () => {
      const next = new URLSearchParams(window.location.search).has("bank");
      setBank(next);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (href !== "/" && href !== "/?bank=1") return;
    event.preventDefault();
    const destination = href === "/" && reviewId ? `/?review=${encodeURIComponent(reviewId)}` : href;
    window.history.pushState(null, "", destination);
    const next = href === "/?bank=1";
    setBank(next);
    window.scrollTo(0, 0);
  }
  return <div onClick={navigate}>
    <div hidden={bank}><App active={!bank} onReviewChange={setReviewId} /></div>
    {bank && <QuestionBank />}
  </div>;
}
