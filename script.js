let accountsData = [];

// 1. Fetch External Data
fetch("first_sheet.json")
  .then((res) => res.json())
  .then((data) => {
    accountsData = data;
    console.log("Database Ready");
  })
  .catch((err) => console.error("Could not load accounts:", err));

// 2. Helper: Number Formatting with Commas
function formatWithCommas(e) {
  let value = e.target.value.replace(/,/g, "");
  if (!isNaN(value) && value !== "") {
    e.target.value = Number(value).toLocaleString("en-US");
  }
}

function cleanNumber(val) {
  return parseFloat(String(val).replace(/,/g, "")) || 0;
}

// 3. Helper: Account Type Logic (Excel IF mapping)
function getAccountType(code) {
  const firstDigit = String(code).trim().charAt(0);
  const mapping = {
    1: "Assets",
    2: "Liabilities & Owners Equity",
    3: "Expenses",
    4: "Revenue",
  };
  return mapping[firstDigit] || "";
}

// 4. Core: Sequential Journal Numbering
function updateJournalNumbers() {
  const rows = document.querySelectorAll("#journal-body tr");
  const seenDates = new Set();

  rows.forEach((row) => {
    const dateInput = row.querySelector(".input-date");
    const drInput = row.querySelector(".input-dr");
    const crInput = row.querySelector(".input-cr");
    const journalSpan = row.querySelector(".journal-span");

    const dateVal = dateInput.value.trim();
    const drVal = cleanNumber(drInput.value);
    const crVal = cleanNumber(crInput.value);

    if (dateVal !== "") seenDates.add(dateVal);

    const currentJournalNo = seenDates.size;

    // Only show if transaction has a value
    if (drVal > 0 || crVal > 0) {
      journalSpan.textContent = currentJournalNo > 0 ? currentJournalNo : "";
    } else {
      journalSpan.textContent = "";
    }
  });
}

// 5. Core: Row Initialization & Logic Setup
function addNewRow() {
  const tbody = document.getElementById("journal-body");
  const row = document.createElement("tr");

  row.innerHTML = `
        <td><input type="text" class="input-date" placeholder="DD/MM/YYYY"></td>
        <td><input type="text" class="code-input" placeholder="Code"></td>
        <td><span class="static-field arabic name-span">---</span></td>
        <td><input type="text" class="input-dr" ></td>
        <td><input type="text" class="input-cr" ></td>
        <td><span class="static-field journal-span">---</span></td>
        <td><input type="text" placeholder="Explanation"></td>
        <td><input type="text" placeholder="Cost Centre"></td>
        <td><span class="static-field type-span">---</span></td>
        <td><input type="text" class="input-numerical" value="0"></td>
    `;

  setupRowLogic(row);
  tbody.appendChild(row);
}

function setupRowLogic(row) {
  const codeInput = row.querySelector(".code-input");
  const dateInput = row.querySelector(".input-date");
  const drInput = row.querySelector(".input-dr");
  const crInput = row.querySelector(".input-cr");
  const nameSpan = row.querySelector(".name-span");
  const typeSpan = row.querySelector(".type-span");

  // Code Lookup Logic
  codeInput.addEventListener("input", () => {
    const val = codeInput.value.trim();
    typeSpan.textContent = getAccountType(val) || "---";
    const match = accountsData.find((item) => String(item.code) === val);
    nameSpan.textContent = match ? match["account name"] : "---";
  });

  // Formatting & Numbering Logic
  [drInput, crInput].forEach((input) => {
    input.addEventListener("input", (e) => {
      formatWithCommas(e);
      updateJournalNumbers();
    });
  });

  dateInput.addEventListener("input", updateJournalNumbers);
}

// 6. Init
document.getElementById("add-row-btn").addEventListener("click", addNewRow);
window.onload = addNewRow;

// 7. Trial Balance Logic (Unified & Fixed)
let beginningBalances = {}; // Stores { code: { dr: 0, cr: 0 } }
const HIERARCHY_LEVELS = [1, 3, 6, 9];

function updateTrialBalance() {
  const journalRows = document.querySelectorAll("#journal-body tr");
  const tbBody = document.querySelector("#trial-balance-body");
  if (!tbBody) return;

  const summary = {};
  const seenLevels = new Set();

  // 1. Aggregate movements from Ledger
  journalRows.forEach((row) => {
    const code = row.querySelector(".code-input").value.trim();
    const nameSpan = row.querySelector(".name-span");
    const name = nameSpan ? nameSpan.textContent : "---";
    const dr = cleanNumber(row.querySelector(".input-dr").value);
    const cr = cleanNumber(row.querySelector(".input-cr").value);

    if (code && name !== "---") {
      if (!summary[code]) {
        summary[code] = { name: name, movementDr: 0, movementCr: 0 };
      }
      summary[code].movementDr += dr;
      summary[code].movementCr += cr;
    }
  });

  tbBody.innerHTML = ""; // Clear table before re-rendering

  // 2. Sort the leaf codes (9-digits)
  const sortedFinalCodes = Object.keys(summary).sort((a, b) =>
    a.localeCompare(b),
  );

  // 3. Inject rows with Hierarchy
  sortedFinalCodes.forEach((fullCode) => {
    HIERARCHY_LEVELS.forEach((levelLen) => {
      if (fullCode.length >= levelLen) {
        const subCode = fullCode.substring(0, levelLen);

        if (!seenLevels.has(subCode)) {
          renderTBRow(subCode, summary, tbBody, levelLen);
          seenLevels.add(subCode);
        }
      }
    });
  });
  applyHierarchyColors();
  updateTableTotals();
}

function renderTBRow(code, summary, container, levelLen) {
  const match = accountsData.find((item) => String(item.code) === code);
  const accountName = match
    ? match["account name"]
    : summary[code]
      ? summary[code].name
      : "---";

  // Get movement data if it exists for this specific code level
  const move = summary[code] || { movementDr: 0, movementCr: 0 };
  const start = beginningBalances[code] || { dr: "", cr: "" };

  // Math for totals and balances
  const totalDr = start.dr + move.movementDr;
  const totalCr = start.cr + move.movementCr;
  const balDr = totalDr > totalCr ? totalDr - totalCr : 0;
  const balCr = totalCr > totalDr ? totalCr - totalDr : 0;

  const isFinalLevel = levelLen === 9;
  const row = document.createElement("tr");
  row.className = `level-${levelLen}`;

  // Note: Only 9-digit accounts get inputs and movement math
  if (isFinalLevel) {
    row.innerHTML = `
            <td>${code}</td>
            <td class="arabic">${accountName}</td>
            <td><input type="text" class="tb-input" value="${start.dr.toLocaleString()}" onchange="updateBeginningValue('${code}', 'dr', this)"></td>
            <td><input type="text" class="tb-input" value="${start.cr.toLocaleString()}" onchange="updateBeginningValue('${code}', 'cr', this)"></td>
            <td>${move.movementDr.toLocaleString()}</td>
            <td>${move.movementCr.toLocaleString()}</td>
            <td>${totalDr.toLocaleString()}</td>
            <td>${totalCr.toLocaleString()}</td>
            <td class="bold">${balDr > 0 ? balDr.toLocaleString() : ""}</td>
            <td class="bold">${balCr > 0 ? balCr.toLocaleString() : ""}</td>
        `;
  } else {
    // Parent rows (1, 3, 6 digits) are just headers
    row.innerHTML = `
            <td>${code}</td>
            <td class="arabic">${accountName}</td>
            <td colspan="8"></td>
        `;
  }
  container.appendChild(row);
}

// Helper for Trial Balance manual inputs
function updateBeginningValue(code, type, el) {
  const val = cleanNumber(el.value);
  if (!beginningBalances[code]) beginningBalances[code] = { dr: 0, cr: 0 };
  beginningBalances[code][type] = val;
  el.value = val.toLocaleString();
  updateTrialBalance(); // Trigger re-calculation
}

// Global Listener to sync tables
document.addEventListener("input", (e) => {
  if (
    e.target.classList.contains("input-dr") ||
    e.target.classList.contains("input-cr") ||
    e.target.classList.contains("code-input")
  ) {
    updateTrialBalance();
    updateTableTotals();
    updateFinancialStatements();
  }
});

function applyHierarchyColors() {
  const rows = document.querySelectorAll("#trial-balance-body tr");

  rows.forEach((row) => {
    const codeCell = row.cells[0]; // The 'Code' column
    const nameCell = row.cells[1]; // The 'Account Name' column

    if (!codeCell || !nameCell) return;

    const codeLen = codeCell.textContent.trim().length;

    // Remove any existing hierarchy classes first
    nameCell.classList.remove("bg-yellow", "bg-orange", "bg-green");

    // Apply colors based on digit count
    if (codeLen === 1) {
      nameCell.classList.add("bg-yellow");
    } else if (codeLen === 3) {
      nameCell.classList.add("bg-orange");
    } else if (codeLen === 6) {
      nameCell.classList.add("bg-green");
    }
  });
}

function updateTableTotals() {
  // --- 1. General Ledger Summation ---
  const ledgerRows = document.querySelectorAll("#journal-body tr");
  let ledgerDr = 0;
  let ledgerCr = 0;

  ledgerRows.forEach((row) => {
    ledgerDr += cleanNumber(row.querySelector(".input-dr").value);
    ledgerCr += cleanNumber(row.querySelector(".input-cr").value);
  });

  const lDrEl = document.getElementById("ledger-total-dr");
  const lCrEl = document.getElementById("ledger-total-cr");

  lDrEl.textContent = ledgerDr.toLocaleString();
  lCrEl.textContent = ledgerCr.toLocaleString();

  // Color logic for Ledger
  const ledgerColor =
    ledgerDr === ledgerCr && ledgerDr > 0 ? "#d4edda" : "#f8d7da";
  const ledgerText =
    ledgerDr === ledgerCr && ledgerDr > 0 ? "#155724" : "#721c24";
  document.getElementById("ledger-totals-row").style.backgroundColor =
    ledgerColor;
  document.getElementById("ledger-totals-row").style.color = ledgerText;

  // --- 2. Trial Balance Summation (By Balances) ---
  const tbRows = document.querySelectorAll("#trial-balance-body tr");
  let tbDr = 0;
  let tbCr = 0;

  tbRows.forEach((row) => {
    // We only sum the "Final Account" rows (Level 9) to avoid double-counting parents
    if (row.classList.contains("level-9")) {
      // Balances are the last two cells (index 8 and 9)
      tbDr += cleanNumber(row.cells[8].textContent);
      tbCr += cleanNumber(row.cells[9].textContent);
    }
  });

  const tDrEl = document.getElementById("tb-total-dr");
  const tCrEl = document.getElementById("tb-total-cr");

  tDrEl.textContent = tbDr.toLocaleString();
  tCrEl.textContent = tbCr.toLocaleString();

  // Color logic for Trial Balance
  const tbColor = tbDr === tbCr && tbDr > 0 ? "#d4edda" : "#f8d7da";
  const tbText = tbDr === tbCr && tbDr > 0 ? "#155724" : "#721c24";
  document.getElementById("tb-totals-row").style.backgroundColor = tbColor;
  document.getElementById("tb-totals-row").style.color = tbText;
}

function updateFinancialStatements() {
  const journalRows = document.querySelectorAll("#journal-body tr");
  const summary = {};

  // 1. Re-aggregate data (Same logic as Trial Balance)
  journalRows.forEach((row) => {
    const code = row.querySelector(".code-input").value.trim();
    const name = row.querySelector(".name-span").textContent;
    const dr = cleanNumber(row.querySelector(".input-dr").value);
    const cr = cleanNumber(row.querySelector(".input-cr").value);

    if (code && name !== "---") {
      if (!summary[code]) summary[code] = { name, dr: 0, cr: 0 };
      summary[code].dr += dr;
      summary[code].cr += cr;
    }
  });

  // 2. Separate into Income Statement and Balance Sheet
  let revTotal = 0,
    expTotal = 0,
    assetTotal = 0,
    liabTotal = 0,
    equityTotal = 0;

  const incomeBody = document.getElementById("income-body");
  const balanceBody = document.getElementById("balance-body");
  incomeBody.innerHTML = "";
  balanceBody.innerHTML = "";

  const sortedCodes = Object.keys(summary).sort((a, b) => a.localeCompare(b));

  sortedCodes.forEach((code) => {
    const data = summary[code];
    const firstDigit = code[0];
    let amount = 0;

    // Calculate Amount based on Type
    if (firstDigit === "1" || firstDigit === "3")
      amount = data.dr - data.cr; // Normal Debit
    else amount = data.cr - data.dr; // Normal Credit

    const rowHtml = `
            <tr class="level-${code.length}">
                <td>${code}</td>
                <td class="arabic">${data.name}</td>
                <td>${data.dr.toLocaleString()}</td>
                <td>${data.cr.toLocaleString()}</td>
                <td>${amount.toLocaleString()}</td>
            </tr>`;

    if (firstDigit === "3" || firstDigit === "4") {
      incomeBody.insertAdjacentHTML("beforeend", rowHtml);
      if (firstDigit === "3") expTotal += amount;
      if (firstDigit === "4") revTotal += amount;
    } else {
      balanceBody.insertAdjacentHTML("beforeend", rowHtml);
      if (firstDigit === "1") assetTotal += amount;
      if (firstDigit === "2") {
        // Check if it's Equity (usually 201 or similar) vs Liabilities
        if (code.startsWith("201")) equityTotal += amount;
        else liabTotal += amount;
      }
    }
  });

  // 3. Update Summaries
  const netIncome = revTotal - expTotal;
  document.getElementById("summary-revenue").textContent =
    revTotal.toLocaleString();
  document.getElementById("summary-expenses").textContent =
    expTotal.toLocaleString();
  document.getElementById("summary-net-income").textContent =
    netIncome.toLocaleString();

  document.getElementById("summary-assets").textContent =
    assetTotal.toLocaleString();
  document.getElementById("summary-liabilities").textContent =
    liabTotal.toLocaleString();
  document.getElementById("summary-equity").textContent =
    equityTotal.toLocaleString();
  document.getElementById("summary-bs-net-income").textContent =
    netIncome.toLocaleString();
  document.getElementById("summary-total-equity").textContent = (
    equityTotal + netIncome
  ).toLocaleString();

  // Call the color function for these new tables
  applyFinancialHierarchyColors();
}

function applyFinancialHierarchyColors() {
  // Specifically targeting level 3 headers for Red/Green in Income Statement
  document
    .querySelectorAll("#income-body .level-1, #income-body .level-3")
    .forEach((row) => {
      if (row.cells[0].textContent.startsWith("3")) row.classList.add("bg-red");
      if (row.cells[0].textContent.startsWith("4"))
        row.classList.add("bg-green");
    });
}
