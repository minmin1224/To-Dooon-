const STORAGE_KEY = "todo-app-items";

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const dateInput = document.getElementById("todo-date");
const list = document.getElementById("todo-list");
const countEl = document.getElementById("todo-count");
const filterBtns = document.querySelectorAll(".filter-btn");
const clearCompletedBtn = document.getElementById("clear-completed");
const micBtn = document.getElementById("mic-btn");
const micStatus = document.getElementById("mic-status");

let todos = [];
let currentFilter = "all";

function loadTodosFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function loadTodos() {
  try {
    const res = await fetch("/api/todos");
    if (!res.ok) throw new Error("server unavailable");
    const serverTodos = await res.json();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serverTodos));
    return serverTodos;
  } catch {
    return loadTodosFromLocalStorage();
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(todos),
  }).catch(() => {
    // サーバー未起動時はlocalStorageのみで動作を継続
  });
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function googleCalendarUrl(todo) {
  const start = todo.dueDate || todayStr();
  const end = addDays(start, 1);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: todo.text,
    dates: `${start.replace(/-/g, "")}/${end.replace(/-/g, "")}`,
    details: "To-Doooon!から追加",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function render() {
  list.innerHTML = "";

  const filtered = todos.filter((t) => {
    if (currentFilter === "active") return !t.completed;
    if (currentFilter === "completed") return t.completed;
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-message";
    empty.textContent = "タスクはありません";
    list.appendChild(empty);
  } else {
    filtered.forEach((todo) => {
      const li = document.createElement("li");
      li.className = "todo-item" + (todo.completed ? " completed" : "");
      if (todo.dueDate && !todo.completed && todo.dueDate < todayStr()) {
        li.classList.add("overdue");
      }

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = todo.completed;
      checkbox.addEventListener("change", () => toggleTodo(todo.id));

      const text = document.createElement("span");
      text.className = "todo-text";
      text.textContent = todo.text;

      li.appendChild(checkbox);
      li.appendChild(text);

      if (todo.dueDate) {
        const date = document.createElement("span");
        date.className = "todo-date";
        date.textContent = todo.dueDate;
        li.appendChild(date);
      }

      const calendarBtn = document.createElement("a");
      calendarBtn.className = "calendar-btn";
      calendarBtn.href = googleCalendarUrl(todo);
      calendarBtn.target = "_blank";
      calendarBtn.rel = "noopener noreferrer";
      calendarBtn.title = "Googleカレンダーに追加";
      calendarBtn.textContent = "📅";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.setAttribute("aria-label", "削除");
      deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

      li.appendChild(calendarBtn);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });
  }

  const activeCount = todos.filter((t) => !t.completed).length;
  countEl.textContent = `残り ${activeCount} 件 / 合計 ${todos.length} 件`;
}

function addTodo(text, dueDate) {
  todos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    text,
    dueDate: dueDate || "",
    completed: false,
  });
  saveTodos();
  render();
}

function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    saveTodos();
    render();
  }
}

function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
  render();
}

function clearCompleted() {
  todos = todos.filter((t) => !t.completed);
  saveTodos();
  render();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addTodo(text, dateInput.value);
  input.value = "";
  dateInput.value = "";
  input.focus();
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

clearCompletedBtn.addEventListener("click", clearCompleted);

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = "この端末・ブラウザは音声入力に対応していません";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let listening = false;

  recognition.addEventListener("start", () => {
    listening = true;
    micBtn.classList.add("listening");
    micStatus.textContent = "聞き取り中...";
  });

  recognition.addEventListener("result", (e) => {
    const transcript = e.results[0][0].transcript.trim();
    if (transcript) {
      input.value = transcript;
      input.focus();
    }
  });

  recognition.addEventListener("error", (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      micStatus.textContent = "マイクの使用が許可されていません";
    } else if (e.error === "no-speech") {
      micStatus.textContent = "音声を認識できませんでした";
    } else {
      micStatus.textContent = "音声入力エラーが発生しました";
    }
  });

  recognition.addEventListener("end", () => {
    listening = false;
    micBtn.classList.remove("listening");
    setTimeout(() => {
      if (!listening) micStatus.textContent = "";
    }, 2000);
  });

  micBtn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
    } else {
      micStatus.textContent = "";
      recognition.start();
    }
  });
}

setupVoiceInput();

async function init() {
  todos = await loadTodos();
  render();
}

init();
