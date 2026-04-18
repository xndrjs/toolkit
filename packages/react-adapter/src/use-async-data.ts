import type { AsyncDataInteractionPort } from "@xndrjs/orchestration";
import { useMemo, useState } from "react";

export interface UseAsyncDataResult<T, E = Error> {
  data: T;
  isLoading: boolean;
  error: E | null;
  port: AsyncDataInteractionPort<T, E>;
}

export function useAsyncData<T, E = Error>(initialData: T): UseAsyncDataResult<T, E> {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<E | null>(null);

  const port: AsyncDataInteractionPort<T, E> = useMemo(
    () => ({
      startLoading: () => {
        setLoading(true);
      },
      endLoading: () => {
        setLoading(false);
      },
      displayData: setData,
      displayError: setError,
    }),
    [setLoading, setData, setError]
  );

  return { data, isLoading, error, port };
}
