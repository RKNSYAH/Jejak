import Image from "next/image";

export default function HeroImageSlot() {
    return (
        <div
            aria-hidden="true"
            data-hci-region="landing-image"
            className="relative h-36 w-full overflow-hidden rounded-[2rem_3rem_2rem_5rem] md:aspect-[6/5] md:h-auto"
        >
            {/* Insert the image here; use object-cover and an empty alt if it is decorative. */}
            <Image
                src="/hero.jpg"
                alt=""
                className="h-full w-full object-cover"
                width={600}
                height={500}
                priority
            />
        </div>
    );
}
