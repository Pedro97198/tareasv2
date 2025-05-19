const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb'); // <-- ESTA ES LA LÍNEA QUE TE FALTA
const puppeteer = require('puppeteer');

require('dotenv').config();


const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let collection;

async function connectMongo() {
    try {
        await client.connect();
        collection = client.db("agendaDB").collection("tasks");
        console.log("MongoDB conectado");
    } catch (err) {
        console.error("Error al conectar MongoDB:", err);
    }
}

connectMongo();


async function saveBackupToMongo(tasks) {
    try {
        await collection.replaceOne({}, { tasks }, { upsert: true });
        console.log("Copia de seguridad guardada en MongoDB.");
    } catch (err) {
        console.error("Error guardando copia en MongoDB:", err);
    }
}


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.')); // Servir archivos estáticos desde la carpeta actual
///////////////////////////////
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/generate-report', (req, res) => {
    const { period } = req.query;

    fs.readFile('tasks.json', 'utf8', async (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');

        const tasks = JSON.parse(data || '[]');
        const now = new Date();

        const filtered = [];

        for (const task of tasks) {
            // Día actual: tomar los campos 'hours' y 'erp'
            if (period === 'today') {
                const [d, m, y] = task.fechaHoras.split('/');
                const taskDate = new Date(`${y}-${m}-${d}`);

                if (
                    taskDate.getDate() === now.getDate() &&
                    taskDate.getMonth() === now.getMonth() &&
                    taskDate.getFullYear() === now.getFullYear()
                ) {
                    filtered.push({
                        nombre: task.name,
                        fecha: task.fechaHoras,
                        horas: task.hours,
                        resumen: task.erp || 'Sin resumen'
                    });
                }
            }

            // Acumulados (para today, week o month)
            task.horasAcumuladas.forEach(record => {
                const [d, m, y] = record.fecha.split('/');
                const date = new Date(`${y}-${m}-${d}`);

                let incluir = false;

                if (period === 'week') {
                    const semanaPasada = new Date();
                    semanaPasada.setDate(now.getDate() - 7);
                    incluir = date >= semanaPasada;
                }

                if (period === 'month') {
                    incluir =
                        date.getMonth() === now.getMonth() &&
                        date.getFullYear() === now.getFullYear();
                }

                if (incluir) {
                    const resumen = task.erpsAcumulados.find(e => e.fecha === record.fecha)?.erp || 'Sin resumen';
                    filtered.push({
                        nombre: task.name,
                        fecha: record.fecha,
                        horas: record.horas,
                        resumen
                    });
                }
            });
        }

        console.log("Tareas filtradas para el informe:", filtered);

        if (filtered.length === 0) {
            return res.json({
                report: "⚠️ No hay tareas registradas en el rango seleccionado para generar un informe."
            });
        }

        const inputForGPT = filtered.map(t =>
            `Tarea: ${t.nombre}\nFecha: ${t.fecha}\nHoras: ${t.horas}\nResumen: ${t.resumen}`
        ).join('\n\n');

        const prompt = `
Eres un asistente que genera informes laborales resumidos para un usuario que registra tareas diarias. 
A partir de la siguiente información, genera un informe claro, en tono profesional y redactado en español.

${inputForGPT}
        `.trim();

        try {
            const completion = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
            });

            const generatedText = completion.choices[0].message.content;
            res.json({ report: generatedText });

        } catch (error) {
            console.error('Error al generar informe con OpenAI:', error);
            res.status(500).send('Error al generar informe con IA');
        }
    });
});



///////////////////////////////////////////////////


// Generar informe en PDF
function generateReportPDF(period) {
    fetch(`/generate-report-pdf?period=${period}`, {
        method: 'GET',
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Error al generar el informe');
        }
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `informe-${period}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    })
    .catch(error => console.error('Error al descargar el informe:', error));
}





















// Ruta para obtener todas las tareas, con lógica de reinicio diario
app.get('/tasks', (req, res) => {
    const today = new Date().toLocaleDateString();

    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');
        
        let tasks = JSON.parse(data || '[]');

        // Verificar y actualizar tareas si ha pasado un día
        tasks = tasks.map(task => {
            if (task.fechaHoras !== today) {
                if (!task.horasAcumuladas) task.horasAcumuladas = [];
                task.horasAcumuladas.push({ fecha: task.fechaHoras, horas: task.hours });
                task.hours = 0;
                task.fechaHoras = today;
            }

            if (task.fechaERP !== today) {
                if (!task.erpsAcumulados) task.erpsAcumulados = [];
                task.erpsAcumulados.push({ fecha: task.fechaERP, erp: task.erp });
                task.erp = '';
                task.fechaERP = today;
            }

            return task;
        });

        // Guardar cambios en el archivo
        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), async (err) => {
            if (err) return res.status(500).send('Error al actualizar las tareas');
            
            // Añadir aquí la copia de seguridad a MongoDB
            await saveBackupToMongo(tasks);

            res.json(tasks);
        });
    });
});

// Ruta para agregar una nueva tarea
app.post('/tasks', (req, res) => {
    const newTask = req.body;
    const today = new Date().toLocaleDateString();
    newTask.fechaHoras = today;
    newTask.fechaERP = today;
    newTask.horasAcumuladas = [];
    newTask.erpsAcumulados = [];

    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');

        const tasks = JSON.parse(data || '[]');
        tasks.push(newTask);

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), async (err) => {
            if (err) return res.status(500).send('Error al guardar la tarea');

            // Añadir aquí la copia de seguridad a MongoDB
            await saveBackupToMongo(tasks);

            res.status(201).json(newTask);
        });
    });
});

// Ruta para actualizar las horas de una tarea específica
app.put('/tasks/:index/hours', (req, res) => {
    const { index } = req.params;
    const { hours } = req.body;
    const today = new Date().toLocaleDateString();

    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');

        const tasks = JSON.parse(data || '[]');
        if (index < 0 || index >= tasks.length) {
            return res.status(400).send('Índice de tarea no válido');
        }

        tasks[index].hours = hours;
        tasks[index].fechaHoras = today;

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), async (err) => {
            if (err) return res.status(500).send('Error al guardar las horas');

            // Añadir aquí la copia de seguridad a MongoDB
            await saveBackupToMongo(tasks);

            res.status(200).send('Horas actualizadas');
        });
    });
});

// Ruta para actualizar el campo ERP de una tarea específica
app.put('/tasks/:index/erp', (req, res) => {
    const { index } = req.params;
    const { erp } = req.body;
    const today = new Date().toLocaleDateString();

    fs.readFile('tasks.json', 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');
        
        const tasks = JSON.parse(data || '[]');
        if (index < 0 || index >= tasks.length) {
            return res.status(400).send('Índice de tarea no válido');
        }

        tasks[index].erp = erp;
        tasks[index].fechaERP = today;

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), async (err) => {
            if (err) return res.status(500).send('Error al guardar el campo ERP');

            // Añadir aquí la copia de seguridad a MongoDB
            await saveBackupToMongo(tasks);

            res.status(200).send('Campo ERP actualizado');
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

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), async (err) => {
            if (err) return res.status(500).send('Error al guardar las notas');

            // Copia de seguridad a MongoDB
            await saveBackupToMongo(tasks);

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

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), async (err) => {
            if (err) return res.status(500).send('Error al guardar las tareas');

            // Copia de seguridad en MongoDB
            await saveBackupToMongo(tasks);

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

        fs.writeFile('tasks.json', JSON.stringify(tasks, null, 2), async (err) => {
            if (err) return res.status(500).send('Error al guardar las tareas');

            // Copia de seguridad en MongoDB
            await saveBackupToMongo(tasks);

            res.status(200).send('Tarea movida a revisión');
        });
    });
});


app.get('/generate-report-pdf', async (req, res) => {
    const { period } = req.query;
    const now = new Date();

    fs.readFile('tasks.json', 'utf8', async (err, data) => {
        if (err) return res.status(500).send('Error al leer las tareas');

        const tasks = JSON.parse(data || '[]');

        const tareasConActividad = [];
        const tareasPendientes = [];

        for (const task of tasks) {
            let actividad = [];

            if (period === 'today') {
                const [d, m, y] = task.fechaHoras.split('/');
                const taskDate = new Date(`${y}-${m}-${d}`);

                if (
                    taskDate.getDate() === now.getDate() &&
                    taskDate.getMonth() === now.getMonth() &&
                    taskDate.getFullYear() === now.getFullYear()
                ) {
                    if ((task.hours > 0) || (task.erp && task.erp.trim() !== '' && task.erp.trim().toLowerCase() !== 'sin resumen')) {
                        actividad.push({
                            fecha: task.fechaHoras,
                            horas: task.hours,
                            resumen: task.erp
                        });
                    }
                }
            }

            task.horasAcumuladas.forEach(record => {
                const [d, m, y] = record.fecha.split('/');
                const date = new Date(`${y}-${m}-${d}`);
                let incluir = false;

                if (period === 'week') {
                    const semanaPasada = new Date();
                    semanaPasada.setDate(now.getDate() - 7);
                    incluir = date >= semanaPasada;
                }
                if (period === 'month') {
                    incluir =
                        date.getMonth() === now.getMonth() &&
                        date.getFullYear() === now.getFullYear();
                }

                const resumen = task.erpsAcumulados.find(e => e.fecha === record.fecha)?.erp || '';

                if (incluir && ((record.horas > 0) || (resumen.trim() !== '' && resumen.trim().toLowerCase() !== 'sin resumen'))) {
                    actividad.push({
                        fecha: record.fecha,
                        horas: record.horas,
                        resumen
                    });
                }
            });

            if (actividad.length > 0) {
                tareasConActividad.push({
                    nombre: task.name,
                    actividad
                });
            } else if (task.status === 'pending') {
                tareasPendientes.push(task.name);
            }
        }

        if (tareasConActividad.length === 0 && tareasPendientes.length === 0) {
            return res.status(400).send('No hay datos para generar el informe.');
        }

        const textoParaLLM = tareasConActividad.map(t => {
            const resumenes = t.actividad.map(a => `- (${a.fecha}) ${a.resumen} (${a.horas} horas)`).join('\n');
            return `Tarea: ${t.nombre}\n${resumenes}`;
        }).join('\n\n');

        const prompt = `
Eres un asistente especializado en generar informes profesionales de actividad laboral. 
Redacta un resumen elegante en español a partir de los datos que te paso. 
No hagas despedidas ni pongas nombres de asistentes. Solo escribe el cuerpo del informe.

Datos:

${textoParaLLM}
        `.trim();

        let resumenGenerado = '';
try {
    const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
    });

    if (completion.choices && completion.choices.length > 0) {
        resumenGenerado = completion.choices[0].message.content.trim();
    } else {
        throw new Error('Respuesta vacía de OpenAI');
    }

} catch (error) {
    console.error('Error al generar informe con OpenAI:', error.message);
    return res.status(500).send('Error generando resumen IA: ' + error.message);
}

// Verificar que realmente tenemos un resumen válido antes de seguir
if (!resumenGenerado) {
    console.error('Resumen generado vacío.');
    return res.status(500).send('No se pudo generar el resumen.');
}


        const html = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; }
                    h1 { text-align: center; }
                    h2 { color: #444; }
                    .section { margin-bottom: 40px; }
                    ul { padding-left: 20px; }
                    li { margin-bottom: 8px; }
                </style>
            </head>
            <body>
                <h1>Informe de Actividad</h1>

                <div class="section">
                    <h2>Resumen de Tareas Realizadas</h2>
                    <p>${resumenGenerado.replace(/\n/g, '<br>')}</p>
                </div>

                <div class="section">
                    <h2>Tareas Pendientes</h2>
                    ${tareasPendientes.length > 0 ? `
                        <ul>
                            ${tareasPendientes.map(t => `<li>${t}</li>`).join('')}
                        </ul>
                    ` : '<p>No hay tareas pendientes registradas.</p>'}
                </div>
            </body>
            </html>
        `;

        try {
            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu'
                ]
            });
            
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({ format: 'A4' });
            await browser.close();

            res.type('application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="informe-${period}.pdf"`);
            res.end(pdfBuffer);


        } catch (error) {
            console.error('Error generando PDF:', error.message);
            res.status(500).send('Error generando PDF.');
        }
    });
});






// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor en funcionamiento en http://localhost:${PORT}`);
});
