const printReceipt = document.querySelector("#print-receipt");
if (printReceipt) {
  printReceipt.hidden = false;
  printReceipt.addEventListener("click", () => window.print());
}
