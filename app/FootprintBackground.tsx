"use client";

import FootprintIcon from "@/icons/FootPrintIcon";
import { useEffect, useRef, useState } from "react";

type Footprint = {
  id: number;
  x: number;
  y: number;
  rotation: number;
  size: number;
};

export default function FootprintBackground() {
  const [footprints, setFootprints] = useState<Footprint[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const spawnFootprint = () => {
      const id = nextId.current++;

      const footprint: Footprint = {
        id,
        x: 2 + Math.random() * 94,
        y: 2 + Math.random() * 94,
        rotation: Math.random() * 360,
        size: 30 + Math.random() * 50,
      };

      setFootprints((prev) => [...prev.slice(-20), footprint]);

      setTimeout(() => {
        setFootprints((prev) => prev.filter((fp) => fp.id !== id));
      }, 2000);
    };

    const interval = setInterval(spawnFootprint, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {footprints.map((footprint) => (
        <div
          key={footprint.id}
          className="absolute animate-footprint"
          style={{
            left: `${footprint.x}%`,
            top: `${footprint.y}%`,
            transform: `rotate(${footprint.rotation}deg)`,
          }}
        >
          <FootprintIcon
            className="text-secondary/50"
            style={{ width: footprint.size, height: footprint.size }}
          />
        </div>
      ))}
    </div>
  );
}
