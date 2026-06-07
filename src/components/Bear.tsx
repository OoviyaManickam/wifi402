"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface BearProps {
  position: [number, number, number];
  color: string;
  selected: boolean;
  onClick: () => void;
  personality: "shy" | "happy" | "smug";
}

export default function Bear({ position, color, selected, onClick, personality }: BearProps) {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(Math.random() * Math.PI * 2);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    timeRef.current += delta;
    const t = timeRef.current;

    groupRef.current.position.y = position[1] + Math.sin(t * 1.4) * 0.06;
    groupRef.current.rotation.z = Math.sin(t * 0.9) * 0.04;

    if (selected) {
      groupRef.current.position.y = position[1] + Math.sin(t * 2.2) * 0.12;
      groupRef.current.rotation.z = Math.sin(t * 1.5) * 0.08;
    }
  });

  const furColor = new THREE.Color(color);
  const darkFur = furColor.clone().multiplyScalar(0.75);
  const lightFur = furColor.clone().multiplyScalar(1.2);

  const eyeY = personality === "smug" ? 0.18 : 0.22;
  const eyeRotX = personality === "smug" ? -0.3 : 0;

  const scale = selected ? 1.12 : 1.0;

  return (
    <group
      ref={groupRef}
      position={position}
      scale={[scale, scale, scale]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Body */}
      <mesh position={[0, -0.35, 0]}>
        <capsuleGeometry args={[0.38, 0.45, 8, 16]} />
        <meshStandardMaterial color={darkFur} roughness={0.95} metalness={0} />
      </mesh>

      {/* Belly */}
      <mesh position={[0, -0.28, 0.28]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color={lightFur} roughness={0.98} metalness={0} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial color={furColor} roughness={0.95} metalness={0} />
      </mesh>

      {/* Face muzzle */}
      <mesh position={[0, 0.18, 0.34]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={lightFur} roughness={0.98} metalness={0} />
      </mesh>

      {/* Left ear */}
      <mesh position={[-0.3, 0.62, 0]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color={darkFur} roughness={0.95} metalness={0} />
      </mesh>

      {/* Right ear */}
      <mesh position={[0.3, 0.62, 0]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color={darkFur} roughness={0.95} metalness={0} />
      </mesh>

      {/* Left eye */}
      <mesh position={[-0.13, eyeY + 0.28, 0.38]} rotation={[eyeRotX, 0, 0]}>
        <sphereGeometry args={[0.065, 16, 16]} />
        <meshStandardMaterial color="#1a0a00" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Left eye shine */}
      <mesh position={[-0.11, eyeY + 0.31, 0.44]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="white" roughness={0} metalness={0} />
      </mesh>

      {/* Right eye */}
      <mesh position={[0.13, eyeY + 0.28, 0.38]} rotation={[eyeRotX, 0, 0]}>
        <sphereGeometry args={[0.065, 16, 16]} />
        <meshStandardMaterial color="#1a0a00" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Right eye shine */}
      <mesh position={[0.11, eyeY + 0.31, 0.44]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="white" roughness={0} metalness={0} />
      </mesh>

      {/* Nose */}
      <mesh position={[0, 0.5, 0.42]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#3d1a0a" roughness={0.5} metalness={0} />
      </mesh>

      {/* Left arm */}
      <mesh position={[-0.44, -0.15, 0.1]} rotation={[0.2, 0, personality === "smug" ? -0.8 : -0.4]}>
        <capsuleGeometry args={[0.1, 0.28, 8, 12]} />
        <meshStandardMaterial color={darkFur} roughness={0.95} metalness={0} />
      </mesh>

      {/* Right arm */}
      <mesh position={[0.44, -0.15, 0.1]} rotation={[0.2, 0, personality === "smug" ? 0.8 : 0.4]}>
        <capsuleGeometry args={[0.1, 0.28, 8, 12]} />
        <meshStandardMaterial color={darkFur} roughness={0.95} metalness={0} />
      </mesh>

      {/* Selected glow ring */}
      {selected && (
        <mesh position={[0, -0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.58, 32]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={1.5} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}
