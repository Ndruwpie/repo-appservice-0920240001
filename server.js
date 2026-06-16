const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

async function getDBConnection() {
    return await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
    });
}

function generateSASUrl(accountName, accountKey, containerName, blobName) {
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const sasOptions = {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn: new Date(new Date().valueOf() + 365 * 24 * 60 * 60 * 1000),
    };
    const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
    return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
}

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/submit-task');
});

// Halaman submit tugas
app.get('/submit-task', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'submit-task.html'));
});

// Halaman admin login
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Proses submit tugas
app.post('/submit-task', upload.single('file'), async (req, res) => {
    try {
        const { nim, name, class: kelas, course } = req.body;
        const file = req.file;

        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION);
        const containerClient = blobServiceClient.getContainerClient(process.env.CONTAINER_NAME);
        const blobName = `${nim}_${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(file.buffer);

        const fileUrl = generateSASUrl(
            process.env.STORAGE_ACCOUNT_NAME,
            process.env.STORAGE_ACCOUNT_KEY,
            process.env.CONTAINER_NAME,
            blobName
        );

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
        const [tasks] = await conn.execute('SELECT * FROM submissions ORDER BY submitted_at DESC');
        await conn.end();

        let tableRows = tasks.map(task => `
            <tr>
                <td>${task.nim}</td>
                <td>${task.name}</td>
                <td>${task.class}</td>
                <td>${task.course}</td>
                <td><span class="badge">${task.status}</span></td>
                <td>${new Date(task.submitted_at).toLocaleString('id-ID')}</td>
                <td>
                    <a href="/task-detail?id=${task.id}">🔍 Detail</a> &nbsp;
                    <a href="${task.file_url}" target="_blank">📥 Download</a>
                </td>
            </tr>
        `).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Daftar Tugas Praktikum</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        min-height: 100vh;
                        background: #f0f0ff;
                        padding: 40px;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        font-size: 28px;
                        background: linear-gradient(135deg, #a78bfa, #f87171);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        font-weight: 700;
                    }
                    .nav-btns { display: flex; gap: 10px; }
                    .btn {
                        display: inline-block;
                        padding: 10px 22px;
                        background: linear-gradient(135deg, #a78bfa, #f87171);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        font-size: 13px;
                        font-weight: 600;
                        transition: 0.3s;
                    }
                    .btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 20px rgba(167, 139, 250, 0.4);
                    }
                    .btn-outline {
                        background: white;
                        color: #7c3aed;
                        border: 2px solid #a78bfa;
                    }
                    .card {
                        background: white;
                        border-radius: 20px;
                        padding: 30px;
                        box-shadow: 0 4px 20px rgba(124, 58, 237, 0.1);
                    }
                    table { width: 100%; border-collapse: collapse; }
                    th {
                        background: linear-gradient(135deg, #a78bfa, #f87171);
                        color: white;
                        padding: 14px 12px;
                        text-align: left;
                        font-size: 13px;
                    }
                    th:first-child { border-radius: 12px 0 0 0; }
                    th:last-child { border-radius: 0 12px 0 0; }
                    td {
                        padding: 12px;
                        border-bottom: 1px solid #ede9fe;
                        font-size: 13px;
                        color: #555;
                    }
                    tr:last-child td { border-bottom: none; }
                    tr:hover td { background: #faf5ff; }
                    .badge {
                        background: linear-gradient(135deg, #a78bfa, #c084fc);
                        color: white;
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 11px;
                        font-weight: 600;
                    }
                    td a {
                        color: #7c3aed;
                        text-decoration: none;
                        font-weight: 600;
                        font-size: 12px;
                    }
                    td a:hover { text-decoration: underline; }
                    .empty {
                        text-align: center;
                        padding: 40px;
                        color: #a78bfa;
                        font-style: italic;
                    }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        color: #a78bfa;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📋 Daftar Tugas Praktikum</h1>
                    <div class="nav-btns">
                        <a class="btn btn-outline" href="/admin-login">🔐 Admin</a>
                        <a class="btn" href="/submit-task">📤 Submit Tugas</a>
                    </div>
                </div>
                <div class="card">
                    <table>
                        <tr>
                            <th>NIM</th>
                            <th>Nama</th>
                            <th>Kelas</th>
                            <th>Mata Kuliah</th>
                            <th>Status</th>
                            <th>Waktu Submit</th>
                            <th>Aksi</th>
                        </tr>
                        ${tableRows || '<tr><td colspan="7" class="empty">✨ Belum ada tugas yang dikumpulkan</td></tr>'}
                    </table>
                </div>
                <div class="footer">PraktikumSubmit - Azure Cloud Service ✨</div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan: ' + error.message);
    }
});

// Halaman detail tugas
app.get('/task-detail', async (req, res) => {
    try {
        const { id } = req.query;
        const conn = await getDBConnection();
        const [tasks] = await conn.execute('SELECT * FROM submissions WHERE id = ?', [id]);
        await conn.end();

        if (tasks.length === 0) {
            return res.status(404).send('Tugas tidak ditemukan');
        }

        const task = tasks[0];

        res.send(`
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Detail Tugas - ${task.name}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        min-height: 100vh;
                        background: #f0f0ff;
                        padding: 40px;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        font-size: 28px;
                        background: linear-gradient(135deg, #a78bfa, #f87171);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        font-weight: 700;
                    }
                    .btn {
                        display: inline-block;
                        padding: 10px 22px;
                        background: linear-gradient(135deg, #a78bfa, #f87171);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        font-size: 13px;
                        font-weight: 600;
                        transition: 0.3s;
                    }
                    .btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 20px rgba(167, 139, 250, 0.4);
                    }
                    .card {
                        background: white;
                        border-radius: 20px;
                        padding: 40px;
                        box-shadow: 0 4px 20px rgba(124, 58, 237, 0.1);
                        max-width: 700px;
                        margin: auto;
                    }
                    .detail-header {
                        text-align: center;
                        margin-bottom: 35px;
                        padding-bottom: 25px;
                        border-bottom: 2px solid #ede9fe;
                    }
                    .avatar {
                        width: 70px;
                        height: 70px;
                        background: linear-gradient(135deg, #a78bfa, #f87171);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 28px;
                        margin: 0 auto 15px;
                    }
                    .detail-header h2 {
                        color: #5b21b6;
                        font-size: 22px;
                        margin-bottom: 5px;
                    }
                    .detail-header p {
                        color: #888;
                        font-size: 14px;
                    }
                    .detail-row {
                        display: flex;
                        padding: 14px 0;
                        border-bottom: 1px solid #ede9fe;
                        align-items: center;
                    }
                    .detail-row:last-child { border-bottom: none; }
                    .detail-label {
                        width: 160px;
                        font-size: 13px;
                        color: #888;
                        font-weight: 500;
                        flex-shrink: 0;
                    }
                    .detail-value {
                        font-size: 14px;
                        color: #444;
                        font-weight: 500;
                    }
                    .badge {
                        background: linear-gradient(135deg, #a78bfa, #c084fc);
                        color: white;
                        padding: 4px 14px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                    }
                    .btn-download {
                        display: inline-block;
                        margin-top: 25px;
                        padding: 13px 35px;
                        background: linear-gradient(135deg, #a78bfa, #f87171);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        font-size: 14px;
                        font-weight: 600;
                        transition: 0.3s;
                        width: 100%;
                        text-align: center;
                    }
                    .btn-download:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 20px rgba(167, 139, 250, 0.4);
                    }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        color: #a78bfa;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🔍 Detail Tugas</h1>
                    <a class="btn" href="/task-list">← Kembali</a>
                </div>

                <div class="card">
                    <div class="detail-header">
                        <div class="avatar">👤</div>
                        <h2>${task.name}</h2>
                        <p>${task.nim} • ${task.class}</p>
                    </div>

                    <div class="detail-row">
                        <span class="detail-label">NIM</span>
                        <span class="detail-value">${task.nim}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Nama</span>
                        <span class="detail-value">${task.name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Kelas</span>
                        <span class="detail-value">${task.class}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Mata Kuliah</span>
                        <span class="detail-value">${task.course}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status</span>
                        <span class="detail-value"><span class="badge">${task.status}</span></span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Waktu Submit</span>
                        <span class="detail-value">${new Date(task.submitted_at).toLocaleString('id-ID')}</span>
                    </div>

                    <a href="${task.file_url}" target="_blank" class="btn-download">
                        📥 Download File Tugas
                    </a>
                </div>

                <div class="footer">PraktikumSubmit - Azure Cloud Service ✨</div>
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
