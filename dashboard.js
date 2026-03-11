/* ============================
   FIREBASE CONFIG
   ──────────────────────────────
   Byt ut värdena nedan med dina egna från Firebase Console:
   https://console.firebase.google.com → Ditt projekt → Project settings → General → Your apps → Config
   ============================ */

const firebaseConfig = {
    apiKey:            "AIzaSyCO-ZpT2F5aqV1xA2JQFEIbK8MS4pnU5FU",
    authDomain:        "dashboard-28380.firebaseapp.com",
    databaseURL:       "https://dashboard-28380-default-rtdb.europe-west1.firebasedatabase.app",
    projectId:         "dashboard-28380",
    storageBucket:     "dashboard-28380.firebasestorage.app",
    messagingSenderId: "101598152489",
    appId:             "1:101598152489:web:040757e05110d141481938"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ============================
   DOM-ELEMENT
   ============================ */

const inputBox = document.getElementById("input-box");
const listContainer = document.getElementById("list-container");

const dialog = document.getElementById("loanDialog");
const form = document.getElementById('loanForm');
const borrowerInput = document.getElementById("borrowerInput");
const returnDateInput = document.getElementById('returnDate');
const noReturnDateCheckbox = document.getElementById('noReturnDate');

let activeCard = null;

// Sätt min-datum till idag
const todayISO = new Date().toISOString().slice(0, 10);
returnDateInput.min = todayISO;

// "Inget returdatum" - toggle
function syncNoReturnDateUI() {
    const noDate = noReturnDateCheckbox && noReturnDateCheckbox.checked;
    returnDateInput.disabled = !!noDate;
    if (noDate) returnDateInput.value = '';
}
if (noReturnDateCheckbox) {
    noReturnDateCheckbox.addEventListener('change', syncNoReturnDateUI);
    syncNoReturnDateUI();
}

// Flagga: ignorera nästa Firebase-uppdatering om vi just sparade själva
let ignoreNextDevices = false;
let ignoreNextTodos = false;

/* ============================
   TODOS – STATE / RENDERING / FIREBASE
   ============================ */

function buildTodosState() {
    const todos = [];
    listContainer.querySelectorAll("li").forEach(li => {
        todos.push({
            text: li.childNodes[0].textContent.trim(),
            checked: li.classList.contains("checked")
        });
    });
    return todos;
}

function applyTodosState(todos) {
    listContainer.innerHTML = "";
    (todos || []).forEach(todo => {
        let li = document.createElement("li");
        li.textContent = todo.text;
        if (todo.checked) li.classList.add("checked");
        let span = document.createElement("span");
        span.innerHTML = "\u00d7";
        li.appendChild(span);
        listContainer.appendChild(li);
    });
}

function saveTodos() {
    const todos = buildTodosState();
    ignoreNextTodos = true;
    db.ref("todos").set(todos)
        .catch(err => console.error("Kunde inte spara todos:", err));
}

/* ============================
   DEVICES – STATE / RENDERING / FIREBASE
   ============================ */

function buildDevicesState() {
    const devices = {};
    document.querySelectorAll('.device-card').forEach(card => {
        const id = card.dataset.deviceId;
        const status = card.classList.contains('status--utlanad') ? 'utlanad' : 'ledig';
        const deviceState = { status };

        if (status === 'utlanad') {
            const borrowerEl = card.querySelector('.js-borrower');
            const dateEl = card.querySelector('.js-date');
            deviceState.borrower = borrowerEl ? borrowerEl.textContent.trim() : "";
            // tar bara första text-noden (innan badge) om den finns
            deviceState.date = dateEl ? (dateEl.childNodes[0] ? dateEl.childNodes[0].textContent.trim() : dateEl.textContent.trim()) : "";
        }

        devices[id] = deviceState;
    });
    return devices;
}

function applyDevicesState(devices) {
    if (!devices) return;
    document.querySelectorAll('.device-card').forEach(card => {
        const id = card.dataset.deviceId;
        const devState = devices[id];
        if (!devState || devState.status === 'ledig') {
            markAsReturned(card, true);
        } else if (devState.status === 'utlanad') {
            markAsLent(card, devState.borrower, devState.date, true);
        }
    });
}

function saveDevices() {
    const devices = buildDevicesState();
    ignoreNextDevices = true;
    db.ref("devices").set(devices)
        .catch(err => console.error("Kunde inte spara devices:", err));
}

/* ============================
   TODO-LOGIK (UI)
   ============================ */

function addTask() {
    if (inputBox.value === '') {
        alert("Skriv först något!");
    } else {
        let li = document.createElement("li");
        li.textContent = inputBox.value;
        listContainer.appendChild(li);
        let span = document.createElement("span");
        span.innerHTML = "\u00d7";
        li.appendChild(span);
    }
    inputBox.value = "";
    saveTodos();
}

listContainer.addEventListener("click", function (e) {
    if (e.target.tagName === "LI") {
        e.target.classList.toggle("checked");
        saveTodos();
    }
    else if (e.target.tagName === "SPAN") {
        e.target.parentElement.remove();
        saveTodos();
    }
}, false);

/* ============================
   DEVICE / LÅNE-LOGIK
   ============================ */

document.querySelectorAll('.js-loan').forEach(btn => {
    btn.addEventListener('click', (e) => {
        activeCard = e.currentTarget.closest('.device-card');
        borrowerInput.value = '';
        returnDateInput.value = '';
        if (noReturnDateCheckbox) {
            noReturnDateCheckbox.checked = false;
            syncNoReturnDateUI();
        }

        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    });
});

function toLocalDateOnly(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function getDueClass(dateStr) {
    const due = toLocalDateOnly(dateStr);
    const today = toLocalDateOnly(new Date());
    if (due.getTime() < today.getTime()) return 'due--late';
    if (due.getTime() === today.getTime()) return 'due--today';
    return 'due--ok';
}

function closeDialog() {
    if (dialog.open) dialog.close();
    borrowerInput.value = '';
    returnDateInput.value = '';
    if (noReturnDateCheckbox) {
        noReturnDateCheckbox.checked = false;
        syncNoReturnDateUI();
    }
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const submitter = e.submitter && e.submitter.getAttribute('value');
    if (submitter === 'cancel') {
        closeDialog();
        return;
    }

    const borrower = borrowerInput.value.trim();
    const noDate = noReturnDateCheckbox ? noReturnDateCheckbox.checked : false;
    const date = returnDateInput.value; // "" om inget valt

    if (!activeCard || !borrower) return;
    if (!noDate && !date) return; // måste välja datum om man inte kryssat i "ingen"

    markAsLent(activeCard, borrower, noDate ? '' : date);
});

function markAsLent(card, borrower, dateStr, noSave) {
    card.classList.remove('status--ledig');
    card.classList.add('status--utlanad');

    const info = card.querySelector('.device-info');
    info.innerHTML = `
<div class="row"><span class="label">Status:</span><span class="value js-status">Utlånad</span></div>
<div class="row"><span class="label">Låntagare:</span><span class="value js-borrower"></span></div>
<div class="row"><span class="label">Förv. retur:</span>
<span class="value js-date"></span>
</div>
<div class="row actions">
<button class="btn js-return">Lämna tillbaka</button>
</div>
`;

    const dateEl = info.querySelector('.js-date');
    if (dateStr) {
        const dueClass = getDueClass(dateStr);
        dateEl.innerHTML = `
${dateStr}
<span class="badge due ${dueClass}" title="Deadline-status"></span>
`;
    } else {
        dateEl.textContent = '—'; // eller "Ingen"
    }

    info.querySelector('.js-borrower').textContent = borrower;

    closeDialog();

    info.querySelector('.js-return').addEventListener('click', () => markAsReturned(card));

    if (!noSave) {
        saveDevices();
    }
}

function markAsReturned(card, noSave) {
    card.classList.remove('status--utlanad');
    card.classList.add('status--ledig');

    const info = card.querySelector('.device-info');
    info.innerHTML = `
<div class="row"><span class="label">Status:</span><span class="value js-status">Ledig</span></div>
<div class="row actions">
<button class="btn js-loan">Låna ut</button>
</div>
`;

    info.querySelector('.js-loan').addEventListener('click', (e) => {
        activeCard = e.currentTarget.closest('.device-card');
        borrowerInput.value = '';
        returnDateInput.value = '';
        if (noReturnDateCheckbox) {
            noReturnDateCheckbox.checked = false;
            syncNoReturnDateUI();
        }

        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    });

    if (!noSave) {
        saveDevices();
    }
}

/* ============================
   FIREBASE REALTIDS-LYSSNARE
   ──────────────────────────────
   Dessa triggas automatiskt när datan ändras i Firebase,
   oavsett vilken användare som sparade.
   ============================ */

db.ref("devices").on("value", (snapshot) => {
    if (ignoreNextDevices) {
        ignoreNextDevices = false;
        return;
    }
    // Hoppa över om dialogen är öppen
    if (dialog.open) return;
    const devices = snapshot.val();
    applyDevicesState(devices || {});
});

db.ref("todos").on("value", (snapshot) => {
    if (ignoreNextTodos) {
        ignoreNextTodos = false;
        return;
    }
    // Hoppa över om användaren skriver
    if (document.activeElement === inputBox) return;
    const todos = snapshot.val();
    applyTodosState(todos || []);
});

/* ============================
   KALENDER + EVENTS (Firebase)
   - klick på dag => popup (titel + beskrivning)
   - render titel i kalendern
   - hover visar beskrivning
   - delete-knapp (×) tar bort och synkar via Firebase
   ============================ */
(() => {
    const calRoot = document.getElementById("calendar");
    if (!calRoot) return;

    // Dialog för event
    const eventDialog = document.getElementById("eventDialog");
    const eventForm = document.getElementById("eventForm");
    const eventDateLabel = document.getElementById("eventDateLabel");
    const eventTitleInput = document.getElementById("eventTitle");
    const eventDescInput = document.getElementById("eventDesc");

    const state = {
        viewDate: new Date(),
        selectedDate: null,
        // eventsByDate: { "YYYY-MM-DD": { "<pushId>": {title, description, createdAt} } }
        eventsByDate: {}
    };

    let pendingDateKey = null;
    let ignoreNextCalendarEvents = false;

    const pad2 = (n) => String(n).padStart(2, "0");
    const isoKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    const sameDay = (a, b) =>
        a && b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const mondayIndex = (jsDayIndex) => (jsDayIndex + 6) % 7;

    const fmtMonthYear = (d) => d.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
    const fmtLong = (d) => d.toLocaleDateString("sv-SE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    function capitalize(s) {
        return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
    }

    const monthLabel = document.getElementById("monthLabel");
    const rangeLabel = document.getElementById("rangeLabel");
    const selectedLabel = document.getElementById("selectedLabel");
    const dowRow = document.getElementById("dowRow");
    const daysGrid = document.getElementById("daysGrid");

    document.getElementById("prevBtn").addEventListener("click", () => {
        state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() - 1, 1);
        render();
    });

    document.getElementById("nextBtn").addEventListener("click", () => {
        state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + 1, 1);
        render();
    });

    document.getElementById("todayBtn").addEventListener("click", () => {
        state.viewDate = new Date();
        state.selectedDate = new Date();
        render();
    });

    const weekDaysSv = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

    function renderDow() {
        dowRow.innerHTML = "";
        for (const name of weekDaysSv) {
            const el = document.createElement("div");
            el.className = "dow";
            el.textContent = name;
            dowRow.appendChild(el);
        }
    }

    function openEventDialog(dateObj) {
        // skydd om någon dialog-del saknas
        if (!eventDialog || !eventForm || !eventDateLabel || !eventTitleInput || !eventDescInput) {
            alert("Event-dialogen saknas i HTML eller fel id:n (eventDialog/eventForm/eventDateLabel/eventTitle/eventDesc).");
            return;
        }

        pendingDateKey = isoKey(dateObj);
        state.selectedDate = dateObj;

        eventDateLabel.textContent = fmtLong(dateObj);
        eventTitleInput.value = "";
        eventDescInput.value = "";

        if (typeof eventDialog.showModal === "function") eventDialog.showModal();
        else eventDialog.setAttribute("open", "");
    }

    function closeEventDialog() {
        if (eventDialog && eventDialog.open) eventDialog.close();
        pendingDateKey = null;
    }

    // Submit: spara event
    if (eventForm) {
        eventForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const submitter = e.submitter && e.submitter.getAttribute("value");
            if (submitter === "cancel") {
                closeEventDialog();
                return;
            }

            const title = (eventTitleInput?.value || "").trim();
            const description = (eventDescInput?.value || "").trim();
            if (!pendingDateKey || !title) return;

            const eventObj = {
                title,
                description,
                createdAt: Date.now()
            };

            ignoreNextCalendarEvents = true;

            db.ref("calendarEvents")
                .child(pendingDateKey)
                .push(eventObj)
                .then(() => {
                    closeEventDialog();
                })
                .catch((err) => {
                    console.error("Kunde inte spara kalender-event:", err);
                    ignoreNextCalendarEvents = false;
                });
        });
    }

    function renderDays() {
        daysGrid.innerHTML = "";

        const today = new Date();
        const first = startOfMonth(state.viewDate);
        const last = endOfMonth(state.viewDate);

        const leading = mondayIndex(first.getDay());
        const gridStart = new Date(first);
        gridStart.setDate(first.getDate() - leading);

        const totalCells = 42;

        for (let i = 0; i < totalCells; i++) {
            const d = new Date(gridStart);
            d.setDate(gridStart.getDate() + i);

            const key = isoKey(d);

            const cell = document.createElement("div");
            cell.className = "day";
            cell.dataset.date = key;

            const num = document.createElement("div");
            num.className = "num";
            num.textContent = d.getDate();
            cell.appendChild(num);

            if (d.getMonth() !== state.viewDate.getMonth()) cell.classList.add("is-outside");
            if (sameDay(d, today)) cell.classList.add("is-today");

            if (sameDay(d, state.selectedDate)) {
                cell.style.outline = "1px solid rgba(255,255,255,.18)";
                cell.style.boxShadow = "inset 0 0 0 1px rgba(124,196,255,.28)";
            }

            // Hämta events med id
            const dayEventsObj = state.eventsByDate[key] || {};
            const dayEvents = Object.entries(dayEventsObj); // [ [eventId, eventData], ... ]

            if (dayEvents.length) {
                const eventsWrap = document.createElement("div");
                eventsWrap.className = "events";

                for (const [eventId, ev] of dayEvents
                    .slice()
                    .sort((a, b) => ((a[1].createdAt || 0) - (b[1].createdAt || 0)))
                    .slice(0, 3)) {

                    const tag = document.createElement("div");
                    tag.className = "event";

                    // hover = beskrivning
                    if (ev.description) tag.title = ev.description;

                    // titel
                    const titleSpan = document.createElement("span");
                    titleSpan.className = "event__title";
                    titleSpan.textContent = ev.title || "(utan titel)";
                    tag.appendChild(titleSpan);

                    // delete-knapp
                    const delBtn = document.createElement("button");
                    delBtn.type = "button";
                    delBtn.className = "event__del";
                    delBtn.textContent = "×";
                    delBtn.title = "Ta bort";

                    delBtn.addEventListener("click", (e) => {
                        e.stopPropagation(); // hindra dag-klick
                        const ok = confirm(`Ta bort "${ev.title}"?`);
                        if (!ok) return;

                        db.ref("calendarEvents")
                            .child(key)
                            .child(eventId)
                            .remove()
                            .catch(err => console.error("Kunde inte ta bort event:", err));
                    });

                    tag.appendChild(delBtn);

                    // klick på event-taggen ska inte öppna dialog för dagen
                    tag.addEventListener("click", (e) => {
                        e.stopPropagation();
                    });

                    eventsWrap.appendChild(tag);
                }

                cell.appendChild(eventsWrap);
            }

            // Klick på dag: välj + öppna popup
            cell.addEventListener("click", () => {
                state.selectedDate = d;
                if (selectedLabel) selectedLabel.textContent = fmtLong(d);
                openEventDialog(d);
                render();
            });

            daysGrid.appendChild(cell);
        }

        if (monthLabel) monthLabel.textContent = capitalize(fmtMonthYear(state.viewDate));
        if (rangeLabel) rangeLabel.textContent = `${first.toLocaleDateString("sv-SE")} – ${last.toLocaleDateString("sv-SE")}`;
        if (selectedLabel) selectedLabel.textContent = state.selectedDate ? fmtLong(state.selectedDate) : "Ingen dag vald";
    }

    function render() {
        renderDow();
        renderDays();
    }

    // Firebase: realtime sync av kalender-events
    db.ref("calendarEvents").on("value", (snapshot) => {
        if (ignoreNextCalendarEvents) {
            ignoreNextCalendarEvents = false;
        }
        state.eventsByDate = snapshot.val() || {};
        render();
    });

    render();
})();
