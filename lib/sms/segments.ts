const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);
const GSM_EXTENDED = new Set("^{}\\[~]|€");

export type SmsEncoding = "GSM-7" | "UCS-2";

export function calculateSmsSegments(content: string) {
  let septets = 0;
  let gsm = true;
  for (const character of content) {
    if (GSM_BASIC.has(character)) septets += 1;
    else if (GSM_EXTENDED.has(character)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }

  // UCS-2 limits are measured in 16-bit code units. Characters outside the
  // basic multilingual plane, such as emoji, consume a surrogate pair.
  const length = gsm ? septets : content.length;
  const singleLimit = gsm ? 160 : 70;
  const multipartLimit = gsm ? 153 : 67;
  return {
    encoding: (gsm ? "GSM-7" : "UCS-2") as SmsEncoding,
    units: length,
    segments: length === 0 ? 0 : Math.ceil(length / (length <= singleLimit ? singleLimit : multipartLimit)),
  };
}
