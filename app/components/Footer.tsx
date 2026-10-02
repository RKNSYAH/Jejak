export default function Footer(){

    return (
        <footer className="bg-panel-surface sticky bottom-0 border-t border-rule text-on-surface-muted text-sm py-4 px-6 flex justify-between items-between gap-2">
            <span>© 2026 Jejak</span>
            <div className="flex gap-4">


            <a href="/privacy" className="underline">Kebijakan Privasi</a>
            <a href="/terms" className="underline">Syarat Layanan</a>
            </div>
        </footer>
    )
}