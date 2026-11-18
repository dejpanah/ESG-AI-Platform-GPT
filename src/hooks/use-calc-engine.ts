import {
  addCalcRecord,
  deleteCalcRecord,
  fetchCalcEngine,
  updateCalcConfig,
  type CalcEngineSlug,
  type CalcEngineView,
} from "@/api/calc-engines";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function useCalcEngine(slug: CalcEngineSlug) {
  const [view, setView] = useState<CalcEngineView | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCalcEngine(slug);
      setView(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    fetchCalcEngine(slug)
      .then((data) => {
        if (active) {
          setView(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const addRecord = useCallback(
    async (payload: Record<string, unknown>, successMsg?: string) => {
      setMutating(true);
      try {
        const updated = await addCalcRecord(slug, payload);
        setView(updated);
        toast.success(successMsg || "Calculation record added & totals updated");
        return updated;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add record");
        return null;
      } finally {
        setMutating(false);
      }
    },
    [slug],
  );

  const removeRecord = useCallback(
    async (recordId: string) => {
      setMutating(true);
      try {
        const updated = await deleteCalcRecord(slug, recordId);
        setView(updated);
        toast.success("Record deleted & totals recalculated");
        return updated;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete record");
        return null;
      } finally {
        setMutating(false);
      }
    },
    [slug],
  );

  const patchConfig = useCallback(
    async (patch: Record<string, unknown>, successMsg?: string) => {
      setMutating(true);
      try {
        const updated = await updateCalcConfig(slug, patch);
        setView(updated);
        toast.success(successMsg || "Calculation parameters updated");
        return updated;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update config");
        return null;
      } finally {
        setMutating(false);
      }
    },
    [slug],
  );

  return {
    view,
    setView,
    loading,
    mutating,
    error,
    reload,
    addRecord,
    removeRecord,
    patchConfig,
  };
}
