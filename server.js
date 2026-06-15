const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Koneksi database
async function getDBConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });
}

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/submit-task');
});

// Halaman submit tugas
app.get('/submit-task', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'submit-task.html'));
});

// Proses submit tugas
app.post('/submit-task', upload.single('file'), async (req, res) => {
    try {
        const { nim, name, class: kelas, course } = req.body;
        const file = req.file;

        // Upload file ke Azure Blob Storage
        const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.STORAGE_CONNECTION
        );
        const containerClient = blobServiceClient.getContainerClient(
            process.env.CONTAINER_NAME
        );
        const blobName = `${nim}_${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(file.buffer);
        const fileUrl = blockBlobClient.url;

        // Simpan data ke MySQL
        const conn = await getDBConnection();
        await conn.execute(
            `INSERT INTO submissions (nim, name, class, course, file_url, status, submitted_at) 
             VALUES (?, ?, ?, ?, ?, 'Submitted', NOW())`,
            [nim, name, kelas, course, fileUrl]
        );
        await conn.end();

        res.redirect('/task-list');
    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan: ' + error.message);
    }
});

// Halaman daftar tugas
app.get('/task-list', async (req, res) => {
    try {
        const conn = await getDBConnection();
        const [tasks] = await conn.execute(
            'SELECT * FROM submissions ORDER BY submitted_at DESC'
        );
        await conn.end();

        let tableRows = tasks.map(task => `
            <tr>
                <td>${task.nim}</td>
                <td>${task.name}</td>
                <td>${task.class}</td>
                <td>${task.course}</td>
                <td>${task.status}</td>
                <td>${task.submitted_at}</td>
                <td><a href="${task.file_url}" target="_blank">Download</a></td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <title>Daftar Tugas</title>
                <style>
                    body { font-family: Arial; margin: 40px; background: #f4f6f8; }
                    .container { background: white; padding: 24px; border-radius: 12px; }
                    h1 { color: #0078d4; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
                    th { background-color: #0078d4; color: white; }
                    tr:nth-child(even) { background-color: #f2f2f2; }
                    a { color: #0078d4; }
                    .btn { background: #0078d4; color: white; padding: 10px 20px;
                           text-decoration: none; border-radius: 4px; display: inline-block; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📋 Daftar Tugas Praktikum</h1>
                    <a class="btn" href="/submit-task">+ Submit Tugas Baru</a>
                    <table>
                        <tr>
                            <th>NIM</th><th>Nama</th><th>Kelas</th>
                            <th>Mata Kuliah</th><th>Status</th>
                            <th>Waktu Submit</th><th>File</th>
                        </tr>
                        ${tableRows}
                    </table>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan: ' + error.message);
    }
});

// Status endpoint
app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        service: 'PraktikumSubmit App Service',
        timestamp: new Date()
    });
});

app.listen(port, () => console.log(`Server berjalan pada port ${port}`));
