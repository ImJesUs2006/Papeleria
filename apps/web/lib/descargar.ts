// Descarga en el navegador un archivo que llegó en base64 dentro de un JSON
// (respaldos de purga: el servidor responde datos y archivo en una sola vuelta).
export function descargarBase64(base64: string, nombre: string, tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
