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

// Generate SAS URL
function generateSASUrl(accountName, accountKey, containerName, blobName) {
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    
    const sasOptions = {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn: new Date(new Date().valueOf() + 365 * 24 * 60 * 60 * 1000), // 1 tahun
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

        // Generate SAS URL
        const accountName = process.env.STORAGE_ACCOUNT_NAME;
        const accountKey = process.env.STORAGE_ACCOUNT_KEY;
        const fileUrl = generateSASUrl(accountName, accountKey, process.env.CONTAINER_NAME, blobName);

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
        <title>Daftar Tugas Praktikum</title>
        [CSS STYLE DIATAS]
    </head>
    <body>
        <div class="header">
            <h1>📋 Daftar Tugas Praktikum</h1>
            <a class="btn" href="/submit-task">📤 Submit Tugas Baru</a>
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
                    <th>File</th>
                </tr>
                ${tableRows || '<tr><td colspan="7" class="empty">✨ Belum ada tugas yang dikumpulkan</td></tr>'}
            </table>
        </div>

        <div class="footer">
            PraktikumSubmit - Azure Cloud Service ✨
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
