import QRCode from 'qrcode';

export async function generateQR(content) {
  return QRCode.toDataURL(content, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
}
