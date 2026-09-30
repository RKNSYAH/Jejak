import Link from "next/link";
import BrandLogo from "./BrandLogo";

export default function UserHeader() {
    return (
        <header className="navbar mx-4 my-4 flex w-auto max-w-80 flex-wrap gap-2 rounded-2xl border border-rule px-4 shadow-sm sm:mx-6" data-hci-region="user-header">
            <BrandLogo border={false} />
            <Link href="/map" className="btn btn-ghost ml-auto min-h-11 gap-1 hover:text-primary">
                <span className="text-md"> Kembali ke peta</span>
            </Link>
        </header>
    )
}
