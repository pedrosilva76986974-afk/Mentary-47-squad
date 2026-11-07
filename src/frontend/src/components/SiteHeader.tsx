export function SiteHeader({ active = "upload" }: { active?: "upload" | "bank" }) {
  return <header className="topbar"><a className="brand" href="https://mentary.com.br/" aria-label="Mentary, site institucional"><img src="/assets/mentary-logo.png" alt="Mentary" /></a>
    <nav aria-label="Navegação principal"><a href="https://mentary.com.br/">INÍCIO</a><a href="/" className={active === "upload" ? "active" : ""}>ENVIAR MATERIAL</a><a href="/?bank=1" className={active === "bank" ? "active" : ""}>BANCO DE QUESTÕES</a></nav></header>;
}
