import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../../src/data.js";

const limited = () => Object.assign(new Error("limited"), { status: 429 });

describe("withRetry", () => {
  it("tries again after a rate-limit answer", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(limited())
      .mockResolvedValueOnce("ok");
    await expect(withRetry(request, { wait: 1 })).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("also tries again when a request inside a batch was limited", async () => {
    const batchLimited = Object.assign(new Error("batch"), {
      status: 400,
      data: { requests: { 20: { response: { status: 429 } } } },
    });
    const request = vi
      .fn()
      .mockRejectedValueOnce(batchLimited)
      .mockResolvedValueOnce("ok");
    await expect(withRetry(request, { wait: 1 })).resolves.toBe("ok");
  });

  it("gives up after the last try and passes other errors straight on", async () => {
    const always = vi.fn().mockRejectedValue(limited());
    await expect(withRetry(always, { tries: 3, wait: 1 })).rejects.toThrow(
      "limited",
    );
    expect(always).toHaveBeenCalledTimes(3);

    const broken = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(withRetry(broken, { wait: 1 })).rejects.toThrow("bad");
    expect(broken).toHaveBeenCalledTimes(1);
  });
});
