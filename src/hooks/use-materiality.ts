import {
  fetchMaterialityState,
  type MaterialityWorkspaceState,
} from "@/api/materiality";
import { useCallback, useEffect, useState } from "react";

export function useMateriality() {
  const [state, setState] = useState<MaterialityWorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMaterialityState();
      setState(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load Materiality Assessment state",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchMaterialityState()
      .then((data) => {
        if (active) {
          setState(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load Materiality Assessment state",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    state,
    setState,
    loading,
    error,
    reload,
  };
}
