// 🔒 Google Apps Script API
const API_URL = "https://script.google.com/macros/s/AKfycbwu8aY5XoT2IEkMU-j_mbJ6bvPFWyCnehEjvUp-LzULdT-odz-Ii3xrF9htVIHjfZ9EFA/exec";

const GROUP_MAP = {
    "READY_FOR_SHIP": "Pending Pickup",
    "READY_FOR_PICKUP": "Pending Pickup",
    "READY_TO_SHIP": "Pending Pickup",
    "READY_TO_PICKUP": "Pending Pickup",
    "RETURNED_TO_ORIGIN": "RTO",
    "RETURNING_TO_ORIGIN": "RTO"
};

const ALL_STATUS_BUTTONS = [
    "Pending Pickup",
    "OUT FOR DELIVERY",
    "DELIVERED",
    "RTO",
    "LOST",
    "CANCELLED",
    "SHIPPED"
];

let ALL_DATA = [];
let VIEW_DATA = [];
let PARTY_SET = new Set();

let F_STATUS = "ALL";
let F_PIN = "ALL";
let isNewestFirst = true;

document.addEventListener("DOMContentLoaded", init);

// ---------------- INIT ----------------
async function init() {
    const role = localStorage.getItem("role");
    const savedPin = localStorage.getItem("pin");
    const loader = document.getElementById("loader");

    if (!role || !savedPin) {
        window.location.href = "./index.html";
        return;
    }

    try {
        const res = await fetch(`${API_URL}?pin=${encodeURIComponent(savedPin)}`);
        const rows = await res.json();

        if (!Array.isArray(rows) || rows.length === 0) {
            loader && (loader.style.display = "none");
            document.getElementById("list").innerHTML = "<p style='text-align:center;'>No data found.</p>";
            return;
        }

        ALL_DATA = rows.map(r => {
            const raw = (r[5] || "PENDING").toString().trim().toUpperCase().replace(/\s+/g, "_");

            return {
                awb: (r[1] || "").toString().trim(),
                pickupName: (r[2] || "Unknown").toString().trim(),
                consignee: (r[3] || "No Name").toString().trim(),
                city: (r[4] || "No City").toString().trim(),
                date: formatDate(r[0]),
                delDate: formatDate(r[6]),
                rawStatus: raw,
                displayGroup: GROUP_MAP[raw] || raw.replace(/_/g, " "),
                status: normalizeStatus(raw),
                payment: (r[7] || "").toString().toUpperCase(),
                cod: parseFloat((r[8] || "0").toString().replace(/,/g, "")) || 0,
                pin: (r[19] || "").toString().trim(),
                phone: (r[20] || "").toString().replace(/[^0-9]/g, "")
            };
        });

        sortData();

        if (role === "admin") {
            ALL_DATA.forEach(x => {
                if (x.pickupName && x.pin) {
                    PARTY_SET.add(`${x.pickupName} - ${x.pin}`);
                }
            });
            buildDropdown();
        } else {
            const title = document.getElementById("clientTitle");
            if (title && ALL_DATA.length > 0) {
                title.innerText = ALL_DATA[0].pickupName;
            }
        }

        buildStatusButtons();
        applyFilters();
        loader && (loader.style.display = "none");

    } catch (err) {
        console.error(err);
        loader && (loader.style.display = "none");
    }
}

// ---------------- SORT ----------------
window.toggleSort = function () {
    isNewestFirst = !isNewestFirst;
    const btn = document.getElementById("sortBtn");
    if (btn) {
        btn.innerText = isNewestFirst
            ? "Sort: Newest First ⇅"
            : "Sort: Oldest First ⇅";
    }
    sortData();
    applyFilters();
};

function sortData() {
    ALL_DATA.sort((a, b) => {
        const toNum = d => {
            if (!d || !d.includes("/")) return 0;
            const [dd, mm, yy] = d.split("/");
            return parseInt(`${yy}${mm.padStart(2, "0")}${dd.padStart(2, "0")}`);
        };
        return isNewestFirst
            ? toNum(b.delDate) - toNum(a.delDate)
            : toNum(a.delDate) - toNum(b.delDate);
    });
}

// ---------------- FILTER ----------------
function applyFilters() {
    const q = document.getElementById("search")?.value.toLowerCase() || "";

    VIEW_DATA = ALL_DATA.filter(r => {
        const mStatus = F_STATUS === "ALL" || r.displayGroup.toUpperCase() === F_STATUS.toUpperCase();
        const mPin = F_PIN === "ALL" || r.pin === F_PIN;
        const mSearch =
            r.awb.toLowerCase().includes(q) ||
            r.city.toLowerCase().includes(q) ||
            r.consignee.toLowerCase().includes(q);
        return mStatus && mPin && mSearch;
    });

    render();
    updateSummary();
}

// ---------------- RENDER ----------------
function render() {
    const list = document.getElementById("list");
    if (!list) return;

    if (VIEW_DATA.length === 0) {
        list.innerHTML = "<p style='text-align:center; padding:40px;'>No results found.</p>";
        return;
    }

    list.innerHTML = VIEW_DATA.map(r => {
        const link = `https://www.delhivery.com/track-v2/package/${r.awb}`;
        const dateInfo = (r.displayGroup === "DELIVERED" || r.displayGroup === "RTO") ? `📅 ${r.delDate}` : "";

        return `
        <div class="shipment-card status-${r.status}">
            <div><strong>AWB ${r.awb}</strong> (${r.payment})</div>
            <div>${r.consignee} | ${r.city}</div>
            <div>${r.displayGroup} ${dateInfo}</div>
            <div>₹${r.cod.toFixed(0)}</div>
            <a href="${link}" target="_blank">Track</a>
        </div>`;
    }).join("");
}

// ---------------- HELPERS ----------------
function formatDate(d) {
    if (!d) return "";
    const s = d.toString();
    if (s.includes("T")) return s.split("T")[0].split("-").reverse().join("/");
    return s;
}

function normalizeStatus(s) {
    if (s.includes("DELIVERED")) return "delivered";
    if (s.includes("RETURN")) return "rto";
    return "in_transit";
}

function updateSummary() {
    let cod = 0, c = 0, p = 0;
    VIEW_DATA.forEach(r => {
        if (r.payment === "COD") {
            c++; cod += r.cod;
        } else {
            p++;
        }
    });
    document.getElementById("sumTotal") && (document.getElementById("sumTotal").innerText = VIEW_DATA.length);
    document.getElementById("sumCODCount") && (document.getElementById("sumCODCount").innerText = c);
    document.getElementById("sumPrepaidCount") && (document.getElementById("sumPrepaidCount").innerText = p);
    document.getElementById("sumCODAmount") && (document.getElementById("sumCODAmount").innerText = "₹" + cod.toLocaleString("en-IN"));
}

// ---------------- UI ----------------
function buildStatusButtons() {
    const c = document.getElementById("statusFilterContainer");
    if (!c) return;

    c.innerHTML = `<button class="status-btn active" onclick="setStatus('ALL', this)">All</button>`;
    ALL_STATUS_BUTTONS.forEach(s => {
        const b = document.createElement("button");
        b.className = "status-btn";
        b.innerText = s;
        b.onclick = () => setStatus(s, b);
        c.appendChild(b);
    });
}

function buildDropdown() {
    const s = document.getElementById("partySelect");
    if (!s) return;

    s.innerHTML = `<option value="ALL">All Registered Parties</option>`;
    [...PARTY_SET].sort().forEach(p => {
        const o = document.createElement("option");
        o.value = p.split(" - ").pop();
        o.textContent = p;
        s.appendChild(o);
    });
}

// ---------------- GLOBAL ----------------
window.setStatus = (g, b) => {
    F_STATUS = g;
    b.parentElement.querySelectorAll(".status-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    applyFilters();
};

window.setParty = v => { F_PIN = v; applyFilters(); };
window.searchData = () => applyFilters();
window.logout = () => { localStorage.clear(); window.location.href = "./index.html"; };
window.topFunction = () => window.scrollTo({ top: 0, behavior: "smooth" });
