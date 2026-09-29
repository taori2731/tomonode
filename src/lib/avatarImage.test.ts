import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarImageError, MAX_AVATAR_SOURCE_BYTES, prepareAvatarUpload } from "./avatarImage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareAvatarUpload", () => {
  it("rejects unsupported and oversized source files before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(prepareAvatarUpload({ type: "image/svg+xml", size: 100 } as File)).rejects.toEqual(new AvatarImageError("type"));
    await expect(prepareAvatarUpload({ type: "image/jpeg", size: MAX_AVATAR_SOURCE_BYTES + 1 } as File)).rejects.toEqual(new AvatarImageError("size"));
    expect(decode).not.toHaveBeenCalled();
  });

  it("center-crops a normal photo and compresses the synchronized bytes below the server limit", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    let attempt = 0;
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      attempt += 1;
      callback(new Blob([new Uint8Array(attempt === 1 ? 150 * 1024 : 72 * 1024)], { type: "image/webp" }));
    });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 600, height: 400, close })));

    const prepared = await prepareAvatarUpload(new File([new Uint8Array(2 * 1024 * 1024)], "photo.jpg", { type: "image/jpeg" }));

    expect(prepared.mimeType).toBe("image/webp");
    expect(prepared.preview).toBe(`data:image/webp;base64,${prepared.dataBase64}`);
    expect(atob(prepared.dataBase64)).toHaveLength(72 * 1024);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 400, 400, 0, 0, 320, 320);
    expect(attempt).toBe(2);
    expect(close).toHaveBeenCalledOnce();
    getContext.mockRestore();
    toBlob.mockRestore();
  });

  it("reports an unreadable image without uploading it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode failed")));
    await expect(prepareAvatarUpload(new File(["bad"], "bad.png", { type: "image/png" })))
      .rejects.toEqual(new AvatarImageError("decode"));
  });
});
