export default function Footer(){

    return (
        <footer className="bg-panel-surface border-t border-rule text-on-surface-muted text-sm py-4 px-4 md:px-6 flex flex-col-reverse items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Jejak</span>
            <div className="flex gap-4">


            <a href="/privacy" className="underline">Kebijakan Privasi</a>
            <a href="/terms" className="underline">Syarat Layanan</a>
            </div>
        </footer>
    )
}
