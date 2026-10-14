// Everything in this module runs on the device. No photo data is sent over HTTP.
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 160 * 1024;
export const MAX_PHOTO_EDGE = 1280;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 32;

export function validatePhotos(photos = []) {
  if (!Array.isArray(photos) || photos.length > MAX_PHOTOS)
    throw Error("Invalid photos");
  return photos.map((photo) => {
    if (
      !photo ||
      typeof photo.data !== "string" ||
      photo.data.length > MAX_DATA_URL_LENGTH ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.data) ||
      !Number.isInteger(photo.width) ||
      !Number.isInteger(photo.height) ||
      photo.width < 1 ||
      photo.height < 1 ||
      photo.width > MAX_PHOTO_EDGE ||
      photo.height > MAX_PHOTO_EDGE ||
      !photo.caption ||
      typeof photo.caption.zh !== "string" ||
      typeof photo.caption.en !== "string" ||
      photo.caption.zh.length > 100000 ||
      photo.caption.en.length > 100000
    )
      throw Error("Invalid photo");
    return {
      data: photo.data,
      width: photo.width,
      height: photo.height,
      caption: { zh: photo.caption.zh, en: photo.caption.en },
    };
  });
}

export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(Error("This browser could not open the image."));
    image.src = source;
  });
}

export async function compressPhoto(file) {
  if (!file || file.size > 40 * 1024 * 1024)
    throw Error(
      "Please choose a photo smaller than 40 MB. / 请选择小于40 MB的照片。",
    );
  if (
    !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name) &&
    !/^image\/(jpeg|png|heic|heif|webp)$/i.test(file.type)
  ) {
    throw Error(
      "Choose JPG, PNG, or a browser-supported HEIC/HEIF photo. / 请选择 JPG、PNG 或浏览器支持的 HEIC/HEIF 照片。",
    );
  }
  const url = URL.createObjectURL(file);
  try {
    let image;
    try {
      image = await loadImage(url);
    } catch {
      throw Error(
        "This browser cannot open that photo. Export it as JPG or PNG and try again. HEIC/HEIF support depends on your browser. / 浏览器无法打开此照片，请转为 JPG 或 PNG 后重试。HEIC/HEIF 支持取决于浏览器。",
      );
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 60000000
    )
      throw Error("Please choose a smaller photo. / 请选择较小的照片。");
    // Native image decoding honors camera orientation; canvas removes EXIF/location metadata.
    const scale = Math.min(
      1,
      MAX_PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    let quality = 0.8;
    for (let attempt = 0; attempt < 12; attempt++) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= MAX_DATA_URL_LENGTH) return { data, width, height };
      if (quality > 0.5) quality -= 0.1;
      else {
        width = Math.max(1, Math.round(width * 0.8));
        height = Math.max(1, Math.round(height * 0.8));
        quality = 0.75;
      }
    }
    throw Error(
      "This photo could not be compressed. Please choose a smaller image. / 无法压缩此照片，请选择较小的图片。",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Confirm imported photo bytes decode and their dimensions match the bounded schema.
export async function verifyPhotoImages(photos) {
  for (const photo of photos) {
    const image = await loadImage(photo.data);
    if (
      image.naturalWidth !== photo.width ||
      image.naturalHeight !== photo.height
    )
      throw Error("Invalid photo dimensions");
  }
}
