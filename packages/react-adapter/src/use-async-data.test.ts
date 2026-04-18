// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAsyncData } from "./use-async-data";

describe("useAsyncData", () => {
  it("starts with initial data, not loading, no error", () => {
    const { result } = renderHook(() => useAsyncData({ count: 0 }));

    expect(result.current.data).toEqual({ count: 0 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("startLoading and endLoading toggle isLoading", () => {
    const { result } = renderHook(() => useAsyncData("idle"));

    act(() => {
      result.current.port.startLoading();
    });
    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.port.endLoading();
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("displayData updates data", () => {
    const { result } = renderHook(() => useAsyncData(0));

    act(() => {
      result.current.port.displayData(42);
    });
    expect(result.current.data).toBe(42);
  });

  it("displayError sets error", () => {
    const { result } = renderHook(() => useAsyncData(0));

    const err = new Error("failed");
    act(() => {
      result.current.port.displayError(err);
    });
    expect(result.current.error).toBe(err);
  });

  it("supports custom error type", () => {
    interface AppError {
      code: string;
    }

    const { result } = renderHook(() => useAsyncData<number, AppError>(0));

    const err: AppError = { code: "E_TEST" };
    act(() => {
      result.current.port.displayError(err);
    });
    expect(result.current.error).toEqual({ code: "E_TEST" });
  });

  it("exposes a port that matches AsyncDataInteractionPort shape", () => {
    const { result } = renderHook(() => useAsyncData("x"));

    const { port } = result.current;
    expect(typeof port.startLoading).toBe("function");
    expect(typeof port.endLoading).toBe("function");
    expect(typeof port.displayData).toBe("function");
    expect(typeof port.displayError).toBe("function");
  });
});
