"use client";

import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Suspense } from "react";
import { Plan } from "@/lib/plans";
import Bear from "./Bear";

interface BearSceneProps {
  plans: Plan[];
  selectedPlan: Plan;
  onSelectPlan: (plan: Plan) => void;
}

const BEAR_CONFIGS = [
  { color: "#e8c98a", personality: "shy" as const },
  { color: "#d4a96b", personality: "happy" as const },
  { color: "#c49050", personality: "smug" as const },
];

const POSITIONS: [number, number, number][] = [
  [-2.8, -0.2, 0],
  [0,     0.0, 0],
  [2.8,  -0.2, 0],
];

export default function BearScene({ plans, selectedPlan, onSelectPlan }: BearSceneProps) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas
        camera={{ position: [0, 0.8, 4.0], fov: 65 }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
          <directionalLight position={[-4, 3, -2]} intensity={0.4} color="#a855f7" />
          <pointLight position={[0, -2, 3]} intensity={0.3} color="#7c3aed" />

          <Environment preset="studio" />

          {plans.map((plan, i) => (
            <Bear
              key={plan.id}
              position={POSITIONS[i]}
              color={BEAR_CONFIGS[i].color}
              selected={selectedPlan.id === plan.id}
              onClick={() => onSelectPlan(plan)}
              personality={BEAR_CONFIGS[i].personality}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}
