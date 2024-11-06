let tasks = [];
let currentTaskIndex = null;

// Cargar tareas desde el servidor
function loadTasks() {
    fetch('/tasks')
        .then(response => response.json())
        .then(data => {
            tasks = data;
            renderTasks(); // Llamar a renderTasks después de cargar tareas
        })
        .catch(error => console.error('Error al cargar tareas:', error));
}

// Renderizar tareas en la interfaz
function renderTasks() {
    const pendingTasksEl = document.getElementById('pending-tasks');
    const reviewTasksEl = document.getElementById('review-tasks');
    const completedTasksEl = document.getElementById('completed-tasks'); // Asegúrate de que este elemento exista
    pendingTasksEl.innerHTML = '';
    reviewTasksEl.innerHTML = '';
    completedTasksEl.innerHTML = ''; // Limpiar el historial antes de renderizar

    tasks.forEach((task, index) => {
        const taskEl = document.createElement('li');
        taskEl.innerText = `${task.name} - ${task.date}`;
        taskEl.onclick = () => selectTask(index); // Permitir ver notas

        const doneButton = document.createElement('button');
        doneButton.innerText = 'Completar';
        doneButton.onclick = (e) => {
            e.stopPropagation();
            completeTask(index);
        };

        const reviewButton = document.createElement('button');
        reviewButton.innerText = 'Mover a Revisión';
        reviewButton.onclick = (e) => {
            e.stopPropagation();
            moveToReview(index);
        };

        if (task.status === 'pending') {
            taskEl.appendChild(doneButton);
            taskEl.appendChild(reviewButton);
            pendingTasksEl.appendChild(taskEl);
        } else if (task.status === 'review') {
            taskEl.appendChild(doneButton);
            taskEl.appendChild(reviewButton);
            reviewTasksEl.appendChild(taskEl);
        } else if (task.status === 'completed') {
            taskEl.innerText += ` - Completada el ${task.completedDate}`; // Añadir fecha de completado
            completedTasksEl.appendChild(taskEl); // Asegúrate de añadir a la lista de completadas
        }
    });
}

// Seleccionar tarea para ver anotaciones
function selectTask(index) {
    currentTaskIndex = index;
    const noteTextArea = document.getElementById('note-text');
    noteTextArea.value = tasks[index].notes;
}

// Agregar nueva tarea
function addTask() {
    const taskName = document.getElementById('new-task-name').value;
    if (taskName) {
        const newTask = {
            name: taskName,
            date: new Date().toLocaleDateString(),
            status: 'pending',
            notes: ''
        };
        fetch('/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newTask),
        })
        .then(response => response.json())
        .then(data => {
            loadTasks(); // Recargar tareas
            document.getElementById('new-task-name').value = ''; // Limpiar el campo de entrada
        })
        .catch(error => console.error('Error al agregar tarea:', error));
    }
}

// Completar tarea
function completeTask(index) {
    fetch(`/tasks/${index}/complete`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Error al completar tarea');
        }
        loadTasks(); // Recargar tareas
    })
    .catch(error => console.error('Error al completar tarea:', error));
}

// Mover tarea a revisión
function moveToReview(index) {
    fetch(`/tasks/${index}/review`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Error al mover a revisión');
        }
        loadTasks(); // Recargar tareas
    })
    .catch(error => console.error('Error al mover a revisión:', error));
}

// Guardar anotaciones manualmente
function saveNote() {
    if (currentTaskIndex !== null) {
        const noteTextArea = document.getElementById('note-text');
        tasks[currentTaskIndex].notes = noteTextArea.value;
        fetch(`/tasks/${currentTaskIndex}/notes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ notes: noteTextArea.value }),
        })
        .then(() => {
            loadTasks(); // Recargar tareas para reflejar cambios
        })
        .catch(error => console.error('Error al guardar nota:', error));
    }
}

// Cargar tareas al iniciar
document.addEventListener('DOMContentLoaded', loadTasks);