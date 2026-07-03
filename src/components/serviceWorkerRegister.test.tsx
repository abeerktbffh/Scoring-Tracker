// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ServiceWorkerRegister", () => {
  it("registers /sw.js on window load when serviceWorker is supported", () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegister />);
    window.dispatchEvent(new Event("load"));

    expect(register).toHaveBeenCalledWith("/sw.js");

    // @ts-expect-error cleaning up test-only override
    delete navigator.serviceWorker;
  });

  it("renders nothing and does not throw when serviceWorker is unsupported", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    // @ts-expect-error simulating an unsupported browser
    delete navigator.serviceWorker;

    const { container } = render(<ServiceWorkerRegister />);
    expect(container.innerHTML).toBe("");

    window.dispatchEvent(new Event("load"));

    if (original) Object.defineProperty(navigator, "serviceWorker", original);
  });
});
