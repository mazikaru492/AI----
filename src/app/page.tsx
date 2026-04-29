"use client";

import { useMemo, useState } from "react";
import { SystemSelector } from "@/components/SystemSelector";
import { SYSTEM_REGISTRY } from "@/lib/systemRegistry";

export default function Home() {
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);

  const selectedSystem = useMemo(() => {
    if (!selectedSystemId) return null;
    return SYSTEM_REGISTRY.find((system) => system.id === selectedSystemId) ?? null;
  }, [selectedSystemId]);

  if (!selectedSystem) {
    return (
      <SystemSelector
        systems={SYSTEM_REGISTRY.map(({ component, ...system }) => system)}
        onSelect={(systemId) => setSelectedSystemId(systemId)}
      />
    );
  }

  const SelectedSystem = selectedSystem.component;
  return <SelectedSystem onBack={() => setSelectedSystemId(null)} />;
}
