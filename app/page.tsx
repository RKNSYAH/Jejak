import FootprintBackground from "./FootprintBackground";
import FootprintIcon from "@/icons/FootPrintIcon";

export default function Home() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center bg-base-100 font-sans">
      <FootprintBackground />

      <div className="relative z-10 flex flex-col items-center gap-2 px-4">
        <h1 className="text-6xl font-bold text-secondary text-center">
          Welcome to{" "}

          <span className="inline-flex items-baseline text-primary">
            <span>Je</span>

            <span className="relative inline-block">
              <span>ȷ</span>

              <FootprintIcon
                className="
                  absolute
                  left-1/2
                  top-0
                  h-[0.4em]
                  w-[0.4em]
                  -translate-x-[40%]
                  -translate-y-[30%]
                "
              />
            </span>

            <span>ak</span>
          </span>
        </h1>

        <p className="text-lg font-body font-medium text-ink-muted text-center">
          COMING SOON.
        </p>
      </div>
    </main>
  );
}
