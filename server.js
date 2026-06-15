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
                <td><span class="badge">${task.status}</span></td>
                <td>${new Date(task.submitted_at).toLocaleString('id-ID')}</td>
                <td><a href="${task.file_url}" target="_blank">📥 Download</a></td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>🌸 Daftar Tugas Praktikum 🌸</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }

                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #ffe6f2, #ffd6eb, #ffeef8);
                        min-height: 100vh;
                        padding: 30px;
                        color: #5a3d4d;
                    }

                    .container {
                        max-width: 1000px;
                        margin: auto;
                        background: white;
                        border-radius: 25px;
                        padding: 35px;
                        box-shadow: 0 10px 30px rgba(255, 105, 180, 0.25);
                        border: 3px solid #ffc0cb;
                    }

                    h1 {
                        text-align: center;
                        color: #ff4fa3;
                        margin-bottom: 8px;
                    }

                    .subtitle {
                        text-align: center;
                        color: #d63384;
                        margin-bottom: 25px;
                        font-size: 14px;
                    }

                    .btn {
                        display: inline-block;
                        padding: 12px 24px;
                        background: linear-gradient(135deg, #ff69b4, #ff85c1);
                        color: white;
                        text-decoration: none;
                        border-radius: 15px;
                        font-weight: bold;
                        font-size: 14px;
                        transition: 0.3s;
                        margin-bottom: 20px;
                    }

                    .btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 15px rgba(255, 105, 180, 0.4);
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }

                    th {
                        background: linear-gradient(135deg, #ff69b4, #ff85c1);
                        color: white;
                        padding: 12px 10px;
                        text-align: left;
                        font-size: 14px;
                    }

                    th:first-child { border-radius: 10px 0 0 0; }
                    th:last-child { border-radius: 0 10px 0 0; }

                    td {
                        padding: 10px;
                        border-bottom: 1px solid #ffd6eb;
                        font-size: 14px;
                        color: #5a3d4d;
                    }

                    tr:nth-child(even) { background-color: #fff0f6; }

                    tr:hover { background-color: #ffe6f2; }

                    .badge {
                        background: #fff0f6;
                        color: #d63384;
                        border: 1px solid #ffb6d9;
                        padding: 4px 10px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: bold;
                    }

                    td a {
                        color: #ff69b4;
                        text-decoration: none;
                        font-weight: bold;
                    }

                    td a:hover { color: #d63384; }

                    .empty {
                        text-align: center;
                        padding: 30px;
                        color: #d63384;
                        font-style: italic;
                    }

                    .footer {
                        margin-top: 25px;
                        text-align: center;
                        color: #c2185b;
                        font-size: 13px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎀 Daftar Tugas Praktikum 🎀</h1>
                    <p class="subtitle">Sistem Pengumpulan Tugas Berbasis Azure Cloud</p>

                    <a class="btn" href="/submit-task">📤 Submit Tugas Baru</a>

                    <table>
                        <tr>
                            <th>NIM</th>
                            <th>Nama</th>
                            <th>Kelas</th>
                            <th>Mata Kuliah</th>
                            <th>Status</th>
                            <th>Waktu Submit</th>
                            <th>File</th>
                        </tr>
                        ${tableRows || '<tr><td colspan="7" class="empty">🌸 Belum ada tugas yang dikumpulkan 🌸</td></tr>'}
                    </table>

                    <div class="footer">
                        💕 PraktikumSubmit - Azure Cloud Service 💕
                    </div>
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
