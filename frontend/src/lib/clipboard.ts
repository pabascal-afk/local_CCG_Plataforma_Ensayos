/**
 * Copia texto al portapapeles de manera confiable y universal.
 * Compatible con contextos seguros (HTTPS o localhost) y con redes locales sobre HTTP
 * (ej. http://192.168.3.16:3300) donde `navigator.clipboard` es undefined.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;

  // 1. Intentar con la API moderna si está disponible (HTTPS / localhost)
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Intentar fallback si falla por permisos o foco de ventana
    }
  }

  // 2. Fallback con textarea y execCommand('copy') para HTTP en red local
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    textArea.style.opacity = "0";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Error al copiar texto al portapapeles:", err);
    return false;
  }
}
