
import Footer from "../Footer";
import Header from "../Header";

export default function LandingPage() {
    return  (
    <div className="flex h-full min-h-0 flex-col"> 
            <Header />
            <section aria-label="Pembuka" className="flex flex-col items-center justify-center text-center px-32 py-20">
                <h1 className="text-4xl font-bold leading-tight tracking-tight">Temukan tempat tinggal yang cocok dengan rencanamu.</h1>
                <p className="mt-5 text-lg leading-relaxed">Ceritakan mau pindah ke mana dan untuk apa. Jejak menunjukkannya di peta.</p>

                <div className="mt-10 flex items-center gap-3">
                    <button className="btn btn-primary h-12 px-6 text-base">Mulai gratis </button>
                </div>
                <span className="mt-4 text-sm">Sudah punya akun? <a href="/login" className="font-semibold">Masuk</a></span>
            </section>
            <Footer />
    </div>
    )
}