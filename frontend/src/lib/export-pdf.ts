export async function downloadDashboardPDF(
  containerEl: HTMLElement,
  title: string,
) {
  const html2canvas = (await import("html2canvas-pro")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(containerEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // A4 landscape
  const pdf = new jsPDF("l", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
  const scaledW = imgWidth * ratio;
  const scaledH = imgHeight * ratio;

  pdf.addImage(imgData, "PNG", (pageWidth - scaledW) / 2, 10, scaledW, scaledH - 10);
  pdf.save(`${title}.pdf`);
}
