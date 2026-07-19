import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_APIKEY,
  api_secret: process.env.CLOUDINARY_CLOUD_APISECRET,
});

export interface CloudinaryAsset {
  url: string;
  publicId: string;
}

export const uploadCloudinaryAsset = async (
  file: Blob,
  options?: { folder?: string },
): Promise<CloudinaryAsset | null> => {
  if (!file) {
    return null;
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "auto", folder: options?.folder },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(
              result?.secure_url && result.public_id
                ? { url: result.secure_url, publicId: result.public_id }
                : null,
            );
          }
        },
      );
      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    return null;
  }
};

export async function deleteCloudinaryAssets(publicIds: string[]) {
  await Promise.allSettled(
    publicIds.map((publicId) => cloudinary.uploader.destroy(publicId)),
  );
}

const uploadOnCloudinary = async (file: Blob): Promise<string | null> => {
  const asset = await uploadCloudinaryAsset(file);
  return asset?.url ?? null;
};

export default uploadOnCloudinary;
