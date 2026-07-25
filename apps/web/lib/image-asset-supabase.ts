import "server-only";
import { z } from "zod";
import {
  type ImageAssetPersistencePort,
  type ImageObjectUploadState,
} from "./image-asset-persistence";
import { createSupabaseServiceClient } from "./supabase/service";

function isExistingObjectError(error: { message: string; statusCode?: string | number }) {
  return Number(error.statusCode) === 409 || /already exists|duplicate/i.test(error.message);
}

export class SupabaseImageAssetPersistencePort implements ImageAssetPersistencePort {
  private readonly client = createSupabaseServiceClient();

  async upload(path: string, bytes: Buffer): Promise<ImageObjectUploadState> {
    const { error } = await this.client.storage.from("generated-images").upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: false,
    });
    if (!error) return "uploaded";
    if (isExistingObjectError(error)) return "exists";
    throw new Error("The generated image could not be stored.");
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const { error } = await this.client.storage.from("generated-images").remove(paths);
    if (error) {
      throw new Error("Generated image cleanup failed after persistence rollback.");
    }
  }

  async persist(payload: Record<string, unknown>) {
    const { data, error } = await this.client.rpc("persist_image_asset", { payload }).single();
    if (error) {
      throw new Error(
        ["23505", "40001"].includes(error.code ?? "")
          ? "The image request conflicted with an existing request or post version."
          : "The generated image record could not be persisted.",
      );
    }
    return z.unknown().parse(data);
  }

  async persistOverride(payload: Record<string, unknown>) {
    const { data, error } = await this.client
      .rpc("override_image_validation", { payload })
      .single();
    if (error) {
      throw new Error(
        error.code === "23505"
          ? "The image override key was reused with different content."
          : "The image validation override could not be persisted.",
      );
    }
    return z.unknown().parse(data);
  }
}
