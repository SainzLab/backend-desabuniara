// Terimakasih GEMINI
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const multer = require('multer'); // Tambahan: Multer untuk upload file
const path = require('path');     // Tambahan: Path untuk mengatur nama file
const fs = require('fs');         // Tambahan: File System

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 5
});

// ==========================================
// KONFIGURASI MULTER (PENYIMPANAN GAMBAR FISIK)
// ==========================================
// Pastikan folder public/uploads/ ada. Jika belum, buat secara otomatis.
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Folder tujuan penyimpanan gambar
  },
  filename: function (req, file, cb) {
    // Generate nama file unik: timestamp + angka random + ekstensi asli
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // Batasi ukuran file max 5MB agar aman
});


// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MENYAJIKAN FOLDER PUBLIC AGAR BISA DIAKSES FRONTEND/BROWSER
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Akses Ditolak: Token tidak ditemukan" });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: "Akses Ditolak: Token tidak valid atau kadaluarsa" });
  }
};


// ==========================================
// 1. PUBLIC ROUTES (Tanpa Token)
// ==========================================

// A. Root URL
app.get('/', (req, res) => {
  res.send('Halo! Ini adalah Backend API untuk Desa Buniara.');
});

// B. Login Admin
app.post('/api/login', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { email, password } = req.body;

    const rows = await conn.query(
      "SELECT id, nama, email, role, password, is_aktif FROM pengguna WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Email atau kata sandi salah" });
    }

    const user = rows[0];
    const isAktif = user.is_aktif === 1 || user.is_aktif === true;
    
    if (!isAktif) {
      return res.status(403).json({ 
        success: false, 
        message: "Akses Ditolak: Akun Anda telah dinonaktifkan oleh Super Admin." 
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: "Email atau kata sandi salah" });
    }

    delete user.password;
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({ success: true, token, user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
  } finally {
    if (conn) conn.release();
  }
});

// C. MENGAMBIL DATA KONTEN WEB (Bisa diakses publik untuk frontend web desa)
app.get('/api/konten', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query("SELECT * FROM konten_web WHERE id = 1");
    
    if (rows.length > 0) {
      const data = rows[0];
      
      const parseJSON = (str, fallback) => {
        if (!str) return fallback; 
        try {
          const parsed = typeof str === 'string' ? JSON.parse(str) : str;
          return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch (e) {
          console.error("Gagal parse JSON:", str);
          return fallback;
        }
      };

      data.dusun = parseJSON(data.dusun, []);
      data.perangkat_desa = parseJSON(data.perangkat_desa, []);
      
      Object.keys(data).forEach(key => {
        if (data[key] === null) {
          data[key] = '';
        }
      });

      res.status(200).json({ success: true, data: data });
    } else {
      res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }
  } catch (err) {
    console.error("Error GET Konten:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil data konten" });
  } finally {
    if (conn) conn.release();
  }
});


// ==========================================
// 2. PROTECTED ROUTES (Wajib Login / Token)
// ==========================================

// A. MENGUPDATE DATA KONTEN WEB (Mendukung upload banyak file sekaligus)
const uploadFields = upload.fields([
  { name: 'hero_image', maxCount: 1 },
  { name: 'tentang_img1', maxCount: 1 },
  { name: 'tentang_img2', maxCount: 1 },
  { name: 'kantor_img', maxCount: 1 }
]);

app.put('/api/konten', verifyToken, uploadFields, async (req, res) => {
  let conn;
  try {
    // Ambil data teks biasa dari req.body
    const {
      hero_headline, hero_subheadline, tentang_judul, tentang_desc1, 
      tentang_desc2, dusun, maps_embed, alamat, jam_operasional, 
      layanan, kontak, perangkat_desa
    } = req.body;

    // Cek apakah ada file baru yang diunggah. Jika ada, ambil path-nya. Jika tidak, pakai URL gambar yang lama dari req.body.
    const hero_image = req.files && req.files['hero_image'] ? '/uploads/' + req.files['hero_image'][0].filename : req.body.hero_image;
    const tentang_img1 = req.files && req.files['tentang_img1'] ? '/uploads/' + req.files['tentang_img1'][0].filename : req.body.tentang_img1;
    const tentang_img2 = req.files && req.files['tentang_img2'] ? '/uploads/' + req.files['tentang_img2'][0].filename : req.body.tentang_img2;
    const kantor_img = req.files && req.files['kantor_img'] ? '/uploads/' + req.files['kantor_img'][0].filename : req.body.kantor_img;

    const dusunJSON = JSON.stringify(Array.isArray(dusun) ? dusun : (typeof dusun === 'string' ? JSON.parse(dusun || '[]') : []));
    const perangkatDesaJSON = JSON.stringify(Array.isArray(perangkat_desa) ? perangkat_desa : (typeof perangkat_desa === 'string' ? JSON.parse(perangkat_desa || '[]') : []));

    conn = await pool.getConnection();
    
    const query = `
      UPDATE konten_web 
      SET 
        hero_headline = ?, hero_subheadline = ?, hero_image = ?,
        tentang_judul = ?, tentang_desc1 = ?, tentang_desc2 = ?, tentang_img1 = ?, tentang_img2 = ?,
        dusun = ?, maps_embed = ?, kantor_img = ?, alamat = ?, 
        jam_operasional = ?, layanan = ?, kontak = ?, perangkat_desa = ?
      WHERE id = 1
    `;

    const values = [
      hero_headline || '', hero_subheadline || '', hero_image || '',
      tentang_judul || '', tentang_desc1 || '', tentang_desc2 || '', tentang_img1 || '', tentang_img2 || '',
      dusunJSON, maps_embed || '', kantor_img || '', alamat || '', 
      jam_operasional || '', layanan || '', kontak || '', perangkatDesaJSON
    ];

    const result = await conn.query(query, values);

    if (result.affectedRows > 0) {
      res.status(200).json({ success: true, message: "Data konten web berhasil diperbarui!" });
    } else {
      res.status(400).json({ success: false, message: "Gagal memperbarui data" });
    }
  } catch (err) {
    console.error("Error PUT Konten:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server saat menyimpan" });
  } finally {
    if (conn) conn.release();
  }
});


// B - F. MANAJEMEN PENGGUNA (Tetap Sama)
// ... (Kode untuk /api/pengguna GET, POST, PUT, DELETE sama seperti sebelumnya) ...
app.get('/api/pengguna', verifyToken, async (req, res) => {
  let conn; try { conn = await pool.getConnection(); const rows = await conn.query("SELECT id, nama, email, role, is_aktif FROM pengguna ORDER BY id DESC"); res.status(200).json({ success: true, data: rows }); } catch (err) { res.status(500).json({ success: false, message: "Gagal mengambil data pengguna" }); } finally { if (conn) conn.release(); }
});
app.post('/api/pengguna', verifyToken, async (req, res) => {
  let conn; try { const { nama, email, password, role } = req.body; const salt = await bcrypt.genSalt(10); const hashedPassword = await bcrypt.hash(password, salt); conn = await pool.getConnection(); await conn.query("INSERT INTO pengguna (nama, email, password, role) VALUES (?, ?, ?, ?)", [nama, email, hashedPassword, role || 'Administrator']); res.status(201).json({ success: true, message: "Pengguna berhasil ditambahkan" }); } catch (err) { res.status(500).json({ success: false, message: "Gagal menambah pengguna (mungkin email sudah terdaftar)" }); } finally { if (conn) conn.release(); }
});
app.put('/api/pengguna/:id', verifyToken, async (req, res) => {
  let conn; try { const { id } = req.params; const { nama, email, role, password } = req.body; conn = await pool.getConnection(); if (password && password.trim() !== '') { const salt = await bcrypt.genSalt(10); const hashedPassword = await bcrypt.hash(password, salt); await conn.query("UPDATE pengguna SET nama = ?, email = ?, role = ?, password = ? WHERE id = ?", [nama, email, role, hashedPassword, id]); } else { await conn.query("UPDATE pengguna SET nama = ?, email = ?, role = ? WHERE id = ?", [nama, email, role, id]); } res.status(200).json({ success: true, message: "Data pengguna berhasil diperbarui" }); } catch (err) { res.status(500).json({ success: false, message: "Gagal memperbarui pengguna" }); } finally { if (conn) conn.release(); }
});
app.put('/api/pengguna/:id/status', verifyToken, async (req, res) => {
  let conn; try { const { id } = req.params; const { is_aktif } = req.body; conn = await pool.getConnection(); await conn.query("UPDATE pengguna SET is_aktif = ? WHERE id = ?", [is_aktif, id]); res.status(200).json({ success: true, message: "Status pengguna berhasil diperbarui" }); } catch (err) { res.status(500).json({ success: false, message: "Gagal memperbarui status" }); } finally { if (conn) conn.release(); }
});
app.delete('/api/pengguna/:id', verifyToken, async (req, res) => {
  let conn; try { const { id } = req.params; conn = await pool.getConnection(); await conn.query("DELETE FROM pengguna WHERE id = ?", [id]); res.status(200).json({ success: true, message: "Pengguna berhasil dihapus" }); } catch (err) { res.status(500).json({ success: false, message: "Gagal menghapus pengguna" }); } finally { if (conn) conn.release(); }
});


// ==========================================
// API UNTUK MANAJEMEN WISATA
// ==========================================

app.get('/api/wisata', verifyToken, async (req, res) => {
  let conn; try { conn = await pool.getConnection(); const rows = await conn.query("SELECT * FROM wisata ORDER BY id DESC"); res.status(200).json({ success: true, data: rows }); } catch (err) { res.status(500).json({ success: false, message: 'Gagal mengambil data wisata' }); } finally { if (conn) conn.release(); }
});

// POST: Tambah Wisata (Mendukung File Upload)
app.post('/api/wisata', verifyToken, upload.single('image'), async (req, res) => {
  let conn;
  try {
    const { judul, kategori, deskripsi, isPublished } = req.body;
    const is_published = (isPublished === 'true' || isPublished === true || isPublished == 1) ? 1 : 0; 
    
    // Ambil path file yang baru diunggah
    const imagePath = req.file ? '/uploads/' + req.file.filename : '';

    conn = await pool.getConnection();
    const result = await conn.query(
      "INSERT INTO wisata (judul, kategori, deskripsi, image, is_published) VALUES (?, ?, ?, ?, ?)",
      [judul, kategori, deskripsi, imagePath, is_published]
    );

    res.status(201).json({ success: true, message: 'Data wisata berhasil ditambahkan', id: Number(result.insertId) });
  } catch (err) {
    console.error('Error menambah wisata:', err);
    res.status(500).json({ success: false, message: 'Gagal menyimpan data wisata' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT: Edit Wisata (Mendukung File Upload)
app.put('/api/wisata/:id', verifyToken, upload.single('image'), async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { judul, kategori, deskripsi } = req.body;
    
    // Jika user mengunggah file baru, pakai path baru. Jika tidak, pakai nilai image lama yang dikirim sebagai teks.
    const imagePath = req.file ? '/uploads/' + req.file.filename : req.body.image;

    conn = await pool.getConnection();
    await conn.query(
      "UPDATE wisata SET judul = ?, kategori = ?, deskripsi = ?, image = ? WHERE id = ?",
      [judul, kategori, deskripsi, imagePath, id]
    );

    res.status(200).json({ success: true, message: 'Data wisata berhasil diupdate' });
  } catch (err) {
    console.error('Error update wisata:', err);
    res.status(500).json({ success: false, message: 'Gagal mengupdate data wisata' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/wisata/:id/status', verifyToken, async (req, res) => {
  let conn; try { const { id } = req.params; const { is_published } = req.body; conn = await pool.getConnection(); await conn.query("UPDATE wisata SET is_published = ? WHERE id = ?", [is_published, id]); res.status(200).json({ success: true, message: 'Status wisata berhasil diperbarui' }); } catch (err) { res.status(500).json({ success: false, message: 'Gagal merubah status wisata' }); } finally { if (conn) conn.release(); }
});
app.delete('/api/wisata/:id', verifyToken, async (req, res) => {
  let conn; try { const { id } = req.params; conn = await pool.getConnection(); await conn.query("DELETE FROM wisata WHERE id = ?", [id]); res.status(200).json({ success: true, message: 'Data wisata berhasil dihapus' }); } catch (err) { res.status(500).json({ success: false, message: 'Gagal menghapus data wisata' }); } finally { if (conn) conn.release(); }
});
app.get('/api/public/wisata', async (req, res) => {
  let conn; try { conn = await pool.getConnection(); const rows = await conn.query("SELECT * FROM wisata WHERE is_published = 1 ORDER BY id DESC"); res.status(200).json({ success: true, data: rows }); } catch (err) { res.status(500).json({ success: false, message: 'Gagal mengambil data' }); } finally { if (conn) conn.release(); }
});

// ==========================================
// API MANAJEMEN UMKM (MENDUKUNG FILE UPLOAD)
// ==========================================

app.get('/api/umkm', verifyToken, async (req, res) => {
    try { const rows = await pool.query('SELECT * FROM umkm ORDER BY id DESC'); res.json({ success: true, data: rows }); } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/umkm', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { judul, pemilik, kategori, deskripsi, is_published } = req.body;
        const imagePath = req.file ? '/uploads/' + req.file.filename : '';
        const statusPublish = (is_published === 'true' || is_published === true || is_published == 1) ? 1 : 0;

        const result = await pool.query(
            'INSERT INTO umkm (judul, pemilik, kategori, deskripsi, image, is_published) VALUES (?, ?, ?, ?, ?, ?)',
            [judul, pemilik, kategori, deskripsi, imagePath, statusPublish]
        );
        res.json({ success: true, message: 'UMKM berhasil ditambahkan', id: Number(result.insertId) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/umkm/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { judul, pemilik, kategori, deskripsi } = req.body;
        const imagePath = req.file ? '/uploads/' + req.file.filename : req.body.image;

        await pool.query(
            'UPDATE umkm SET judul=?, pemilik=?, kategori=?, deskripsi=?, image=? WHERE id=?', 
            [judul, pemilik, kategori, deskripsi, imagePath, id]
        );
        res.json({ success: true, message: 'UMKM berhasil diupdate' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.patch('/api/umkm/:id/status', verifyToken, async (req, res) => {
    try { const { id } = req.params; const { is_published } = req.body; await pool.query('UPDATE umkm SET is_published=? WHERE id=?', [is_published ? 1 : 0, id]); res.json({ success: true, message: 'Status publish diupdate' }); } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.delete('/api/umkm/:id', verifyToken, async (req, res) => {
    try { const { id } = req.params; await pool.query('DELETE FROM umkm WHERE id=?', [id]); res.json({ success: true, message: 'UMKM berhasil dihapus' }); } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});
app.get('/api/public/umkm', async (req, res) => {
    try { const rows = await pool.query('SELECT * FROM umkm WHERE is_published = 1 ORDER BY id DESC'); res.json({ success: true, data: rows }); } catch (error) { res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' }); }
});
app.get('/api/public/umkm/:id', async (req, res) => {
    try { const { id } = req.params; const rows = await pool.query('SELECT * FROM umkm WHERE id = ? AND is_published = 1', [id]); if (rows.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' }); res.json({ success: true, data: rows[0] }); } catch (error) { res.status(500).json({ success: false, message: 'Terjadi kesalahan' }); }
});


// ==========================================
// API LAPORAN MASYARAKAT
// ==========================================
app.post('/api/public/laporan', upload.single('lampiran'), async (req, res) => {
  let conn;
  try {
    const { nama_lengkap, kontak, kategori, subjek, pesan } = req.body;
    
    // Validasi data wajib
    if (!nama_lengkap || !kontak || !kategori || !subjek || !pesan) {
      return res.status(400).json({ success: false, message: 'Semua kolom wajib diisi kecuali lampiran' });
    }

    // Ambil path file jika masyarakat melampirkan foto
    const lampiranPath = req.file ? '/uploads/' + req.file.filename : null;

    conn = await pool.getConnection();
    
    // Simpan laporan ke database
    const result = await conn.query(
      'INSERT INTO laporan (nama_lengkap, kontak, kategori, subjek, pesan, lampiran) VALUES (?, ?, ?, ?, ?, ?)', 
      [nama_lengkap, kontak, kategori, subjek, pesan, lampiranPath]
    );
    
    // Ambil konfigurasi nomor WA admin
    const waConfig = await conn.query("SELECT nilai FROM pengaturan WHERE kunci = 'wa_admin_laporan'");
    const nomorWa = waConfig.length > 0 ? waConfig[0].nilai : '';
    
    res.json({ 
      success: true, 
      message: 'Laporan berhasil dikirim.', 
      id: Number(result.insertId), 
      wa_number: nomorWa 
    });

  } catch (error) { 
    console.error('Error saat mengirim laporan:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' }); 
  } finally { 
    if (conn) conn.release(); 
  }
});

app.get('/api/laporan', verifyToken, async (req, res) => { try { const rows = await pool.query('SELECT * FROM laporan ORDER BY created_at DESC'); res.json({ success: true, data: rows }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.patch('/api/laporan/:id/status', verifyToken, async (req, res) => { const { id } = req.params; const { status } = req.body; const allowedStatuses = ['Menunggu', 'Diproses', 'Selesai', 'Ditolak']; if (!allowedStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Status tidak valid' }); try { await pool.query('UPDATE laporan SET status = ? WHERE id = ?', [status, id]); res.json({ success: true, message: 'Status laporan berhasil diperbarui' }); } catch (error) { res.status(500).json({ success: false, message: 'Gagal memperbarui status laporan' }); } });
app.delete('/api/laporan/:id', verifyToken, async (req, res) => { try { const { id } = req.params; await pool.query('DELETE FROM laporan WHERE id = ?', [id]); res.json({ success: true, message: 'Laporan berhasil dihapus' }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.get('/api/pengaturan/wa', verifyToken, async (req, res) => { try { const rows = await pool.query("SELECT nilai FROM pengaturan WHERE kunci = 'wa_admin_laporan'"); res.json({ success: true, data: rows.length > 0 ? rows[0].nilai : '' }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });
app.put('/api/pengaturan/wa', verifyToken, async (req, res) => { const { nomor } = req.body; try { const rows = await pool.query("SELECT id FROM pengaturan WHERE kunci = 'wa_admin_laporan'"); if (rows.length > 0) { await pool.query("UPDATE pengaturan SET nilai = ? WHERE kunci = 'wa_admin_laporan'", [nomor]); } else { await pool.query("INSERT INTO pengaturan (kunci, nilai, deskripsi) VALUES ('wa_admin_laporan', ?, 'Nomor WhatsApp Admin')", [nomor]); } res.json({ success: true, message: 'Nomor WhatsApp berhasil diperbarui' }); } catch (error) { res.status(500).json({ success: false, message: error.message }); } });

app.listen(PORT, () => {
  console.log(`Server backend berjalan di http://localhost:${PORT}`);
});