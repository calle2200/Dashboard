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

let activeCard = null;

// Sätt min-datum till idag
const todayISO = new Date().toISOString().slice(0, 10);
returnDateInput.min = todayISO;

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
            deviceState.date = dateEl ? dateEl.childNodes[0].textContent.trim() : "";
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
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const submitter = e.submitter && e.submitter.getAttribute('value');
    if (submitter === 'cancel') {
        closeDialog();
        return;
    }

    const borrower = borrowerInput.value;
    const date = returnDateInput.value;
    if (!activeCard || !borrower || !date) return;

    markAsLent(activeCard, borrower, date);
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

    const dueClass = getDueClass(dateStr);
    info.querySelector('.js-date').innerHTML = `
${dateStr}
<span class="badge due ${dueClass}" title="Deadline-status"></span>
`;

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
