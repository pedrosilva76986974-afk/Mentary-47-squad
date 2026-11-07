import { useEffect, useState, type MouseEvent } from "react";
import { App } from "../pages/App.js";
import { QuestionBank } from "../pages/QuestionBank.js";

/** Keep the upload/review mounted while navigating so files, requests and edits survive. */
export function Workspace() {
  const [bank, setBank] = useState(() => new URLSearchParams(window.location.search).has("bank"));
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
    window.history.pushState(null, "", href);
    const next = href === "/?bank=1";
    setBank(next);
    window.scrollTo(0, 0);
  }
  return <div onClick={navigate}>
    <div hidden={bank}><App /></div>
    {bank && <QuestionBank />}
  </div>;
}
