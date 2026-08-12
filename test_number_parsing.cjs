const tests = [
  "40,000 KG",
  "0,980",
  "39,20",
  "6",
  "14,00",
  "84,00"
];

for (const t of tests) {
  const val = parseFloat((t || '').replace(',', '.'));
  console.log(`"${t}" -> ${val}`);
}
