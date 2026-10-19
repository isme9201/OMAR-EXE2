import {
  createUploadLink,
  invokeAvenmediaFunction,
  revokeUploadLink,
} from "@/lib/avenmedia";
import {
  uploadCloudinaryChunks,
  type CloudinaryAsset,
  type CloudinarySignedUpload,
  type CloudinaryUploadProgress,
} from "@/lib/cloudinary-chunked-upload";

type UploadProgress = {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  percent: number;
};

type UploadOutcome = {
  uploaded: string[];
  failed: Array<{ file: File; error: string }>;
  cleanupError?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر رفع الملف.";
}

export async function uploadTaskAttachments(
  taskId: string,
  taskLabel: string,
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadOutcome> {
  if (!files.length) return { uploaded: [], failed: [] };

  const linkResult = await createUploadLink({
    clientName: `مرفقات المهمة: ${taskLabel}`.slice(0, 150),
    taskId,
    ttlHours: 1,
  });
  const link = linkResult.data;
  const token = link?.token;
  if (linkResult.error || !link || !token) {
    const message = linkResult.error || "تعذر إنشاء جلسة رفع آمنة.";
    return { uploaded: [], failed: files.map((file) => ({ file, error: message })) };
  }

  const uploaded: string[] = [];
  const failed: UploadOutcome["failed"] = [];
  let cleanupError = "";

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const signedResult = await invokeAvenmediaFunction<CloudinarySignedUpload & { taskId?: string }>(
          "cloudinary-upload",
          { action: "sign_upload", token },
        );
        const signed = signedResult.data;
        if (signedResult.error || !signed?.cloudName || !signed.apiKey || !signed.signature) {
          throw new Error(signedResult.error || "تعذر الحصول على توقيع الرفع الآمن.");
        }

        const asset = await uploadCloudinaryChunks(
          file,
          signed,
          (progress: CloudinaryUploadProgress) => {
            onProgress?.({
              fileName: file.name,
              fileIndex: index,
              totalFiles: files.length,
              percent: Math.round(((index + progress.percent / 100) / files.length) * 100),
            });
          },
        );

        const completed = await invokeAvenmediaFunction<{ upload?: { id?: string } }>(
          "cloudinary-upload",
          { action: "complete_upload", token, asset: asset as CloudinaryAsset, fileName: file.name },
        );
        if (completed.error || !completed.data?.upload) {
          throw new Error(completed.error || "رُفع الملف لكن تعذر تسجيله في سجل المرفقات.");
        }
        uploaded.push(file.name);
        onProgress?.({ fileName: file.name, fileIndex: index, totalFiles: files.length, percent: Math.round(((index + 1) / files.length) * 100) });
      } catch (error) {
        failed.push({ file, error: errorMessage(error) });
      }
    }
  } finally {
    const revoked = await revokeUploadLink(link.id);
    if (revoked.error) cleanupError = revoked.error;
  }

  return { uploaded, failed, ...(cleanupError ? { cleanupError } : {}) };
}
