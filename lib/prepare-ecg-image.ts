const TARGET_BYTES = 4.8 * 1024 * 1024;

/** Prepare one image locally; never crop the trace or upload during preparation. */
export async function prepareEcgImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('format');
  if (file.size <= TARGET_BYTES) return file;
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    const context = canvas.getContext('2d');
    if (!context || !image.naturalWidth || !image.naturalHeight) throw new Error('decode');
    // Retain aspect ratio and avoid low-quality JPEG or aggressive downsampling.
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    for (const edge of [6000, 4800, 4000, 3200]) {
      const scale = Math.min(1, edge / longest);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.96, 0.92, 0.88]) {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('encode')), 'image/jpeg', quality));
        if (blob.size <= TARGET_BYTES) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-prepared.jpg', {type: 'image/jpeg', lastModified: file.lastModified});
      }
    }
    throw new Error('compression');
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
    image.src = '';
  }
}
