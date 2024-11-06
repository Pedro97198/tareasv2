const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.')); // Servir archivos estáticos desde la carpeta actual

// Ruta para obtener todas las tareas
app.get('/tasks', (req, res) => {
    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');
        res.json(JSON.parse(data || '[]'));
    });
});

// Ruta para agregar una nueva tarea
app.post('/tasks', (req, res) => {
    const newTask = req.body;
    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');

        const tasks = JSON.parse(data || '[]');
        tasks.push(newTask);

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), (err) => {
            if (err) return res.status(500).send('Error al guardar la tarea');
            res.status(201).json(newTask);
        });
    });
});

// Ruta para actualizar las notas de una tarea específica
app.put('/tasks/:index/notes', (req, res) => {
    const { index } = req.params;
    const { notes } = req.body;

    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');
        
        const tasks = JSON.parse(data || '[]');
        if (index < 0 || index >= tasks.length) {
            return res.status(400).send('Índice de tarea no válido');
        }

        tasks[index].notes = notes;

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), (err) => {
            if (err) return res.status(500).send('Error al guardar las notas');
            res.status(200).send('Notas actualizadas');
        });
    });
});

// Ruta para completar una tarea
app.put('/tasks/:index/complete', (req, res) => {
    const { index } = req.params;

    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');
        
        const tasks = JSON.parse(data || '[]');
        if (index < 0 || index >= tasks.length) {
            return res.status(400).send('Índice de tarea no válido');
        }

        const completedTask = { ...tasks[index], status: 'completed', completedDate: new Date().toLocaleDateString() };
        tasks.splice(index, 1); // Remover la tarea de la lista pendiente
        tasks.push(completedTask); // Agregarla al historial de completadas

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), (err) => {
            if (err) return res.status(500).send('Error al guardar las tareas');
            res.status(200).json(completedTask);
        });
    });
});

// Ruta para mover una tarea a revisión
app.put('/tasks/:index/review', (req, res) => {
    const { index } = req.params;

    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');
        
        const tasks = JSON.parse(data || '[]');
        if (index < 0 || index >= tasks.length) {
            return res.status(400).send('Índice de tarea no válido');
        }

        tasks[index].status = 'review'; // Cambiar estado a revisión

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), (err) => {
            if (err) return res.status(500).send('Error al guardar las tareas');
            res.status(200).send('Tarea movida a revisión');
        });
    });
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor en funcionamiento en http://localhost:${PORT}`);
});