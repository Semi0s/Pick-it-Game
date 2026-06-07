import { NextResponse } from "next/server";
import { AVATAR_IMAGE_UPLOAD_POLICY } from "@/lib/image-upload-config";
import { validateImageUploadFile } from "@/lib/image-upload-validation";
import { isMissingStorageBucketError } from "@/lib/schema-safety";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const AVATAR_BUCKET = "avatars";
const LEGACY_AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, message: "You must be signed in to upload an avatar." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Choose an image file first." }, { status: 400 });
  }

  const validation = await validateImageUploadFile(file, AVATAR_IMAGE_UPLOAD_POLICY);
  if (!validation.ok) {
    return NextResponse.json(validation, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  await removeKnownAvatarObjects(adminSupabase, user.id);

  const objectPath = `${user.id}.${validation.value.extension}`;
  const { error: uploadError } = await adminSupabase.storage.from(AVATAR_BUCKET).upload(objectPath, validation.value.bytes, {
    upsert: true,
    contentType: validation.value.mimeType,
    cacheControl: "3600"
  });

  if (uploadError) {
    if (isMissingStorageBucketError(uploadError.message, AVATAR_BUCKET)) {
      return NextResponse.json(
        { ok: false, message: "Avatar uploads are not available yet. Apply the avatar storage migration first." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: false, message: uploadError.message }, { status: 400 });
  }

  const { data: publicUrlData } = adminSupabase.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
  const { error: profileError } = await adminSupabase.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);

  if (profileError) {
    await removeKnownAvatarObjects(adminSupabase, user.id);
    return NextResponse.json({ ok: false, message: profileError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    avatarUrl,
    message: "Avatar updated."
  });
}

async function removeKnownAvatarObjects(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const paths = LEGACY_AVATAR_EXTENSIONS.map((extension) => `${userId}.${extension}`);
  const { error } = await adminSupabase.storage.from(AVATAR_BUCKET).remove(paths);
  if (error && !error.message.toLowerCase().includes("not found") && !isMissingStorageBucketError(error.message, AVATAR_BUCKET)) {
    console.warn("Could not clear previous avatar objects.", error.message);
  }
}
